# Goldberg Emulator DLLs

This folder should contain the Goldberg emulator DLL files for the app to function with Goldberg support.

## Required Files

Place the following files in this folder:

### 32-bit Files (Required for 32-bit games):
- `steam_api.dll` - 32-bit Steam API emulator
- `generate_interfaces_x32.exe` - Interface generator for 32-bit games

### 64-bit Files (Required for 64-bit games):
- `steam_api64.dll` - 64-bit Steam API emulator
- `generate_interfaces_x64.exe` - Interface generator for 64-bit games

## Where to Get Them

Download the latest release from the official Goldberg Emulator fork:

**GitHub Repository:** https://github.com/Detanup01/gbe_fork

**Latest Release:** https://github.com/Detanup01/gbe_fork/releases/latest

### Step-by-Step:
1. Go to the releases page
2. Download the Windows build (look for a `.7z` or `.zip` file)
3. Extract the archive with 7-Zip or WinRAR
4. Inside you'll find folders like `x32` and `x64` or similar
5. Copy `steam_api.dll` and `steam_api64.dll` to this `goldberg_dlls` folder

## File Structure

After adding the files, this folder should look like:

```
goldberg_dlls/
├── README.md (this file)
├── steam_api.dll
├── steam_api64.dll
├── generate_interfaces_x32.exe
└── generate_interfaces_x64.exe
```

## What do these files do?

### Steam API DLLs (steam_api.dll / steam_api64.dll)
These replace the game's original Steam API DLL to emulate Steam's functionality without requiring Steam to be running.

### Interface Generators (generate_interfaces_*.exe)
These tools automatically scan the game's original Steam API DLL and create a `steam_interfaces.txt` file. This file is **essential for older games** (pre-May 2016) to work correctly with Goldberg. The app runs the appropriate version automatically based on the game's architecture.

## Important Note

⚠️ The app will NOT install Goldberg without the Steam API DLL files. Make sure to download them from the official repository to ensure you have the latest and most secure version.

⚠️ The interface generators are **optional** but highly recommended. Without them, some older games may not work with Goldberg.

⚠️ If you're missing the required DLL, the installation will fail with an error message.
