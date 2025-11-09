# Building GlobalFix Installer for Windows

Since this build environment is Linux-based, you'll need to build the Windows installer on a Windows machine.

## Prerequisites

1. **Node.js** - Download and install from https://nodejs.org/ (LTS version recommended)
2. **Git** - Already installed if you're reading this

## Build Steps

### 1. Pull the latest code

```bash
git pull origin claude/build-new-app-011CUoTSkENPXvkPaieUQeaW
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the installer

Choose one of the following:

**Option A: Build both NSIS installer and portable exe**
```bash
npm run build
```
This creates:
- `dist/GlobalFix Installer-1.0.0-x64.exe` (NSIS installer)
- `dist/GlobalFix Installer-1.0.0-Portable.exe` (Portable exe)

**Option B: Build only portable exe**
```bash
npm run build:portable
```

**Option C: Build unpacked directory (for testing)**
```bash
npm run build:dir
```

### 4. Find your builds

The output files will be in the `dist/` folder:
- NSIS Installer: `GlobalFix Installer-1.0.0-x64.exe`
- Portable: `GlobalFix Installer-1.0.0-Portable.exe`

## Important Notes

### Goldberg DLLs

Before distributing the installer, make sure you have the Goldberg DLLs in the `goldberg_dlls/` folder:
- `steam_api.dll` (32-bit)
- `steam_api64.dll` (64-bit)

Download from: https://github.com/Detanup01/gbe_fork/releases/latest

**The installer will fail if these files are missing!**

### Windows Defender Warning

Since the app is unsigned, Windows Defender SmartScreen will show a warning when users run it. Users will need to click "More info" and then "Run anyway".

To avoid this, you would need to:
1. Get a code signing certificate ($$$)
2. Sign the executable using the certificate

For personal use or testing, the unsigned version works fine.

## Troubleshooting

**Problem: `npm install` fails**
- Make sure you're using Node.js LTS version (18.x or 20.x)
- Try deleting `node_modules` and `package-lock.json`, then run `npm install` again

**Problem: Build fails with "Cannot find module"**
- Run `npm install` again
- Check that you're in the correct directory

**Problem: Installer is too large**
- This is normal - Electron apps bundle Node.js and Chromium
- The installer will be ~150-200 MB

**Problem: Antivirus flags the installer**
- This is common for unsigned Electron apps
- Add an exception in your antivirus
- Or get a code signing certificate

## File Structure After Build

```
dist/
├── win-unpacked/                           # Unpacked app (for testing)
│   ├── GlobalFix Installer.exe             # Main executable
│   ├── resources/
│   │   └── app.asar                        # App code (packed)
│   └── ...
├── GlobalFix Installer-1.0.0-x64.exe       # NSIS installer
└── GlobalFix Installer-1.0.0-Portable.exe  # Portable executable
```

## Testing Before Distribution

1. Build the portable version: `npm run build:portable`
2. Run `dist/GlobalFix Installer-1.0.0-Portable.exe`
3. Test installing and unfixing a game
4. Make sure achievements download (if Steam API key is provided)
5. If everything works, build the NSIS installer

## Distribution

The recommended files to distribute:
1. **For most users**: `GlobalFix Installer-1.0.0-x64.exe` (NSIS installer)
2. **For portable users**: `GlobalFix Installer-1.0.0-Portable.exe`

Upload to GitHub Releases or wherever you want to share it.
