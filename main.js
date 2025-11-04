const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { extractFull } = require('node-7z');
const sevenBin = require('7zip-bin');
const ini = require('ini');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true,
    resizable: false
  });

  mainWindow.loadFile('index.html');

  // Uncomment for debugging
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Helper function to find Steam installation path
function findSteamPath() {
  const possiblePaths = [
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
    path.join(process.env.ProgramFiles, 'Steam'),
    path.join(process.env['ProgramFiles(x86)'], 'Steam')
  ];

  for (const steamPath of possiblePaths) {
    if (fs.existsSync(steamPath)) {
      return steamPath;
    }
  }

  return null;
}

// Parse libraryfolders.vdf to find all Steam library paths
function getSteamLibraryPaths(steamPath) {
  const libraryFoldersPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  const libraries = [steamPath];

  if (!fs.existsSync(libraryFoldersPath)) {
    return libraries;
  }

  try {
    const content = fs.readFileSync(libraryFoldersPath, 'utf-8');
    const pathRegex = /"path"\s+"(.+?)"/gi;
    let match;

    while ((match = pathRegex.exec(content)) !== null) {
      const libraryPath = match[1].replace(/\\\\/g, '\\');
      if (fs.existsSync(libraryPath)) {
        libraries.push(libraryPath);
      }
    }
  } catch (error) {
    console.error('Error parsing libraryfolders.vdf:', error);
  }

  return [...new Set(libraries)]; // Remove duplicates
}

// Find game folder by AppID
function findGameByAppId(libraries, appId) {
  for (const library of libraries) {
    const steamappsPath = path.join(library, 'steamapps');
    const manifestPath = path.join(steamappsPath, `appmanifest_${appId}.acf`);

    if (fs.existsSync(manifestPath)) {
      try {
        const content = fs.readFileSync(manifestPath, 'utf-8');
        const installDirMatch = content.match(/"installdir"\s+"(.+?)"/i);

        if (installDirMatch) {
          const installDir = installDirMatch[1];
          const gamePath = path.join(steamappsPath, 'common', installDir);

          if (fs.existsSync(gamePath)) {
            return gamePath;
          }
        }
      } catch (error) {
        console.error('Error reading manifest:', error);
      }
    }
  }

  return null;
}

// Find the main executable in game folder
function findGameExe(gameFolder) {
  try {
    const files = fs.readdirSync(gameFolder);

    // Look for .exe files (excluding common utility files)
    const exeFiles = files.filter(file =>
      file.toLowerCase().endsWith('.exe') &&
      !file.toLowerCase().includes('uninstall') &&
      !file.toLowerCase().includes('crash') &&
      !file.toLowerCase().includes('report') &&
      !file.toLowerCase().includes('setup') &&
      !file.toLowerCase().includes('config') &&
      !file.toLowerCase().includes('launcher')
    );

    if (exeFiles.length === 0) {
      // Search in subdirectories
      for (const file of files) {
        const fullPath = path.join(gameFolder, file);
        if (fs.statSync(fullPath).isDirectory()) {
          const subExe = findGameExe(fullPath);
          if (subExe) return subExe;
        }
      }
      return null;
    }

    // Prefer the first non-utility exe found
    return exeFiles[0];
  } catch (error) {
    console.error('Error finding exe:', error);
    return null;
  }
}

