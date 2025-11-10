# Global OnlineFix - Unsteam Edition

**A powerful toolkit for enabling online multiplayer, Steam API emulation, and DRM removal in Steam games.**

Global OnlineFix is an Electron-based application that provides three powerful tools for enhancing your Steam gaming experience: **Unsteam** for online multiplayer, **Goldberg Emulator** for Steam API emulation, and **Steamless** for DRM removal. Use them individually or combine them for maximum functionality.

---

## What Does Global OnlineFix Do?

### Three Powerful Tools in One Application

#### 🌐 Unsteam - Online Multiplayer Enabler
- **Enable LAN & Online Multiplayer**: Activates online co-op and multiplayer functionality for games that use peer-to-peer networking
- **No Steam Authentication Required**: Play games online without Steam authentication
- **Direct Connections**: Connect directly with friends via IP address or LAN
- **Works with 80%+ of P2P Games**: Compatible with most games using Steam's networking APIs
- **Manual Launch Option Setup**: Copy/paste a simple launch command to enable Unsteam

#### 🎮 Goldberg Emulator - Steam API Emulation
- **Full Steam API Emulation**: Emulates Steam's APIs without requiring Steam to be running
- **Achievements Support**: Unlock and track achievements offline
- **Friends List Functional**: See and play with friends using the emulator
- **VLAN Support**: Virtual LAN support for network play
- **Save Game Compatibility**: Works with Steam Cloud save formats
- **Customizable Settings**: Configure Steam ID, username, and language

#### 🔓 Steamless - DRM Removal
- **Remove SteamStub Protection**: Strips SteamStub DRM from game executables
- **Improved Compatibility**: Resolves launch issues caused by DRM
- **Performance Benefits**: Potential performance improvements by removing DRM layer
- **Backup Original Files**: Automatically backs up original executable before modification

### Selective Component Installation

**Choose what you need:**
- Install **Unsteam only** for online multiplayer
- Install **Goldberg only** for offline Steam API emulation
- Install **Steamless only** to remove DRM
- Install **any combination** of tools together for maximum functionality

### Smart Unfix Feature

Remove installed components selectively:
- Uninstall individual components without affecting others
- Restore games to their original state
- Track installation state for each game

### How It Works

The Global OnlineFix application streamlines the entire setup process:

1. **Game Detection**: Automatically locates your Steam installation and all game library folders
2. **Smart Search**: Search for games by name with autocomplete or enter Steam App ID directly
3. **Component Selection**: Choose which tools to install (Unsteam, Goldberg, Steamless, or any combination)
4. **Automated Installation**:
   - Downloads and extracts selected components to your game directory
   - Configures INI files with correct executable names and App IDs
   - Sets up Goldberg with your Steam ID and username (if selected)
   - Creates Steamless unpacked executable (if selected)
5. **Manual Launch Option Setup**: For Unsteam, copy the provided launch command and paste it into Steam's game properties
6. **Persistent State Tracking**: Remembers what's installed for easy uninstallation later

All file operations happen in seconds with clear visual feedback.

---

## Compatibility

### Unsteam Compatibility

**✅ What Works with Unsteam:**
- Games using peer-to-peer (P2P) networking
- Games with direct player-to-player connections
- Games using Steam's built-in networking APIs
- Games with LAN-based multiplayer systems
- Games using Steam sockets and Steam networking

**❌ What Doesn't Work with Unsteam:**
- **Dedicated servers** (e.g., Sons of the Forest, Warhammer: Darktide)
- **Authentication-based online** (e.g., For the King 2, FBC: Fireworks)
- **Photon networking** (e.g., Phasmophobia, PEAK, Warhammer: Rogue Trader)
- **Platform-specific authentication** (e.g., Microsoft accounts for Grounded)
- **Third-party authentication services**

### Goldberg Emulator Compatibility

**✅ Works with most games** that use Steam APIs for:
- Achievements
- Stats tracking
- Friend lists
- Steam Cloud saves
- Steam networking (when combined with Unsteam)

### Steamless Compatibility

