# Goldberg Emulator DLLs

This folder should contain the Goldberg emulator DLL files for the app to function with Goldberg support.

## Required Files

Place the following files in this folder:

### 32-bit DLL (Required for 32-bit games):
- `steam_api.dll` - 32-bit Steam API emulator

### 64-bit DLL (Required for 64-bit games):
- `steam_api64.dll` - 64-bit Steam API emulator

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
└── steam_api64.dll
```

## Important Note

⚠️ The app will NOT install Goldberg without these DLL files. Make sure to download them from the official repository to ensure you have the latest and most secure version.

⚠️ If you're missing the required DLL, the installation will fail with an error message.
