const { app, BrowserWindow, ipcMain, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { extractFull } = require('node-7z');
const sevenBin = require('7zip-bin');
const ini = require('ini');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

let mainWindow;

// Helper function to log to both main console AND renderer console
function logToRenderer(...args) {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');

  console.log(...args); // Log to main process console

  // Send to renderer console if window exists
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.executeJavaScript(`console.log(${JSON.stringify(message)})`);
  }
}

function logErrorToRenderer(...args) {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');

  console.error(...args); // Log to main process console

  // Send to renderer console if window exists
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.executeJavaScript(`console.error(${JSON.stringify(message)})`);
  }
}

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
    mainWindow.webContents.openDevTools();
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
  // Method 1: Check Windows Registry (most reliable)
  const { execSync } = require('child_process');

  // Try multiple registry keys (64-bit and 32-bit)
  const registryKeys = [
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Valve\\Steam',
    'HKEY_LOCAL_MACHINE\\SOFTWARE\\Valve\\Steam',
    'HKEY_CURRENT_USER\\SOFTWARE\\Valve\\Steam'
  ];

  for (const regKey of registryKeys) {
    try {
      const regQuery = `reg query "${regKey}" /v InstallPath`;
      const output = execSync(regQuery, { encoding: 'utf-8' });
      const match = output.match(/InstallPath\s+REG_SZ\s+(.+)/);

      if (match && match[1]) {
        const steamPath = match[1].trim();
        if (fs.existsSync(steamPath) && fs.existsSync(path.join(steamPath, 'steam.exe'))) {
          console.log(`Found Steam via Registry (${regKey}): ${steamPath}`);
          return steamPath;
        }
      }
    } catch (error) {
      // Continue to next registry key
      continue;
    }
  }

  console.log('Registry lookup failed for all keys, trying other methods...');

  // Method 2: Check all drives (A-Z) for Steam installation
  const drives = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const commonLocations = [
    'Program Files (x86)\\Steam',
    'Program Files\\Steam',
    'Steam',
    'Games\\Steam',
    'SteamLibrary',
    'Valve\\Steam',
    'Steam Games\\Steam',
    'Program Files (x86)\\Valve\\Steam',
    'Program Files\\Valve\\Steam'
  ];

  for (const drive of drives) {
    for (const location of commonLocations) {
      const steamPath = `${drive}:\\${location}`;
      if (fs.existsSync(steamPath) && fs.existsSync(path.join(steamPath, 'steam.exe'))) {
        console.log(`Found Steam on ${drive}: drive: ${steamPath}`);
        return steamPath;
      }
    }
  }

  // Method 3: Fall back to environment variables (already covers C: drive)
  const possiblePaths = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Steam'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam')
  ];

  for (const steamPath of possiblePaths) {
    if (fs.existsSync(steamPath)) {
      console.log(`Found Steam via environment: ${steamPath}`);
      return steamPath;
    }
  }

  console.error('Steam installation not found on any drive!');
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

// ============================================================
// GAME EXE AUTO-DETECTION
// Search for "GAME EXE AUTO-DETECTION" to find this section
// ============================================================
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
// ============================================================
// END GAME EXE AUTO-DETECTION
// ============================================================

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

// Unpack game executable using Steamless
async function steamlessUnpack(exePath) {
  return new Promise((resolve, reject) => {
    // Determine the correct resources path based on whether app is packaged
    // When packaged: use process.resourcesPath/app.asar.unpacked
    // When dev: use __dirname
    const resourcesPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked')
      : __dirname;

    const steamlessExe = path.join(resourcesPath, 'steamless', 'Steamless.CLI.exe');

    console.log(`Looking for Steamless at: ${steamlessExe}`);

    // Check if Steamless exists
    if (!fs.existsSync(steamlessExe)) {
      return reject(new Error(`Steamless.CLI.exe not found at: ${steamlessExe}\n\nPlease ensure the steamless folder is included in your installation.`));
    }

    const args = ['--quiet', '--recalcchecksum', exePath];

    console.log(`Running Steamless on: ${exePath}`);

    exec(`"${steamlessExe}" ${args.map(arg => `"${arg}"`).join(' ')}`, (error, stdout, stderr) => {
      if (error) {
        console.error('Steamless error:', stderr || error.message);
        return reject(new Error(`Steamless unpacking failed: ${error.message}`));
      }

      const unpackedPath = exePath + '.unpacked.exe';

      if (!fs.existsSync(unpackedPath)) {
        return reject(new Error('Steamless did not create unpacked file. Game may not have SteamStub protection.'));
      }

      console.log('Steamless unpacking completed successfully');
      resolve(unpackedPath);
    });
  });
}

