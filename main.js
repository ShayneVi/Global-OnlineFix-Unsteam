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
    resizable: true,
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
          file.close();
          try {
            fs.unlinkSync(destPath);
          } catch (e) {
            // Ignore
          }
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
      file.close();
      try {
        fs.unlinkSync(destPath);
      } catch (e) {
        // Ignore
      }
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

  // Generate steam_interfaces.txt using the appropriate tool
  try {
    const interfacesExe = is64bit ? 'generate_interfaces_x64.exe' : 'generate_interfaces_x32.exe';
    const interfacesToolPath = path.join(goldbergDllFolder, interfacesExe);

    if (fs.existsSync(interfacesToolPath)) {
      console.log(`Running ${interfacesExe} to generate steam_interfaces.txt...`);

      // Run generate_interfaces in the steam_api directory
      const { stdout, stderr } = await execPromise(`"${interfacesToolPath}"`, {
        cwd: steamApiDir,
        timeout: 10000 // 10 second timeout
      });

      if (stdout) console.log('generate_interfaces output:', stdout);
      if (stderr) console.warn('generate_interfaces stderr:', stderr);

      // Check if steam_interfaces.txt was created
      const interfacesFile = path.join(steamApiDir, 'steam_interfaces.txt');
      if (fs.existsSync(interfacesFile)) {
        console.log('✓ steam_interfaces.txt generated successfully');
      } else {
        console.warn('steam_interfaces.txt was not created, but continuing anyway');
      }
    } else {
      console.warn(`${interfacesExe} not found, skipping interface generation`);
      console.warn('This may cause issues with older games (pre-May 2016 Steam API)');
    }
  } catch (interfaceError) {
    console.warn('Failed to generate steam_interfaces.txt:', interfaceError.message);
    console.warn('Goldberg may still work without it for newer games');
  }

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

    // Track which exe was restored (for success message)
    let restoredExePath = null;
    let restoredExeName = null;

    // Step 5: Restore Steamless backup (if requested and it was used)
    if (removeSteamless && fixState && fixState.steamlessEnabled) {
      try {
        console.log('\n========================================');
        console.log('STEAMLESS UNFIX - START');
        console.log('========================================');
        console.log('Game folder:', gameFolder);

        // Detect if this is a UE5 game
        const isUE5 = detectUnrealEngine5(gameFolder);
        console.log('UE5 detection result:', isUE5);

        let exeToRestore = findGameExe(gameFolder); // Default to main game exe

        if (isUE5) {
          console.log('✓ UE5 game detected - looking for Shipping.exe backup');
          const ue5ShippingExe = findUE5ShippingExe(gameFolder);
          if (ue5ShippingExe) {
            exeToRestore = ue5ShippingExe;
            console.log('✓ Will restore Shipping.exe backup:', exeToRestore);
          } else {
            console.warn('⚠ UE5 detected but could not find Shipping.exe, using main exe');
          }
        } else {
          console.log('✓ Not a UE5 game - using standard exe');
        }

        if (exeToRestore) {
          const backupPath = exeToRestore + '.bak';
          console.log('Looking for backup at:', backupPath);
          console.log('Backup exists?:', fs.existsSync(backupPath));

          if (fs.existsSync(backupPath)) {
            // Delete current exe (unpacked version)
            if (fs.existsSync(exeToRestore)) {
              fs.unlinkSync(exeToRestore);
              console.log('✓ Deleted unpacked exe:', exeToRestore);
            }
            // Restore backup
            fs.renameSync(backupPath, exeToRestore);
            console.log('✓ Restored original exe from backup');

            // Track for success message
            restoredExePath = path.dirname(exeToRestore);
            restoredExeName = path.basename(exeToRestore);

            removedItems.push(`Restored original game executable (${restoredExeName})`);
            console.log('\n✓✓✓ STEAMLESS UNFIX COMPLETED SUCCESSFULLY ✓✓✓');
          } else {
            console.warn('⚠ Backup file not found, skipping restore');
          }
        }

        console.log('========================================\n');
      } catch (error) {
        console.error('\n========================================');
        console.error('❌ STEAMLESS UNFIX FAILED');
        console.error('========================================');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('========================================\n');
      }
    }

    // Step 6: Unfix the game (remove Unsteam/Goldberg files based on selection)
    const result = await unfixGame(gameFolder, removeGoldberg, removeUnsteam);
    removedItems.push(...result.removedItems);

    // Step 7: Update or delete fix state file
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

    return {
      success: true,
      gameFolder: restoredExePath || gameFolder,
      gameExe: restoredExeName || null,
      removedItems: removedItems
    };
  } catch (error) {
    console.error('Unfix error:', error);
    return { success: false, error: error.message };
  }
});