**✅ Works with games** protected by:
- SteamStub DRM (most common Steam DRM)

**❌ Does not work with:**
- Denuvo or other third-party DRM
- Games without SteamStub protection (not needed anyway)

---

## Tested Games (Unsteam)

### ✅ Confirmed Working (12 Games)

The following games have been successfully tested with **Unsteam** and confirmed to have working online multiplayer:

- **Granny Escape Together** - Online multiplayer confirmed working
- **Paint the Town Red** - LAN play confirmed, online works with Steam servers
- **Mimesis** - Multiplayer working
- **Hearts of Iron IV** - Multiplayer confirmed working
- **South Park: Snow Day** - Online functionality confirmed
- **Escape Simulator** - Multiplayer works perfectly
- **Stellaris** - Multiplayer confirmed working
- **Swapmeat** - Works as expected
- **Europa Universalis IV** - Multiplayer confirmed working
- **Veins** - Online features working
- **Tavern Keeper** - Works correctly
- **Streets of Rage 4** - Multiplayer working

### ❌ Not Compatible (12 Games)

These games have been tested and are **not compatible** with Unsteam due to their network architecture:

- **Inzoi** - Does not work with current version
- **Sons of the Forest** - Uses dedicated servers
- **PEAK** - Photon networking
- **FBC: Fireworks** - Authentication-based online only
- **For the King 2** - Requires authentication
- **American Truck Simulator** - Multiplayer not working with Unsteam
- **Grounded** - Microsoft account authentication required
- **Dying Light** - Incompatible
- **Warhammer: Darktide** - Dedicated servers
- **Warhammer 40,000: Rogue Trader** - Not compatible
- **Abiotic Factor** - Does not work
- **Phasmophobia** - Photon networking