// Modify unsteam.ini - preserve original format and comments
function modifyUnsteamIni(iniPath, exePath, dllPath, appId, steamId, username) {
  try {
    let content = fs.readFileSync(iniPath, 'utf-8');

    // Replace exe_file in [loader] section (can be filename or full path)
    content = content.replace(/^exe_file=.*$/m, `exe_file=${exePath}`);

    // Replace dll_file in [loader] section (can be filename or full path)
    content = content.replace(/^dll_file=.*$/m, `dll_file=${dllPath}`);

    // Replace real_app_id in [game] section
    content = content.replace(/^real_app_id=.*$/m, `real_app_id=${appId}`);

    // Replace Steam ID if provided
    if (steamId && steamId.trim() !== '') {
      content = content.replace(/^steam_id=.*$/m, `steam_id=${steamId.trim()}`);
    }

    // Replace username if provided
    if (username && username.trim() !== '') {
      content = content.replace(/^player_name=.*$/m, `player_name=${username.trim()}`);
    }

    fs.writeFileSync(iniPath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('Error modifying INI:', error);
    return false;
  }
}

// Remove Steam launch options by setting them to empty string
async function removeSteamLaunchOptions(appId) {
  try {
    const steamPath = findSteamPath();
    if (!steamPath) {
      throw new Error('Steam path not found');
    }

    const userDataPath = path.join(steamPath, 'userdata');
    const users = fs.readdirSync(userDataPath);

    let modifiedCount = 0;
    const modifiedUsers = [];

    // Loop through ALL users and clear launch options for each one that has this game
    for (const user of users) {
      const configPath = path.join(userDataPath, user, 'config', 'localconfig.vdf');

      if (fs.existsSync(configPath)) {
        let content = fs.readFileSync(configPath, 'utf-8');

        // Check if app ID exists in this config
        if (content.includes(`"${appId}"`)) {
          // Check if LaunchOptions exists for this app
          const launchOptionsPattern = new RegExp(
            `"${appId}"\\s*\\n\\s*\\{[^}]*"LaunchOptions"\\s*"[^"]*"`,
            's'
          );

          if (launchOptionsPattern.test(content)) {
            // Clear the LaunchOptions value (set it to empty string)
            // This mirrors how modifySteamLaunchOptions works but clears the value
            content = content.replace(
              new RegExp(`("${appId}"\\s*\\n\\s*\\{[^}]*"LaunchOptions"\\s*")([^"]*)(")`,'s'),
              `$1$3`  // Keeps the key and quotes but removes the value between them
            );

            fs.writeFileSync(configPath, content, 'utf-8');
            modifiedCount++;
            modifiedUsers.push(user);
            console.log(`✓ Launch options cleared for AppID ${appId} in Steam user ${user}`);
          }
        }
      }
    }

    // Log summary
    if (modifiedCount > 0) {
      if (modifiedCount === 1) {
        console.log(`✓ Launch options successfully cleared for 1 Steam user`);
      } else {
        console.log(`✓ Launch options successfully cleared for ${modifiedCount} Steam users: ${modifiedUsers.join(', ')}`);
      }
    } else {
      console.log(`No launch options found to clear for AppID ${appId}`);
    }

    return modifiedCount > 0;
  } catch (error) {
    console.error('Error removing launch options:', error);
    return false;
  }
}

// Save fix state to file for tracking what was installed
function saveFixState(gameFolder, state) {
  try {
    const statePath = path.join(gameFolder, '.globalfix-state.json');
    const stateData = {
      ...state,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(statePath, JSON.stringify(stateData, null, 2), 'utf-8');
    console.log('Fix state saved:', stateData);
    return true;
  } catch (error) {
    console.error('Error saving fix state:', error);
    return false;
  }
}

// Load fix state from file
function loadFixState(gameFolder) {
  try {
    const statePath = path.join(gameFolder, '.globalfix-state.json');
    if (!fs.existsSync(statePath)) {
      return null;
    }
    const content = fs.readFileSync(statePath, 'utf-8');
    const state = JSON.parse(content);
    console.log('Fix state loaded:', state);
    return state;
  } catch (error) {
    console.error('Error loading fix state:', error);
    return null;
  }
}

// Delete fix state file
function deleteFixState(gameFolder) {
  try {
    const statePath = path.join(gameFolder, '.globalfix-state.json');
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
      console.log('Fix state deleted');
    }
    return true;
  } catch (error) {
    console.error('Error deleting fix state:', error);
    return false;
  }
}

// Modify Steam launch options
// Helper function to close Steam and wait for it to fully exit
async function closeSteamAndWait(steamPath) {
  const { execSync } = require('child_process');

  try {
    // Check if Steam is running
    const tasklistOutput = execSync('tasklist /FI "IMAGENAME eq steam.exe" /NH', { encoding: 'utf-8' });
    if (!tasklistOutput.toLowerCase().includes('steam.exe')) {
      return false; // Steam is not running
    }

    logToRenderer('🔄 Closing Steam to apply configuration changes...');
    logToRenderer('   Steam must fully shut down and save its config before we can modify it.');

    // Close Steam gracefully first
    try {
      execSync('taskkill /IM steam.exe', { encoding: 'utf-8' });
      logToRenderer('   Sent graceful shutdown signal to Steam...');
    } catch (e) {
      // Ignore errors - Steam might already be closed
    }

    // Wait for Steam to fully close (check every 500ms, max 10 seconds)
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500));

      const checkOutput = execSync('tasklist /FI "IMAGENAME eq steam.exe" /NH', { encoding: 'utf-8' });
      if (!checkOutput.toLowerCase().includes('steam.exe')) {
        logToRenderer('✓ Steam process has exited');
        break;
      }
      attempts++;
    }

    // If graceful shutdown didn't work, force kill Steam
    if (attempts >= maxAttempts) {
      logToRenderer('⚠️ Steam did not close gracefully, forcing shutdown...');
      try {
        execSync('taskkill /F /IM steam.exe', { encoding: 'utf-8' });
        logToRenderer('✓ Forced Steam to close');

        // Wait a bit more for force kill to complete
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify Steam is actually closed
        const verifyOutput = execSync('tasklist /FI "IMAGENAME eq steam.exe" /NH', { encoding: 'utf-8' });
        if (verifyOutput.toLowerCase().includes('steam.exe')) {
          logErrorToRenderer('✗ ERROR: Steam is still running even after force kill!');
          throw new Error('Could not close Steam. Please close Steam manually and try again.');
        }
      } catch (killError) {
        if (killError.message.includes('Could not close Steam')) {
          throw killError;
        }
        // If taskkill failed, Steam might already be closed - verify
        const finalCheck = execSync('tasklist /FI "IMAGENAME eq steam.exe" /NH', { encoding: 'utf-8' });
        if (finalCheck.toLowerCase().includes('steam.exe')) {
          logErrorToRenderer('✗ ERROR: Failed to close Steam');
          throw new Error('Could not close Steam. Please close Steam manually and try again.');
        }
      }
    }

    // CRITICAL: Wait for Steam's config files to finish being written
    // Steam writes localconfig.vdf as it shuts down, we need to wait for that to complete
    logToRenderer('⏳ Waiting for Steam to finish writing config files...');

    const userDataPath = path.join(steamPath, 'userdata');
    if (fs.existsSync(userDataPath)) {
      const users = fs.readdirSync(userDataPath);
      const configFiles = [];

      // Collect all localconfig.vdf files
      for (const user of users) {
        const configPath = path.join(userDataPath, user, 'config', 'localconfig.vdf');
        if (fs.existsSync(configPath)) {
          configFiles.push(configPath);
        }
      }

      // Wait for all config files to stop being modified (stable for 2 seconds)
      const stabilityWaitMs = 2000;
      const maxConfigWaitMs = 10000;
      const startTime = Date.now();

      let allStable = false;
      while (!allStable && (Date.now() - startTime) < maxConfigWaitMs) {
        // Get current modification times
        const mtimes = configFiles.map(f => {
          try {
            return fs.statSync(f).mtimeMs;
          } catch (e) {
            return 0;
          }
        });

        // Wait
        await new Promise(resolve => setTimeout(resolve, stabilityWaitMs));

        // Check if any files were modified during the wait
        allStable = true;
        for (let i = 0; i < configFiles.length; i++) {
          try {
            const newMtime = fs.statSync(configFiles[i]).mtimeMs;
            if (newMtime !== mtimes[i]) {
              allStable = false;
              logToRenderer(`   Config file still being written (${users[i]})...`);
              break;
            }
          } catch (e) {
            // File might have been deleted or locked, skip
          }
        }
      }

      if (allStable) {
        logToRenderer('✓ Config files are stable and ready for modification');
      } else {
        logToRenderer('⚠️ Config files may still be in use, proceeding anyway...');
      }
    }

    // Extra safety wait
    logToRenderer('   Adding 2-second safety buffer...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    logToRenderer('✓ Steam fully shut down - safe to modify config');
    return true; // We closed Steam

  } catch (e) {
    logErrorToRenderer('Error while closing Steam:', e.message);
    return false;
  }
}

