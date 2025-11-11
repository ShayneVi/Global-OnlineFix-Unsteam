// Get DOM elements
const gameSearchInput = document.getElementById('gameSearch');
const searchDropdown = document.getElementById('searchDropdown');
const appIdInput = document.getElementById('appId');
const installBtn = document.getElementById('installBtn');
const unfixBtn = document.getElementById('unfixBtn');
const statusSection = document.getElementById('status');
const statusText = document.getElementById('statusText');
const spinner = document.getElementById('spinner');
const resultSection = document.getElementById('result');
const resultTitle = document.getElementById('resultTitle');
const resultDetails = document.getElementById('resultDetails');

// Unsteam options elements
const unsteamCheckbox = document.getElementById('unsteamCheckbox');
const unsteamOptions = document.getElementById('unsteamOptions');
const unsteamSteamIdInput = document.getElementById('unsteamSteamId');
const unsteamUsernameInput = document.getElementById('unsteamUsername');

// Goldberg options elements
const goldbergCheckbox = document.getElementById('goldbergCheckbox');
const goldbergOptions = document.getElementById('goldbergOptions');
const accountNameInput = document.getElementById('accountName');
const steamIdInput = document.getElementById('steamId');
const languageSelect = document.getElementById('language');
const steamApiKeyInput = document.getElementById('steamApiKey');

// Steamless options elements
const steamlessCheckbox = document.getElementById('steamlessCheckbox');

// Steam apps list
let steamApps = [];
let searchTimeout = null;

// Fetch Steam app list on load
async function loadSteamApps() {
  try {
    const result = await window.electronAPI.fetchSteamApps();
    if (result.success) {
      steamApps = result.apps;
      console.log(`Loaded ${steamApps.length} Steam games`);
    } else {
      console.error('Failed to load Steam apps:', result.error);
    }
  } catch (error) {
    console.error('Error loading Steam apps:', error);
  }
}

// Debounced search function
function handleGameSearch() {
  const query = gameSearchInput.value.trim().toLowerCase();

  // Clear existing timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  // If search is empty, hide dropdown
  if (query === '') {
    searchDropdown.classList.add('hidden');
    return;
  }

  // Show loading state
  searchDropdown.classList.remove('hidden');
  searchDropdown.innerHTML = '<div class="search-dropdown-loading">Searching...</div>';

  // Debounce search by 500ms
  searchTimeout = setTimeout(() => {
    performSearch(query);
  }, 500);
}

// Perform the actual search
function performSearch(query) {
  // Filter games by name (case insensitive)
  const results = steamApps.filter(app =>
    app.name.toLowerCase().includes(query)
  ).slice(0, 50); // Limit to 50 results

  // Display results
  if (results.length === 0) {
    searchDropdown.innerHTML = '<div class="search-dropdown-empty">No games found</div>';
  } else {
    searchDropdown.innerHTML = results.map(app => `
      <div class="search-dropdown-item" data-appid="${app.appid}" data-name="${escapeHtml(app.name)}">
        <div class="search-dropdown-item-name">${escapeHtml(app.name)}</div>
        <div class="search-dropdown-item-appid">App ID: ${app.appid}</div>
      </div>
    `).join('');

    // Add click handlers to dropdown items
    const items = searchDropdown.querySelectorAll('.search-dropdown-item');
    items.forEach(item => {
      item.addEventListener('click', () => {
        const appId = item.getAttribute('data-appid');
        const gameName = item.getAttribute('data-name');
        selectGame(appId, gameName);
      });
    });
  }
}

// Handle game selection
function selectGame(appId, gameName) {
  appIdInput.value = appId;
  gameSearchInput.value = gameName;
  searchDropdown.classList.add('hidden');
  installBtn.disabled = false;
  unfixBtn.disabled = false;

  // Fetch and display game info from PCGamingWiki
  fetchAndDisplayGameInfo(appId);
}

// Clear game selection
function clearGameSelection() {
  appIdInput.value = '';
  gameSearchInput.value = '';
  installBtn.disabled = true;
  unfixBtn.disabled = true;

  // Hide game info section
  const gameInfoSection = document.getElementById('gameInfoSection');
  if (gameInfoSection) {
    gameInfoSection.classList.add('hidden');
  }
}

