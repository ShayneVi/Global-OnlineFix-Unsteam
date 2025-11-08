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

// Goldberg options elements
const goldbergCheckbox = document.getElementById('goldbergCheckbox');
const goldbergOptions = document.getElementById('goldbergOptions');
const accountNameInput = document.getElementById('accountName');
const steamIdInput = document.getElementById('steamId');
const languageSelect = document.getElementById('language');
const steamApiKeyInput = document.getElementById('steamApiKey');

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

// Fetch and display game info from PCGamingWiki
async function fetchAndDisplayGameInfo(appId) {
  const gameInfoSection = document.getElementById('gameInfoSection');
  const gameInfoLoading = document.getElementById('gameInfoLoading');
  const gameInfoContent = document.getElementById('gameInfoContent');

  // Show section and loading state
  gameInfoSection.classList.remove('hidden');
  gameInfoLoading.classList.remove('hidden');
  gameInfoContent.classList.add('hidden');

  try {
    const result = await window.electronAPI.fetchPCGamingWikiInfo(appId);

    gameInfoLoading.classList.add('hidden');

    if (result.success) {
      populateGameInfo(result.data);
      gameInfoContent.classList.remove('hidden');
    } else {
      // Show "No info" state
      showNoGameInfo();
    }
  } catch (error) {
    gameInfoLoading.classList.add('hidden');
    showNoGameInfo();
  }
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

    // Local Play
    if (mp.localPlay) {
      multiplayerRows.push(createTableRow('Local Play', mp.localPlay, mp.localPlayNotes || mp.localPlayPlayers));
    }

    // LAN Play
    if (mp.lanPlay) {
      multiplayerRows.push(createTableRow('LAN Play', mp.lanPlay, mp.lanPlayNotes || mp.lanPlayPlayers));
    }

    // Online Play
    if (mp.onlinePlay) {
      const onlineDetails = [
        mp.onlinePlayPlayers && `${mp.onlinePlayPlayers} players`,
        mp.onlinePlayModes,
        mp.onlinePlayNotes
      ].filter(Boolean).join(', ');
      multiplayerRows.push(createTableRow('Online Play', mp.onlinePlay, onlineDetails));
    }

    // Crossplay
    if (mp.crossplay) {
      const crossplayDetails = [mp.crossplayPlatforms, mp.crossplayNotes].filter(Boolean).join(', ');
      multiplayerRows.push(createTableRow('Crossplay', mp.crossplay, crossplayDetails));
    }

    // Asynchronous
    if (mp.asynchronous) {
      multiplayerRows.push(createTableRow('Asynchronous', mp.asynchronous, ''));
    }
  }

  if (multiplayerRows.length > 0) {
    multiplayerTableBody.innerHTML = multiplayerRows.join('');
  } else {
    multiplayerTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No info</td></tr>';
  }

  // Populate connection table
  const connectionRows = [];

  if (data.connections && Object.keys(data.connections).length > 0) {
    const conn = data.connections;

    // Matchmaking
    if (conn.matchmaking) {
      connectionRows.push(createTableRow('Matchmaking', conn.matchmaking, conn.matchmakingNotes));
    }

    // P2P
    if (conn.p2p) {
      connectionRows.push(createTableRow('P2P', conn.p2p, conn.p2pNotes));
    }

    // Dedicated Servers
    if (conn.dedicated) {
      connectionRows.push(createTableRow('Dedicated Servers', conn.dedicated, conn.dedicatedNotes));
    }

    // Self-Hosting
    if (conn.selfHosting) {
      connectionRows.push(createTableRow('Self-Hosting', conn.selfHosting, conn.selfHostingNotes));
    }

    // Direct IP
    if (conn.directIp) {
      connectionRows.push(createTableRow('Direct IP', conn.directIp, conn.directIpNotes));
    }
  }

  if (connectionRows.length > 0) {
    connectionTableBody.innerHTML = connectionRows.join('');
  } else {
    connectionTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No info</td></tr>';
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
  if (!value) return '';

  const lowerValue = value.toLowerCase().trim();

  if (lowerValue === 'true' || lowerValue === 'yes') {
    return '✅ Yes';
  } else if (lowerValue === 'false' || lowerValue === 'no') {
    return '❌ No';
  } else if (lowerValue === 'limited' || lowerValue === 'hackable') {
    return '⚠️ ' + escapeHtml(value);
  } else if (lowerValue === 'unknown' || lowerValue === '') {
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
      type: 'error',
      text: '⚠️ <strong>Unsteam Global Fix will NOT work</strong> - This game uses dedicated servers.'
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
gameSearchInput.addEventListener('input', handleGameSearch);

// Goldberg checkbox toggle
goldbergCheckbox.addEventListener('change', () => {
  if (goldbergCheckbox.checked) {
    goldbergOptions.classList.remove('hidden');
  } else {
    goldbergOptions.classList.add('hidden');
  }
});

// Enable buttons when AppID is entered
appIdInput.addEventListener('input', () => {
  const hasAppId = appIdInput.value.trim() !== '';
  installBtn.disabled = !hasAppId;
  unfixBtn.disabled = !hasAppId;
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

  // Check if Goldberg is enabled
  const goldbergEnabled = goldbergCheckbox.checked;
  let goldbergOptions = null;

  if (goldbergEnabled) {
    goldbergOptions = {
      accountName: accountNameInput.value.trim() || 'Goldberg',
      steamId: steamIdInput.value.trim() || '76561197960287930',
      language: languageSelect.value || 'english',
      steamApiKey: steamApiKeyInput.value.trim() || null
    };
  }

  // Disable input during installation
  appIdInput.disabled = true;
  installBtn.disabled = true;
  goldbergCheckbox.disabled = true;

  // Show status
  showStatus(goldbergEnabled ? 'Installing GlobalFix and Goldberg Emulator...' : 'Installing GlobalFix...');

  try {
    // Call the main process to install GlobalFix (and optionally Goldberg)
    const result = await window.electronAPI.installGlobalFix(appId, goldbergOptions);

    hideStatus();

    if (result.success) {
      showSuccess(result, goldbergEnabled);
    } else {
      showError('Installation Failed', result.error);
    }
  } catch (error) {
    hideStatus();
    showError('Installation Error', error.message || 'An unexpected error occurred.');
  } finally {
    // Re-enable input
    appIdInput.disabled = false;
    installBtn.disabled = false;
    goldbergCheckbox.disabled = false;
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

function showSuccess(result, goldbergEnabled) {
  resultSection.classList.remove('hidden', 'error');
  resultSection.classList.add('success');
  resultTitle.textContent = '✓ Installation Successful!';

  let nextSteps = '';
  if (goldbergEnabled) {
    nextSteps = `
      <li>GlobalFix has been installed to your game folder</li>
      <li>Goldberg emulator has been configured with achievements and VLAN support</li>
      <li>steam_settings folder has been created with all necessary files</li>
      <li><strong>Simply launch your game from Steam normally</strong></li>
      <li>For VLAN play: Connect to your Hamachi/ZeroTier network first</li>
      <li>Each player should have a unique Steam ID (increment the last digits)</li>
    `;
  } else {
    nextSteps = `
      <li>GlobalFix has been installed to your game folder</li>
      <li>The unsteam.ini file has been configured with your game settings</li>
      <li>The winmm.dll loader has been placed in the necessary locations</li>
      <li><strong>Simply launch your game from Steam normally</strong></li>
      <li>No launch options needed - the fix will load automatically!</li>
    `;
  }

  resultDetails.innerHTML = `
    <div class="result-details-item">
      <strong>Game Folder:</strong> ${escapeHtml(result.gameFolder)}
    </div>
    <div class="result-details-item">
      <strong>Game Executable:</strong> ${escapeHtml(result.gameExe)}
    </div>
    <div class="result-details-item" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ccc;">
      <strong>Next Steps:</strong>
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

  // Confirm with user
  if (!confirm('This will remove all GlobalFix and Goldberg modifications from the game. Continue?')) {
    return;
  }

  // Disable input during unfix
  appIdInput.disabled = true;
  installBtn.disabled = true;
  unfixBtn.disabled = true;
  goldbergCheckbox.disabled = true;

  // Show status
  showStatus('Unfixing game...');

  try {
    // Call the main process to unfix the game
    const result = await window.electronAPI.unfixGame(appId);

    hideStatus();

    if (result.success) {
      showUnfixSuccess(result);
    } else {
      showError('Unfix Failed', result.error || 'An error occurred while unfixing the game.');
    }
  } catch (error) {
    hideStatus();
    showError('Unfix Error', error.message || 'An unexpected error occurred.');
  } finally {
    // Re-enable input
    appIdInput.disabled = false;
    installBtn.disabled = false;
    unfixBtn.disabled = false;
    goldbergCheckbox.disabled = false;
  }
}

function showUnfixSuccess(result) {
  resultSection.classList.remove('hidden', 'error');
  resultSection.classList.add('success');
  resultTitle.textContent = '✓ Game Unfixed Successfully!';

  const removedItemsHtml = result.removedItems && result.removedItems.length > 0
    ? `<ul style="margin-left: 20px; margin-top: 10px; line-height: 1.6;">${result.removedItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p>No modifications were found to remove.</p>';

  resultDetails.innerHTML = `
    <div class="result-details-item">
      <strong>Game Folder:</strong> ${escapeHtml(result.gameFolder)}
    </div>
    <div class="result-details-item" style="margin-top: 15px;">
      <strong>Removed Items:</strong>
      ${removedItemsHtml}
    </div>
    <div class="result-details-item" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ccc;">
      <p>✓ The game has been restored to its original state.</p>
      <p>You can now launch the game normally through Steam.</p>
    </div>
  `;
}

// Initialize
installBtn.disabled = true;
unfixBtn.disabled = true;
loadSteamApps();