// Function to detect if executable is 32-bit or 64-bit
function detectExeArchitecture(exePath) {
  try {
    // Read the first 64 bytes to get DOS header
    const fd = fs.openSync(exePath, 'r');
    const buffer = Buffer.alloc(64);
    fs.readSync(fd, buffer, 0, 64, 0);

    // Check if it's a valid PE file (starts with 'MZ')
    if (buffer[0] !== 0x4D || buffer[1] !== 0x5A) {
      fs.closeSync(fd);
      console.log('Not a valid PE executable (missing MZ signature)');
      return 'x64'; // Default to x64 if we can't detect
    }

    // Get offset to PE header (at offset 0x3C in DOS header)
    const peOffset = buffer.readUInt32LE(0x3C);

    // Read PE header
    const peBuffer = Buffer.alloc(6);
    fs.readSync(fd, peBuffer, 0, 6, peOffset);
    fs.closeSync(fd);

    // Check PE signature ('PE\0\0')
    if (peBuffer[0] !== 0x50 || peBuffer[1] !== 0x45 || peBuffer[2] !== 0x00 || peBuffer[3] !== 0x00) {
      console.log('Invalid PE signature');
      return 'x64'; // Default to x64 if we can't detect
    }

    // Read machine type (2 bytes at offset 4 from PE signature)
    const machineType = peBuffer.readUInt16LE(4);

    // 0x014c = IMAGE_FILE_MACHINE_I386 (32-bit)
    // 0x8664 = IMAGE_FILE_MACHINE_AMD64 (64-bit)
    if (machineType === 0x014c) {
      console.log(`Detected 32-bit executable (machine type: 0x${machineType.toString(16)})`);
      return 'x32';
    } else if (machineType === 0x8664) {
      console.log(`Detected 64-bit executable (machine type: 0x${machineType.toString(16)})`);
      return 'x64';
    } else {
      console.log(`Unknown machine type: 0x${machineType.toString(16)}, defaulting to x64`);
      return 'x64'; // Default to x64 for unknown types
    }
  } catch (error) {
    console.error('Error detecting exe architecture:', error);
    return 'x64'; // Default to x64 on error
  }
}

// Function to detect if a game is Unreal Engine 5
function detectUnrealEngine5(gameFolder) {
  try {
    console.log('[UE5 Detection] Starting detection for:', gameFolder);
    // UE5 games typically have this structure:
    // GameFolder/GameName/Binaries/Win64/*-Win64-Shipping.exe

    // Look for Binaries/Win64 directory
    const binariesPath = path.join(gameFolder, 'Binaries', 'Win64');
    console.log('[UE5 Detection] Checking path:', binariesPath);
    console.log('[UE5 Detection] Path exists?:', fs.existsSync(binariesPath));

    if (fs.existsSync(binariesPath)) {
      // Check if there's a *-Win64-Shipping.exe file
      const files = fs.readdirSync(binariesPath);
      console.log('[UE5 Detection] Files in Binaries/Win64:', files);

      const shippingExe = files.find(file =>
        file.endsWith('-Win64-Shipping.exe') ||
        file.endsWith('-Win32-Shipping.exe')
      );

      if (shippingExe) {
        console.log(`[UE5 Detection] ✓ Detected UE5 game - found ${shippingExe}`);
        return true;
      }
    }

    // Alternative check: Look for subfolder with Binaries/Win64
    // Structure: GameFolder/SubFolder/Binaries/Win64/*-Shipping.exe
    console.log('[UE5 Detection] Checking subfolders...');
    const folders = fs.readdirSync(gameFolder, { withFileTypes: true });
    console.log('[UE5 Detection] Found', folders.length, 'items in game folder');

    for (const folder of folders) {
      if (folder.isDirectory()) {
        console.log('[UE5 Detection] Checking subfolder:', folder.name);
        const subBinariesPath = path.join(gameFolder, folder.name, 'Binaries', 'Win64');
        console.log('[UE5 Detection] Checking path:', subBinariesPath);
        console.log('[UE5 Detection] Path exists?:', fs.existsSync(subBinariesPath));

        if (fs.existsSync(subBinariesPath)) {
          const files = fs.readdirSync(subBinariesPath);
          console.log('[UE5 Detection] Files in', folder.name + '/Binaries/Win64:', files);

          const shippingExe = files.find(file =>
            file.endsWith('-Win64-Shipping.exe') ||
            file.endsWith('-Win32-Shipping.exe')
          );

          if (shippingExe) {
            console.log(`[UE5 Detection] ✓ Detected UE5 game in subfolder ${folder.name} - found ${shippingExe}`);
            return true;
          }
        }
      }
    }

    console.log('[UE5 Detection] ❌ Not a UE5 game');
    return false;
  } catch (error) {
    console.error('[UE5 Detection] ❌ Error detecting UE5:', error);
    return false;
  }
}

