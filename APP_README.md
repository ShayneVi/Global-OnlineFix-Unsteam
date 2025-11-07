# GlobalFix Installer - Electron App

An automated installer application for GlobalFix Steam game modifications. This Electron app streamlines the process of installing and configuring GlobalFix for your Steam games.

## Features

- 🔎 **Steam Game Search** - Search for games by name with autocomplete dropdown
- 🔍 Automatically finds your Steam installation and game libraries
- 🎮 Locates games by Steam App ID (or search by name!)
- 📦 Downloads and extracts GlobalFix from the repository
- ⚙️ Auto-configures unsteam.ini with the correct game executable and App ID
- 🚀 Automatically places winmm.dll loader in necessary locations
- 🎮 **NEW: Goldberg Emulator Support** - Optional LAN multiplayer and offline play
  - Automatically downloads achievements and images from Steam
  - Configures LAN settings for multiplayer
  - Creates complete steam_settings folder structure
  - Enables overlay and achievement tracking
- 💻 Clean, user-friendly interface
- ⚡ Debounced search (no lag or freezing)

## Prerequisites

- Windows OS (required for Steam path detection)
- Steam installed
- Node.js (v16 or higher)
- npm (Node Package Manager)

## Installation

1. Clone this repository:
```bash
git clone https://github.com/ShayneVi/Global-OnlineFix-Unsteam.git
cd Global-OnlineFix-Unsteam
```

2. Install dependencies:
```bash
npm install
```

## Running the App

### Development Mode
```bash
npm start
```

### Building for Distribution

Want to share this app with friends? See **[BUILD.md](BUILD.md)** for complete build instructions.

Quick build:
```bash
npm run build
```

This creates both an installer and portable version in the `dist` folder. No dev console will appear in built versions!

## How to Use

1. **Launch the app** using `npm start` (or run the built executable)

2. **Find your game** - Two options:

   **Option A: Search by name (Easiest!)**
   - Type your game's name in the search box
   - Wait for results to appear (autocomplete)
   - Click your game from the dropdown
   - App ID is filled automatically!

   **Option B: Manual App ID entry**
   - Find your game on Steam's store page
   - Look at the URL: `store.steampowered.com/app/APPID/GameName`
   - Copy the numeric App ID and paste it
   - Example: Paint the Town Red = `337320`

3. **Click "Install GlobalFix"**

5. **Wait for completion** - The app will:
   - Locate your game installation
   - Find the game's executable
   - Download GlobalFix.zip
   - Extract it to the game folder
   - Configure unsteam.ini
   - Place winmm.dll loader in necessary locations

6. **Launch your game** from Steam as usual - No restart needed!

## Using Goldberg Emulator (Optional)

Goldberg Emulator enables **LAN multiplayer** and **offline play** with full achievement support. To use it:

### Setup Requirements:

1. **Get a Steam Web API Key:**
   - Visit: https://steamcommunity.com/dev/apikey
   - Sign in with your Steam account
   - Register for a key (enter any domain name, e.g., "localhost")
   - Copy your API key

2. **Add Goldberg DLLs:**
   - Download the latest release from: https://github.com/Detanup01/gbe_fork/releases/latest
   - Extract the Windows build
   - Copy `steam_api.dll` and `steam_api64.dll` to the `goldberg_dlls` folder
   - See `goldberg_dlls/README.md` for detailed instructions

### Installation Steps:

1. Enter your Steam App ID as usual
2. **Check the "Also install Goldberg Emulator" checkbox**
3. Fill in the Goldberg settings:
   - **Steam Web API Key:** Paste your API key (required)
   - **Username:** Your display name for LAN play (default: Player)
   - **Steam ID:** Unique ID for your player (default provided)
   - **Listen Port:** Port for LAN discovery (default: 47584)
4. Click "Install GlobalFix"

### LAN Multiplayer Setup:

For multiple players on the same network:

1. **All players must use the same Listen Port** (e.g., 47584)
2. **Each player needs a unique Steam ID:**
   - Player 1: `76561198000000000` (default)
   - Player 2: `76561198000000001` (increment by 1)
   - Player 3: `76561198000000002` (increment by 1)
   - And so on...
3. **Each player should have a different Username**
4. Launch the game and use the game's LAN/multiplayer features

### What Gets Installed:

When Goldberg is enabled, the app will:

- Detect the correct Steam API DLL (32-bit or 64-bit)
- Backup the original DLL as `.bak`
- Replace it with Goldberg emulator DLL
- Download all achievements and their images from Steam
- Create a complete `steam_settings` folder with:
  - `achievements.json` - All game achievements
  - `configs.user.ini` - Your username and Steam ID
  - `configs.overlay.ini` - Overlay settings (always enabled)
  - `configs.app.ini` - Matchmaking and server settings
  - `steam_appid.txt` - Game's App ID
  - `steam_interfaces.txt` - Required Steam interfaces
  - `images/` - All achievement icons

## What the App Does

### Step-by-Step Process:

1. **Steam Detection:** Finds your Steam installation path
2. **Library Discovery:** Reads all Steam library folders from `libraryfolders.vdf`
3. **Game Location:** Finds the game by reading `appmanifest_[AppID].acf`
4. **Executable Detection:** Locates the main game executable
5. **Download:** Downloads GlobalFix.zip from this repository
6. **Extraction:** Extracts all files to the game directory
7. **Configuration:** Modifies `unsteam.ini`:
   ```ini
   exe_file=YourGameExecutable.exe
   real_app_id=YourAppID
   ```
8. **DLL Loader:** Places `winmm.dll` in the necessary locations:
   - Always in the folder with the game executable
   - Also in the game root folder if the executable is in a subfolder
   - This allows automatic loading when the game launches

## Troubleshooting

### "Steam installation not found"
- Ensure Steam is installed in a standard location
- Check if Steam is installed at: `C:\Program Files (x86)\Steam` or `C:\Program Files\Steam`

### "Game with AppID not found"
- Verify the App ID is correct
- Ensure the game is installed through Steam
- Try validating game files in Steam

### "Could not find game executable"
- The game may have an unusual structure
- Check if the game has multiple executables
- You may need to manually verify the installation

### "winmm.dll not found in extracted files"
- Ensure you have the latest GlobalFix.zip from the repository
- The zip file should include the winmm.dll loader
- Try re-downloading the repository

## File Structure

```
Global-OnlineFix-Unsteam/
├── main.js              # Main Electron process
├── preload.js           # Preload script for IPC
├── index.html           # App UI
├── styles.css           # Styling
├── renderer.js          # Renderer process logic
├── package.json         # Node.js dependencies
├── GlobalFix.zip        # GlobalFix archive (do not modify)
└── APP_README.md        # This file
```

## Dependencies

- **electron:** Cross-platform desktop app framework
- **7zip-bin:** Bundled 7-Zip executable for all platforms
- **node-7z:** Node.js wrapper for 7-Zip (supports LZMA, DEFLATE, and all compression methods)
- **ini:** INI file parsing and modification

## Security Note

This application:
- Does not collect or transmit any data
- Only modifies files in your local game directories
- Only updates Steam configuration files locally
- Downloads GlobalFix.zip from this GitHub repository only

## Important Notes

⚠️ **Always backup your game files before using any modification tools**

⚠️ **Use this tool only for games you legally own**

⚠️ **This tool modifies Steam configuration files. Use at your own risk.**

## License

MIT License - See repository for details

## Support

For issues or questions, please open an issue on the GitHub repository.

---

**Developed for Windows** | **Requires Steam** | **Electron-based Application**