// Download GlobalFix.zip from GitHub
async function downloadGlobalFix(destPath) {
  return new Promise((resolve, reject) => {
    const url = 'https://github.com/ShayneVi/Global-OnlineFix-Unsteam/raw/refs/heads/main/GlobalFix.zip';
    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', (err) => {
          fs.unlinkSync(destPath);
          reject(err);
        });
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// Extract zip to destination using 7-Zip (supports LZMA and other compression methods)
async function extractZip(zipPath, destPath) {
  const pathTo7zip = sevenBin.path7za;
  const seven = extractFull(zipPath, destPath, {
    $bin: pathTo7zip,
    recursive: true
  });

  return new Promise((resolve, reject) => {
    seven.on('end', () => {
      resolve();
    });
    seven.on('error', (err) => {
      reject(err);
    });
  });
}

// Modify unsteam.ini
function modifyUnsteamIni(iniPath, exeName, appId) {
  try {
    const config = ini.parse(fs.readFileSync(iniPath, 'utf-8'));

    // Modify the necessary fields
    if (!config.config) {
      config.config = {};
    }

    config.config.exe_file = exeName;
    config.config.real_app_id = appId;

    fs.writeFileSync(iniPath, ini.stringify(config));
    return true;
  } catch (error) {
    console.error('Error modifying INI:', error);
    return false;
  }
}

// Modify Steam launch options
async function modifySteamLaunchOptions(appId, gamePath) {
  try {
    const steamPath = findSteamPath();
    if (!steamPath) {
      throw new Error('Steam path not found');
    }

    const userDataPath = path.join(steamPath, 'userdata');
    const users = fs.readdirSync(userDataPath);

    for (const user of users) {
      const configPath = path.join(userDataPath, user, 'config', 'localconfig.vdf');

      if (fs.existsSync(configPath)) {
        let content = fs.readFileSync(configPath, 'utf-8');

        // Find the app section
        const appRegex = new RegExp(`"${appId}"\\s*{([^}]*)}`, 'gs');
        const match = appRegex.exec(content);

        if (match) {
          const launchOptions = `"${path.join(gamePath, 'unsteam_loader64.exe')}" %command%`;

          // Check if LaunchOptions already exists
          if (match[1].includes('LaunchOptions')) {
            content = content.replace(
              new RegExp(`("${appId}"\\s*{[^}]*"LaunchOptions"\\s+"[^"]*")`, 's'),
              `$1\n\t\t\t\t"LaunchOptions"\t\t"${launchOptions}"`
            );
          } else {
            // Add LaunchOptions
            content = content.replace(
              new RegExp(`("${appId}"\\s*{)`, 's'),
              `$1\n\t\t\t\t"LaunchOptions"\t\t"${launchOptions}"`
            );
          }

          fs.writeFileSync(configPath, content, 'utf-8');
          return true;
        }
      }
    }

    throw new Error('Could not find app configuration in Steam config files');
  } catch (error) {
    console.error('Error modifying launch options:', error);
    return false;
  }
}

// Main IPC handler
ipcMain.handle('install-globalfix', async (event, appId) => {
  try {
    // Step 1: Find Steam installation
    const steamPath = findSteamPath();
    if (!steamPath) {
      return { success: false, error: 'Steam installation not found' };
    }

    // Step 2: Get all Steam library paths
    const libraries = getSteamLibraryPaths(steamPath);

    // Step 3: Find game by AppID
    const gameFolder = findGameByAppId(libraries, appId);
    if (!gameFolder) {
      return { success: false, error: `Game with AppID ${appId} not found in any Steam library` };
    }

    // Step 4: Find game executable
    const gameExe = findGameExe(gameFolder);
    if (!gameExe) {
      return { success: false, error: 'Could not find game executable' };
    }

    // Step 5: Download GlobalFix.zip
    const tempZipPath = path.join(app.getPath('temp'), 'GlobalFix.zip');
    await downloadGlobalFix(tempZipPath);

    // Step 6: Extract to game folder
    await extractZip(tempZipPath, gameFolder);

    // Step 7: Modify unsteam.ini
    const iniPath = path.join(gameFolder, 'unsteam.ini');
    if (!fs.existsSync(iniPath)) {
      return { success: false, error: 'unsteam.ini not found after extraction' };
    }

    modifyUnsteamIni(iniPath, gameExe, appId);

    // Step 8: Modify Steam launch options
    await modifySteamLaunchOptions(appId, gameFolder);

    // Cleanup
    fs.unlinkSync(tempZipPath);

    return {
      success: true,
      gameFolder: gameFolder,
      gameExe: gameExe
    };
  } catch (error) {
    console.error('Installation error:', error);
    return { success: false, error: error.message };
  }
});
