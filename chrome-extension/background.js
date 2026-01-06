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
    systemPrompt = `You are a professional on LinkedIn. You are the AUTHOR of the post, replying to someone who commented.
Rewrite the given canned response template to sound natural and personalized for this specific comment.
Keep the core message intact but make it sound fresh and contextually appropriate.
Keep it brief (1-2 sentences). Do not add hashtags or emojis unless they're in the original.`;

    userMessage = userContext
      ? `About me: ${userContext}

My Post: ${postContent}

Comment from ${commenterName}: ${commentText}

Canned response to rewrite: "${cannedResponse}"

Rewrite naturally:`
      : `My Post: ${postContent}

Comment from ${commenterName}: ${commentText}

Canned response to rewrite: "${cannedResponse}"

Rewrite naturally:`;
  } else {
    // Generate from scratch
    systemPrompt = replyPrompt || `You are a professional on LinkedIn replying to a comment on YOUR OWN post.
Generate a warm, appreciative reply (1-2 sentences) that:
- Thanks them for engaging
- Responds to their specific point
- Continues the conversation naturally
Be genuine and personable as the post author. Do not use hashtags or emojis.`;

    userMessage = userContext
      ? `About me: ${userContext}

My Post: ${postContent}

Comment from ${commenterName}: ${commentText}

Generate a reply:`
      : `My Post: ${postContent}

Comment from ${commenterName}: ${commentText}

Generate a reply:`;
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