// Fetch and display game info from PCGamingWiki
async function fetchAndDisplayGameInfo(appId) {
  console.log(`[Renderer] Fetching game info for AppID: ${appId}`);

  const gameInfoSection = document.getElementById('gameInfoSection');
  const gameInfoLoading = document.getElementById('gameInfoLoading');
  const gameInfoContent = document.getElementById('gameInfoContent');
  const gameInfoTitle = document.getElementById('gameInfoTitle');

  // Update title with game name if available
  const gameName = gameSearchInput.value.trim();
  if (gameName) {
    gameInfoTitle.textContent = `${gameName} Network Information`;
  } else {
    gameInfoTitle.textContent = 'Game Network Information';
  }

  // Show section and loading state
  gameInfoSection.classList.remove('hidden');
  gameInfoLoading.classList.remove('hidden');
  gameInfoContent.classList.add('hidden');

  try {
    const result = await window.electronAPI.fetchPCGamingWikiInfo(appId);

    console.log('[Renderer] Received result:', result);

    gameInfoLoading.classList.add('hidden');

    if (result.success) {
      console.log('[Renderer] Success! Populating game info');
      populateGameInfo(result.data);
      gameInfoContent.classList.remove('hidden');
    } else {
      console.log('[Renderer] Failed:', result.error);
      // Show "No info" state
      showNoGameInfo();
    }
  } catch (error) {
    console.log('[Renderer] Error:', error);
    gameInfoLoading.classList.add('hidden');
    showNoGameInfo();
  }
}

// Clean wikitext markup from text
function cleanWikitext(text) {
  if (!text) return '';

  let cleaned = text;

  // Remove nested MediaWiki templates like {{...}} using iterative approach
  // Keep removing until no more templates found
  let prevLength = 0;
  while (cleaned.length !== prevLength) {
    prevLength = cleaned.length;
    // Remove simple templates first
    cleaned = cleaned.replace(/\{\{[^{}]*\}\}/g, '');
  }

  // Remove MediaWiki references like <ref>...</ref> or <ref name="..." />
  cleaned = cleaned.replace(/<ref[^>]*>.*?<\/ref>/gis, '');
  cleaned = cleaned.replace(/<ref[^>]*\/>/gi, '');
  cleaned = cleaned.replace(/<ref[^>]*>/gi, '');
  cleaned = cleaned.replace(/<\/ref>/gi, '');

  // Convert wiki links [url text] to just the text
  cleaned = cleaned.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1');
  cleaned = cleaned.replace(/\[https?:\/\/[^\]]+\]/g, '');

  // Remove HTML tags
  cleaned = cleaned.replace(/<br\s*\/?>/gi, ' ');
  cleaned = cleaned.replace(/<[^>]+>/g, '');

  // Remove any remaining template artifacts
  cleaned = cleaned.replace(/\{\{/g, '');
  cleaned = cleaned.replace(/\}\}/g, '');
  cleaned = cleaned.replace(/\|[a-z\s]+=/gi, '');

  // Clean up multiple spaces and trim
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

