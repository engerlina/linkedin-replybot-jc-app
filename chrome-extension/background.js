// LinkedIn Reply Bot - Background Service Worker

// ============================================
// COOKIE CAPTURE & SYNC (for direct LinkedIn API)
// ============================================

const LINKEDIN_COOKIES = ['li_at', 'JSESSIONID'];
const COOKIE_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let lastSyncedCookies = null;

// Get LinkedIn cookies
async function getLinkedInCookies() {
  const cookies = {};
  for (const name of LINKEDIN_COOKIES) {
    try {
      const cookie = await chrome.cookies.get({
        url: 'https://www.linkedin.com',
        name: name
      });
      if (cookie) {
        cookies[name] = cookie.value;
      }
    } catch (e) {
      console.error(`[Cookie Sync] Error getting cookie ${name}:`, e);
    }
  }
  return cookies;
}

// Sync cookies to backend
async function syncCookiesToBackend(force = false) {
  const settings = await chrome.storage.sync.get(['backendUrl', 'backendPassword', 'backendToken']);
  let { backendUrl, backendPassword, backendToken } = settings;

  if (!backendUrl) {
    console.log('[Cookie Sync] Backend URL not configured, skipping sync');
    return false;
  }

  backendUrl = backendUrl.replace(/\/$/, '');

  // Get current cookies
  const cookies = await getLinkedInCookies();

  if (!cookies.li_at || !cookies.JSESSIONID) {
    console.log('[Cookie Sync] Missing LinkedIn cookies, user may not be logged in');
    return false;
  }

  // Check if cookies changed (unless forced)
  const cookieString = JSON.stringify(cookies);
  if (!force && lastSyncedCookies === cookieString) {
    console.log('[Cookie Sync] Cookies unchanged, skipping sync');
    return true;
  }

  // Get or refresh auth token
  if (!backendToken) {
    if (!backendPassword) {
      console.log('[Cookie Sync] Backend password not configured');
      return false;
    }
    try {
      backendToken = await loginToBackend(backendUrl, backendPassword);
    } catch (e) {
      console.error('[Cookie Sync] Failed to login:', e);
      return false;
    }
  }

  // Sync to backend
  try {
    let response = await fetch(`${backendUrl}/api/cookies/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${backendToken}`
      },
      body: JSON.stringify({
        liAt: cookies.li_at,
        jsessionId: cookies.JSESSIONID,
        userAgent: navigator.userAgent
      })
    });

    // Handle token expiration
    if (response.status === 401) {
      console.log('[Cookie Sync] Token expired, refreshing...');
      backendToken = await loginToBackend(backendUrl, backendPassword);
      response = await fetch(`${backendUrl}/api/cookies/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${backendToken}`
        },
        body: JSON.stringify({
          liAt: cookies.li_at,
          jsessionId: cookies.JSESSIONID,
          userAgent: navigator.userAgent
        })
      });
    }

    if (response.ok) {
      const data = await response.json();
      lastSyncedCookies = cookieString;
      console.log('[Cookie Sync] Cookies synced successfully:', data.message);
      return true;
    } else {
      const data = await response.json();
      console.error('[Cookie Sync] Sync failed:', data.detail || response.status);
      return false;
    }
  } catch (e) {
    console.error('[Cookie Sync] Sync error:', e);
    return false;
  }
}

// Listen for cookie changes
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.cookie.domain.includes('linkedin.com') &&
      LINKEDIN_COOKIES.includes(changeInfo.cookie.name)) {
    console.log(`[Cookie Sync] LinkedIn cookie ${changeInfo.cookie.name} changed`);
    // Debounce syncs - wait a bit in case multiple cookies change at once
    setTimeout(() => syncCookiesToBackend(), 2000);
  }
});

// Periodic sync (backup in case change listener misses something)
setInterval(() => {
  syncCookiesToBackend();
}, COOKIE_SYNC_INTERVAL_MS);

// Initial sync on extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[Cookie Sync] Extension started, syncing cookies...');
  setTimeout(() => syncCookiesToBackend(true), 3000);
});

// Initial sync on install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Cookie Sync] Extension installed/updated, syncing cookies...');
  setTimeout(() => syncCookiesToBackend(true), 3000);
});

