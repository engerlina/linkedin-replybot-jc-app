// LinkedIn Reply Bot - Background Service Worker

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

  if (request.action === 'getSettings') {
    chrome.storage.sync.get(null, (settings) => {
      sendResponse({ success: true, settings });
    });
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