// Helper function to restart Steam
async function restartSteam(steamPath) {
  const { exec } = require('child_process');

  try {
    logToRenderer('\n🔄 Restarting Steam...');

    // Find steam.exe path
    const steamExePath = path.join(steamPath, 'steam.exe');

    if (!fs.existsSync(steamExePath)) {
      logErrorToRenderer('Steam.exe not found at:', steamExePath);
      return false;
    }

    // Start Steam (using exec for non-blocking)
    exec(`"${steamExePath}"`, (error) => {
      if (error) {
        logErrorToRenderer('Error starting Steam:', error.message);
      }
    });

    // Give Steam a moment to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    logToRenderer('✓ Steam restarted successfully');
    return true;
  } catch (e) {
    logErrorToRenderer('Error restarting Steam:', e.message);
    return false;
  }
}

async function modifySteamLaunchOptions(appId, loaderPath) {
  logToRenderer('\n╔══════════════════════════════════════════════════════════╗');
  logToRenderer('║  INSIDE modifySteamLaunchOptions FUNCTION               ║');
  logToRenderer('╚══════════════════════════════════════════════════════════╝');
  logToRenderer('Function called with:');
  logToRenderer('  - AppID:', appId);
  logToRenderer('  - Loader Path:', loaderPath);

  try {
    logToRenderer('\nStep 1: Finding Steam installation...');
    const steamPath = findSteamPath();
    logToRenderer('Steam Path found:', steamPath);

    if (!steamPath) {
      logErrorToRenderer('ERROR: Steam path is null/undefined!');
      throw new Error('Steam installation not found. Please ensure Steam is installed. If Steam is installed in a custom location, the app may not be able to find it automatically.');
    }

    // Close Steam if it's running
    logToRenderer('\n=== Step 2: Ensuring Steam is closed ===');
    const steamWasClosed = await closeSteamAndWait(steamPath);
    const needsSteamRestart = steamWasClosed;

    if (steamWasClosed) {
      logToRenderer('✓ Steam has been closed to prevent config overwrites\n');
    } else {
      logToRenderer('✓ Steam was not running\n');
    }

    const userDataPath = path.join(steamPath, 'userdata');

    if (!fs.existsSync(userDataPath)) {
      throw new Error('Steam userdata folder not found. Steam may not be configured properly.');
    }

    const users = fs.readdirSync(userDataPath);

    if (users.length === 0) {
      throw new Error('No Steam users found. Please ensure you have logged into Steam at least once.');
    }

    let modifiedCount = 0;
    let foundAppId = false;
    const modifiedUsers = [];

    // Loop through ALL users and modify launch options for each one that has this game
    for (const user of users) {
      const configPath = path.join(userDataPath, user, 'config', 'localconfig.vdf');

      logToRenderer(`\n=== Checking Steam user ${user} ===`);
      logToRenderer(`Config path: ${configPath}`);

      if (fs.existsSync(configPath)) {
        logToRenderer(`✓ Config file exists`);
        let content = fs.readFileSync(configPath, 'utf-8');

        // Escape backslashes for the launch options path
        const launchOptions = `\\"${loaderPath.replace(/\\/g, '\\\\')}\\" %command%`;
        logToRenderer(`Launch options to set: ${launchOptions}`);

        // Check if app ID exists in this config
        logToRenderer(`Looking for AppID "${appId}" in config...`);
        if (content.includes(`"${appId}"`)) {
          logToRenderer(`✓ AppID "${appId}" found in config file`);
          foundAppId = true;

          // Extract the section around the AppID for debugging
          const appIdIndex = content.indexOf(`"${appId}"`);
          const sampleText = content.substring(Math.max(0, appIdIndex - 50), Math.min(content.length, appIdIndex + 200));
          logToRenderer(`Context around AppID:\n${sampleText}\n`);

          // Find the app section - look for the pattern: "appid"\n\t\t\t{
          const appSectionRegex = new RegExp(`("${appId}"\\s*\\n\\s*\\{)`, 'g');

          if (appSectionRegex.test(content)) {
            logToRenderer(`✓ App section pattern matched`);

            // Check if LaunchOptions already exists for this app
            const launchOptionsPattern = new RegExp(
              `"${appId}"\\s*\\n\\s*\\{[^}]*"LaunchOptions"\\s*"[^"]*"`,
              's'
            );

            // Create a backup before modifying
            const backupPath = configPath + '.backup';
            fs.writeFileSync(backupPath, content, 'utf-8');
            logToRenderer(`Created backup at: ${backupPath}`);

            if (launchOptionsPattern.test(content)) {
              logToRenderer(`Updating existing LaunchOptions...`);
              // Update existing LaunchOptions
              const replaceRegex = new RegExp(`("${appId}"\\s*\\n\\s*\\{[^}]*"LaunchOptions"\\s*")([^"]*)(")`,'s');
              const oldContent = content;
              content = content.replace(replaceRegex, `$1${launchOptions}$3`);

              if (content !== oldContent) {
                logToRenderer(`✓ Content was modified`);
              } else {
                logToRenderer(`⚠️ WARNING: Replace didn't change anything!`);
              }
            } else {
              logToRenderer(`Adding new LaunchOptions entry...`);
              // Add new LaunchOptions after the opening brace of the app section
              const addRegex = new RegExp(`("${appId}"\\s*\\n\\s*\\{)`,'');
              const oldContent = content;
              content = content.replace(addRegex, `$1\n\t\t\t\t"LaunchOptions"\t\t"${launchOptions}"`);

              if (content !== oldContent) {
                logToRenderer(`✓ LaunchOptions entry added`);
              } else {
                logToRenderer(`⚠️ WARNING: Add didn't change anything!`);
              }
            }

            fs.writeFileSync(configPath, content, 'utf-8');
            logToRenderer(`✓ Config file written successfully`);

            // Verify the write
            const verifyContent = fs.readFileSync(configPath, 'utf-8');
            if (verifyContent.includes(launchOptions)) {
              logToRenderer(`✓ VERIFIED: Launch options are in the file`);
            } else {
              logToRenderer(`✗ ERROR: Launch options NOT found after writing!`);
            }

            modifiedCount++;
            modifiedUsers.push(user);
            logToRenderer(`✓ Launch options set for AppID ${appId} in Steam user ${user}`);
          } else {
            logToRenderer(`✗ App section regex did NOT match`);
            logToRenderer(`Regex pattern: ("${appId}"\\s*\\n\\s*\\{)`);
          }
        } else {
          logToRenderer(`✗ AppID "${appId}" NOT found in config file`);
        }
      } else {
        logToRenderer(`✗ Config file does not exist`);
      }
    }

    if (modifiedCount === 0) {
      if (!foundAppId) {
        throw new Error(`Game (AppID ${appId}) has not been launched in Steam yet. Please launch the game at least once, close it, then try applying the fix again. This creates the necessary Steam configuration entry.`);
      } else {
        throw new Error(`Could not modify launch options for AppID ${appId}. The game may need to be launched once to create its Steam configuration entry.`);
      }
    }

    // Log summary
    if (modifiedCount === 1) {
      logToRenderer(`✓ Launch options successfully updated for 1 Steam user`);
    } else {
      logToRenderer(`✓ Launch options successfully updated for ${modifiedCount} Steam users: ${modifiedUsers.join(', ')}`);
    }

    if (needsSteamRestart) {
      logToRenderer('\n⚠️ IMPORTANT: Please restart Steam for the changes to take effect!');
    }

    return { success: true, modifiedCount, modifiedUsers, needsSteamRestart };
  } catch (error) {
    logErrorToRenderer('Error modifying launch options:', error);
    throw error; // Re-throw to preserve the error message
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

// Detect which Steam API DLL the game uses
function detectSteamApiDll(gameFolder) {
  const api64Path = path.join(gameFolder, 'steam_api64.dll');
  const api32Path = path.join(gameFolder, 'steam_api.dll');

  // Check recursively in subdirectories too
  function searchDir(dir, filename) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (file.toLowerCase() === filename.toLowerCase()) {
        return fullPath;
      }
      if (fs.statSync(fullPath).isDirectory()) {
        const found = searchDir(fullPath, filename);
        if (found) return found;
      }
    }
    return null;
  }

  if (fs.existsSync(api64Path)) {
    return { path: api64Path, is64bit: true };
  }
  if (fs.existsSync(api32Path)) {
    return { path: api32Path, is64bit: false };
  }

  // Search in subdirectories
  const found64 = searchDir(gameFolder, 'steam_api64.dll');
  if (found64) return { path: found64, is64bit: true };

  const found32 = searchDir(gameFolder, 'steam_api.dll');
  if (found32) return { path: found32, is64bit: false };

  return null;
}

