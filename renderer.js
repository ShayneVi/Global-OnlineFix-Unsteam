// Get DOM elements
const gameSearchInput = document.getElementById('gameSearch');
const searchDropdown = document.getElementById('searchDropdown');
const appIdInput = document.getElementById('appId');
const installBtn = document.getElementById('installBtn');
const statusSection = document.getElementById('status');
const statusText = document.getElementById('statusText');
const spinner = document.getElementById('spinner');
const resultSection = document.getElementById('result');
const resultTitle = document.getElementById('resultTitle');
const resultDetails = document.getElementById('resultDetails');

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
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!gameSearchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
    searchDropdown.classList.add('hidden');
  }
});

// Game search input event listener
gameSearchInput.addEventListener('input', handleGameSearch);

// Enable install button when AppID is entered
appIdInput.addEventListener('input', () => {
  installBtn.disabled = appIdInput.value.trim() === '';
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

  // Disable input during installation
  appIdInput.disabled = true;
  installBtn.disabled = true;

  // Show status
  showStatus('Installing GlobalFix...');

  try {
    // Call the main process to install GlobalFix
    const result = await window.electronAPI.installGlobalFix(appId);

    hideStatus();

    if (result.success) {
      showSuccess(result);
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

function showSuccess(result) {
  resultSection.classList.remove('hidden', 'error');
  resultSection.classList.add('success');
  resultTitle.textContent = '✓ Installation Successful!';

  let launchOptionsInfo = '';
  if (result.launchOptionsSet) {
    launchOptionsInfo = `
      <li>Steam launch options have been updated automatically</li>
      <li><strong>Close Steam completely and reopen it</strong> to apply the changes</li>
    `;
  } else {
    launchOptionsInfo = `
      <li style="color: #f57c00;"><strong>⚠️ Could not update Steam launch options automatically</strong></li>
      <li>Please add the following launch option manually:
        <div style="background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 4px; font-family: monospace; word-break: break-all; font-size: 0.9em;">
          ${escapeHtml(result.launchOptionsPath)}
        </div>
        <strong>How to add manually:</strong>
        <ol style="margin-left: 20px; margin-top: 5px;">
          <li>Close Steam completely</li>
          <li>Open Steam and go to your Library</li>
          <li>Right-click the game → Properties</li>
          <li>In the Launch Options field, paste the text above</li>
          <li>Close the properties window</li>
        </ol>
      </li>
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
        <li>GlobalFix has been installed to your game folder</li>
        <li>The unsteam.ini file has been configured with your game settings</li>
        ${launchOptionsInfo}
        <li>Launch your game from Steam</li>
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

// Initialize
installBtn.disabled = true;
loadSteamApps();
