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
    resizable: false,
    icon: path.join(__dirname, '4310811.png')
  });

  mainWindow.loadFile('index.html');

  // Only open DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    // mainWindow.webContents.openDevTools();
  }
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

// Find the main executable in game folder - returns full path to exe
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
          if (subExe) return subExe; // Already returns full path
        }
      }
      return null;
    }

    // Return full path to the first non-utility exe found
    return path.join(gameFolder, exeFiles[0]);
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
  let pathTo7zip = sevenBin.path7za;

  // When packaged, 7zip-bin is unpacked to app.asar.unpacked
  // but sevenBin.path7za still points to app.asar, so we need to fix the path
  if (app.isPackaged && pathTo7zip.includes('app.asar')) {
    pathTo7zip = pathTo7zip.replace('app.asar', 'app.asar.unpacked');
  }

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

// Modify unsteam.ini - preserve original format and comments
function modifyUnsteamIni(iniPath, exePath, dllPath, appId) {
  try {
    let content = fs.readFileSync(iniPath, 'utf-8');

    // Replace exe_file in [loader] section (can be filename or full path)
    content = content.replace(/^exe_file=.*$/m, `exe_file=${exePath}`);

    // Replace dll_file in [loader] section (can be filename or full path)
    content = content.replace(/^dll_file=.*$/m, `dll_file=${dllPath}`);

    // Replace real_app_id in [game] section
    content = content.replace(/^real_app_id=.*$/m, `real_app_id=${appId}`);

    fs.writeFileSync(iniPath, content, 'utf-8');
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

    let modified = false;

    for (const user of users) {
      const configPath = path.join(userDataPath, user, 'config', 'localconfig.vdf');

      if (fs.existsSync(configPath)) {
        let content = fs.readFileSync(configPath, 'utf-8');

        // Escape backslashes for the launch options path
        const launchOptions = `\\"${path.join(gamePath, 'unsteam_loader64.exe').replace(/\\/g, '\\\\')}\\" %command%`;

        // Check if app ID exists in this config
        if (content.includes(`"${appId}"`)) {
          // Find the app section - look for the pattern: "appid"\n\t\t\t{
          const appSectionRegex = new RegExp(`("${appId}"\\s*\\n\\s*\\{)`, 'g');

          if (appSectionRegex.test(content)) {
            // Check if LaunchOptions already exists for this app
            const launchOptionsPattern = new RegExp(
              `"${appId}"\\s*\\n\\s*\\{[^}]*"LaunchOptions"\\s*"[^"]*"`,
              's'
            );

            if (launchOptionsPattern.test(content)) {
              // Update existing LaunchOptions
              content = content.replace(
                new RegExp(`("${appId}"\\s*\\n\\s*\\{[^}]*"LaunchOptions"\\s*")([^"]*)(")`,'s'),
                `$1${launchOptions}$3`
              );
            } else {
              // Add new LaunchOptions after the opening brace of the app section
              content = content.replace(
                new RegExp(`("${appId}"\\s*\\n\\s*\\{)`,''),
                `$1\n\t\t\t\t"LaunchOptions"\t\t"${launchOptions}"`
              );
            }

            fs.writeFileSync(configPath, content, 'utf-8');
            modified = true;
            console.log(`Launch options set for AppID ${appId} in user ${user}`);
          }
        }
      }
    }

    if (!modified) {
      throw new Error(`Could not find app configuration for AppID ${appId} in Steam config files`);
    }

    return true;
  } catch (error) {
    console.error('Error modifying launch options:', error);
    return false;
  }
}

// Fetch Steam app list
let steamAppListCache = null;