// Fetch achievements from Steam Web API
async function fetchAchievements(appId, apiKey) {
  return new Promise((resolve, reject) => {
    const url = `http://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${apiKey}&appid=${appId}&l=english&format=json`;

    http.get(url, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.game && parsed.game.availableGameStats) {
            resolve(parsed.game.availableGameStats);
          } else {
            resolve({ achievements: [], stats: [] });
          }
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

// Download achievement image
async function downloadImage(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 404) {
        resolve(false); // Image not found, skip
        return;
      }

      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
      file.on('error', (err) => {
        fs.unlinkSync(destPath);
        reject(err);
      });
    }).on('error', reject);
  });
}

// Create steam_settings folder structure
async function createSteamSettings(gameFolder, appId, goldbergOptions, achievementsData) {
  const settingsFolder = path.join(gameFolder, 'steam_settings');
  const imagesFolder = path.join(settingsFolder, 'achievement_images');

  // Create directories
  if (!fs.existsSync(settingsFolder)) {
    fs.mkdirSync(settingsFolder, { recursive: true });
  }

  // Create steam_appid.txt
  fs.writeFileSync(path.join(settingsFolder, 'steam_appid.txt'), appId.toString(), 'utf-8');

  // Create configs.user.ini
  const userIni = `[user::general]
# user account name
# default=gse orca
account_name=${goldbergOptions.accountName}
# your account ID in Steam64 format
# if the specified ID is invalid, the emu will ignore it and generate a proper one
# default=randomly generated by the emu only once and saved in the global settings
account_steamid=${goldbergOptions.steamId}
# the language reported to the app/game
# this must exist in 'supported_languages.txt', otherwise it will be ignored by the emu
# look for the column 'API language code' here: https://partner.steamgames.com/doc/store/localization/languages
# default=english
language=${goldbergOptions.language}
`;
  fs.writeFileSync(path.join(settingsFolder, 'configs.user.ini'), userIni, 'utf-8');

  // Create configs.main.ini
  const mainIni = `[main::connectivity]
# 1=disable all steam networking interface functionality
# this won't prevent games/apps from making external requests
# networking related functionality like lobbies or those that launch a server in the background will not work
# default=0
disable_networking=0
# change the UDP/TCP port the emulator listens on, you should probably not change this because everyone needs to use the same port or you won't find yourselves on the network
# default=0
listen_port=47584
# pretend steam is running in offline mode
# Some games that connect to online servers might only work if the steam emu behaves like steam is in offline mode
# default=0
offline=0
`;
  fs.writeFileSync(path.join(settingsFolder, 'configs.main.ini'), mainIni, 'utf-8');

  // Create configs.overlay.ini
  const overlayIni = `[overlay::general]
# enable the experimental overlay, might cause crashes
# default=0
enable_experimental_overlay=0
`;
  fs.writeFileSync(path.join(settingsFolder, 'configs.overlay.ini'), overlayIni, 'utf-8');

  // Create configs.app.ini
  const appIni = `[app::dlcs]
# 1=report all DLCs as unlocked
# 0=report only the DLCs mentioned
# some games check for "hidden" DLCs, hence this should be set to 1 in that case
# but other games detect emus by querying for a fake/bad DLC, hence this should be set to 0 in that case
# default=1
unlock_all=0
`;
  fs.writeFileSync(path.join(settingsFolder, 'configs.app.ini'), appIni, 'utf-8');

  // Create achievements.json if achievements exist and API key was provided
  if (achievementsData && achievementsData.achievements && achievementsData.achievements.length > 0) {
    // Create achievement_images folder
    if (!fs.existsSync(imagesFolder)) {
      fs.mkdirSync(imagesFolder, { recursive: true });
    }

    // Format achievements according to Goldberg format
    const achievementsJson = achievementsData.achievements.map(ach => ({
      description: ach.description || '',
      displayName: ach.displayName || ach.name || '',
      hidden: ach.hidden || 0,
      icon: `achievement_images/${path.basename(ach.icon || '')}`,
      icongray: `achievement_images/${path.basename(ach.icongray || '')}`,
      name: ach.name || ''
    }));

    fs.writeFileSync(
      path.join(settingsFolder, 'achievements.json'),
      JSON.stringify(achievementsJson, null, 2),
      'utf-8'
    );

    // Download achievement images
    console.log(`Downloading ${achievementsData.achievements.length} achievement images...`);
    for (const ach of achievementsData.achievements) {
      if (ach.icon) {
        const iconName = path.basename(ach.icon);
        const iconPath = path.join(imagesFolder, iconName);
        try {
          await downloadImage(ach.icon, iconPath);
        } catch (err) {
          console.warn(`Failed to download icon: ${ach.icon}`, err);
        }
      }
      if (ach.icongray) {
        const iconGrayName = path.basename(ach.icongray);
        const iconGrayPath = path.join(imagesFolder, iconGrayName);
        try {
          await downloadImage(ach.icongray, iconGrayPath);
        } catch (err) {
          console.warn(`Failed to download icongray: ${ach.icongray}`, err);
        }
      }
    }
  }

  return settingsFolder;
}

