# Building GlobalFix Installer

This guide explains how to build the GlobalFix Installer for distribution to your friends.

## Prerequisites

Before building, make sure you have:

1. **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
2. **npm** (comes with Node.js)
3. **Windows** (for building Windows executables)

## Installation

1. Clone or download this repository
2. Open a terminal/command prompt in the project directory
3. Install dependencies:

```bash
npm install
```

## Build Options

The app can be built in two formats:

### 1. Installer (Recommended for Distribution)

Creates a Windows installer that users can run to install the app:

```bash
npm run build
```

**Output:** `dist/GlobalFix Installer-1.0.0-x64.exe` (NSIS installer)

**Features:**
- Professional installation wizard
- Creates Start Menu shortcut
- Creates Desktop shortcut
- Can be uninstalled from Windows Settings
- Best for sharing with friends

### 2. Portable Version

Creates a single executable that doesn't require installation:

```bash
npm run build:portable
```

**Output:** `dist/GlobalFix Installer-1.0.0-Portable.exe`

**Features:**
- Single executable file
- No installation required
- Can run from USB drive
- No admin rights needed
- Good for quick sharing

### 3. Unpacked Directory (For Testing)

Creates an unpacked directory with all files:

```bash
npm run build:dir
```

**Output:** `dist/win-unpacked/` directory

**Use case:** Testing the built version before creating installer

## Build Output

After building, you'll find the distributable files in the `dist/` folder:

```
dist/
├── GlobalFix Installer-1.0.0-x64.exe          # Installer version
├── GlobalFix Installer-1.0.0-Portable.exe      # Portable version
└── win-unpacked/                                # Unpacked files (if built)
```

## Sharing with Friends

### Option 1: Share the Installer (Recommended)

1. Build the installer: `npm run build`
2. Share the file: `dist/GlobalFix Installer-1.0.0-x64.exe`
3. Your friends just run it and follow the installation wizard

### Option 2: Share the Portable Version

1. Build portable: `npm run build:portable`
2. Share the file: `dist/GlobalFix Installer-1.0.0-Portable.exe`
3. Your friends can run it directly without installation

## Important Notes

### DevTools (Developer Console)

The developer console is **automatically disabled** in built versions. It only appears when running with `npm start` in development mode.

### File Size

The built executables will be around **100-150 MB** because they include:
- Electron runtime
- Node.js
- All dependencies (7-Zip, etc.)
- Your app code

This is normal for Electron apps!

### Windows Defender / Antivirus

Windows Defender might show a warning when running unsigned executables. This is normal for apps that aren't code-signed. Your friends can click "More info" → "Run anyway".

To avoid this, you would need to purchase a code signing certificate (costs money).

## Customization

### Change App Version

Edit `package.json`:

```json
{
  "version": "1.0.0"  // Change this
}
```

### Change App Name

Edit `package.json`:

```json
{
  "productName": "GlobalFix Installer"  // Change this
}
```

### Add an Icon

1. Create/obtain an `.ico` file
2. Save it as `icon.ico` in the project root
3. The build will automatically use it

## Troubleshooting

### Build fails with "Cannot find module"

```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install
```

### Build is too slow

The first build is always slow (5-10 minutes). Subsequent builds are faster because electron-builder caches dependencies.

### Antivirus blocks the build

Some antivirus software may block electron-builder. Temporarily disable it during build, or add the project folder to exclusions.

## Testing the Built App

Before sharing:

1. Build the app: `npm run build`
2. Go to `dist/` folder
3. Run the executable
4. Test all features:
   - Game search
   - App ID input
   - Installation process
5. Make sure DevTools doesn't open
6. Verify it works on a fresh Windows machine

## Support

If you encounter issues during building:

1. Make sure Node.js is up to date
2. Delete `node_modules` and `dist` folders
3. Run `npm install` again
4. Try building again

---

**Ready to build?** Run `npm run build` and share the installer with your friends! 🚀
