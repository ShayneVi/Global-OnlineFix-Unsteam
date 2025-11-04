// Get DOM elements
const appIdInput = document.getElementById('appId');
const installBtn = document.getElementById('installBtn');
const statusSection = document.getElementById('status');
const statusText = document.getElementById('statusText');
const spinner = document.getElementById('spinner');
const resultSection = document.getElementById('result');
const resultTitle = document.getElementById('resultTitle');
const resultDetails = document.getElementById('resultDetails');

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