// Install Goldberg emulator
async function installGoldberg(gameFolder, appId, goldbergOptions) {
  // Detect which Steam API DLL the game uses
  const steamApiInfo = detectSteamApiDll(gameFolder);
  if (!steamApiInfo) {
    throw new Error('Could not find steam_api.dll or steam_api64.dll in game folder');
  }

  console.log(`Found Steam API DLL: ${steamApiInfo.path} (${steamApiInfo.is64bit ? '64-bit' : '32-bit'})`);

  // Fetch achievements from Steam Web API (only if API key provided)
  let achievementsData = null;
  if (goldbergOptions.steamApiKey) {
    try {
      achievementsData = await fetchAchievements(appId, goldbergOptions.steamApiKey);
      console.log(`Fetched ${achievementsData.achievements?.length || 0} achievements`);
    } catch (error) {
      console.warn('Failed to fetch achievements:', error);
    }
  } else {
    console.log('No Steam API key provided, skipping achievement download');
  }

  // Create steam_settings folder
  const steamApiDir = path.dirname(steamApiInfo.path);
  await createSteamSettings(steamApiDir, appId, goldbergOptions, achievementsData);

  // Backup original Steam API DLL
  const backupPath = steamApiInfo.path + '.bak';
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(steamApiInfo.path, backupPath);
    console.log(`Backed up original Steam API DLL to: ${backupPath}`);
  }

  // Copy Goldberg steam_api DLL
  const resourcesPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : __dirname;
  const goldbergDllFolder = path.join(resourcesPath, 'goldberg_dlls');
  const is64bit = steamApiInfo.is64bit;
  const sourceDll = is64bit ? 'steam_api64.dll' : 'steam_api.dll';
  const sourcePath = path.join(goldbergDllFolder, sourceDll);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Goldberg DLL not found: ${sourceDll}. Please add it to the goldberg_dlls folder. See goldberg_dlls/README.md for details.`);
  }

  // Copy Goldberg DLL to game folder
  fs.copyFileSync(sourcePath, steamApiInfo.path);
  console.log(`Installed Goldberg ${sourceDll}`);

  console.log('Goldberg installation complete!');

  return {
    steamApiPath: steamApiInfo.path,
    is64bit: steamApiInfo.is64bit,
    achievementsCount: achievementsData?.achievements?.length || 0
  };
}

// Helper function to make HTTP request using Electron's net module (bypasses Cloudflare)
function makeElectronRequest(url, followRedirects = true) {
  return new Promise((resolve, reject) => {
    const redirectUrls = [];

    const request = net.request({
      method: 'GET',
      url: url,
      redirect: followRedirects ? 'follow' : 'manual'
    });

    request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    request.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8');
    request.setHeader('Accept-Language', 'en-US,en;q=0.9');

    // Track redirects
    request.on('redirect', (statusCode, method, redirectUrl, responseHeaders) => {
      console.log(`[PCGamingWiki] Redirect ${statusCode}: ${redirectUrl}`);
      redirectUrls.push(redirectUrl);
    });

    request.on('response', (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk.toString();
      });

      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          data: data,
          redirectUrls: redirectUrls,
          finalUrl: redirectUrls.length > 0 ? redirectUrls[redirectUrls.length - 1] : url
        });
      });

      response.on('error', (error) => {
        reject(error);
      });
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.end();
  });
}

// Fetch game info from PCGamingWiki
async function fetchPCGamingWikiInfo(appId) {
  try {
    console.log(`[PCGamingWiki] Fetching info for AppID: ${appId}`);

    // Step 1: Get the redirect from appid.php (follow redirects automatically)
    const redirectUrl = `https://pcgamingwiki.com/api/appid.php?appid=${appId}`;
    const response = await makeElectronRequest(redirectUrl, true);

    console.log(`[PCGamingWiki] Final response status: ${response.statusCode}`);
    console.log(`[PCGamingWiki] Redirect chain:`, response.redirectUrls);
    console.log(`[PCGamingWiki] Final URL: ${response.finalUrl}`);

    // The final redirect URL should be the wiki page
    const finalUrl = response.finalUrl;

    if (!finalUrl || !finalUrl.includes('/wiki/')) {
      console.log('[PCGamingWiki] ERROR: No wiki page found in redirects');
      return { success: false, error: 'Game not found on PCGamingWiki' };
    }

    // Extract page name from final URL
    const pageName = finalUrl.split('/wiki/')[1];

    console.log(`[PCGamingWiki] Extracted page name: ${pageName}`);

    if (!pageName) {
      console.log('[PCGamingWiki] ERROR: Could not extract page name');
      return { success: false, error: 'Game not found on PCGamingWiki' };
    }

    // Step 2: Fetch wikitext for the page
    const wikitextUrl = `https://www.pcgamingwiki.com/w/api.php?action=parse&page=${pageName}&prop=wikitext&format=json`;
    console.log(`[PCGamingWiki] Fetching wikitext from: ${wikitextUrl}`);

    const wikitextResponse = await makeElectronRequest(wikitextUrl, true);

    if (wikitextResponse.statusCode !== 200) {
      console.log('[PCGamingWiki] ERROR: Failed to fetch wikitext');
      return { success: false, error: 'Failed to fetch wikitext' };
    }

    const parsed = JSON.parse(wikitextResponse.data);

    if (parsed.parse && parsed.parse.wikitext) {
      const wikitext = parsed.parse.wikitext['*'];
      console.log('[PCGamingWiki] Successfully fetched and parsed wikitext');

      const gameInfo = parseWikitext(wikitext);
      console.log('[PCGamingWiki] Parsed game info:', JSON.stringify(gameInfo, null, 2));

      return { success: true, data: gameInfo };
    } else {
      console.log('[PCGamingWiki] ERROR: No wikitext in response');
      return { success: false, error: 'No wikitext found' };
    }

  } catch (error) {
    console.log('[PCGamingWiki] ERROR:', error);
    return { success: false, error: error.message || 'Network error' };
  }
}

