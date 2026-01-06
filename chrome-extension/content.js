// LinkedIn Reply Bot - Content Script
// Injects AI Reply buttons on LinkedIn comments

(function() {
  'use strict';

  if (window.linkedInReplyBotInjected) return;
  window.linkedInReplyBotInjected = true;

  console.log('[LinkedIn Reply Bot] Content script loaded');

  // Canned responses (loaded from settings) - now objects with {text, autoConnect, addToFlow}
  let cannedResponses = [];

  // Cache for existing leads (to show "In Flow" before clicking)
  let existingLeadsCache = {};
  let lastBatchCheckTime = 0;
  const BATCH_CHECK_INTERVAL = 30000; // Re-check every 30 seconds

  // Load canned responses
  async function loadCannedResponses() {
    const settings = await chrome.storage.sync.get(['cannedResponses']);
    let responses = settings.cannedResponses || [];

    // Migrate old string format to new object format
    if (responses.length > 0 && typeof responses[0] === 'string') {
      responses = responses.map(text => ({
        text,
        autoConnect: true,
        addToFlow: true
      }));
    }

    // Default responses if empty
    if (responses.length === 0) {
      responses = [
        { text: "Thanks for the comment! I'll DM you with more details.", autoConnect: true, addToFlow: true },
        { text: "Great question! Let me send you some resources via DM.", autoConnect: true, addToFlow: true },
        { text: "Appreciate you reaching out! Check your DMs.", autoConnect: true, addToFlow: true }
      ];
    }

    cannedResponses = responses;
  }
  loadCannedResponses();

  // Initialize
  function init() {
    console.log('[LinkedIn Reply Bot] Initializing...');

    setTimeout(() => {
      scanForComments();
    }, 2000);

    // Watch for new content
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        debounce(scanForComments, 500)();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Periodic scan
    setInterval(scanForComments, 5000);
  }

  // Debounce helper
  let debounceTimers = {};
  function debounce(func, wait) {
    return function(...args) {
      const key = func.name;
      clearTimeout(debounceTimers[key]);
      debounceTimers[key] = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Scan for comments and inject buttons
  async function scanForComments() {
    // Only select actual comment items, not thread wrappers
    // Use more specific selectors to avoid duplicates
    const comments = document.querySelectorAll('.comments-comment-item, .comments-comment-entity:not(.comments-comment-entity .comments-comment-entity)');
    const newComments = [];
    const commenterUrls = [];

    // First pass: collect new comments and their URLs
    comments.forEach(comment => {
      if (comment.dataset.replyBotProcessed) return;

      // Find the social bar (Like/Reply buttons)
      let socialBar = comment.querySelector('.comments-comment-social-bar__action-group');
      if (!socialBar) {
        socialBar = comment.querySelector('.comments-comment-social-bar');
      }
      if (!socialBar) {
        const replyBtn = comment.querySelector('button[aria-label*="Reply"]');
        if (replyBtn) {
          socialBar = replyBtn.parentElement;
        }
      }

      // Skip if no socialBar, already has buttons, or socialBar already processed
      if (!socialBar || socialBar.querySelector('.reply-bot-btn-container') || socialBar.dataset.replyBotInjected) {
        comment.dataset.replyBotProcessed = 'true'; // Mark anyway to avoid re-checking
        return;
      }

      const url = extractCommenterUrl(comment);
      if (url) {
        commenterUrls.push(url);
      }
      newComments.push({ comment, socialBar, url });
    });

    // Batch check leads if we have new comments and enough time has passed
    if (commenterUrls.length > 0) {
      const now = Date.now();
      if (now - lastBatchCheckTime > BATCH_CHECK_INTERVAL) {
        lastBatchCheckTime = now;
        try {
          const response = await chrome.runtime.sendMessage({
            action: 'batchCheckLeads',
            commenterUrls
          });
          if (response.success && response.leads) {
            // Merge new results into cache
            Object.assign(existingLeadsCache, response.leads);
            console.log('[LinkedIn Reply Bot] Updated leads cache:', Object.keys(existingLeadsCache).length, 'leads');
          }
        } catch (e) {
          console.warn('[LinkedIn Reply Bot] Batch check failed:', e);
        }
      }
    }

    // Second pass: inject buttons with lead status
    newComments.forEach(({ comment, socialBar, url }) => {
      comment.dataset.replyBotProcessed = 'true';
      socialBar.dataset.replyBotInjected = 'true'; // Mark socialBar to prevent duplicates
      const isExistingLead = url && existingLeadsCache[url];
      injectButton(comment, socialBar, isExistingLead);
    });
  }

  // Inject the AI Reply button
  function injectButton(comment, socialBar, existingLead = null) {
    // Final safeguard: don't inject if buttons already exist
    if (socialBar.querySelector('.reply-bot-btn-container')) {
      return;
    }

    const container = document.createElement('div');
    container.className = 'reply-bot-btn-container';

    // Main button
    const button = document.createElement('button');
    button.className = 'reply-bot-btn';
    button.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
      </svg>
      <span>AI Reply</span>
    `;

    // Dropdown button
    const dropdownBtn = document.createElement('button');
    dropdownBtn.className = 'reply-bot-dropdown-btn';
    dropdownBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>`;

    // Dropdown menu
    const dropdown = document.createElement('div');
    dropdown.className = 'reply-bot-dropdown';
    dropdown.style.display = 'none';

    // Add to Flow button (shows status if already a lead)
    const flowBtn = document.createElement('button');
    flowBtn.className = 'reply-bot-flow-btn-inline';

    if (existingLead) {
      // Already in flow - show persistent status
      flowBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span>In Flow ✓</span>
      `;
      flowBtn.classList.add('exists');
      flowBtn.title = `${existingLead.name || 'Lead'} - ${existingLead.connectionStatus || 'unknown'}`;
    } else {
      flowBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/>
        </svg>
        <span>+ Flow</span>
      `;
    }

    container.appendChild(button);
    container.appendChild(dropdownBtn);
    container.appendChild(dropdown);
    container.appendChild(flowBtn);
    socialBar.appendChild(container);

    // Main button click - generate AI reply
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleReply(comment, button, null);
    });

    // Dropdown button click - show canned responses
    dropdownBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      populateDropdown(dropdown);
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    // Dropdown item click
    dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.reply-bot-dropdown-item');
      if (item && item.dataset.index !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        dropdown.style.display = 'none';
        const cannedObj = cannedResponses[parseInt(item.dataset.index)];
        handleReply(comment, button, cannedObj);
      }
    });

    // Flow button click - add to DM flow directly (skip if already exists)
    flowBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // If already in flow, don't do anything
      if (flowBtn.classList.contains('exists')) {
        return;
      }
      await handleAddToFlowDirect(comment, flowBtn);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  // Handle adding to flow directly (checks if already a lead)
  async function handleAddToFlowDirect(comment, flowBtn) {
    if (flowBtn.classList.contains('loading')) return;

    flowBtn.classList.add('loading');
    flowBtn.querySelector('span').textContent = 'Checking...';

    try {
      const post = findParentPost(comment);
      const commenterUrl = extractCommenterUrl(comment);
      const commenterName = extractCommenterName(comment);
      const commenterHeadline = extractCommenterHeadline(comment);
      const postUrl = extractPostUrl(post);

      if (!commenterUrl) {
        throw new Error('Could not extract LinkedIn profile URL');
      }

      console.log('[LinkedIn Reply Bot] Adding to flow:', { commenterName, commenterUrl });

      const response = await chrome.runtime.sendMessage({
        action: 'addToFlowWithCheck',
        commenterUrl,
        commenterName,
        commenterHeadline,
        postUrl,
        replyText: null
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      flowBtn.classList.remove('loading');

      if (response.alreadyExists) {
        // Update cache and show persistent state
        existingLeadsCache[commenterUrl] = response.lead;
        flowBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span>In Flow ✓</span>
        `;
        flowBtn.classList.add('exists');
        flowBtn.title = `${response.lead?.name || commenterName} - already in flow`;
      } else {
        // Successfully added - update cache and show persistent state
        existingLeadsCache[commenterUrl] = {
          id: response.leadId,
          name: commenterName,
          connectionStatus: response.connectionStatus || 'unknown'
        };
        flowBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          <span>In Flow ✓</span>
        `;
        flowBtn.classList.add('exists');
        flowBtn.title = `${commenterName} - added to flow`;
      }

    } catch (error) {
      console.error('[LinkedIn Reply Bot] Add to flow error:', error);
      flowBtn.classList.remove('loading');
      flowBtn.querySelector('span').textContent = 'Error!';
      alert('Error: ' + error.message);
      // Reset error state after 3 seconds
      setTimeout(() => {
        flowBtn.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/>
          </svg>
          <span>+ Flow</span>
        `;
      }, 3000);
    }
  }

  // Populate dropdown with canned responses
  function populateDropdown(dropdown) {
    dropdown.innerHTML = '';

    cannedResponses.forEach((response, i) => {
      const text = typeof response === 'string' ? response : response.text;
      const autoConnect = typeof response === 'object' ? response.autoConnect : false;
      const addToFlow = typeof response === 'object' ? response.addToFlow : false;

      const item = document.createElement('div');
      item.className = 'reply-bot-dropdown-item';
      item.dataset.index = i;

      // Build display with badges
      let badges = '';
      if (autoConnect) badges += '<span class="reply-bot-badge connect">+Connect</span>';
      if (addToFlow) badges += '<span class="reply-bot-badge flow">+Flow</span>';

      const displayText = text.length > 40 ? text.substring(0, 40) + '...' : text;
      item.innerHTML = `<span class="reply-bot-dropdown-text">${displayText}</span>${badges}`;

      dropdown.appendChild(item);
    });

    if (cannedResponses.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'reply-bot-dropdown-item reply-bot-dropdown-empty';
      empty.textContent = 'No canned responses configured';
      dropdown.appendChild(empty);
    }
  }

  // Handle reply generation
  // cannedResponse can be: null (AI generate), string (legacy), or object {text, autoConnect, addToFlow}
  async function handleReply(comment, button, cannedResponse) {
    if (button.classList.contains('loading')) return;

    const originalText = button.querySelector('span').textContent;
    button.classList.add('loading');

    // Extract canned response options
    let cannedText = null;
    let autoConnect = false;
    let addToFlow = false;

    if (cannedResponse) {
      if (typeof cannedResponse === 'string') {
        cannedText = cannedResponse;
      } else {
        cannedText = cannedResponse.text;
        autoConnect = cannedResponse.autoConnect || false;
        addToFlow = cannedResponse.addToFlow || false;
      }
    }

    button.querySelector('span').textContent = cannedText ? 'Rewriting...' : 'Generating...';

    try {
      // Extract info
      const post = findParentPost(comment);
      const postContent = extractPostContent(post);
      const commentText = extractCommentContent(comment);
      const commenterName = extractCommenterName(comment);
      const commenterUrl = extractCommenterUrl(comment);
      const commenterHeadline = extractCommenterHeadline(comment);
      const postUrl = extractPostUrl(post);

      console.log('[LinkedIn Reply Bot] Generating reply for:', {
        commenter: commenterName,
        comment: commentText.substring(0, 50) + '...',
        autoConnect,
        addToFlow
      });

      // Generate reply via background script
      const response = await chrome.runtime.sendMessage({
        action: 'generateReply',
        postContent,
        commentText,
        commenterName,
        isOwnPost: true,
        cannedResponse: cannedText
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      const reply = response.reply;

      // Auto-like the comment first
      button.querySelector('span').textContent = 'Liking...';
      await likeComment(comment);

      // Open reply box and insert text
      await openReplyBox(comment);
      await insertReply(comment, reply);

      button.querySelector('span').textContent = 'Done!';

      const flowData = {
        commenterUrl,
        commenterName,
        commenterHeadline,
        postUrl,
        replyText: reply
      };

      // Auto-actions based on canned response settings
      if (autoConnect || addToFlow) {
        button.querySelector('span').textContent = 'Processing...';

        try {
          const result = await chrome.runtime.sendMessage({
            action: 'addToFlowWithConnect',
            ...flowData,
            autoConnect,
            addToFlow
          });

          if (!result.success) {
            throw new Error(result.error);
          }

          // Show success status
          let statusMsg = [];
          if (result.connected) statusMsg.push('Connected');
          if (result.addedToFlow) statusMsg.push('Added to flow');
          button.querySelector('span').textContent = statusMsg.join(' + ') || 'Done!';

        } catch (error) {
          console.error('[LinkedIn Reply Bot] Auto-action error:', error);
          // Show error but don't block - reply was still sent
          button.querySelector('span').textContent = 'Reply sent (action failed)';
          // Still show manual button as fallback
          showAddToFlowButton(comment, flowData);
        }
      } else {
        // Show manual "Add to Flow" button
        showAddToFlowButton(comment, flowData);
      }

    } catch (error) {
      console.error('[LinkedIn Reply Bot] Error:', error);
      button.querySelector('span').textContent = 'Error!';
      alert('Error: ' + error.message);
    } finally {
      setTimeout(() => {
        button.classList.remove('loading');
        button.querySelector('span').textContent = originalText;
      }, 3000);
    }
  }

  // Like a comment
  async function likeComment(comment) {
    // Find the like button in the comment's social bar
    const likeSelectors = [
      'button[aria-label*="Like"]',
      'button[aria-label*="like"]',
      '.comments-comment-social-bar__reactions-icon button',
      '.social-actions-button[aria-label*="Like"]',
      'button.react-button__trigger',
      '.comments-comment-social-bar button:first-child',
      // Newer LinkedIn UI
      'button[data-test-reactions-icon-btn]',
      '.comment-social-bar button[aria-pressed]'
    ];

    for (const selector of likeSelectors) {
      const likeBtn = comment.querySelector(selector);
      if (likeBtn) {
        // Check if already liked (aria-pressed="true" or has active class)
        const isLiked = likeBtn.getAttribute('aria-pressed') === 'true' ||
                        likeBtn.classList.contains('react-button--active') ||
                        likeBtn.querySelector('.reactions-icon--active');

        if (!isLiked) {
          console.log('[LinkedIn Reply Bot] Clicking like button');
          likeBtn.click();
          await new Promise(resolve => setTimeout(resolve, 300));
          return true;
        } else {
          console.log('[LinkedIn Reply Bot] Comment already liked');
          return true;
        }
      }
    }

    // Try finding in the comment's social actions area
    const socialBar = comment.querySelector('.comments-comment-social-bar, .comment-social-bar');
    if (socialBar) {
      const buttons = socialBar.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent.toLowerCase();
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (text.includes('like') || label.includes('like')) {
          const isLiked = btn.getAttribute('aria-pressed') === 'true';
          if (!isLiked) {
            console.log('[LinkedIn Reply Bot] Clicking like button (fallback)');
            btn.click();
            await new Promise(resolve => setTimeout(resolve, 300));
            return true;
          }
          return true;
        }
      }
    }

    console.warn('[LinkedIn Reply Bot] Could not find like button');
    return false;
  }

  // Show "Add to Flow" button after replying
  function showAddToFlowButton(comment, data) {
    // Remove existing if any
    const existing = comment.querySelector('.reply-bot-flow-btn');
    if (existing) existing.remove();

    const flowBtn = document.createElement('button');
    flowBtn.className = 'reply-bot-flow-btn';
    flowBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/>
      </svg>
      <span>Add to DM Flow</span>
    `;

    // Insert after the reply bot button container
    const container = comment.querySelector('.reply-bot-btn-container');
    if (container && container.parentElement) {
      container.parentElement.insertBefore(flowBtn, container.nextSibling);
    }

    flowBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (flowBtn.classList.contains('loading')) return;

      flowBtn.classList.add('loading');
      flowBtn.querySelector('span').textContent = 'Adding...';

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'addToFlow',
          ...data
        });

        if (!response.success) {
          throw new Error(response.error);
        }

        flowBtn.querySelector('span').textContent = 'Added!';
        flowBtn.classList.add('success');

        setTimeout(() => {
          flowBtn.remove();
        }, 3000);

      } catch (error) {
        console.error('[LinkedIn Reply Bot] Add to flow error:', error);
        flowBtn.querySelector('span').textContent = 'Error!';
        alert('Error adding to flow: ' + error.message);

        setTimeout(() => {
          flowBtn.classList.remove('loading');
          flowBtn.querySelector('span').textContent = 'Add to DM Flow';
        }, 2000);
      }
    });
  }

  // Find parent post
  function findParentPost(comment) {
    return comment.closest('.feed-shared-update-v2') ||
           comment.closest('[data-urn]') ||
           comment.closest('.occludable-update');
  }

  // Extract post content
  function extractPostContent(post) {
    if (!post) return '';
    const content = post.querySelector('.update-components-text, .feed-shared-text');
    return content ? content.textContent.trim() : '';
  }

  // Extract post URL
  function extractPostUrl(post) {
    if (!post) return window.location.href;

    // Try to find post link
    const link = post.querySelector('a[href*="/feed/update/"]');
    if (link) return link.href;

    // Try data-urn attribute
    const urn = post.getAttribute('data-urn');
    if (urn) {
      const activityId = urn.split(':').pop();
      return `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/`;
    }

    return window.location.href;
  }

  // Extract comment content
  function extractCommentContent(comment) {
    const content = comment.querySelector('.comments-comment-item__main-content, .update-components-text');
    return content ? content.textContent.trim() : '';
  }

  // Extract commenter name
  function extractCommenterName(comment) {
    const nameEl = comment.querySelector(
      '.comments-comment-meta__description-title, ' +
      '.comments-post-meta__name-text, ' +
      'a[data-control-name="comment_commenter_name"]'
    );
    return nameEl ? nameEl.textContent.trim() : '';
  }

  // Extract commenter URL
  function extractCommenterUrl(comment) {
    // Try multiple selectors - LinkedIn's DOM changes frequently
    const selectors = [
      'a.comments-post-meta__profile-link',
      'a[data-control-name="comment_commenter_name"]',
      '.comments-comment-meta a[href*="/in/"]',
      '.comments-comment-item__post-meta a[href*="/in/"]',
      '.comments-comment-entity-meta a[href*="/in/"]',
      'a.comment-actor__link[href*="/in/"]',
      // New LinkedIn UI selectors
      'a[data-test-app-aware-link][href*="/in/"]',
      '.update-components-actor__container a[href*="/in/"]',
      // Generic fallbacks
      'a[href*="linkedin.com/in/"]'
    ];

    for (const selector of selectors) {
      const link = comment.querySelector(selector);
      if (link && link.href && link.href.includes('/in/')) {
        return link.href.split('?')[0];  // Remove query params
      }
    }

    // Last resort: search all links for profile URLs
    const allLinks = comment.querySelectorAll('a[href*="/in/"]');
    for (const link of allLinks) {
      if (link.href && link.href.includes('linkedin.com/in/')) {
        return link.href.split('?')[0];
      }
    }

    console.warn('[LinkedIn Reply Bot] Could not find commenter URL in:', comment);
    return '';
  }

  // Extract commenter headline
  function extractCommenterHeadline(comment) {
    const headline = comment.querySelector(
      '.comments-comment-meta__description, ' +
      '.comments-post-meta__headline'
    );
    return headline ? headline.textContent.trim() : '';
  }

  // Open reply box
  async function openReplyBox(comment) {
    const replyBtn = comment.querySelector(
      'button[aria-label*="Reply"], ' +
      '.comments-comment-social-bar__reply-action-button'
    );

    if (replyBtn) {
      replyBtn.click();
      await wait(500);
    }
  }

  // Insert reply text
  async function insertReply(comment, text) {
    // Find the reply editor that appeared
    const editor = await waitForElement(
      '.ql-editor[data-placeholder*="reply"], .ql-editor',
      comment.closest('.comments-thread-entity') || comment.parentElement,
      3000
    );

    if (!editor) {
      throw new Error('Could not find reply editor');
    }

    // Focus and insert text
    editor.focus();
    await wait(100);

    // Check for existing @mention
    const mention = editor.querySelector('.ql-mention');
    if (mention) {
      editor.innerHTML = `<p>${mention.outerHTML} ${text}</p>`;
    } else {
      editor.innerHTML = `<p>${text}</p>`;
    }

    // Trigger input events
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new Event('change', { bubbles: true }));

    await wait(100);
  }

  // Wait helper
  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Wait for element
  function waitForElement(selector, parent = document, timeout = 5000) {
    return new Promise((resolve) => {
      const el = parent.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const found = parent.querySelector(selector);
        if (found) {
          obs.disconnect();
          resolve(found);
        }
      });

      observer.observe(parent, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // Debug function
  window.linkedInReplyBotDebug = function() {
    console.log('[LinkedIn Reply Bot] Debug:');
    console.log('Comments found:', document.querySelectorAll('.comments-comment-entity').length);
    console.log('Buttons injected:', document.querySelectorAll('.reply-bot-btn-container').length);
    console.log('Canned responses:', cannedResponses);

    // Force re-scan
    document.querySelectorAll('[data-reply-bot-processed]').forEach(el => {
      delete el.dataset.replyBotProcessed;
    });
    scanForComments();
  };

  // =====================
  // DM Sidebar for Messaging Pages
  // =====================

  // DM Templates - organized by stage (1st, 2nd, 3rd DM)
  let dmTemplates = {
    dm1: [],
    dm2: [],
    dm3: []
  };
  let activeDmTab = 'dm1';
  let dmSidebarVisible = true; // Start visible
  let dmSidebarMinimized = false;

  // Load DM templates for all tabs
  async function loadDmTemplates() {
    const settings = await chrome.storage.sync.get(['dm1Templates', 'dm2Templates', 'dm3Templates', 'cannedDmMessages']);

    // Migrate old format if exists
    if (settings.cannedDmMessages && !settings.dm1Templates) {
      dmTemplates.dm1 = settings.cannedDmMessages;
      await chrome.storage.sync.set({ dm1Templates: settings.cannedDmMessages });
    } else {
      dmTemplates.dm1 = settings.dm1Templates || [
        "Hey {name}! Saw your comment on my post and wanted to connect. Would love to chat if you're interested!",
        "Hi {name}, thanks for engaging with my content! Curious about your work.",
        "Hey {name}! Appreciate your comment. Would you be open to a quick chat?"
      ];
    }

    dmTemplates.dm2 = settings.dm2Templates || [
      "Perfect, that's exactly what Zero to Builder is for.\n8 weeks. Start with visual automations (quick wins), graduate to AI-assisted coding (Claude, Cursor).\nBy the end you'll have actually shipped something.\nWant the details?"
    ];

    dmTemplates.dm3 = settings.dm3Templates || [
      "Here's the link to apply:\nhttps://www.aineversleeps.net/apply-zero-to-builder\nQuick form, then payment. We start January 15th, 12pm AEST.\nExcited to see what you build!"
    ];
  }

  // Save DM templates for current tab
  async function saveDmTemplates() {
    await chrome.storage.sync.set({ [`${activeDmTab}Templates`]: dmTemplates[activeDmTab] });
    console.log(`[LinkedIn Reply Bot] ${activeDmTab} templates saved`);
  }

  // Create floating DM sidebar
  function createDmSidebar() {
    if (document.getElementById('reply-bot-dm-sidebar')) return document.getElementById('reply-bot-dm-sidebar');

    const sidebar = document.createElement('div');
    sidebar.id = 'reply-bot-dm-sidebar';
    sidebar.innerHTML = `
      <style>
        #reply-bot-dm-sidebar {
          position: fixed;
          right: 20px;
          top: 80px;
          width: 340px;
          max-height: calc(100vh - 120px);
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15);
          z-index: 9999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
          display: block;
          transition: all 0.3s ease;
        }
        #reply-bot-dm-sidebar.minimized {
          width: 180px;
          max-height: 44px;
          overflow: hidden;
        }
        #reply-bot-dm-sidebar.minimized .dm-sidebar-content,
        #reply-bot-dm-sidebar.minimized .dm-sidebar-footer {
          display: none;
        }
        .dm-sidebar-header {
          background: linear-gradient(135deg, #0077b5 0%, #00a0dc 100%);
          color: white;
          padding: 12px 16px;
          font-weight: 600;
          font-size: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
        }
        .dm-sidebar-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .dm-sidebar-header-btns {
          display: flex;
          gap: 8px;
        }
        .dm-sidebar-btn {
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          cursor: pointer;
          font-size: 14px;
          padding: 4px 8px;
          border-radius: 4px;
          line-height: 1;
        }
        .dm-sidebar-btn:hover {
          background: rgba(255,255,255,0.3);
        }
        .dm-sidebar-recipient {
          background: rgba(255,255,255,0.15);
          padding: 8px 16px;
          font-size: 12px;
          color: white;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .dm-sidebar-recipient strong {
          color: #fff;
        }
        .dm-sidebar-content {
          max-height: calc(100vh - 280px);
          overflow-y: auto;
          padding: 12px;
        }
        .dm-sidebar-item {
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 10px;
          margin-bottom: 10px;
          transition: all 0.2s;
          font-size: 13px;
          line-height: 1.4;
          color: #333;
          position: relative;
        }
        .dm-sidebar-item:hover {
          border-color: #0077b5;
          box-shadow: 0 2px 8px rgba(0,119,181,0.1);
        }
        .dm-sidebar-item.copied {
          background: #e8f5e9;
          border-color: #4caf50;
        }
        .dm-sidebar-textarea {
          width: 100%;
          border: none;
          background: transparent;
          resize: none;
          font-size: 13px;
          line-height: 1.4;
          color: #333;
          font-family: inherit;
          min-height: 60px;
        }
        .dm-sidebar-textarea:focus {
          outline: none;
        }
        .dm-sidebar-item-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid #eee;
        }
        .dm-sidebar-action-btn {
          padding: 4px 10px;
          border: none;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dm-sidebar-copy-btn {
          background: #0077b5;
          color: white;
        }
        .dm-sidebar-copy-btn:hover {
          background: #005582;
        }
        .dm-sidebar-copy-btn.copied {
          background: #4caf50;
        }
        .dm-sidebar-delete-btn {
          background: transparent;
          color: #dc3545;
          padding: 4px 6px;
        }
        .dm-sidebar-delete-btn:hover {
          background: #ffebee;
        }
        .dm-sidebar-add-btn {
          width: 100%;
          padding: 10px;
          background: #e3f2fd;
          color: #1976d2;
          border: 1px dashed #1976d2;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          margin-top: 8px;
        }
        .dm-sidebar-add-btn:hover {
          background: #bbdefb;
        }
        .dm-sidebar-empty {
          text-align: center;
          color: #888;
          padding: 20px;
          font-size: 13px;
        }
        .dm-sidebar-footer {
          padding: 8px 16px;
          border-top: 1px solid #eee;
          font-size: 10px;
          color: #888;
          text-align: center;
          background: #fafafa;
        }
        .dm-sidebar-hint {
          font-size: 10px;
          color: #888;
        }
        .dm-sidebar-tabs {
          display: flex;
          background: #f5f5f5;
          border-bottom: 1px solid #e0e0e0;
        }
        .dm-sidebar-tab {
          flex: 1;
          padding: 10px 8px;
          border: none;
          background: transparent;
          font-size: 12px;
          font-weight: 600;
          color: #666;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }
        .dm-sidebar-tab:hover {
          color: #0077b5;
          background: rgba(0, 119, 181, 0.05);
        }
        .dm-sidebar-tab.active {
          color: #0077b5;
          border-bottom-color: #0077b5;
          background: white;
        }
      </style>
      <div class="dm-sidebar-header">
        <div class="dm-sidebar-header-left">
          <span>📋 DM Templates</span>
        </div>
        <div class="dm-sidebar-header-btns">
          <button class="dm-sidebar-btn dm-sidebar-refresh" title="Refresh recipient name">↻</button>
          <button class="dm-sidebar-btn dm-sidebar-minimize" title="Minimize">−</button>
        </div>
      </div>
      <div class="dm-sidebar-tabs">
        <button class="dm-sidebar-tab active" data-tab="dm1">1st DM</button>
        <button class="dm-sidebar-tab" data-tab="dm2">2nd DM</button>
        <button class="dm-sidebar-tab" data-tab="dm3">3rd DM</button>
      </div>
      <div class="dm-sidebar-recipient" id="dm-sidebar-recipient">
        To: <strong id="dm-recipient-name">detecting...</strong>
        <span id="dm-recipient-refresh" style="margin-left: 6px; cursor: pointer; opacity: 0.7;" title="Click to refresh">↻</span>
      </div>
      <div class="dm-sidebar-content" id="dm-sidebar-messages"></div>
      <div class="dm-sidebar-footer">
        Use {name} for recipient's name • Templates auto-save
      </div>
    `;

    document.body.appendChild(sidebar);

    // Refresh button in header
    sidebar.querySelector('.dm-sidebar-refresh').addEventListener('click', (e) => {
      e.stopPropagation();
      refreshRecipientName();
    });

    // Minimize button
    sidebar.querySelector('.dm-sidebar-minimize').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDmSidebarMinimize();
    });

    // Tab switching
    sidebar.querySelectorAll('.dm-sidebar-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        const tabKey = tab.dataset.tab;
        activeDmTab = tabKey;

        // Update active tab styling
        sidebar.querySelectorAll('.dm-sidebar-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Re-render messages for selected tab
        renderDmSidebarMessages();
      });
    });

    // Refresh button next to recipient name
    sidebar.querySelector('#dm-recipient-refresh').addEventListener('click', (e) => {
      e.stopPropagation();
      refreshRecipientName();
    });

    // Click header to expand when minimized
    sidebar.querySelector('.dm-sidebar-header').addEventListener('click', () => {
      if (dmSidebarMinimized) {
        toggleDmSidebarMinimize();
      }
    });

    // Watch for conversation changes (when user switches to a different message thread)
    setupConversationObserver();

    return sidebar;
  }

  // Refresh recipient name and update hints
  function refreshRecipientName() {
    const recipientName = getMessagingRecipientName();
    const recipientEl = document.getElementById('dm-recipient-name');
    const refreshIcon = document.getElementById('dm-recipient-refresh');

    if (recipientEl) {
      recipientEl.textContent = recipientName || '(not detected)';
    }

    // Visual feedback on refresh
    if (refreshIcon) {
      refreshIcon.style.transform = 'rotate(360deg)';
      refreshIcon.style.transition = 'transform 0.3s';
      setTimeout(() => {
        refreshIcon.style.transform = '';
      }, 300);
    }

    // Update hints in all template items
    const hints = document.querySelectorAll('.dm-sidebar-hint');
    hints.forEach(hint => {
      hint.textContent = '{name} = ' + (recipientName || 'recipient');
    });

    console.log('[LinkedIn Reply Bot] Refreshed recipient name:', recipientName);
  }

  // Watch for conversation changes to auto-detect new recipient
  let conversationObserver = null;
  let lastConversationUrl = '';

  function setupConversationObserver() {
    if (conversationObserver) return;

    // Watch for URL changes (conversation switches)
    const checkConversationChange = () => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastConversationUrl && currentUrl.includes('/messaging')) {
        lastConversationUrl = currentUrl;
        // Delay to let LinkedIn render the new conversation
        setTimeout(() => {
          refreshRecipientName();
        }, 500);
      }
    };

    // Watch for DOM changes in messaging area
    conversationObserver = new MutationObserver((mutations) => {
      // Check if conversation header changed
      for (const mutation of mutations) {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          const target = mutation.target;
          // Look for changes in conversation title areas
          if (target.closest && (
            target.closest('.msg-thread') ||
            target.closest('.msg-overlay-conversation-bubble') ||
            target.closest('.msg-entity-lockup')
          )) {
            // Debounce the refresh
            clearTimeout(conversationObserver.refreshTimeout);
            conversationObserver.refreshTimeout = setTimeout(() => {
              refreshRecipientName();
            }, 300);
            break;
          }
        }
      }
    });

    // Start observing
    const messagingContainer = document.querySelector('.msg-thread') ||
                               document.querySelector('.msg-overlay-list-bubble') ||
                               document.querySelector('.scaffold-layout__main');

    if (messagingContainer) {
      conversationObserver.observe(messagingContainer, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    // Also check URL periodically for conversation switches
    setInterval(checkConversationChange, 1000);
  }

  // Toggle minimize state
  function toggleDmSidebarMinimize() {
    const sidebar = document.getElementById('reply-bot-dm-sidebar');
    if (!sidebar) return;

    dmSidebarMinimized = !dmSidebarMinimized;
    if (dmSidebarMinimized) {
      sidebar.classList.add('minimized');
      sidebar.querySelector('.dm-sidebar-minimize').textContent = '+';
      sidebar.querySelector('.dm-sidebar-minimize').title = 'Expand';
    } else {
      sidebar.classList.remove('minimized');
      sidebar.querySelector('.dm-sidebar-minimize').textContent = '−';
      sidebar.querySelector('.dm-sidebar-minimize').title = 'Minimize';
      renderDmSidebarMessages();
    }
  }

  // Render DM messages in sidebar with editable textareas
  function renderDmSidebarMessages() {
    const container = document.getElementById('dm-sidebar-messages');
    if (!container) return;

    container.innerHTML = '';

    // Update recipient name
    const recipientName = getMessagingRecipientName();
    const recipientEl = document.getElementById('dm-recipient-name');
    if (recipientEl) {
      recipientEl.textContent = recipientName || '(not detected)';
    }

    // Get templates for current active tab
    const currentTemplates = dmTemplates[activeDmTab] || [];

    if (currentTemplates.length === 0) {
      const tabLabels = { dm1: '1st DM', dm2: '2nd DM', dm3: '3rd DM' };
      container.innerHTML = `<div class="dm-sidebar-empty">No ${tabLabels[activeDmTab]} templates yet.<br>Click "Add Template" below.</div>`;
    } else {
      currentTemplates.forEach((message, index) => {
        const item = document.createElement('div');
        item.className = 'dm-sidebar-item';
        item.dataset.index = index;

        const textarea = document.createElement('textarea');
        textarea.className = 'dm-sidebar-textarea';
        textarea.value = message;
        textarea.placeholder = 'Enter your DM template...';

        // Auto-resize
        textarea.addEventListener('input', () => {
          textarea.style.height = 'auto';
          textarea.style.height = textarea.scrollHeight + 'px';
          // Save on edit (debounced)
          clearTimeout(textarea.saveTimeout);
          textarea.saveTimeout = setTimeout(() => {
            dmTemplates[activeDmTab][index] = textarea.value;
            saveDmTemplates();
          }, 500);
        });

        const actions = document.createElement('div');
        actions.className = 'dm-sidebar-item-actions';

        const hint = document.createElement('span');
        hint.className = 'dm-sidebar-hint';
        hint.textContent = '{name} = ' + (recipientName || 'recipient');

        const btnsDiv = document.createElement('div');
        btnsDiv.style.display = 'flex';
        btnsDiv.style.gap = '6px';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'dm-sidebar-action-btn dm-sidebar-copy-btn';
        copyBtn.textContent = 'Copy & Insert';
        copyBtn.addEventListener('click', async () => {
          // Get the current recipient name at click time (not render time)
          const currentRecipientName = getMessagingRecipientName();
          const personalizedMessage = textarea.value.replace(/\{name\}/g, currentRecipientName || '');
          try {
            await navigator.clipboard.writeText(personalizedMessage);
            insertIntoMessageInput(personalizedMessage);
            copyBtn.textContent = 'Copied!';
            copyBtn.classList.add('copied');
            item.classList.add('copied');
            setTimeout(() => {
              copyBtn.textContent = 'Copy & Insert';
              copyBtn.classList.remove('copied');
              item.classList.remove('copied');
            }, 2000);
          } catch (err) {
            console.error('Failed to copy:', err);
          }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'dm-sidebar-action-btn dm-sidebar-delete-btn';
        deleteBtn.innerHTML = '🗑';
        deleteBtn.title = 'Delete template';
        deleteBtn.addEventListener('click', () => {
          dmTemplates[activeDmTab].splice(index, 1);
          saveDmTemplates();
          renderDmSidebarMessages();
        });

        btnsDiv.appendChild(copyBtn);
        btnsDiv.appendChild(deleteBtn);
        actions.appendChild(hint);
        actions.appendChild(btnsDiv);

        item.appendChild(textarea);
        item.appendChild(actions);
        container.appendChild(item);

        // Set initial height
        setTimeout(() => {
          textarea.style.height = 'auto';
          textarea.style.height = textarea.scrollHeight + 'px';
        }, 0);
      });
    }

    // Add template button
    const addBtn = document.createElement('button');
    addBtn.className = 'dm-sidebar-add-btn';
    addBtn.textContent = '+ Add Template';
    addBtn.addEventListener('click', () => {
      dmTemplates[activeDmTab].push('Hey {name}! ');
      saveDmTemplates();
      renderDmSidebarMessages();
      // Focus the new textarea
      setTimeout(() => {
        const textareas = container.querySelectorAll('.dm-sidebar-textarea');
        if (textareas.length > 0) {
          textareas[textareas.length - 1].focus();
        }
      }, 100);
    });
    container.appendChild(addBtn);
  }

  // Get recipient name from messaging page
  function getMessagingRecipientName() {
    // Check if compose modal is open - if so, prioritize compose selectors
    const isComposeOpen = document.querySelector('.artdeco-pill__text') ||
                          document.querySelector('.msg-form__pill-listitem') ||
                          document.querySelector('.msg-compose-form') ||
                          document.querySelector('.msg-connections-typeahead');

    // COMPOSE MODAL SELECTORS - highest priority when composing new message
    const composeSelectors = [
      // Artdeco pill (the blue pill showing selected recipient) - PRIMARY
      '.artdeco-pill__text',
      'span.artdeco-pill__text',
      // Compose pill/chip variations
      '.msg-form__pill-listitem .msg-entity-lockup__entity-title',
      '.msg-form__pill-listitem span[dir="ltr"]',
      '.msg-compose-form .msg-entity-lockup__entity-title',
      '.msg-form__pill button span',
      '.msg-connections-typeahead__search-result-title',
      '.msg-compose-pill__text',
      '.msg-compose__convo-pill span',
      // Recipient input area pill
      '.msg-form__to-input .msg-entity-lockup__entity-title',
      '.msg-form__recipients-area .msg-entity-lockup__entity-title',
      // New compose modal (2024+)
      '.msg-form__pill-container .artdeco-entity-lockup__title',
      '.msg-form__pill-container span.visually-hidden + span',
      '[data-artdeco-is-focused] .artdeco-entity-lockup__title'
    ];

    // If compose is open, only check compose selectors first
    if (isComposeOpen) {
      for (const selector of composeSelectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent.trim()) {
          const fullName = el.textContent.trim();
          if (fullName.toLowerCase() === 'messaging' ||
              fullName.toLowerCase().includes('new message') ||
              fullName.toLowerCase() === 'compose' ||
              fullName.toLowerCase() === 'to:') {
            continue;
          }
          const firstName = fullName.split(' ')[0];
          if (firstName && firstName.length > 1) {
            console.log('[LinkedIn Reply Bot] Found name in compose modal:', firstName);
            return firstName;
          }
        }
      }
    }

    // CONVERSATION THREAD SELECTORS - for existing conversations
    const selectors = [
      // Full messaging page - main conversation header
      '.msg-thread .msg-entity-lockup__entity-title',
      '.msg-thread h2.msg-entity-lockup__entity-title',
      '.msg-s-message-list-container .msg-entity-lockup__entity-title',
      '.msg-conversations-container__title-row .truncate',
      // Conversation title in thread view (when opened from URL)
      '.msg-s-event-listitem__link .msg-s-message-group__name',
      '.msg-thread__link-to-profile span',
      '.msg-thread__link-to-profile',
      // Header area selectors
      '.msg-title-bar .truncate',
      '.msg-title-bar__title-text',
      '.msg-title-bar a[href*="/in/"]',
      // Compose/overlay bubble (different from compose modal)
      '.msg-overlay-conversation-bubble__title',
      '.msg-overlay-bubble-header__title',
      'h2.msg-overlay-bubble-header__title',
      // Selected conversation in list (fallback)
      '.msg-conversation-listitem--active .msg-conversation-card__title',
      '.msg-conversation-listitem--active .msg-conversation-card__participant-names',
      // New LinkedIn messaging UI (2024+)
      '[data-test-messaging-conversation-thread-header-title]',
      '.msg-s-message-list-content .msg-s-message-group__profile-link',
      // Thread header when viewing a conversation
      '.msg-overlay-list-bubble__header-heading',
      // Profile link in conversation header
      'a.msg-thread__link-to-profile',
      // Generic fallbacks for name in header area
      '.msg-s-message-list-container h2',
      '.msg-thread h2'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        // Extract first name
        const fullName = el.textContent.trim();
        // Skip if it's generic text like "Messaging" or "New message"
        if (fullName.toLowerCase() === 'messaging' ||
            fullName.toLowerCase().includes('new message') ||
            fullName.toLowerCase() === 'compose') {
          continue;
        }
        const firstName = fullName.split(' ')[0];
        if (firstName && firstName.length > 1) {
          return firstName;
        }
      }
    }

    // Last resort: try to find name from profile links in the thread header
    const profileLinks = document.querySelectorAll('.msg-thread a[href*="/in/"], .msg-title-bar a[href*="/in/"]');
    for (const link of profileLinks) {
      const name = link.textContent.trim();
      if (name && name.length > 1 && !name.includes('/')) {
        const firstName = name.split(' ')[0];
        if (firstName.length > 1) {
          return firstName;
        }
      }
    }

    return null;
  }

  // Try to insert message into LinkedIn's message input
  function insertIntoMessageInput(text) {
    const inputSelectors = [
      '.msg-form__contenteditable',
      '.msg-overlay-conversation-bubble .msg-form__contenteditable',
      '[data-artdeco-is-focused] .msg-form__contenteditable',
      '.msg-form__message-texteditor .msg-form__contenteditable',
      '.msg-form__msg-content-container .msg-form__contenteditable'
    ];

    for (const selector of inputSelectors) {
      const input = document.querySelector(selector);
      if (input) {
        input.focus();
        input.innerHTML = `<p>${text}</p>`;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[LinkedIn Reply Bot] Inserted message into input');
        return true;
      }
    }

    return false;
  }

  // Toggle sidebar visibility
  function toggleDmSidebar(visible) {
    const sidebar = document.getElementById('reply-bot-dm-sidebar') || createDmSidebar();
    dmSidebarVisible = visible !== undefined ? visible : !dmSidebarVisible;

    if (dmSidebarVisible) {
      sidebar.style.display = 'block';
      renderDmSidebarMessages();
    } else {
      sidebar.style.display = 'none';
    }
  }

  // Check if on messaging page and initialize sidebar
  function checkMessagingPage() {
    const isMessaging = window.location.pathname.includes('/messaging') ||
                        document.querySelector('.msg-overlay-conversation-bubble') ||
                        document.querySelector('.msg-thread');

    const existingSidebar = document.getElementById('reply-bot-dm-sidebar');

    if (isMessaging) {
      loadDmTemplates().then(() => {
        if (!existingSidebar) {
          createDmSidebar();
        }
        // Always show and refresh on messaging pages
        toggleDmSidebar(true);

        // When coming from external link (like leads page), LinkedIn may still be loading
        // Do aggressive retries to detect recipient name
        detectRecipientWithRetries();
      });
    } else {
      // Hide sidebar when not on messaging
      if (existingSidebar) {
        existingSidebar.style.display = 'none';
      }
    }
  }

  // Detect recipient name with multiple retries (for fresh page loads)
  let recipientDetectionObserver = null;

  async function detectRecipientWithRetries(maxAttempts = 10, baseDelay = 300) {
    // Clean up previous observer if any
    if (recipientDetectionObserver) {
      recipientDetectionObserver.disconnect();
      recipientDetectionObserver = null;
    }

    let attempts = 0;
    let detected = false;

    const tryDetect = () => {
      if (detected) return true;

      attempts++;
      const name = getMessagingRecipientName();

      if (name) {
        detected = true;
        console.log(`[LinkedIn Reply Bot] Recipient detected on attempt ${attempts}: ${name}`);
        refreshRecipientName();
        if (recipientDetectionObserver) {
          recipientDetectionObserver.disconnect();
          recipientDetectionObserver = null;
        }
        return true;
      }

      if (attempts < maxAttempts) {
        // Progressive delay: 300, 500, 700, 900, etc.
        const delay = baseDelay + (attempts * 200);
        console.log(`[LinkedIn Reply Bot] Recipient not found, retrying in ${delay}ms (attempt ${attempts}/${maxAttempts})`);
        setTimeout(tryDetect, delay);
        return false;
      }

      console.log('[LinkedIn Reply Bot] Max attempts reached, recipient not detected');
      return false;
    };

    // Also set up a MutationObserver to catch when the name element appears
    recipientDetectionObserver = new MutationObserver((mutations) => {
      if (detected) {
        recipientDetectionObserver.disconnect();
        return;
      }

      // Check if any name-related element was added
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          const name = getMessagingRecipientName();
          if (name) {
            detected = true;
            console.log('[LinkedIn Reply Bot] Recipient detected via MutationObserver:', name);
            refreshRecipientName();
            recipientDetectionObserver.disconnect();
            recipientDetectionObserver = null;
            return;
          }
        }
      }
    });

    // Observe the main content area for changes
    const observeTarget = document.querySelector('.scaffold-layout__main') ||
                          document.querySelector('.application-outlet') ||
                          document.body;

    recipientDetectionObserver.observe(observeTarget, {
      childList: true,
      subtree: true
    });

    // Start polling detection after a short initial delay
    setTimeout(tryDetect, 200);

    // Auto-cleanup observer after 15 seconds
    setTimeout(() => {
      if (recipientDetectionObserver) {
        recipientDetectionObserver.disconnect();
        recipientDetectionObserver = null;
      }
    }, 15000);
  }

  // Periodically refresh recipient name as fallback (in case observer misses changes)
  setInterval(() => {
    if (dmSidebarVisible && !dmSidebarMinimized) {
      refreshRecipientName();
    }
  }, 5000);

  // Escape HTML helper
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Watch for navigation to messaging
  let lastUrl = window.location.href;
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      checkMessagingPage();
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });

  // Initial check for messaging page
  setTimeout(checkMessagingPage, 1000);

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
