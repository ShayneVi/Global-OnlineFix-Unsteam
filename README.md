# GlobalFix Installer

**A powerful automated installer for enabling online multiplayer and unlocking features in Steam games.**

GlobalFix is an Electron-based application that streamlines the installation and configuration of online multiplayer fixes for Steam games. It enables peer-to-peer online gameplay for games that lack dedicated servers, unlocks online features in single-player titles, and can resolve compatibility issues by bypassing Steam DRM.

---

## What Does GlobalFix Do?

### Core Functionality

- **Enable Online Multiplayer**: Activates online co-op and multiplayer functionality for 80%+ of games that use peer-to-peer networking instead of dedicated servers
- **Unlock Online Features**: Enables network features in games originally designed as single-player experiences
- **Steam DRM Bypass**: Acts as a compatibility layer that removes Steam's DRM, potentially resolving launch issues and compatibility problems
- **Permanent Solution**: Once installed, the fix persists through game updates unless developers fundamentally change their networking architecture (e.g., migrating to dedicated servers)

### How It Works

The GlobalFix Installer automates the entire setup process:

1. **Game Detection**: Automatically locates your Steam installation and game libraries
2. **Smart Search**: Search for games by name or enter Steam App ID directly
3. **Automated Installation**: Downloads and extracts the GlobalFix package to your game directory
4. **Configuration**: Modifies game configuration files with the correct executable and App ID
5. **Steam Integration**: Updates Steam launch options to load the fix automatically

All of this happens in seconds with a single click.

---

## Compatibility

### What Works

GlobalFix is compatible with games that use:
- Peer-to-peer (P2P) networking
- Direct connections between players
- Steam's built-in networking APIs
- LAN-based multiplayer systems

### What Doesn't Work

GlobalFix **cannot** enable online play for games using:
- **Dedicated servers** (e.g., Sons of the Forest, Warhammer: Darktide)
- **Authentication-based online** (e.g., For the King 2, FBC: Fireworks)
- **Photon networking** (e.g., Phasmophobia, PEAK, Warhammer: Rogue Trader)
- **Platform-specific authentication** (e.g., Microsoft accounts for Grounded)
- **Third-party authentication services**

---

## Tested Games

### ✅ Confirmed Working

The following games have been successfully tested with GlobalFix and confirmed to have working online multiplayer:

- **Granny Escape Together**
- **Paint the Town Red**
- **Mimesis**
- **Hearts of Iron IV**
- **South Park: Snow Day**
- **Escape Simulator**
- **Stellaris**
- **Swapmeat**
- **Europa Universalis IV**
- **Veins**
- **Tavern Keeper**

### ❌ Not Compatible

These games have been tested and are **not compatible** with GlobalFix due to their network architecture:

- **Sons of the Forest** - Uses dedicated servers
- **PEAK** - Photon networking
- **FBC: Fireworks** - Authentication-based online only
- **For the King 2** - Requires authentication
- **American Truck Simulator** - Compatibility issues (game won't launch properly)
- **Grounded** - Microsoft account authentication required
- **Dying Light** - Compatibility issues (game won't launch properly)
- **Warhammer: Darktide** - Dedicated servers
- **Warhammer: Rogue Trader** - Photon networking
- **Abiotic Factor** - LAN works, but not standard online multiplayer
- **Phasmophobia** - Photon networking

**Note**: This list is not exhaustive. Many other games will work or not work based on similar technical factors.

---

## Features

- 🔎 **Steam Game Database Search** - Instant autocomplete search across 150,000+ Steam games
- 🎯 **Automatic Game Detection** - Finds your Steam installation and all library folders
- ⚡ **One-Click Installation** - Complete setup in seconds
- 🔧 **Automatic Configuration** - Modifies INI files and Steam launch options automatically
- 💾 **Persistent Fix** - Survives game updates (unless networking architecture changes)
- 🎨 **User-Friendly Interface** - Clean, modern UI with real-time status updates
- 📋 **Manual Fallback** - Provides manual instructions if automatic setup fails

---

## Quick Start

### For Users (Using Pre-Built Installer)

1. Download the latest `GlobalFix Installer.exe`
2. Run the installer and follow the installation wizard
3. Launch GlobalFix Installer from your desktop
4. Search for your game or enter its Steam App ID
5. Click "Install GlobalFix"
6. Close and reopen Steam
7. Launch your game and enjoy online features!

### For Developers (Building from Source)

See **[BUILD.md](BUILD.md)** for detailed build instructions.

```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Build for distribution
npm run build
```

---

## System Requirements

- **Operating System**: Windows 7/8/10/11 (64-bit)
- **Dependencies**: Steam must be installed
- **Disk Space**: ~150 MB for the installed application
- **Permissions**: May require administrator privileges for Steam configuration modification

---

## Important Notes

### Legal and Ethical Use

- ✅ **Use only for games you legally own**
- ✅ **For personal use and playing with friends**
- ✅ **Backup your game files before modification**
- ⚠️ **Some games may flag this as a modification**
- ⚠️ **Use at your own risk - we are not responsible for bans or account issues**

### Technical Considerations

- **Antivirus Warnings**: Unsigned executables may trigger Windows Defender warnings. This is normal for community-built software.
- **Game Updates**: The fix generally persists through updates, but major changes to game networking may break compatibility.
- **Steam VAC**: This tool does not bypass VAC (Valve Anti-Cheat). Do not use with VAC-protected games.
- **Multiplayer Bans**: Using this tool in games with anti-cheat systems may result in multiplayer bans.

### Troubleshooting

**Steam launch options not applied?**
- Make sure Steam is completely closed when running the installer
- Try adding launch options manually (the app provides instructions)

**Game won't launch after installation?**
- Verify game files through Steam
- Remove the GlobalFix files and reinstall
- Check the "Not Compatible" list above

**Can't find my game?**
- Make sure the game is installed through Steam
- Try entering the App ID manually (found on the Steam store page URL)

---

## How to Find Your Steam App ID

If the search doesn't find your game or you prefer manual entry:

1. Open your game's page on the Steam store
2. Look at the URL: `https://store.steampowered.com/app/XXXXXX/GameName/`
3. The number (`XXXXXX`) is your App ID
4. Enter this number in the GlobalFix Installer

---

## Credits

- **GlobalFix Package**: Community-maintained Steam networking fix
- **Electron Framework**: Cross-platform desktop application framework
- **Steam Database**: Valve Corporation

---

## Support

For issues, questions, or contributions:
- Open an issue on this repository
- Check existing issues for solutions
- Read [BUILD.md](BUILD.md) for development documentation
- See [APP_README.md](APP_README.md) for technical details

---

## Disclaimer

This tool is provided "as-is" without warranty of any kind. The developers are not responsible for:
- Game bans or account suspensions
- Damage to game files or installations
- Compatibility issues with specific games
- Changes in game networking that break functionality
- Any violation of terms of service

**Use responsibly and at your own risk.**

---

## License

MIT License - See repository for details

---

**Version**: 1.0.0
**Last Updated**: November 2024