ipcMain.handle('fetch-steam-apps', async () => {
  // Return cached list if available
  if (steamAppListCache) {
    return { success: true, apps: steamAppListCache };
  }

  return new Promise((resolve) => {
    const url = 'https://api.steampowered.com/ISteamApps/GetAppList/v2/';

    https.get(url, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.applist && parsed.applist.apps) {
            // Filter out entries with empty names and sort by name
            const apps = parsed.applist.apps
              .filter(app => app.name && app.name.trim() !== '')
              .sort((a, b) => a.name.localeCompare(b.name));

            steamAppListCache = apps;
            resolve({ success: true, apps: apps });
          } else {
            resolve({ success: false, error: 'Invalid response format' });
          }
        } catch (error) {
          resolve({ success: false, error: 'Failed to parse Steam app list' });
        }
      });
    }).on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
  });
});

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

    // Step 4: Find game executable (returns full path)
    const gameExeFullPath = findGameExe(gameFolder);
    if (!gameExeFullPath) {
      return { success: false, error: 'Could not find game executable' };
    }

    // Extract the directory containing the exe and the exe filename
    const gameExeDir = path.dirname(gameExeFullPath);
    const gameExeName = path.basename(gameExeFullPath);

    // Step 5: Download GlobalFix.zip
    const tempZipPath = path.join(app.getPath('temp'), 'GlobalFix.zip');
    await downloadGlobalFix(tempZipPath);

    // Step 6: Extract to the directory containing the game exe
    await extractZip(tempZipPath, gameExeDir);

    // Step 7: Handle unsteam.ini placement and configuration
    // Check if exe is in a subdirectory or in the root
    const exeInSubfolder = path.normalize(gameExeDir) !== path.normalize(gameFolder);

    let finalIniPath;
    let exePathForIni;
    let dllPathForIni;

    if (exeInSubfolder) {
      // Exe is in a subfolder - need ini in BOTH locations with full paths
      const extractedIniPath = path.join(gameExeDir, 'unsteam.ini');
      const rootIniPath = path.join(gameFolder, 'unsteam.ini');

      if (!fs.existsSync(extractedIniPath)) {
        return { success: false, error: 'unsteam.ini not found after extraction' };
      }

      // Copy unsteam.ini to game root (keep original in exe folder too)
      fs.copyFileSync(extractedIniPath, rootIniPath);

      // Use full paths for exe and dll
      exePathForIni = gameExeFullPath;
      dllPathForIni = path.join(gameExeDir, 'unsteam64.dll');

      // Modify BOTH copies of unsteam.ini with full paths
      modifyUnsteamIni(extractedIniPath, exePathForIni, dllPathForIni, appId); // In exe folder
      modifyUnsteamIni(rootIniPath, exePathForIni, dllPathForIni, appId);      // In root folder

      finalIniPath = rootIniPath; // For logging purposes
    } else {
      // Exe is in root - only one ini needed, use filenames only
      finalIniPath = path.join(gameExeDir, 'unsteam.ini');

      if (!fs.existsSync(finalIniPath)) {
        return { success: false, error: 'unsteam.ini not found after extraction' };
      }

      // Use just filenames
      exePathForIni = gameExeName;
      dllPathForIni = 'unsteam64.dll';

      // Modify the single unsteam.ini
      modifyUnsteamIni(finalIniPath, exePathForIni, dllPathForIni, appId);
    }

    // Step 8: Modify Steam launch options
    // Launch options point to unsteam_loader64.exe which is always in the same folder as game exe
    const launchOptionsPath = `"${path.join(gameExeDir, 'unsteam_loader64.exe')}" %command%`;

    let launchOptionsSuccess = false;
    let launchOptionsError = null;

    try {
      launchOptionsSuccess = await modifySteamLaunchOptions(appId, gameExeDir);
    } catch (error) {
      launchOptionsError = error.message;
    }

    // Cleanup
    fs.unlinkSync(tempZipPath);

    return {
      success: true,
      gameFolder: gameExeDir,
      gameExe: gameExeName,
      launchOptionsSet: launchOptionsSuccess,
      launchOptionsPath: launchOptionsPath,
      launchOptionsError: launchOptionsError
    };
  } catch (error) {
    console.error('Installation error:', error);
    return { success: false, error: error.message };
  }
});
