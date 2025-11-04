# GlobalFix Installer - Electron App

An automated installer application for GlobalFix Steam game modifications. This Electron app streamlines the process of installing and configuring GlobalFix for your Steam games.

## Features

- 🔍 Automatically finds your Steam installation and game libraries
- 🎮 Locates games by Steam App ID
- 📦 Downloads and extracts GlobalFix from the repository
- ⚙️ Auto-configures unsteam.ini with the correct game executable and App ID
- 🚀 Automatically updates Steam launch options
- 💻 Clean, user-friendly interface

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
```bash
npm run build
```

The built application will be in the `dist` folder.

## How to Use

1. **Launch the app** using `npm start`

2. **Find your Steam App ID:**
   - Open Steam and navigate to the game's store page
   - Look at the URL: `store.steampowered.com/app/APPID/GameName`
   - Copy the numeric App ID
   - Example: Paint the Town Red = `337320`

3. **Enter the App ID** in the application

4. **Click "Install GlobalFix"**

5. **Wait for completion** - The app will:
   - Locate your game installation
   - Find the game's executable
   - Download GlobalFix.zip
   - Extract it to the game folder
   - Configure unsteam.ini
   - Update Steam launch options

6. **Restart Steam** to apply the changes

7. **Launch your game** from Steam as usual

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
8. **Launch Options:** Updates Steam config with:
   ```
   "C:\Path\To\Game\unsteam_loader64" %command%
   ```

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

### "Launch options could not be updated"
- Make sure Steam is closed when running the installer
- Check that you have write permissions to Steam's config files
- You can manually add the launch options in Steam:
  Right-click game → Properties → Launch Options:
  ```
  "C:\Full\Path\To\Game\unsteam_loader64" %command%
  ```

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