// Populate game info tables
function populateGameInfo(data) {
  const multiplayerTableBody = document.getElementById('multiplayerTableBody');
  const connectionTableBody = document.getElementById('connectionTableBody');
  const gameRecommendations = document.getElementById('gameRecommendations');

  // Populate multiplayer table
  const multiplayerRows = [];

  if (data.multiplayer && Object.keys(data.multiplayer).length > 0) {
    const mp = data.multiplayer;

    // Local Play - show if defined
    if (mp.localPlay !== undefined) {
      const details = cleanWikitext(mp.localPlayNotes || mp.localPlayPlayers || '');
      multiplayerRows.push(createTableRow('Local Play', mp.localPlay, details));
    }

    // LAN Play - show if defined
    if (mp.lanPlay !== undefined) {
      const details = cleanWikitext(mp.lanPlayNotes || mp.lanPlayPlayers || '');
      multiplayerRows.push(createTableRow('LAN Play', mp.lanPlay, details));
    }

    // Online Play - show if defined
    if (mp.onlinePlay !== undefined) {
      const onlineDetails = [
        mp.onlinePlayPlayers && `${mp.onlinePlayPlayers} players`,
        mp.onlinePlayModes,
        cleanWikitext(mp.onlinePlayNotes || '')
      ].filter(Boolean).join(', ');
      multiplayerRows.push(createTableRow('Online Play', mp.onlinePlay, onlineDetails));
    }

    // Crossplay - show if defined
    if (mp.crossplay !== undefined) {
      const crossplayDetails = cleanWikitext([mp.crossplayPlatforms, mp.crossplayNotes].filter(Boolean).join(', '));
      multiplayerRows.push(createTableRow('Crossplay', mp.crossplay, crossplayDetails));
    }

    // Asynchronous - show if defined
    if (mp.asynchronous !== undefined) {
      multiplayerRows.push(createTableRow('Asynchronous', mp.asynchronous, ''));
    }
  }

  if (multiplayerRows.length > 0) {
    multiplayerTableBody.innerHTML = multiplayerRows.join('');
  } else {
    multiplayerTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No info</td></tr>';
  }

  // Populate connection table - ALWAYS show all connection types
  const connectionRows = [];

  if (data.connections && Object.keys(data.connections).length > 0) {
    const conn = data.connections;

    // Always show these connection types (even if empty)
    connectionRows.push(createTableRow('Matchmaking', conn.matchmaking || '', cleanWikitext(conn.matchmakingNotes || '')));
    connectionRows.push(createTableRow('P2P', conn.p2p || '', cleanWikitext(conn.p2pNotes || '')));
    connectionRows.push(createTableRow('Dedicated Servers', conn.dedicated || '', cleanWikitext(conn.dedicatedNotes || '')));
    connectionRows.push(createTableRow('Self-Hosting', conn.selfHosting || '', cleanWikitext(conn.selfHostingNotes || '')));
    connectionRows.push(createTableRow('Direct IP', conn.directIp || '', cleanWikitext(conn.directIpNotes || '')));
  }

  if (connectionRows.length > 0) {
    connectionTableBody.innerHTML = connectionRows.join('');
  } else {
    connectionTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No info</td></tr>';
  }

  // Populate network ports table
  const portsTableContainer = document.getElementById('portsTableContainer');
  const portsTableBody = document.getElementById('portsTableBody');

  if (data.ports && (data.ports.tcp || data.ports.udp || data.ports.upnp)) {
    const portsRows = [];

    if (data.ports.tcp) {
      portsRows.push(`<tr><td>TCP</td><td>${escapeHtml(cleanWikitext(data.ports.tcp))}</td></tr>`);
    }
    if (data.ports.udp) {
      portsRows.push(`<tr><td>UDP</td><td>${escapeHtml(cleanWikitext(data.ports.udp))}</td></tr>`);
    }
    if (data.ports.upnp) {
      portsRows.push(`<tr><td>UPnP</td><td>${escapeHtml(cleanWikitext(data.ports.upnp))}</td></tr>`);
    }

    portsTableBody.innerHTML = portsRows.join('');
    portsTableContainer.classList.remove('hidden');
  } else {
    portsTableContainer.classList.add('hidden');
  }

  // Generate recommendations
  generateRecommendations(data, gameRecommendations);
}

// Create table row
function createTableRow(type, support, details) {
  const supportFormatted = formatSupport(support);
  const detailsFormatted = escapeHtml(details || '');

  return `
    <tr>
      <td>${escapeHtml(type)}</td>
      <td>${supportFormatted}</td>
      <td>${detailsFormatted}</td>
    </tr>
  `;
}

// Format support value
function formatSupport(value) {
  if (!value || value.trim() === '') {
    return '❓ Unknown';
  }

  const lowerValue = value.toLowerCase().trim();

  if (lowerValue === 'true' || lowerValue === 'yes') {
    return '✅ Yes';
  } else if (lowerValue === 'false' || lowerValue === 'no') {
    return '❌ No';
  } else if (lowerValue === 'limited' || lowerValue === 'hackable') {
    return '⚠️ ' + escapeHtml(value);
  } else if (lowerValue === 'unknown') {
    return '❓ Unknown';
  } else {
    return escapeHtml(value);
  }
}