// Parse wikitext to extract multiplayer and connection data
function parseWikitext(wikitext) {
  const result = {
    multiplayer: {},
    connections: {},
    ports: {}
  };

  // Extract multiplayer data
  const multiplayerText = extractTemplate(wikitext, 'Network/Multiplayer');
  if (multiplayerText) {
    console.log('[PCGamingWiki] Raw multiplayer template:', multiplayerText.substring(0, 200));

    result.multiplayer.localPlay = extractField(multiplayerText, 'local play');
    result.multiplayer.localPlayPlayers = extractField(multiplayerText, 'local play players');
    result.multiplayer.localPlayNotes = extractField(multiplayerText, 'local play notes');

    result.multiplayer.lanPlay = extractField(multiplayerText, 'lan play');
    result.multiplayer.lanPlayPlayers = extractField(multiplayerText, 'lan play players');
    result.multiplayer.lanPlayNotes = extractField(multiplayerText, 'lan play notes');

    result.multiplayer.onlinePlay = extractField(multiplayerText, 'online play');
    result.multiplayer.onlinePlayPlayers = extractField(multiplayerText, 'online play players');
    result.multiplayer.onlinePlayModes = extractField(multiplayerText, 'online play modes');
    result.multiplayer.onlinePlayNotes = extractField(multiplayerText, 'online play notes');

    result.multiplayer.crossplay = extractField(multiplayerText, 'crossplay');
    result.multiplayer.crossplayPlatforms = extractField(multiplayerText, 'crossplay platforms');
    result.multiplayer.crossplayNotes = extractField(multiplayerText, 'crossplay notes');

    result.multiplayer.asynchronous = extractField(multiplayerText, 'asynchronous');
  }

  // Extract connection data
  const connectionsText = extractTemplate(wikitext, 'Network/Connections');
  if (connectionsText) {
    // Log the FULL connections template (split into chunks if needed)
    console.log('[PCGamingWiki] ========== FULL CONNECTIONS TEMPLATE START ==========');
    console.log(connectionsText);
    console.log('[PCGamingWiki] ========== FULL CONNECTIONS TEMPLATE END ==========');

    result.connections.matchmaking = extractField(connectionsText, 'matchmaking');
    result.connections.matchmakingNotes = extractField(connectionsText, 'matchmaking notes');

    result.connections.p2p = extractField(connectionsText, 'p2p');
    result.connections.p2pNotes = extractField(connectionsText, 'p2p notes');

    result.connections.dedicated = extractField(connectionsText, 'dedicated');
    result.connections.dedicatedNotes = extractField(connectionsText, 'dedicated notes');

    result.connections.selfHosting = extractField(connectionsText, 'self-hosting');
    result.connections.selfHostingNotes = extractField(connectionsText, 'self-hosting notes');

    result.connections.directIp = extractField(connectionsText, 'direct ip');
    result.connections.directIpNotes = extractField(connectionsText, 'direct ip notes');

    console.log('[PCGamingWiki] Extracted dedicated:', result.connections.dedicated);
    console.log('[PCGamingWiki] Extracted selfHosting:', result.connections.selfHosting);
    console.log('[PCGamingWiki] Extracted directIp:', result.connections.directIp);
  }

  // Extract network ports
  const portsText = extractTemplate(wikitext, 'Network/Ports');
  if (portsText) {
    console.log('[PCGamingWiki] Raw ports template:', portsText);

    result.ports.tcp = extractField(portsText, 'tcp');
    result.ports.udp = extractField(portsText, 'udp');
    result.ports.upnp = extractField(portsText, 'upnp');
  }

  return result;
}

// Extract a template with proper handling of nested braces
function extractTemplate(wikitext, templateName) {
  const searchPattern = `{{${templateName}`;
  const startIndex = wikitext.indexOf(searchPattern);

  if (startIndex === -1) {
    return null;
  }

  // Start counting braces from the opening {{
  let braceCount = 0;
  let i = startIndex;

  while (i < wikitext.length) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') {
      braceCount++;
      i += 2;
    } else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
      braceCount--;
      i += 2;

      if (braceCount === 0) {
        // Found the closing braces
        return wikitext.substring(startIndex, i);
      }
    } else {
      i++;
    }
  }

  return null;
}

// Extract field value from wikitext
function extractField(text, fieldName) {
  // Escape special regex characters in fieldName
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // First, find the field line
  const fieldLineRegex = new RegExp(`^\\|\\s*${escapedFieldName}\\s*=(.*)$`, 'im');
  const lineMatch = text.match(fieldLineRegex);

  if (!lineMatch) {
    return ''; // Field not found
  }

  const valueOnSameLine = lineMatch[1].trim();

  // If there's no value on the same line, field is empty
  if (!valueOnSameLine) {
    return '';
  }

  // There's a value on the same line. Check if it continues on next lines.
  // Capture from |fieldname = until the next | at start of line or }}
  const multiLineRegex = new RegExp(
    `\\|\\s*${escapedFieldName}\\s*=\\s*([\\s\\S]*?)(?=^\\s*\\||^\\s*}}|$)`,
    'im'
  );
  const multiMatch = text.match(multiLineRegex);

  if (multiMatch && multiMatch[1]) {
    return multiMatch[1].trim();
  }

  // Fall back to single-line value
  return valueOnSameLine;
}

// IPC handler for fetching PCGamingWiki info
ipcMain.handle('fetch-pcgamingwiki-info', async (event, appId) => {
  try {
    const result = await fetchPCGamingWikiInfo(appId);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Recursively search for files matching pattern
function findFiles(dir, pattern) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        results = results.concat(findFiles(fullPath, pattern));
      } else if (file.toLowerCase() === pattern.toLowerCase()) {
        results.push(fullPath);
      }
    } catch (err) {
      console.warn(`Error accessing ${fullPath}:`, err);
    }
  }
  return results;
}

