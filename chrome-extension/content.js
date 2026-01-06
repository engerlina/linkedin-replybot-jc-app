// LinkedIn Reply Bot - Content Script
// Injects AI Reply buttons on LinkedIn comments

(function() {
  'use strict';

  if (window.linkedInReplyBotInjected) return;
  window.linkedInReplyBotInjected = true;

  console.log('[LinkedIn Reply Bot] Content script loaded');

  // Canned responses (loaded from settings)
  let cannedResponses = [];

  // Load canned responses
  async function loadCannedResponses() {
    const settings = await chrome.storage.sync.get(['cannedResponses']);
    cannedResponses = settings.cannedResponses || [
      "Thanks for the comment! I'll DM you with more details.",
      "Great question! Let me send you some resources via DM.",
      "Appreciate you reaching out! Check your DMs."
    ];
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

    container.appendChild(button);
    container.appendChild(dropdownBtn);
    container.appendChild(dropdown);
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
      if (item && item.dataset.response) {
        e.preventDefault();
        e.stopPropagation();
        dropdown.style.display = 'none';
        handleReply(comment, button, item.dataset.response);
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        dropdown.style.display = 'none';
      }
    });
  }

  // Populate dropdown with canned responses
  function populateDropdown(dropdown) {
    dropdown.innerHTML = '';

    cannedResponses.forEach((response, i) => {
      const item = document.createElement('div');
      item.className = 'reply-bot-dropdown-item';
      item.textContent = response.length > 50 ? response.substring(0, 50) + '...' : response;
      item.dataset.response = response;
      item.dataset.index = i;
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
  async function handleReply(comment, button, cannedResponse) {
    if (button.classList.contains('loading')) return;

    const originalText = button.querySelector('span').textContent;
    button.classList.add('loading');
    button.querySelector('span').textContent = cannedResponse ? 'Rewriting...' : 'Generating...';

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
        comment: commentText.substring(0, 50) + '...'
      });

      // Generate reply via background script
      const response = await chrome.runtime.sendMessage({
        action: 'generateReply',
        postContent,
        commentText,
        commenterName,
        isOwnPost: true,
        cannedResponse
      });

      if (!response.success) {
        throw new Error(response.error);
      }

      const reply = response.reply;

      // Open reply box and insert text
      await openReplyBox(comment);
      await insertReply(comment, reply);

      button.querySelector('span').textContent = 'Done!';

      // Show "Add to Flow" button
      showAddToFlowButton(comment, {
        commenterUrl,
        commenterName,
        commenterHeadline,
        postUrl,
        replyText: reply
      });

    } catch (error) {
      console.error('[LinkedIn Reply Bot] Error:', error);
      button.querySelector('span').textContent = 'Error!';
      alert('Error: ' + error.message);
    } finally {
      setTimeout(() => {
        button.classList.remove('loading');
        button.querySelector('span').textContent = originalText;
      }, 2000);
    }
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
    const link = comment.querySelector(
      'a.comments-post-meta__profile-link, ' +
      'a[data-control-name="comment_commenter_name"], ' +
      '.comments-comment-meta a[href*="/in/"]'
    );
    return link ? link.href : '';
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

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