// Generate recommendations
function generateRecommendations(data, container) {
  const recommendations = [];
  const conn = data.connections || {};
  const mp = data.multiplayer || {};

  // Check for dedicated servers
  const hasDedicatedServers = conn.dedicated && (conn.dedicated.toLowerCase() === 'true' || conn.dedicated.toLowerCase() === 'yes');
  const hasP2P = conn.p2p && (conn.p2p.toLowerCase() === 'true' || conn.p2p.toLowerCase() === 'yes' || conn.p2p.toLowerCase() === 'limited');
  const hasLAN = mp.lanPlay && (mp.lanPlay.toLowerCase() === 'true' || mp.lanPlay.toLowerCase() === 'yes');

  if (hasDedicatedServers) {
    recommendations.push({
      type: 'warning',
      text: '⚠️ <strong>Unsteam Global Fix MAY NOT work</strong> - This game uses dedicated servers. Please do try and send feedback on <a href="https://github.com/ShayneVi/Global-OnlineFix-Unsteam/issues" target="_blank">GitHub Issues</a>.'
    });
  } else if (hasP2P) {
    recommendations.push({
      type: 'warning',
      text: '⚠️ <strong>Unsteam Global Fix should work</strong>, unless third-party authentications are used. If it does or doesn\'t work, please report the name of the game in <a href="https://github.com/ShayneVi/Global-OnlineFix-Unsteam/issues" target="_blank">GitHub Issues</a>.'
    });
  }

  if (hasLAN) {
    recommendations.push({
      type: 'success',
      text: '✅ <strong>Virtual LAN should function with Goldberg Steam Emu</strong> - Use tools like Hamachi or ZeroTier to create a virtual LAN.'
    });
  }

  // Display recommendations
  if (recommendations.length > 0) {
    container.innerHTML = recommendations.map(rec => `
      <div class="game-recommendations recommendation-${rec.type}">
        ${rec.text}
      </div>
    `).join('');
  } else {
    container.innerHTML = '';
  }
}

// Show no game info state
function showNoGameInfo() {
  const gameInfoContent = document.getElementById('gameInfoContent');
  const multiplayerTableBody = document.getElementById('multiplayerTableBody');
  const connectionTableBody = document.getElementById('connectionTableBody');
  const gameRecommendations = document.getElementById('gameRecommendations');

  multiplayerTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No info</td></tr>';
  connectionTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No info</td></tr>';
  gameRecommendations.innerHTML = '<div class="game-recommendations recommendation-info">ℹ️ No network information available for this game on PCGamingWiki.</div>';

  gameInfoContent.classList.remove('hidden');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!gameSearchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
    searchDropdown.classList.add('hidden');
  }
});

// Game search input event listener
gameSearchInput.addEventListener('input', () => {
  handleGameSearch();

  // Clear App ID when user starts searching for a new game
  if (appIdInput.value && gameSearchInput.value !== appIdInput.value) {
    appIdInput.value = '';
  }
});

// Unsteam checkbox toggle
unsteamCheckbox.addEventListener('change', () => {
  if (unsteamCheckbox.checked) {
    unsteamOptions.classList.remove('hidden');
  } else {
    unsteamOptions.classList.add('hidden');
  }
});

// Goldberg checkbox toggle
goldbergCheckbox.addEventListener('change', () => {
  if (goldbergCheckbox.checked) {
    goldbergOptions.classList.remove('hidden');
  } else {
    goldbergOptions.classList.add('hidden');
  }
});

// Info button tooltips
document.querySelectorAll('.info-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const tooltipId = 'tooltip-' + btn.getAttribute('data-tooltip');
    const tooltip = document.getElementById(tooltipId);
    if (tooltip) {
      // Hide all other tooltips
      document.querySelectorAll('.tooltip-content').forEach(t => {
        if (t.id !== tooltipId) {
          t.classList.add('hidden');
        }
      });
      // Toggle this tooltip
      tooltip.classList.toggle('hidden');
    }
  });
});

// Close tooltips when clicking elsewhere
document.addEventListener('click', (e) => {
  if (!e.target.closest('.info-btn') && !e.target.closest('.tooltip-content')) {
    document.querySelectorAll('.tooltip-content').forEach(t => {
      t.classList.add('hidden');
    });
  }
});

// Load saved Steam API key from localStorage
window.addEventListener('DOMContentLoaded', () => {
  const savedApiKey = localStorage.getItem('steamApiKey');
  if (savedApiKey) {
    steamApiKeyInput.value = savedApiKey;
  }
});

// Save Steam API key to localStorage when it changes
steamApiKeyInput.addEventListener('input', () => {
  const apiKey = steamApiKeyInput.value.trim();
  if (apiKey) {
    localStorage.setItem('steamApiKey', apiKey);
  } else {
    localStorage.removeItem('steamApiKey');
  }
});