// Unfix game - remove selected GlobalFix and Goldberg modifications
async function unfixGame(gameFolder, removeGoldberg = true, removeUnsteam = true) {
  const removedItems = [];
  const errors = [];

  // 1. Restore steam_api.dll.bak or steam_api64.dll.bak (Goldberg)
  if (removeGoldberg) {
    const bakFiles = findFiles(gameFolder, 'steam_api.dll.bak').concat(
      findFiles(gameFolder, 'steam_api64.dll.bak')
    );

    for (const bakFile of bakFiles) {
      try {
        const originalPath = bakFile.replace('.bak', '');
        if (fs.existsSync(originalPath)) {
          fs.unlinkSync(originalPath);
        }
        fs.renameSync(bakFile, originalPath);
        removedItems.push(`Restored: ${path.basename(originalPath)}`);
      } catch (err) {
        errors.push(`Failed to restore ${bakFile}: ${err.message}`);
      }
    }

    // 2. Delete steam_settings folders (Goldberg)
    const steamSettingsFolders = [];
    function findSteamSettings(dir, depth = 0) {
      if (depth > 3 || !fs.existsSync(dir)) return; // Limit recursion depth

      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            if (file.toLowerCase() === 'steam_settings') {
              steamSettingsFolders.push(fullPath);
            } else {
              findSteamSettings(fullPath, depth + 1);
            }
          }
        } catch (err) {
          console.warn(`Error accessing ${fullPath}:`, err);
        }
      }
    }

    findSteamSettings(gameFolder);

    for (const folder of steamSettingsFolders) {
      try {
        fs.rmSync(folder, { recursive: true, force: true });
        removedItems.push(`Deleted: steam_settings folder`);
      } catch (err) {
        errors.push(`Failed to delete steam_settings: ${err.message}`);
      }
    }
  }

  // 3. Delete all Unsteam files
  if (removeUnsteam) {
    const unsteamFiles = [
      'unsteam.ini',
      'unsteam64.dll',
      'unsteam.dll',
      'unsteam_loader64.exe',
      'unsteam_loader32.exe',
      'winmm.dll',
      'winmm64.dll'
    ];

    for (const fileName of unsteamFiles) {
      const foundFiles = findFiles(gameFolder, fileName);
      for (const filePath of foundFiles) {
        try {
          fs.unlinkSync(filePath);
          removedItems.push(`Deleted: ${fileName}`);
        } catch (err) {
          errors.push(`Failed to delete ${fileName}: ${err.message}`);
        }
      }
    }
  }

  return {
    success: errors.length === 0,
    removedItems: removedItems,
    errors: errors
  };
}

// IPC handler for unfixing games
ipcMain.handle('unfix-game', async (event, options) => {
  try {
    const { appId, removeUnsteam, removeGoldberg, removeSteamless } = options;

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

    // Step 4: Load fix state to determine what was installed
    const fixState = loadFixState(gameFolder);
    const removedItems = [];

    // Step 5: Restore Steamless backup (if requested and it was used)
    if (removeSteamless && fixState && fixState.steamlessEnabled) {
      try {
        const gameExeFullPath = findGameExe(gameFolder);
        if (gameExeFullPath) {
          const backupPath = gameExeFullPath + '.bak';
          if (fs.existsSync(backupPath)) {
            // Delete current exe (unpacked version)
            if (fs.existsSync(gameExeFullPath)) {
              fs.unlinkSync(gameExeFullPath);
              console.log('Deleted unpacked exe');
            }
            // Restore backup
            fs.renameSync(backupPath, gameExeFullPath);
            console.log('Restored original exe from backup');
            removedItems.push('Restored original game executable');
          }
        }
      } catch (error) {
        console.error('Error restoring Steamless backup:', error);
      }
    }

    // Step 6: Close Steam if Unsteam is being removed
    if (removeUnsteam) {
      console.log('Closing Steam before removing Unsteam...');
      await closeSteamAndWait(steamPath);
    }

    // Step 7: Remove Steam launch options (if Unsteam is being removed)
    if (removeUnsteam) {
      try {
        const removed = await removeSteamLaunchOptions(appId);
        if (removed) {
          console.log('Steam launch options removed successfully');
          removedItems.push('Removed Steam launch options');
        }
      } catch (error) {
        console.warn('Failed to remove launch options:', error);
      }
    }

    // Step 8: Unfix the game (remove Unsteam/Goldberg files based on selection)
    const result = await unfixGame(gameFolder, removeGoldberg, removeUnsteam);
    removedItems.push(...result.removedItems);

    // Step 9: Update or delete fix state file
    if (removeUnsteam && removeGoldberg && removeSteamless) {
      // All components removed, delete the state file
      deleteFixState(gameFolder);
    } else if (fixState) {
      // Update fix state to reflect what's still installed
      const updatedState = {
        ...fixState,
        steamlessEnabled: removeSteamless ? false : fixState.steamlessEnabled,
        unsteamEnabled: removeUnsteam ? false : fixState.unsteamEnabled,
        goldbergEnabled: removeGoldberg ? false : fixState.goldbergEnabled
      };
      saveFixState(gameFolder, updatedState);
    }

    // Step 10: Restart Steam if Unsteam was removed
    if (removeUnsteam) {
      console.log('Restarting Steam...');
      await restartSteam(steamPath);
    }

    return {
      success: true,
      gameFolder: gameFolder,
      removedItems: removedItems
    };
  } catch (error) {
    console.error('Unfix error:', error);
    return { success: false, error: error.message };
  }
});