// ============================================
// MESSAGE HANDLERS
// ============================================

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Cookie sync commands
  if (request.action === 'syncCookies') {
    syncCookiesToBackend(true)
      .then(success => sendResponse({ success }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getCookieStatus') {
    getLinkedInCookies()
      .then(cookies => {
        sendResponse({
          success: true,
          hasCookies: !!(cookies.li_at && cookies.JSESSIONID),
          lastSynced: lastSyncedCookies ? 'synced' : 'not synced'
        });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // Existing handlers
  if (request.action === 'generateReply') {
    generateReply(request)
      .then(reply => sendResponse({ success: true, reply }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'addToFlow') {
    addToMessagingFlow(request)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'addToFlowWithConnect') {
    addToFlowWithConnect(request)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'addToFlowWithCheck') {
    addToFlowWithCheck(request)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getSettings') {
    chrome.storage.sync.get(null, (settings) => {
      sendResponse({ success: true, settings });
    });
    return true;
  }

  if (request.action === 'batchCheckLeads') {
    batchCheckLeads(request.commenterUrls)
      .then(result => sendResponse({ success: true, leads: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Generate AI reply
async function generateReply(request) {
  const settings = await chrome.storage.sync.get([
    'provider', 'apiKey', 'model', 'replyPrompt', 'userContext'
  ]);

  console.log('[LinkedIn Reply Bot] Generating reply with:', {
    provider: settings.provider,
    model: settings.model,
    hasApiKey: !!settings.apiKey
  });

  if (!settings.apiKey || !settings.model) {
    throw new Error('Please configure API settings in the extension popup');
  }

  const { provider, apiKey, model, replyPrompt, userContext } = settings;
  const { postContent, commentText, commenterName, isOwnPost, cannedResponse } = request;

  let systemPrompt;
  let userMessage;

  if (cannedResponse) {
    // Rewrite a canned response
    systemPrompt = `You are replying to a comment on your LinkedIn post.
Rewrite the canned response to sound natural for this specific comment.
ONLY output the reply text itself - nothing else. No labels, no "DM MESSAGE", no extra content.
Keep it brief (1-2 sentences). Do not use emojis.`;

    userMessage = `Comment from ${commenterName}: ${commentText}

Canned response to rewrite: "${cannedResponse}"

Output ONLY the rewritten reply:`;
  } else {
    // Generate from scratch
    systemPrompt = replyPrompt || `You are replying to a comment on your LinkedIn post.
Generate a short, warm reply (1-2 sentences) that acknowledges their comment.
ONLY output the reply text itself - nothing else. No labels, no headers, no "DM MESSAGE".
Do not use emojis.`;

    userMessage = userContext
      ? `About me: ${userContext}

Comment from ${commenterName}: "${commentText}"

Output ONLY the reply:`
      : `Comment from ${commenterName}: "${commentText}"

Output ONLY the reply:`;
  }

  if (provider === 'claude') {
    return await callClaude(apiKey, model, systemPrompt, userMessage);
  } else if (provider === 'openai') {
    return await callOpenAI(apiKey, model, systemPrompt, userMessage);
  } else {
    throw new Error('Unknown provider: ' + provider);
  }
}

// Call Claude API
async function callClaude(apiKey, model, systemPrompt, userMessage) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Claude API request failed');
  }

  return data.content[0].text.trim();
}

// Call OpenAI API
async function callOpenAI(apiKey, model, systemPrompt, userMessage) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 200,
      temperature: 0.7
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'OpenAI API request failed');
  }

  return data.choices[0].message.content.trim();
}

// Add commenter to messaging flow via backend API
async function addToMessagingFlow(request) {
  const settings = await chrome.storage.sync.get(['backendUrl', 'backendPassword', 'backendToken']);

  let { backendUrl, backendPassword, backendToken } = settings;

  if (!backendUrl) {
    throw new Error('Backend URL not configured');
  }

  // Ensure URL doesn't have trailing slash
  backendUrl = backendUrl.replace(/\/$/, '');

  // Get or refresh token
  if (!backendToken) {
    if (!backendPassword) {
      throw new Error('Backend password not configured');
    }
    backendToken = await loginToBackend(backendUrl, backendPassword);
  }

  const { commenterUrl, commenterName, commenterHeadline, postUrl, matchedKeyword, replyText } = request;

  console.log('[LinkedIn Reply Bot] Adding to flow:', {
    commenterName,
    commenterUrl,
    postUrl
  });

  // Call the backend API to add lead
  const response = await fetch(`${backendUrl}/api/reply-bot/add-lead`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${backendToken}`
    },
    body: JSON.stringify({
      commenterUrl,
      commenterName,
      commenterHeadline,
      postUrl,
      matchedKeyword: matchedKeyword || 'manual',
      replyText
    })
  });

  if (response.status === 401) {
    // Token expired, try to refresh
    console.log('[LinkedIn Reply Bot] Token expired, refreshing...');
    backendToken = await loginToBackend(backendUrl, backendPassword);

    // Retry the request
    const retryResponse = await fetch(`${backendUrl}/api/reply-bot/add-lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${backendToken}`
      },
      body: JSON.stringify({
        commenterUrl,
        commenterName,
        commenterHeadline,
        postUrl,
        matchedKeyword: matchedKeyword || 'manual',
        replyText
      })
    });

    if (!retryResponse.ok) {
      const data = await retryResponse.json();
      throw new Error(data.detail || 'Failed to add to flow');
    }

    return await retryResponse.json();
  }

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.detail || 'Failed to add to flow');
  }

  return await response.json();
}

// Login to backend and get token
async function loginToBackend(backendUrl, password) {
  const response = await fetch(`${backendUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  });

  if (!response.ok) {
    throw new Error('Failed to login to backend');
  }

  const data = await response.json();
  const token = data.token;

  // Save token for future use
  await chrome.storage.sync.set({ backendToken: token });

  return token;
}

// Add to flow and optionally send connection request
async function addToFlowWithConnect(request) {
  const settings = await chrome.storage.sync.get(['backendUrl', 'backendPassword', 'backendToken']);
  let { backendUrl, backendPassword, backendToken } = settings;

  if (!backendUrl) {
    throw new Error('Backend URL not configured');
  }

  backendUrl = backendUrl.replace(/\/$/, '');

  // Get or refresh token
  if (!backendToken) {
    if (!backendPassword) {
      throw new Error('Backend password not configured');
    }
    backendToken = await loginToBackend(backendUrl, backendPassword);
  }

  const { commenterUrl, commenterName, commenterHeadline, postUrl, replyText, autoConnect, addToFlow } = request;

  console.log('[LinkedIn Reply Bot] Processing with options:', { autoConnect, addToFlow });

  let result = { connected: false, addedToFlow: false, leadId: null };
  let errors = [];

  // Helper to make authenticated requests with retry
  async function makeRequest(url, options) {
    let response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${backendToken}`,
        ...options.headers
      }
    });

    if (response.status === 401) {
      // Token expired, refresh and retry
      backendToken = await loginToBackend(backendUrl, backendPassword);
      response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${backendToken}`,
          ...options.headers
        }
      });
    }

    return response;
  }

  // Step 1: Add to flow (creates lead)
  if (addToFlow) {
    try {
      const response = await makeRequest(`${backendUrl}/api/reply-bot/add-lead`, {
        method: 'POST',
        body: JSON.stringify({
          commenterUrl,
          commenterName,
          commenterHeadline,
          postUrl,
          matchedKeyword: 'canned',
          replyText
        })
      });

      if (response.ok) {
        const data = await response.json();
        result.addedToFlow = true;
        result.leadId = data.leadId;
        console.log('[LinkedIn Reply Bot] Added to flow:', data);
      } else {
        const data = await response.json();
        errors.push(`Add to flow: ${data.detail || 'Failed'}`);
      }
    } catch (e) {
      errors.push(`Add to flow: ${e.message}`);
    }
  }

  // Step 2: Send connection request if we have a lead ID
  if (autoConnect && result.leadId) {
    try {
      const response = await makeRequest(`${backendUrl}/api/leads/${result.leadId}/send-connection`, {
        method: 'POST'
      });

      if (response.ok) {
        result.connected = true;
        console.log('[LinkedIn Reply Bot] Connection request sent');
      } else {
        const data = await response.json();
        // Don't treat "already connected" as an error
        if (data.detail && data.detail.includes('Already connected')) {
          result.connected = true;
        } else {
          errors.push(`Connection: ${data.detail || 'Failed'}`);
        }
      }
    } catch (e) {
      errors.push(`Connection: ${e.message}`);
    }
  } else if (autoConnect && !result.leadId) {
    // If we didn't add to flow but want to connect, we need to add the lead first
    try {
      // First add to flow to get lead ID
      const addResponse = await makeRequest(`${backendUrl}/api/reply-bot/add-lead`, {
        method: 'POST',
        body: JSON.stringify({
          commenterUrl,
          commenterName,
          commenterHeadline,
          postUrl,
          matchedKeyword: 'canned',
          replyText
        })
      });

      if (addResponse.ok) {
        const data = await addResponse.json();
        result.leadId = data.leadId;

        // Now send connection
        const connectResponse = await makeRequest(`${backendUrl}/api/leads/${result.leadId}/send-connection`, {
          method: 'POST'
        });

        if (connectResponse.ok) {
          result.connected = true;
        } else {
          const connectData = await connectResponse.json();
          if (connectData.detail && connectData.detail.includes('Already connected')) {
            result.connected = true;
          } else {
            errors.push(`Connection: ${connectData.detail || 'Failed'}`);
          }
        }
      } else {
        const data = await addResponse.json();
        errors.push(`Add lead for connection: ${data.detail || 'Failed'}`);
      }
    } catch (e) {
      errors.push(`Connection flow: ${e.message}`);
    }
  }

  // If we had errors but some things succeeded, include them as warnings
  if (errors.length > 0) {
    result.warnings = errors;
    console.warn('[LinkedIn Reply Bot] Warnings:', errors);
  }

  return result;
}

// Add to flow with check if lead already exists
async function addToFlowWithCheck(request) {
  const settings = await chrome.storage.sync.get(['backendUrl', 'backendPassword', 'backendToken']);
  let { backendUrl, backendPassword, backendToken } = settings;

  if (!backendUrl) {
    throw new Error('Backend URL not configured');
  }

  backendUrl = backendUrl.replace(/\/$/, '');

  // Get or refresh token
  if (!backendToken) {
    if (!backendPassword) {
      throw new Error('Backend password not configured');
    }
    backendToken = await loginToBackend(backendUrl, backendPassword);
  }

  const { commenterUrl, commenterName, commenterHeadline, postUrl, replyText } = request;

  console.log('[LinkedIn Reply Bot] Add to flow with check:', { commenterName, commenterUrl });

  // Helper to make authenticated requests with retry
  async function makeRequest(url, options) {
    let response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${backendToken}`,
        ...options.headers
      }
    });

    if (response.status === 401) {
      // Token expired, refresh and retry
      backendToken = await loginToBackend(backendUrl, backendPassword);
      response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${backendToken}`,
          ...options.headers
        }
      });
    }

    return response;
  }

  // First check if lead already exists
  try {
    const checkResponse = await makeRequest(
      `${backendUrl}/api/reply-bot/check-lead?commenterUrl=${encodeURIComponent(commenterUrl)}`,
      { method: 'GET' }
    );

    if (checkResponse.ok) {
      const checkData = await checkResponse.json();
      if (checkData.exists) {
        console.log('[LinkedIn Reply Bot] Lead already exists:', checkData.lead.name);
        return { alreadyExists: true, lead: checkData.lead };
      }
    }
  } catch (e) {
    console.warn('[LinkedIn Reply Bot] Check failed, proceeding to add:', e);
  }

  // Lead doesn't exist, add it
  const response = await makeRequest(`${backendUrl}/api/reply-bot/add-lead`, {
    method: 'POST',
    body: JSON.stringify({
      commenterUrl,
      commenterName,
      commenterHeadline,
      postUrl,
      matchedKeyword: 'manual',
      replyText
    })
  });

  if (response.ok) {
    const data = await response.json();
    console.log('[LinkedIn Reply Bot] Added to flow:', data);
    return { alreadyExists: false, leadId: data.leadId };
  } else {
    const data = await response.json();
    throw new Error(data.detail || 'Failed to add to flow');
  }
}