// Enable buttons when AppID is entered
let appIdTimeout = null;
appIdInput.addEventListener('input', () => {
  const appId = appIdInput.value.trim();
  const hasAppId = appId !== '';
  installBtn.disabled = !hasAppId;
  unfixBtn.disabled = !hasAppId;

  // Debounce the game info fetch
  if (appIdTimeout) {
    clearTimeout(appIdTimeout);
  }

  if (hasAppId && /^\d+$/.test(appId)) {
    appIdTimeout = setTimeout(() => {
      fetchAndDisplayGameInfo(appId);
    }, 500);
  }
});

// Handle Enter key in input
appIdInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && appIdInput.value.trim() !== '') {
    handleInstall();
  }
});

// Handle install button click
installBtn.addEventListener('click', handleInstall);

async function handleInstall() {
  const appId = appIdInput.value.trim();

  if (!appId) {
    return;
  }

  // Validate AppID (should be numbers only)
  if (!/^\d+$/.test(appId)) {
    showError('Invalid App ID', 'Please enter a valid numeric Steam App ID.');
    return;
  }

  // Check which components are enabled
  const unsteamEnabled = unsteamCheckbox.checked;
  const goldbergEnabled = goldbergCheckbox.checked;
  const steamlessEnabled = steamlessCheckbox.checked;

  // Validate at least one component is selected
  if (!unsteamEnabled && !goldbergEnabled && !steamlessEnabled) {
    showError('No Components Selected', 'Please select at least one component to install (Unsteam, Goldberg, or Steamless).');
    return;
  }

  // Collect Goldberg options (if enabled)
  let goldbergOptions = null;
  if (goldbergEnabled) {
    goldbergOptions = {
      accountName: accountNameInput.value.trim() || 'Goldberg',
      steamId: steamIdInput.value.trim() || '76561197960287930',
      language: languageSelect.value || 'english',
      steamApiKey: steamApiKeyInput.value.trim() || null
    };
  }

  // Collect all options
  const options = {
    appId,
    unsteamEnabled,
    goldbergEnabled,
    goldbergOptions,
    steamlessEnabled,
    steamId: unsteamSteamIdInput.value.trim() || null,
    username: unsteamUsernameInput.value.trim() || null
  };

  // Disable inputs during installation
  appIdInput.disabled = true;
  gameSearchInput.disabled = true;
  installBtn.disabled = true;
  unfixBtn.disabled = true;
  unsteamCheckbox.disabled = true;
  goldbergCheckbox.disabled = true;
  steamlessCheckbox.disabled = true;

  // Build status message
  const components = [];
  if (unsteamEnabled) components.push('Unsteam');
  if (goldbergEnabled) components.push('Goldberg');
  if (steamlessEnabled) components.push('Steamless');
  const statusMsg = `Applying fix with: ${components.join(', ')}...`;

  // Show status
  showStatus(statusMsg);

  try {
    // Call the main process to apply the fix
    const result = await window.electronAPI.installGlobalFix(options);

    hideStatus();

    if (result.success) {
      showSuccess(result, unsteamEnabled, goldbergEnabled, steamlessEnabled);
    } else {
      showError('Installation Failed', result.error);
    }
  } catch (error) {
    hideStatus();
    showError('Installation Error', error.message || 'An unexpected error occurred.');
  } finally {
    // Re-enable inputs
    gameSearchInput.disabled = false;
    appIdInput.disabled = false;
    installBtn.disabled = false;
    unfixBtn.disabled = false;
    unsteamCheckbox.disabled = false;
    goldbergCheckbox.disabled = false;
    steamlessCheckbox.disabled = false;
  }
}

function showStatus(message) {
  statusText.textContent = message;
  spinner.classList.remove('hidden');
  statusSection.classList.remove('hidden');
  resultSection.classList.add('hidden');
}

function hideStatus() {
  statusSection.classList.add('hidden');
}