**Note**: This list represents community-tested games. Many other games will work or not work based on similar technical factors. Check our [compatibility database](https://shaynevi.github.io/Gaming-Tools/compatibility.html) for the latest updates.

---

## Features

### Core Features
- 🎮 **Three Tools in One** - Unsteam, Goldberg Emulator, and Steamless in one application
- 🔧 **Selective Installation** - Choose which components to install (one, two, or all three)
- 🔎 **Steam Game Database Search** - Instant autocomplete search across 150,000+ Steam games
- 🎯 **Automatic Game Detection** - Finds your Steam installation and all library folders
- ⚡ **Quick Installation** - Complete setup in seconds with visual progress feedback
- 📋 **Manual Launch Options** - Clear instructions for setting up Steam launch options
- 🗑️ **Smart Unfix** - Remove components selectively without affecting others
- 💾 **State Tracking** - Remembers what's installed for each game
- 🎨 **Modern UI** - Clean, user-friendly interface with clear status messages
- 📏 **Resizable Window** - Adjust window size to your preference

### Unsteam Features
- Enable LAN and online multiplayer without Steam authentication
- Copy/paste launch option setup (no Steam automation needed)
- Works with Steam's networking APIs
- Persistent through game updates

### Goldberg Emulator Features
- Custom Steam ID configuration
- Username and language settings
- Achievements and stats support
- Friends list and VLAN support
- Optional overlay and local save options

### Steamless Features
- Automatic SteamStub DRM removal
- Backup original executables
- Improved game compatibility
- Potential performance improvements

---

## Quick Start

### For Users (Using Pre-Built Application)

1. Download the latest `Global-OnlineFix-Unsteam.exe`
2. Run the application (no installation needed - portable)
3. Search for your game or enter its Steam App ID
4. **Select components** to install:
   - ✅ **Unsteam** - For online multiplayer
   - ✅ **Goldberg** - For Steam API emulation (configure Steam ID and username)
   - ✅ **Steamless** - For DRM removal
5. Click **"Install GlobalFix"**
6. **If you enabled Unsteam**: Copy the provided launch option command and paste it into your game's Steam properties → Launch Options
7. Launch your game and enjoy!

### Setting Up Steam Launch Options (for Unsteam)

If you installed Unsteam, you need to add a launch option:

1. Open **Steam**
2. Go to your **Library**
3. **Right-click** on the game → Select **Properties**
4. Find the **Launch Options** box
5. **Paste** the command provided by the app (looks like: `"C:\path\to\unsteam_loader64.exe" %command%`)
6. Close properties and launch your game

### Removing Components (Unfix)

1. Open the app and search for your game
2. Click **"Unfix Game"** button
3. Select which components to remove
4. If removing Unsteam, don't forget to remove the launch option from Steam properties

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

**Game won't launch after installation?**
- Verify game files through Steam (Right-click game → Properties → Local Files → Verify Integrity)
- Use the Unfix feature to remove components and try reinstalling
- Check the "Not Compatible" list above
- Make sure you copied the launch option correctly (for Unsteam)

**Unsteam not working (multiplayer still doesn't work)?**
- Double-check the launch option is set correctly in Steam
- Make sure the path in launch options matches the actual unsteam_loader64.exe location
- Try launching the game through Steam (not directly from the .exe)
- Verify the game uses P2P networking (not dedicated servers)

**Can't find my game?**
- Make sure the game is installed through Steam
- Try entering the App ID manually (found on the Steam store page URL: store.steampowered.com/app/XXXXX)
- Check that your Steam library folder is detected

**Goldberg not working?**
- Make sure you configured your Steam ID (can use any random number)
- Check that the game actually uses Steam APIs
- Some games may need additional configuration files

**Steamless fails to remove DRM?**
- The game may not have SteamStub protection (check with a tool like Protection ID)
- The game may have additional DRM layers (Denuvo, etc.)
- Try running the app as Administrator

---

## How to Find Your Steam App ID

If the search doesn't find your game or you prefer manual entry:

1. Open your game's page on the Steam store
2. Look at the URL: `https://store.steampowered.com/app/XXXXXX/GameName/`
3. The number (`XXXXXX`) is your App ID
4. Enter this number in the GlobalFix Installer

---

## Credits

- **Unsteam**: Community-maintained Steam networking alternative for LAN/online play
- **Goldberg Emulator**: Steam API emulator by Mr_Goldberg
- **Steamless**: SteamStub DRM removal tool by atom0s
- **Electron Framework**: Cross-platform desktop application framework
- **Steam Database**: Valve Corporation
- **Community Testers**: Thank you to everyone who tested games and reported compatibility

---

## Support

For issues, questions, or contributions:
- 🐛 **Open an issue** on this repository
- 💬 **Check existing issues** for solutions
- 📖 **Visit our website**: [Gaming Tools Portfolio](https://shaynevi.github.io/Gaming-Tools/)
- 🎮 **Check compatibility**: [Game Compatibility Database](https://shaynevi.github.io/Gaming-Tools/compatibility.html)
- 🔧 **Development docs**: [BUILD.md](BUILD.md) for building from source

---

## Related Projects

Check out our other gaming tools:
- **[Steam Save Monitor](https://github.com/ShayneVi/Steam-Save-Monitor)** - Automated save file and achievement backup
- **[GameVault](https://github.com/ShayneVi/GameVault)** - Multi-platform game library manager
- **[Sims 4 Mod Manager](https://github.com/ShayneVi/Sims4ModManager)** - Manage Sims 4 mods and custom content
- **[OnlineFix Plugin](https://github.com/ShayneVi/OnlineFix-Plugin)** - Plugin for online fix functionality
- **[Ludusavi Restore Plugin](https://github.com/ShayneVi/LudusaviRestore-Plugin)** - Automated save restoration

---

## Disclaimer

This tool is provided "as-is" without warranty of any kind. The developers are not responsible for:
- Game bans or account suspensions
- Damage to game files or installations
- Compatibility issues with specific games
- Changes in game networking that break functionality
- Any violation of terms of service
- Issues arising from improper use

**Use responsibly and at your own risk. Only use with games you legally own.**

---

## License

MIT License - See repository for details

---

**Version**: 2.0.0
**Last Updated**: November 2024
**Website**: [shaynevi.github.io/Gaming-Tools](https://shaynevi.github.io/Gaming-Tools/)