// Main IPC handler
ipcMain.handle('install-globalfix', async (event, options) => {
  try {
    const { appId, unsteamEnabled, goldbergEnabled, goldbergOptions, steamlessEnabled, steamId, username } = options;

    console.log('Install options:', { appId, unsteamEnabled, goldbergEnabled, steamlessEnabled });

    // Validate at least one tool is selected
    if (!unsteamEnabled && !goldbergEnabled && !steamlessEnabled) {
      return { success: false, error: 'Please select at least one component to install' };
    }

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
    let gameExeFullPath = findGameExe(gameFolder);
    if (!gameExeFullPath) {
      return { success: false, error: 'Could not find game executable' };
    }

    // Extract the directory containing the exe and the exe filename
    let gameExeDir = path.dirname(gameExeFullPath);
    let gameExeName = path.basename(gameExeFullPath);

    // Step 4.5: Steamless unpacking (if enabled)
    let steamlessApplied = false;
    if (steamlessEnabled) {
      try {
        console.log('Starting Steamless unpacking...');
        const unpackedPath = await steamlessUnpack(gameExeFullPath);

        // Backup original exe
        const backupPath = gameExeFullPath + '.bak';
        if (!fs.existsSync(backupPath)) {
          fs.renameSync(gameExeFullPath, backupPath);
          console.log(`Backed up original exe to: ${backupPath}`);
        } else {
          // Backup already exists, just delete the original
          fs.unlinkSync(gameExeFullPath);
          console.log('Backup already exists, deleted original exe');
        }

        // Rename unpacked exe to original name
        fs.renameSync(unpackedPath, gameExeFullPath);
        console.log(`Renamed unpacked exe to: ${gameExeName}`);

        steamlessApplied = true;
      } catch (steamlessError) {
        console.error('Steamless error:', steamlessError);
        // Don't fail - Steamless is optional, continue with other tools
        console.log('Continuing without Steamless...');
      }
    }

    // ============================================================
    // UNSTEAM INSTALLATION - START
    // Search for "UNSTEAM INSTALLATION" to find this section
    // ============================================================
    // Step 5: Install Unsteam (if enabled)
    let launchOptionsSet = false;
    let launchOptionsError = null;
    let steamNeedsRestart = false;

    logToRenderer('\n========== STEP 5: UNSTEAM INSTALLATION ==========');
    logToRenderer('unsteamEnabled:', unsteamEnabled);

    if (unsteamEnabled) {
      logToRenderer('✓ Unsteam is ENABLED, proceeding with installation...');

      // Download GlobalFix.zip
      const tempZipPath = path.join(app.getPath('temp'), 'GlobalFix.zip');
      await downloadGlobalFix(tempZipPath);

      // Extract to the directory containing the game exe
      await extractZip(tempZipPath, gameExeDir);

      // Handle unsteam.ini placement and configuration
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
        modifyUnsteamIni(extractedIniPath, exePathForIni, dllPathForIni, appId, steamId, username);
        modifyUnsteamIni(rootIniPath, exePathForIni, dllPathForIni, appId, steamId, username);

        finalIniPath = rootIniPath;
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
        modifyUnsteamIni(finalIniPath, exePathForIni, dllPathForIni, appId, steamId, username);
      }

      // Cleanup
      fs.unlinkSync(tempZipPath);

      // Delete winmm.dll files (we're using launch options instead)
      const winmmFiles = ['winmm.dll', 'winmm64.dll'];
      for (const winmmFile of winmmFiles) {
        const winmmPath = path.join(gameExeDir, winmmFile);
        if (fs.existsSync(winmmPath)) {
          try {
            fs.unlinkSync(winmmPath);
            console.log(`Deleted ${winmmFile} (not needed with launch options method)`);
          } catch (error) {
            console.warn(`Failed to delete ${winmmFile}:`, error);
          }
        }
        // Also check and delete from root if exe is in subfolder
        if (exeInSubfolder) {
          const rootWinmmPath = path.join(gameFolder, winmmFile);
          if (fs.existsSync(rootWinmmPath)) {
            try {
              fs.unlinkSync(rootWinmmPath);
              console.log(`Deleted ${winmmFile} from root folder`);
            } catch (error) {
              console.warn(`Failed to delete ${winmmFile} from root:`, error);
            }
          }
        }
      }

      // Modify Steam launch options to use unsteam_loader64.exe
      const loaderPath = path.join(gameExeDir, 'unsteam_loader64.exe');

      logToRenderer('\n==========================================');
      logToRenderer('ATTEMPTING TO SET STEAM LAUNCH OPTIONS');
      logToRenderer('==========================================');
      logToRenderer('AppID:', appId);
      logToRenderer('Loader Path:', loaderPath);
      logToRenderer('About to call modifySteamLaunchOptions...\n');

      try {
        const result = await modifySteamLaunchOptions(appId, loaderPath);
        launchOptionsSet = true;
        steamNeedsRestart = result.needsSteamRestart || false;
        logToRenderer(`\n✅ Steam launch options updated successfully for ${result.modifiedCount} user(s)`);
      } catch (error) {
        launchOptionsError = error.message;
        logErrorToRenderer('\n❌ Failed to modify Steam launch options:', error);
        logErrorToRenderer('Error stack:', error.stack);
      }

      logToRenderer('✓ Unsteam installation complete!');
    } else {
      logToRenderer('✗ Unsteam is NOT enabled - skipping installation');
    }
    // ============================================================
    // UNSTEAM INSTALLATION - END
    // ============================================================

    // Store Steam path for later restart (if needed)
    let steamPathForRestart = null;
    if (unsteamEnabled && steamNeedsRestart) {
      try {
        steamPathForRestart = findSteamPath();
      } catch (e) {
        console.warn('Could not get Steam path for restart:', e.message);
      }
    }

    // Step 6: Install Goldberg (if enabled)
    let goldbergResult = null;
    if (goldbergEnabled && goldbergOptions) {
      try {
        console.log('Installing Goldberg emulator...');
        goldbergResult = await installGoldberg(gameFolder, appId, goldbergOptions);
        console.log('Goldberg installation complete!');
      } catch (goldbergError) {
        console.error('Goldberg installation error:', goldbergError);
        // Don't fail the whole installation if Goldberg fails
        return {
          success: false,
          error: `Fix applied, but Goldberg installation failed: ${goldbergError.message}`
        };
      }
    }

    // Step 7: Save fix state
    const fixState = {
      appId: appId,
      steamlessEnabled: steamlessApplied,
      unsteamEnabled: unsteamEnabled,
      goldbergEnabled: goldbergEnabled && goldbergResult !== null
    };
    saveFixState(gameFolder, fixState);

    // Step 8: Restart Steam if it was closed for Unsteam
    let steamRestarted = false;
    if (unsteamEnabled && steamNeedsRestart && steamPathForRestart) {
      logToRenderer('\n==========================================');
      logToRenderer('RESTARTING STEAM');
      logToRenderer('==========================================');
      steamRestarted = await restartSteam(steamPathForRestart);
      if (steamRestarted) {
        logToRenderer('✅ Steam has been restarted - your game is ready to play!');
      } else {
        logToRenderer('⚠️ Please manually restart Steam to complete the setup');
      }
    }

    return {
      success: true,
      gameFolder: gameExeDir,
      gameExe: gameExeName,
      steamless: steamlessApplied,
      unsteam: unsteamEnabled ? {
        installed: true,
        loaderPath: path.join(gameExeDir, 'unsteam_loader64.exe')
      } : null,
      launchOptionsSet: launchOptionsSet,
      launchOptionsError: launchOptionsError,
      steamNeedsRestart: steamNeedsRestart,
      steamRestarted: steamRestarted,
      goldberg: goldbergResult ? {
        installed: true,
        steamApiPath: goldbergResult.steamApiPath,
        is64bit: goldbergResult.is64bit,
        achievementsCount: goldbergResult.achievementsCount
      } : null
    };
  } catch (error) {
    console.error('Installation error:', error);
    return { success: false, error: error.message };
  }
});
