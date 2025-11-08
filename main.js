const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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
  const goldbergDllFolder = path.join(__dirname, 'goldberg_dlls');
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

// Fetch game info from PCGamingWiki
async function fetchPCGamingWikiInfo(appId) {
  return new Promise((resolve) => {
    // First, get the page wikitext using Steam AppID
    const url = `https://www.pcgamingwiki.com/w/api.php?action=parse&page=Special:CargoExport&format=json`;

    // Try to get page content via appid redirect
    const redirectUrl = `https://pcgamingwiki.com/api/appid.php?appid=${appId}`;

    https.get(redirectUrl, { rejectUnauthorized: false }, (response) => {
      // Follow redirect to get actual page
      if (response.statusCode === 302 || response.statusCode === 301) {
        const location = response.headers.location;
        const pageName = location.split('/wiki/')[1];

        if (!pageName) {
          resolve({ success: false, error: 'Game not found on PCGamingWiki' });
          return;
        }

        // Now fetch the wikitext for this page
        const wikitextUrl = `https://www.pcgamingwiki.com/w/api.php?action=parse&page=${pageName}&prop=wikitext&format=json`;

        https.get(wikitextUrl, { rejectUnauthorized: false }, (wikitextResponse) => {
          let data = '';
          wikitextResponse.on('data', (chunk) => { data += chunk; });
          wikitextResponse.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.parse && parsed.parse.wikitext) {
                const wikitext = parsed.parse.wikitext['*'];
                const gameInfo = parseWikitext(wikitext);
                resolve({ success: true, data: gameInfo });
              } else {
                resolve({ success: false, error: 'No wikitext found' });
              }
            } catch (error) {
              resolve({ success: false, error: 'Failed to parse response' });
            }
          });
        }).on('error', () => {
          resolve({ success: false, error: 'Network error' });
        });
      } else {
        resolve({ success: false, error: 'Game not found on PCGamingWiki' });
      }
    }).on('error', () => {
      resolve({ success: false, error: 'Network error' });
    });
  });
}

// Parse wikitext to extract multiplayer and connection data
function parseWikitext(wikitext) {
  const result = {
    multiplayer: {},
    connections: {}
  };

  // Extract multiplayer data
  const multiplayerMatch = wikitext.match(/{{Network\/Multiplayer([^}]+(?:}(?!})[^}]*)*)}}/s);
  if (multiplayerMatch) {
    const multiplayerText = multiplayerMatch[0];

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
  const connectionsMatch = wikitext.match(/{{Network\/Connections([^}]+(?:}(?!})[^}]*)*)}}/s);
  if (connectionsMatch) {
    const connectionsText = connectionsMatch[0];

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
  }

  return result;
}

// Extract field value from wikitext
function extractField(text, fieldName) {
  const regex = new RegExp(`\\|\\s*${fieldName}\\s*=\\s*([^|\\n]+)`, 'i');
  const match = text.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return '';
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

// Unfix game - remove all GlobalFix and Goldberg modifications
async function unfixGame(gameFolder) {
  const removedItems = [];
  const errors = [];

  // 1. Restore steam_api.dll.bak or steam_api64.dll.bak
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

  // 2. Delete steam_settings folders
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

  // 3. Delete all Unsteam files
  const unsteamFiles = [
    'unsteam.ini',
    'unsteam64.dll',
    'unsteam.dll',
    'unsteam_loader64.exe',
    'unsteam_loader32.exe',
    'winmm.dll'
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

  return {
    success: errors.length === 0,
    removedItems: removedItems,
    errors: errors
  };
}

// IPC handler for unfixing games
ipcMain.handle('unfix-game', async (event, appId) => {
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

    // Step 4: Unfix the game
    const result = await unfixGame(gameFolder);

    if (result.success) {
      return {
        success: true,
        gameFolder: gameFolder,
        removedItems: result.removedItems
      };
    } else {
      return {
        success: false,
        error: 'Some errors occurred during unfix',
        removedItems: result.removedItems,
        errors: result.errors
      };
    }
  } catch (error) {
    console.error('Unfix error:', error);
    return { success: false, error: error.message };
  }
});

// Main IPC handler
ipcMain.handle('install-globalfix', async (event, appId, goldbergOptions) => {
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

    // Step 8: Copy winmm.dll to necessary locations
    // winmm.dll is the DLL hijacking file that loads the fix
    const winmmSourcePath = path.join(gameExeDir, 'winmm.dll');

    if (!fs.existsSync(winmmSourcePath)) {
      console.warn('winmm.dll not found in extracted files - this may be expected for older GlobalFix versions');
    } else {
      // Always copy winmm.dll to exe directory (it's already there from extraction)
      // If exe is in subfolder, also copy to root
      if (exeInSubfolder) {
        const rootWinmmPath = path.join(gameFolder, 'winmm.dll');
        fs.copyFileSync(winmmSourcePath, rootWinmmPath);
        console.log('Copied winmm.dll to both exe folder and root folder');
      } else {
        console.log('winmm.dll placed in root folder (same as exe location)');
      }
    }

    // Cleanup
    fs.unlinkSync(tempZipPath);

    // Step 9: Install Goldberg if requested
    let goldbergResult = null;
    if (goldbergOptions) {
      try {
        console.log('Installing Goldberg emulator...');
        goldbergResult = await installGoldberg(gameFolder, appId, goldbergOptions);
        console.log('Goldberg installation complete!');
      } catch (goldbergError) {
        console.error('Goldberg installation error:', goldbergError);
        // Don't fail the whole installation if Goldberg fails
        return {
          success: false,
          error: `GlobalFix installed successfully, but Goldberg installation failed: ${goldbergError.message}`
        };
      }
    }

    return {
      success: true,
      gameFolder: gameExeDir,
      gameExe: gameExeName,
      launchOptionsSet: null, // No longer needed
      launchOptionsPath: null,
      launchOptionsError: null,
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