// Function to find UE5 Shipping executable
function findUE5ShippingExe(gameFolder) {
  try {
    console.log('[UE5 ShippingExe] Starting search for Shipping.exe in:', gameFolder);

    // First try: GameFolder/Binaries/Win64
    const binariesPath = path.join(gameFolder, 'Binaries', 'Win64');
    console.log('[UE5 ShippingExe] Checking:', binariesPath);

    if (fs.existsSync(binariesPath)) {
      const files = fs.readdirSync(binariesPath);
      console.log('[UE5 ShippingExe] Files found:', files);

      const shippingExe = files.find(file =>
        file.endsWith('-Win64-Shipping.exe') ||
        file.endsWith('-Win32-Shipping.exe')
      );

      if (shippingExe) {
        const fullPath = path.join(binariesPath, shippingExe);
        console.log(`[UE5 ShippingExe] ✓ Found UE5 Shipping exe: ${fullPath}`);
        return fullPath;
      }
    }

    // Second try: GameFolder/SubFolder/Binaries/Win64
    console.log('[UE5 ShippingExe] Not found in root, checking subfolders...');
    const folders = fs.readdirSync(gameFolder, { withFileTypes: true });

    for (const folder of folders) {
      if (folder.isDirectory()) {
        console.log('[UE5 ShippingExe] Checking subfolder:', folder.name);
        const subBinariesPath = path.join(gameFolder, folder.name, 'Binaries', 'Win64');
        console.log('[UE5 ShippingExe] Path:', subBinariesPath);

        if (fs.existsSync(subBinariesPath)) {
          const files = fs.readdirSync(subBinariesPath);
          console.log('[UE5 ShippingExe] Files found:', files);

          const shippingExe = files.find(file =>
            file.endsWith('-Win64-Shipping.exe') ||
            file.endsWith('-Win32-Shipping.exe')
          );

          if (shippingExe) {
            const fullPath = path.join(subBinariesPath, shippingExe);
            console.log(`[UE5 ShippingExe] ✓ Found UE5 Shipping exe in subfolder: ${fullPath}`);
            return fullPath;
          }
        }
      }
    }

    console.log('[UE5 ShippingExe] ❌ Could not find UE5 Shipping exe');
    return null;
  } catch (error) {
    console.error('[UE5 ShippingExe] ❌ Error finding UE5 Shipping exe:', error);
    return null;
  }
}

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

    // Step 4.5: Detect game architecture (32-bit vs 64-bit)
    const gameArchitecture = detectExeArchitecture(gameExeFullPath);
    console.log(`Game architecture detected: ${gameArchitecture}`);

    // Determine which Unsteam files to use based on architecture
    const unsteamDll = gameArchitecture === 'x32' ? 'unsteam.dll' : 'unsteam64.dll';
    const unsteamLoader = gameArchitecture === 'x32' ? 'unsteam_loader.exe' : 'unsteam_loader64.exe';
    console.log(`Will use: ${unsteamDll} and ${unsteamLoader}`);

    // Step 4.6: Steamless unpacking (if enabled)
    let steamlessApplied = false;
    if (steamlessEnabled) {
      try {
        console.log('\n========================================');
        console.log('STEAMLESS UNPACKING - START');
        console.log('========================================');
        console.log('Game folder:', gameFolder);
        console.log('Default game exe:', gameExeFullPath);
        console.log('steamlessEnabled:', steamlessEnabled);

        // Detect if UE5 and get appropriate executable
        let exeToUnpack = gameExeFullPath;
        let exeNameToUnpack = gameExeName;

        console.log('\n--- Checking if UE5 game ---');
        const isUE5 = detectUnrealEngine5(gameFolder);
        console.log('UE5 detection result:', isUE5);

        if (isUE5) {
          console.log('\n✓ UE5 game detected - looking for Shipping executable...');
          const ue5ShippingExe = findUE5ShippingExe(gameFolder);
          console.log('Shipping exe search result:', ue5ShippingExe);

          if (ue5ShippingExe) {
            exeToUnpack = ue5ShippingExe;
            exeNameToUnpack = path.basename(ue5ShippingExe);
            console.log(`✓ Will unpack UE5 Shipping exe: ${exeToUnpack}`);
          } else {
            console.warn('⚠ UE5 detected but could not find Shipping exe');
            console.warn('⚠ Falling back to default exe:', exeToUnpack);
          }
        } else {
          console.log('✓ Not a UE5 game - using standard exe:', exeToUnpack);
        }

        console.log('\n--- Running Steamless ---');
        console.log('Target exe for unpacking:', exeToUnpack);
        console.log('Checking if file exists:', fs.existsSync(exeToUnpack));

        const unpackedPath = await steamlessUnpack(exeToUnpack);
        console.log('✓ Steamless unpacking completed');
        console.log('Unpacked file path:', unpackedPath);
        console.log('Checking if unpacked file exists:', fs.existsSync(unpackedPath));

        // Backup original exe
        console.log('\n--- Creating backup ---');
        const backupPath = exeToUnpack + '.bak';
        console.log('Backup path:', backupPath);
        console.log('Backup already exists?:', fs.existsSync(backupPath));

        if (!fs.existsSync(backupPath)) {
          fs.renameSync(exeToUnpack, backupPath);
          console.log(`✓ Backed up original exe to: ${backupPath}`);
        } else {
          // Backup already exists, just delete the original
          fs.unlinkSync(exeToUnpack);
          console.log('✓ Backup already exists, deleted original exe');
        }

        // Rename unpacked exe to original name
        console.log('\n--- Finalizing ---');
        console.log('Renaming unpacked file to:', exeToUnpack);
        fs.renameSync(unpackedPath, exeToUnpack);
        console.log(`✓ Renamed unpacked exe to: ${exeNameToUnpack}`);
        console.log('Final exe exists?:', fs.existsSync(exeToUnpack));
        console.log('Backup exists?:', fs.existsSync(backupPath));

        steamlessApplied = true;

        // Update gameExeDir and gameExeName to reflect the actual exe that was unpacked
        // (This is important for UE5 games where we unpack the Shipping.exe instead of the main exe)
        gameExeDir = path.dirname(exeToUnpack);
        gameExeName = exeNameToUnpack;
        console.log('✓ Updated game exe info for success message:');
        console.log('  - Game Exe Dir:', gameExeDir);
        console.log('  - Game Exe Name:', gameExeName);

        console.log('\n✓✓✓ STEAMLESS UNPACKING COMPLETED SUCCESSFULLY ✓✓✓');
        console.log('========================================\n');
      } catch (steamlessError) {
        console.error('\n========================================');
        console.error('❌ STEAMLESS UNPACKING FAILED');
        console.error('========================================');
        console.error('Error name:', steamlessError.name);
        console.error('Error message:', steamlessError.message);
        console.error('Error stack:', steamlessError.stack);
        console.error('========================================\n');
        // Don't fail - Steamless is optional, continue with other tools
        console.log('⚠ Continuing without Steamless...\n');
      }
    } else {
      console.log('Steamless is disabled, skipping...');
    }

    // ============================================================
    // UNSTEAM INSTALLATION - START
    // Search for "UNSTEAM INSTALLATION" to find this section
    // ============================================================
    // Step 5: Install Unsteam (if enabled)
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
        dllPathForIni = path.join(gameExeDir, unsteamDll);

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
        dllPathForIni = unsteamDll;

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

      logToRenderer('✓ Unsteam installation complete!');
    } else {
      logToRenderer('✗ Unsteam is NOT enabled - skipping installation');
    }
    // ============================================================
    // UNSTEAM INSTALLATION - END
    // ============================================================

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

    return {
      success: true,
      gameFolder: gameExeDir,
      gameExe: gameExeName,
      steamless: steamlessApplied,
      unsteam: unsteamEnabled ? {
        installed: true,
        loaderPath: path.join(gameExeDir, unsteamLoader),
        architecture: gameArchitecture
      } : null,
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