function showSuccess(result, unsteamEnabled, goldbergEnabled, steamlessEnabled) {
  resultSection.classList.remove('hidden', 'error');
  resultSection.classList.add('success');
  resultTitle.textContent = '✓ Fix Applied Successfully!';

  // Build component list
  const components = [];
  if (steamlessEnabled && result.steamless) components.push('Steamless DRM removal');
  if (unsteamEnabled && result.unsteam) components.push('Unsteam online fix');
  if (goldbergEnabled && result.goldberg) components.push('Goldberg emulator');

  // Build next steps
  let nextSteps = '';

  if (steamlessEnabled && result.steamless) {
    nextSteps += '<li>Game executable has been unpacked (SteamStub DRM removed)</li>';
  }

  if (unsteamEnabled && result.unsteam) {
    nextSteps += '<li>Unsteam has been installed to your game folder</li>';
    nextSteps += '<li>The unsteam.ini file has been configured with your game settings</li>';
    nextSteps += '<li><strong style="color: #e74c3c;">⚠️ IMPORTANT: You must set the Steam launch option manually (see below)</strong></li>';
  }

  if (goldbergEnabled && result.goldberg) {
    nextSteps += '<li>Goldberg emulator has been configured with achievements and VLAN support</li>';
    nextSteps += '<li>steam_settings folder has been created with all necessary files</li>';
    if (result.goldberg.achievementsCount > 0) {
      nextSteps += `<li>Downloaded ${result.goldberg.achievementsCount} achievements</li>`;
    }
  }

  if (goldbergEnabled) {
    nextSteps += '<li>For VLAN play: Connect to your Hamachi/ZeroTier network first</li>';
    nextSteps += '<li>Each player should have a unique Steam ID (increment the last digits)</li>';
  }

  // Build manual launch options section for Unsteam
  let manualLaunchOptionsSection = '';
  if (unsteamEnabled && result.unsteam) {
    const launchOptionsCommand = `"${result.unsteam.loaderPath}" %command%`;

    manualLaunchOptionsSection = `
      <div class="result-details-item" style="margin-top: 20px; padding: 20px; background: #fff3cd; border: 3px solid #ffc107; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 15px;">
          <strong style="color: #856404; font-size: 1.2em;">⚠️ FINAL STEP: SET STEAM LAUNCH OPTION ⚠️</strong>
        </div>

        <p style="margin: 10px 0; color: #856404; font-size: 1em; text-align: center;">
          Copy the command below and paste it into the game's Steam Launch Options
        </p>

        <div style="background: #f8f9fa; border: 3px solid #667eea; border-radius: 8px; padding: 15px; margin: 15px 0;">
          <strong style="color: #667eea; font-size: 1.1em;">Launch Options Command:</strong>
          <div style="background: white; border: 2px solid #667eea; border-radius: 4px; padding: 15px; margin: 10px 0; font-family: 'Courier New', monospace; font-size: 1.05em; word-break: break-all; user-select: all; text-align: center; font-weight: bold;">
            ${escapeHtml(launchOptionsCommand)}
          </div>
          <p style="margin: 10px 0 0 0; color: #555; font-size: 0.9em; text-align: center;">
            <strong>💡 Tip:</strong> Triple-click to select all, then Ctrl+C to copy
          </p>
        </div>

        <div style="background: #e8f4f8; border-left: 4px solid #3498db; padding: 15px; margin: 10px 0; border-radius: 4px;">
          <strong style="color: #2980b9; font-size: 1.05em;">📋 How to Set Launch Options:</strong>
          <ol style="margin: 8px 0 0 20px; line-height: 2; color: #34495e; font-size: 0.95em;">
            <li>Open <strong>Steam</strong></li>
            <li>Go to your <strong>Library</strong></li>
            <li><strong>Right-click</strong> on the game</li>
            <li>Select <strong>Properties</strong></li>
            <li>Find the <strong>Launch Options</strong> box (usually at the bottom)</li>
            <li><strong>Paste</strong> the command from above into the Launch Options box</li>
            <li>Close the properties window and <strong>launch your game!</strong></li>
          </ol>
        </div>
      </div>
    `;
  }

  resultDetails.innerHTML = `
    <div class="result-details-item">
      <strong>Game Folder:</strong> ${escapeHtml(result.gameFolder)}
    </div>
    <div class="result-details-item">
      <strong>Game Executable:</strong> ${escapeHtml(result.gameExe)}
    </div>
    ${components.length > 0 ? `
      <div class="result-details-item">
        <strong>Components Installed:</strong> ${components.join(', ')}
      </div>
    ` : ''}
    ${manualLaunchOptionsSection}
    <div class="result-details-item" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ccc;">
      <strong>What Was Installed:</strong>
      <ol style="margin-left: 20px; margin-top: 10px; line-height: 1.6;">
        ${nextSteps}
      </ol>
    </div>
  `;
}

