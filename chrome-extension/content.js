// LinkedIn Reply Bot - Content Script
// Injects AI Reply buttons on LinkedIn comments

(function() {
  'use strict';

  if (window.linkedInReplyBotInjected) return;
  window.linkedInReplyBotInjected = true;

  console.log('[LinkedIn Reply Bot] Content script loaded');

  // Canned responses (loaded from settings) - now objects with {text, autoConnect, addToFlow}
  let cannedResponses = [];

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
  function scanForComments() {
    const comments = document.querySelectorAll('.comments-comment-entity, .comments-thread-entity');

    comments.forEach(comment => {
      if (comment.dataset.replyBotProcessed) return;
      comment.dataset.replyBotProcessed = 'true';

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

      if (socialBar && !socialBar.querySelector('.reply-bot-btn-container')) {
        injectButton(comment, socialBar);
      }
    });
  }

  // Inject the AI Reply button
  function injectButton(comment, socialBar) {
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

    // Add to Flow button (always visible)
    const flowBtn = document.createElement('button');
    flowBtn.className = 'reply-bot-flow-btn-inline';
    flowBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/>
      </svg>
      <span>+ Flow</span>
    `;

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

    // Flow button click - add to DM flow directly
    flowBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
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
    const originalText = flowBtn.querySelector('span').textContent;
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

      if (response.alreadyExists) {
        flowBtn.querySelector('span').textContent = 'Already in flow!';
        flowBtn.classList.add('exists');
      } else if (response.dmSent) {
        flowBtn.querySelector('span').textContent = 'Added + DM sent!';
        flowBtn.classList.add('success');
      } else if (response.connectionStatus === 'connected') {
        flowBtn.querySelector('span').textContent = 'Added (connected)';
        flowBtn.classList.add('success');
      } else if (response.connectionStatus === 'notConnected') {
        flowBtn.querySelector('span').textContent = 'Added (not connected)';
        flowBtn.classList.add('exists');
      } else {
        flowBtn.querySelector('span').textContent = 'Added!';
        flowBtn.classList.add('success');
      }

    } catch (error) {
      console.error('[LinkedIn Reply Bot] Add to flow error:', error);
      flowBtn.querySelector('span').textContent = 'Error!';
      alert('Error: ' + error.message);
    } finally {
      setTimeout(() => {
        flowBtn.classList.remove('loading', 'success', 'exists');
        flowBtn.querySelector('span').textContent = originalText;
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

  let cannedDmMessages = [];
  let dmSidebarVisible = false;

  // Load canned DM messages
  async function loadCannedDmMessages() {
    const settings = await chrome.storage.sync.get(['cannedDmMessages']);
    cannedDmMessages = settings.cannedDmMessages || [
      "Hey {name}! Saw your comment on my post and wanted to connect. I help [your service]. Would love to chat if you're interested!",
      "Hi {name}, thanks for engaging with my content! I noticed you're in [industry]. I have some resources that might help - would you like me to share?",
      "Hey {name}! Appreciate your thoughtful comment. I'm curious about your work - would you be open to a quick chat?"
    ];
  }

  // Create floating DM sidebar
  function createDmSidebar() {
    if (document.getElementById('reply-bot-dm-sidebar')) return;

    const sidebar = document.createElement('div');
    sidebar.id = 'reply-bot-dm-sidebar';
    sidebar.innerHTML = `
      <style>
        #reply-bot-dm-sidebar {
          position: fixed;
          right: 20px;
          top: 100px;
          width: 320px;
          max-height: 500px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.15);
          z-index: 9999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          overflow: hidden;
          display: none;
        }
        #reply-bot-dm-sidebar.visible {
          display: block;
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
        }
        .dm-sidebar-close {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 18px;
          padding: 0;
          line-height: 1;
        }
        .dm-sidebar-content {
          max-height: 400px;
          overflow-y: auto;
          padding: 12px;
        }
        .dm-sidebar-item {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 10px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 13px;
          line-height: 1.4;
          color: #333;
          position: relative;
        }
        .dm-sidebar-item:hover {
          background: #e8f4fc;
          transform: translateX(-2px);
        }
        .dm-sidebar-item.copied {
          background: #e8f5e9;
        }
        .dm-sidebar-item-text {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .dm-sidebar-copy-hint {
          font-size: 10px;
          color: #888;
          margin-top: 6px;
          text-align: right;
        }
        .dm-sidebar-item.copied .dm-sidebar-copy-hint {
          color: #2e7d32;
          font-weight: 600;
        }
        .dm-sidebar-empty {
          text-align: center;
          color: #888;
          padding: 20px;
          font-size: 13px;
        }
        .dm-sidebar-footer {
          padding: 10px 16px;
          border-top: 1px solid #eee;
          font-size: 11px;
          color: #666;
          text-align: center;
        }
        .dm-sidebar-footer a {
          color: #0077b5;
          text-decoration: none;
        }
      </style>
      <div class="dm-sidebar-header">
        <span>📋 DM Templates</span>
        <button class="dm-sidebar-close" title="Close">×</button>
      </div>
      <div class="dm-sidebar-content" id="dm-sidebar-messages"></div>
      <div class="dm-sidebar-footer">
        Click to copy • Edit templates in <a href="#" id="dm-sidebar-settings">extension settings</a>
      </div>
    `;

    document.body.appendChild(sidebar);

    // Close button
    sidebar.querySelector('.dm-sidebar-close').addEventListener('click', () => {
      toggleDmSidebar(false);
    });

    // Settings link
    sidebar.querySelector('#dm-sidebar-settings').addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ action: 'openPopup' });
    });

    return sidebar;
  }

  // Render DM messages in sidebar
  function renderDmSidebarMessages() {
    const container = document.getElementById('dm-sidebar-messages');
    if (!container) return;

    container.innerHTML = '';

    if (cannedDmMessages.length === 0) {
      container.innerHTML = '<div class="dm-sidebar-empty">No DM templates configured.<br>Add templates in the extension popup.</div>';
      return;
    }

    cannedDmMessages.forEach((message, index) => {
      const item = document.createElement('div');
      item.className = 'dm-sidebar-item';
      item.dataset.index = index;

      // Try to get recipient name from the messaging page
      const recipientName = getMessagingRecipientName();
      const personalizedMessage = message.replace(/\{name\}/g, recipientName || '[Name]');

      item.innerHTML = `
        <div class="dm-sidebar-item-text">${escapeHtml(personalizedMessage)}</div>
        <div class="dm-sidebar-copy-hint">Click to copy</div>
      `;

      item.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(personalizedMessage);
          item.classList.add('copied');
          item.querySelector('.dm-sidebar-copy-hint').textContent = 'Copied!';

          // Try to paste into message input
          insertIntoMessageInput(personalizedMessage);

          setTimeout(() => {
            item.classList.remove('copied');
            item.querySelector('.dm-sidebar-copy-hint').textContent = 'Click to copy';
          }, 2000);
        } catch (err) {
          console.error('Failed to copy:', err);
        }
      });

      container.appendChild(item);
    });
  }

  // Get recipient name from messaging page
  function getMessagingRecipientName() {
    // Try various selectors for the conversation header
    const selectors = [
      '.msg-overlay-conversation-bubble__title',
      '.msg-conversation-card__title',
      '.msg-thread__link-to-profile',
      '.msg-title-bar .truncate',
      '.msg-thread__link-to-profile span',
      'h2.msg-overlay-bubble-header__title'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        // Extract first name
        const fullName = el.textContent.trim();
        return fullName.split(' ')[0];
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
      '.msg-form__message-texteditor .msg-form__contenteditable'
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
      sidebar.classList.add('visible');
      renderDmSidebarMessages();
    } else {
      sidebar.classList.remove('visible');
    }
  }

  // Create floating toggle button
  function createDmToggleButton() {
    if (document.getElementById('reply-bot-dm-toggle')) return;

    const toggle = document.createElement('button');
    toggle.id = 'reply-bot-dm-toggle';
    toggle.innerHTML = '📋';
    toggle.title = 'Toggle DM Templates';
    toggle.style.cssText = `
      position: fixed;
      right: 20px;
      top: 50px;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0077b5 0%, #00a0dc 100%);
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      z-index: 9998;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      transition: transform 0.2s;
    `;

    toggle.addEventListener('mouseenter', () => {
      toggle.style.transform = 'scale(1.1)';
    });
    toggle.addEventListener('mouseleave', () => {
      toggle.style.transform = 'scale(1)';
    });
    toggle.addEventListener('click', () => {
      toggleDmSidebar();
    });

    document.body.appendChild(toggle);
  }

  // Check if on messaging page and initialize sidebar
  function checkMessagingPage() {
    const isMessaging = window.location.pathname.includes('/messaging') ||
                        document.querySelector('.msg-overlay-conversation-bubble') ||
                        document.querySelector('.msg-thread');

    if (isMessaging) {
      loadCannedDmMessages().then(() => {
        createDmToggleButton();
        createDmSidebar();
      });
    }
  }

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
