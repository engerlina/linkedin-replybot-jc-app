// LinkedIn Reply Bot - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Update tabs
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update content
      const tabName = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });

  // Load saved settings
  loadSettings();

  // AI Settings
  document.getElementById('saveAi').addEventListener('click', saveAiSettings);

  // Backend Settings
  document.getElementById('testBackend').addEventListener('click', testBackend);
  document.getElementById('saveBackend').addEventListener('click', saveBackendSettings);

  // Canned Responses
  document.getElementById('addCanned').addEventListener('click', addCannedResponse);
  document.getElementById('saveCanned').addEventListener('click', saveCannedResponses);

  // Cookie Sync
  document.getElementById('syncCookies').addEventListener('click', syncCookiesNow);
  checkCookieStatus();

  // Update model options based on provider
  document.getElementById('provider').addEventListener('change', updateModelOptions);
});

async function loadSettings() {
  const settings = await chrome.storage.sync.get([
    'provider', 'apiKey', 'model', 'userContext', 'replyPrompt',
    'backendUrl', 'backendPassword',
    'cannedResponses'
  ]);

  // AI Settings
  if (settings.provider) document.getElementById('provider').value = settings.provider;
  if (settings.apiKey) document.getElementById('apiKey').value = settings.apiKey;
  if (settings.model) document.getElementById('model').value = settings.model;
  if (settings.userContext) document.getElementById('userContext').value = settings.userContext;
  if (settings.replyPrompt) document.getElementById('replyPrompt').value = settings.replyPrompt;

  // Backend Settings
  if (settings.backendUrl) document.getElementById('backendUrl').value = settings.backendUrl;
  if (settings.backendPassword) document.getElementById('backendPassword').value = settings.backendPassword;

  // Canned Responses - migrate old format if needed
  let cannedResponses = settings.cannedResponses || [];

  // Migrate old string format to new object format
  if (cannedResponses.length > 0 && typeof cannedResponses[0] === 'string') {
    cannedResponses = cannedResponses.map(text => ({
      text,
      autoConnect: true,
      addToFlow: true
    }));
  }

  // Default responses if empty
  if (cannedResponses.length === 0) {
    cannedResponses = [
      { text: "Thanks for the comment! I'll DM you with more details.", autoConnect: true, addToFlow: true },
      { text: "Great question! Let me send you some resources via DM.", autoConnect: true, addToFlow: true },
      { text: "Appreciate you reaching out! Check your DMs.", autoConnect: true, addToFlow: true }
    ];
  }

  renderCannedResponses(cannedResponses);

  // Update model options
  updateModelOptions();
}

function updateModelOptions() {
  const provider = document.getElementById('provider').value;
  const modelSelect = document.getElementById('model');
  const currentModel = modelSelect.value;

  modelSelect.innerHTML = '';

  if (provider === 'claude') {
    const options = [
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fast)' },
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' }
    ];
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      modelSelect.appendChild(option);
    });
  } else if (provider === 'openai') {
    const options = [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)' },
      { value: 'gpt-4o', label: 'GPT-4o' }
    ];
    options.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      modelSelect.appendChild(option);
    });
  }

  // Try to restore previous selection
  if (currentModel) {
    const options = modelSelect.querySelectorAll('option');
    for (const opt of options) {
      if (opt.value === currentModel) {
        modelSelect.value = currentModel;
        break;
      }
    }
  }
}

async function saveAiSettings() {
  const provider = document.getElementById('provider').value;
  const apiKey = document.getElementById('apiKey').value;
  const model = document.getElementById('model').value;
  const userContext = document.getElementById('userContext').value;
  const replyPrompt = document.getElementById('replyPrompt').value;

  await chrome.storage.sync.set({
    provider,
    apiKey,
    model,
    userContext,
    replyPrompt
  });

  showStatus('aiStatus', 'Settings saved!', 'success');
}