function showError(title, message) {
  resultSection.classList.remove('hidden', 'success');
  resultSection.classList.add('error');
  resultTitle.textContent = '✗ ' + title;
  resultDetails.innerHTML = `<p>${escapeHtml(message)}</p>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Handle unfix button click
unfixBtn.addEventListener('click', handleUnfix);

async function handleUnfix() {
  const appId = appIdInput.value.trim();

  if (!appId) {
    showError('App ID Required', 'Please enter a Steam App ID to unfix.');
    return;
  }

  // Validate AppID (should be numbers only)
  if (!/^\d+$/.test(appId)) {
    showError('Invalid App ID', 'Please enter a valid numeric Steam App ID.');
    return;
  }

  // Check which components are selected for removal
  const removeUnsteam = unsteamCheckbox.checked;
  const removeGoldberg = goldbergCheckbox.checked;
  const removeSteamless = steamlessCheckbox.checked;

  // Validate at least one component is selected
  if (!removeUnsteam && !removeGoldberg && !removeSteamless) {
    showError('No Components Selected', 'Please select at least one component to remove (check the boxes for Unsteam, Goldberg, or Steamless).');
    return;
  }

  // Build dynamic confirmation message
  const components = [];
  if (removeUnsteam) components.push('Unsteam');
  if (removeGoldberg) components.push('Goldberg');
  if (removeSteamless) components.push('Steamless');

  const componentsList = components.join(', ');
  const confirmMessage = `This will remove ${componentsList} modifications from the game.\n\nContinue?`;

  // Confirm with user
  if (!confirm(confirmMessage)) {
    return;
  }

  // Disable inputs during unfix
  appIdInput.disabled = true;
  gameSearchInput.disabled = true;
  installBtn.disabled = true;
  unfixBtn.disabled = true;
  unsteamCheckbox.disabled = true;
  goldbergCheckbox.disabled = true;
  steamlessCheckbox.disabled = true;

  // Build status message
  const statusMsg = `Removing ${componentsList}...`;

  // Show status
  showStatus(statusMsg);

  try {
    // Call the main process to unfix the game
    const options = {
      appId,
      removeUnsteam,
      removeGoldberg,
      removeSteamless
    };
    const result = await window.electronAPI.unfixGame(options);

    hideStatus();

    if (result.success) {
      showUnfixSuccess(result, removeUnsteam);
    } else {
      showError('Unfix Failed', result.error || 'An error occurred while unfixing the game.');
    }
  } catch (error) {
    hideStatus();
    showError('Unfix Error', error.message || 'An unexpected error occurred.');
  } finally {
    // Re-enable inputs
    gameSearchInput.disabled = false;
    appIdInput.disabled = false;
    installBtn.disabled = false;
    unfixBtn.disabled = false;
    unsteamCheckbox.disabled = false;
    goldbergCheckbox.disabled = false;
    steamlessCheckbox.disabled = false;
  }
}

function showUnfixSuccess(result, unsteamWasRemoved) {
  resultSection.classList.remove('hidden', 'error');
  resultSection.classList.add('success');
  resultTitle.textContent = '✓ Game Unfixed Successfully!';

  const removedItemsHtml = result.removedItems && result.removedItems.length > 0
    ? `<ul style="margin-left: 20px; margin-top: 10px; line-height: 1.6;">${result.removedItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p>No modifications were found to remove.</p>';

  let launchOptionsReminder = '';
  if (unsteamWasRemoved) {
    launchOptionsReminder = `
      <div style="margin-top: 15px; padding: 15px; background: #e8f4f8; border-left: 4px solid #3498db; border-radius: 4px;">
        <strong style="color: #2980b9;">💡 Don't forget:</strong>
        <p style="margin: 5px 0 0 0; color: #34495e;">
          Remove the Unsteam launch option from the game's Steam properties if you added it.
        </p>
      </div>
    `;
  }

  const gameExeInfo = result.gameExe ? `
    <div class="result-details-item">
      <strong>Restored Executable:</strong> ${escapeHtml(result.gameExe)}
    </div>
  ` : '';

  resultDetails.innerHTML = `
    <div class="result-details-item">
      <strong>Game Folder:</strong> ${escapeHtml(result.gameFolder)}
    </div>
    ${gameExeInfo}
    <div class="result-details-item" style="margin-top: 15px;">
      <strong>Removed Items:</strong>
      ${removedItemsHtml}
    </div>
    <div class="result-details-item" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ccc;">
      <p>✓ The game has been restored to its original state.</p>
      <p>You can now launch the game normally from Steam.</p>
      ${launchOptionsReminder}
    </div>
  `;
}

// Initialize
installBtn.disabled = true;
unfixBtn.disabled = true;
loadSteamApps();