// Batch check if multiple commenter URLs are already leads
async function batchCheckLeads(commenterUrls) {
  const settings = await chrome.storage.sync.get(['backendUrl', 'backendPassword', 'backendToken']);
  let { backendUrl, backendPassword, backendToken } = settings;

  if (!backendUrl) {
    console.log('[LinkedIn Reply Bot] Backend URL not configured for batch check');
    return {};
  }

  backendUrl = backendUrl.replace(/\/$/, '');

  // Get or refresh token
  if (!backendToken) {
    if (!backendPassword) {
      console.log('[LinkedIn Reply Bot] Backend password not configured');
      return {};
    }
    try {
      backendToken = await loginToBackend(backendUrl, backendPassword);
    } catch (e) {
      console.error('[LinkedIn Reply Bot] Failed to login for batch check:', e);
      return {};
    }
  }

  // Helper to make authenticated requests with retry
  async function makeRequest(url, options) {
    let response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${backendToken}`,
        ...options.headers
      }
    });

    if (response.status === 401) {
      backendToken = await loginToBackend(backendUrl, backendPassword);
      response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${backendToken}`,
          ...options.headers
        }
      });
    }

    return response;
  }

  try {
    const response = await makeRequest(`${backendUrl}/api/reply-bot/batch-check-leads`, {
      method: 'POST',
      body: JSON.stringify({ commenterUrls })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('[LinkedIn Reply Bot] Batch check result:', Object.keys(data.leads).length, 'existing leads found');
      return data.leads;
    } else {
      const data = await response.json();
      console.error('[LinkedIn Reply Bot] Batch check failed:', data.detail || response.status);
      return {};
    }
  } catch (e) {
    console.error('[LinkedIn Reply Bot] Batch check error:', e);
    return {};
  }
}