async function testBackend() {
  const backendUrl = document.getElementById('backendUrl').value.replace(/\/$/, '');
  const backendPassword = document.getElementById('backendPassword').value;

  if (!backendUrl || !backendPassword) {
    showStatus('backendStatus', 'Please enter URL and password', 'error');
    return;
  }

  try {
    // Try to login
    const response = await fetch(`${backendUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: backendPassword })
    });

    if (response.ok) {
      const data = await response.json();
      await chrome.storage.sync.set({ backendToken: data.token });
      showStatus('backendStatus', 'Connected successfully!', 'success');
    } else {
      showStatus('backendStatus', 'Invalid password', 'error');
    }
  } catch (error) {
    showStatus('backendStatus', 'Connection failed: ' + error.message, 'error');
  }
}

async function saveBackendSettings() {
  const backendUrl = document.getElementById('backendUrl').value.replace(/\/$/, '');
  const backendPassword = document.getElementById('backendPassword').value;

  await chrome.storage.sync.set({
    backendUrl,
    backendPassword,
    backendToken: null // Clear token to force re-login
  });

  showStatus('backendStatus', 'Backend settings saved!', 'success');
}

function renderCannedResponses(responses) {
  const container = document.getElementById('cannedList');
  container.innerHTML = '';

  responses.forEach((response, index) => {
    // Handle both old string format and new object format
    const text = typeof response === 'string' ? response : response.text;
    const autoConnect = typeof response === 'object' ? response.autoConnect : true;
    const addToFlow = typeof response === 'object' ? response.addToFlow : true;

    const item = document.createElement('div');
    item.className = 'canned-item';
    item.innerHTML = `
      <div class="canned-item-row">
        <input type="text" value="${escapeHtml(text)}" data-index="${index}">
        <button class="remove-btn" data-index="${index}">X</button>
      </div>
      <div class="canned-item-options">
        <label>
          <input type="checkbox" data-option="autoConnect" ${autoConnect ? 'checked' : ''}>
          Auto-connect
        </label>
        <label>
          <input type="checkbox" data-option="addToFlow" ${addToFlow ? 'checked' : ''}>
          Add to DM flow
        </label>
      </div>
    `;
    container.appendChild(item);
  });

  // Add remove handlers
  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      const items = Array.from(container.querySelectorAll('.canned-item'));
      items[index].remove();
    });
  });
}

function addCannedResponse() {
  const container = document.getElementById('cannedList');
  const index = container.children.length;

  const item = document.createElement('div');
  item.className = 'canned-item';
  item.innerHTML = `
    <div class="canned-item-row">
      <input type="text" value="" data-index="${index}" placeholder="New canned response...">
      <button class="remove-btn" data-index="${index}">X</button>
    </div>
    <div class="canned-item-options">
      <label>
        <input type="checkbox" data-option="autoConnect" checked>
        Auto-connect
      </label>
      <label>
        <input type="checkbox" data-option="addToFlow" checked>
        Add to DM flow
      </label>
    </div>
  `;
  container.appendChild(item);

  // Focus the new input
  item.querySelector('input[type="text"]').focus();

  // Add remove handler
  item.querySelector('.remove-btn').addEventListener('click', () => {
    item.remove();
  });
}

async function saveCannedResponses() {
  const items = document.querySelectorAll('#cannedList .canned-item');
  const responses = Array.from(items)
    .map(item => {
      const text = item.querySelector('input[type="text"]').value.trim();
      const autoConnect = item.querySelector('input[data-option="autoConnect"]').checked;
      const addToFlow = item.querySelector('input[data-option="addToFlow"]').checked;
      return { text, autoConnect, addToFlow };
    })
    .filter(r => r.text.length > 0);

  await chrome.storage.sync.set({ cannedResponses: responses });

  showStatus('cannedStatus', 'Canned responses saved!', 'success');
}

function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `status ${type}`;
  el.style.display = 'block';

  setTimeout(() => {
    el.style.display = 'none';
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Cookie Sync Functions
async function checkCookieStatus() {
  const statusBox = document.getElementById('cookieStatusBox');
  const statusText = document.getElementById('cookieStatusText');

  try {
    // Check if we have LinkedIn cookies in the browser
    const response = await chrome.runtime.sendMessage({ action: 'getCookieStatus' });

    if (response.hasCookies) {
      statusBox.style.background = '#e8f5e9';
      statusText.innerHTML = `<span style="color: #2e7d32;">LinkedIn cookies detected</span><br>` +
        `<span style="font-size: 11px; color: #666;">Status: ${response.lastSynced}</span>`;
    } else {
      statusBox.style.background = '#fff3e0';
      statusText.innerHTML = `<span style="color: #e65100;">No LinkedIn cookies found</span><br>` +
        `<span style="font-size: 11px; color: #666;">Please log into LinkedIn first</span>`;
    }
  } catch (error) {
    statusBox.style.background = '#ffebee';
    statusText.innerHTML = `<span style="color: #c62828;">Error checking status</span><br>` +
      `<span style="font-size: 11px; color: #666;">${error.message}</span>`;
  }
}

async function syncCookiesNow() {
  const btn = document.getElementById('syncCookies');
  const originalText = btn.textContent;
  btn.textContent = 'Syncing...';
  btn.disabled = true;

  try {
    // Trigger sync via background script
    const response = await chrome.runtime.sendMessage({ action: 'syncCookies' });

    if (response.success) {
      showStatus('syncStatus', 'Cookies synced successfully!', 'success');
    } else {
      showStatus('syncStatus', response.error || 'Sync failed', 'error');
    }

    // Refresh the status display
    await checkCookieStatus();
  } catch (error) {
    showStatus('syncStatus', 'Sync failed: ' + error.message, 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}
