'use client';

import { useEffect, useState } from 'react';
import { api, MonitoredPost, LinkedInAccount } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatRelativeTime } from '@/lib/utils';

export default function ReplyBotPage() {
  useAuth();

  const [posts, setPosts] = useState<MonitoredPost[]>([]);
  const [accounts, setAccounts] = useState<LinkedInAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');
  const [pollingPostId, setPollingPostId] = useState<string | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [postsData, accountsData] = await Promise.all([
        api.getMonitoredPosts(),
        api.getAccounts(),
      ]);
      setPosts(postsData);
      setAccounts(accountsData);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (post: MonitoredPost) => {
    try {
      await api.updateMonitoredPost(post.id, { isActive: !post.isActive });
      loadData();
    } catch (err) {
      console.error('Failed to toggle post', err);
    }
  };

  const handleToggleAutoReply = async (post: MonitoredPost) => {
    try {
      await api.updateMonitoredPost(post.id, { autoReply: !post.autoReply });
      loadData();
    } catch (err) {
      console.error('Failed to toggle auto-reply', err);
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    try {
      await api.deleteMonitoredPost(postId);
      loadData();
    } catch (err) {
      console.error('Failed to delete post', err);
    }
  };

  const handlePoll = async (postId: string) => {
    setPollingPostId(postId);
    try {
      const result = await api.triggerPoll(postId);
      alert(`Found ${result.commentsFound} comments, ${result.matchesFound} matches`);
      loadData();
    } catch (err) {
      console.error('Failed to poll', err);
      alert('Failed to check post. Please try again.');
    } finally {
      setPollingPostId(null);
    }
  };

  const togglePromptExpanded = (postId: string) => {
    const newExpanded = new Set(expandedPrompts);
    if (newExpanded.has(postId)) {
      newExpanded.delete(postId);
    } else {
      newExpanded.add(postId);
    }
    setExpandedPrompts(newExpanded);
  };

  const handleEditPrompt = (post: MonitoredPost) => {
    setEditingPrompt(post.id);
    setPromptText(post.replyStyle || '');
  };

  const handleSavePrompt = async (postId: string) => {
    try {
      await api.updateMonitoredPost(postId, { replyStyle: promptText });
      setEditingPrompt(null);
      loadData();
    } catch (err) {
      console.error('Failed to save prompt', err);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Reply Bot</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          Add Post
        </button>
      </div>

      {showForm && (
        <AddPostForm
          accounts={accounts}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            loadData();
          }}
        />
      )}

      <div className="space-y-4">
        {posts.length === 0 ? (
          <p className="text-gray-400">No monitored posts yet</p>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1 min-w-0 mr-4">
                  <h3 className="text-white font-medium text-lg">
                    {post.postTitle || 'Untitled Post'}
                  </h3>
                  <a
                    href={post.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-sm hover:underline block truncate"
                  >
                    {post.postUrl.length > 80 ? post.postUrl.slice(0, 80) + '...' : post.postUrl}
                  </a>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleToggleActive(post)}
                    className={`px-3 py-1 rounded text-sm ${
                      post.isActive
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-600 text-gray-300'
                    }`}
                  >
                    {post.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => handlePoll(post.id)}
                    disabled={pollingPostId === post.id}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {pollingPostId === post.id ? (
                      <>
                        <span className="animate-spin">↻</span>
                        Checking...
                      </>
                    ) : (
                      '⚡ Force Check'
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm mb-4">
                <div>
                  <span className="text-gray-400">Keywords:</span>
                  <div className="text-white mt-1">
                    {post.keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="inline-block bg-blue-600/30 text-blue-300 px-2 py-1 rounded mr-1 mb-1 font-medium"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">CTA Type:</span>
                  <p className="text-white mt-1 capitalize">{post.ctaType.replace('_', ' ')}</p>
                </div>
                <div>
                  <span className="text-gray-400">Matches:</span>
                  <p className="text-white mt-1 font-semibold">{post.totalMatches}</p>
                </div>
                <div>
                  <span className="text-gray-400">Last Checked:</span>
                  <p className="text-white mt-1">
                    {post.lastPolledAt
                      ? formatRelativeTime(post.lastPolledAt)
                      : 'Never'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-400">Auto-Reply:</span>
                  <button
                    onClick={() => handleToggleAutoReply(post)}
                    className={`mt-1 px-3 py-1 rounded text-sm block ${
                      post.autoReply
                        ? 'bg-green-600 text-white'
                        : 'bg-yellow-600 text-white'
                    }`}
                  >
                    {post.autoReply ? 'Auto' : 'Review'}
                  </button>
                </div>
              </div>

              {/* AI Reply Prompt Section */}
              <div className="border-t border-gray-700 pt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-sm font-medium">AI Reply Prompt:</span>
                  <div className="flex gap-2">
                    {post.replyStyle && post.replyStyle.length > 200 && editingPrompt !== post.id && (
                      <button
                        onClick={() => togglePromptExpanded(post.id)}
                        className="text-gray-400 hover:text-gray-300 text-sm"
                      >
                        {expandedPrompts.has(post.id) ? '▼ Collapse' : '▶ Expand'}
                      </button>
                    )}
                    {editingPrompt !== post.id && (
                      <button
                        onClick={() => handleEditPrompt(post)}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        {post.replyStyle ? 'Edit' : 'Add Prompt'}
                      </button>
                    )}
                  </div>
                </div>
                {editingPrompt === post.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm h-48 resize-y font-mono"
                      placeholder="E.g.: 'Be enthusiastic and mention our free consultation. Keep replies under 50 words.'"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingPrompt(null)}
                        className="px-3 py-1 bg-gray-600 text-white rounded text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSavePrompt(post.id)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : post.replyStyle ? (
                  <div className="bg-gray-900 rounded border border-gray-700">
                    <pre
                      className={`text-gray-300 text-sm p-3 whitespace-pre-wrap font-mono overflow-x-auto ${
                        !expandedPrompts.has(post.id) && post.replyStyle.length > 200
                          ? 'max-h-24 overflow-hidden'
                          : ''
                      }`}
                    >
                      {post.replyStyle}
                    </pre>
                    {!expandedPrompts.has(post.id) && post.replyStyle.length > 200 && (
                      <div className="bg-gradient-to-t from-gray-900 to-transparent h-8 -mt-8 relative pointer-events-none" />
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 italic text-sm bg-gray-900 rounded p-3 border border-gray-700">
                    No custom prompt set. Using default AI behavior.
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AddPostForm({
  accounts,
  onClose,
  onSuccess,
}: {
  accounts: LinkedInAccount[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    accountId: '',
    postUrl: '',
    postTitle: '',
    keywords: '',
    ctaType: 'link',
    ctaValue: '',
    ctaMessage: '',
    replyStyle: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.accountId) {
      setError('Please select a LinkedIn account');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.createMonitoredPost({
        ...formData,
        keywords: formData.keywords.split(',').map((k) => k.trim()),
      });
      onSuccess();
    } catch (err) {
      console.error('Failed to create post', err);
      setError(err instanceof Error ? err.message : 'Failed to add post');
    } finally {
      setSubmitting(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
          <h2 className="text-xl font-bold text-white mb-4">No LinkedIn Account</h2>
          <p className="text-gray-300 mb-4">
            You need to add a LinkedIn account in Settings before you can monitor posts.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded"
            >
              Close
            </button>
            <a
              href="/dashboard/settings"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              Go to Settings
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-8">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg mx-4">
        <h2 className="text-xl font-bold text-white mb-4">Add Monitored Post</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-300 mb-1">Account</label>
            <select
              value={formData.accountId}
              onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              required
            >
              <option value="">Select an account...</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} {acc.isActive ? '' : '(Inactive)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-300 mb-1">Post URL</label>
            <input
              type="url"
              value={formData.postUrl}
              onChange={(e) => setFormData({ ...formData, postUrl: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="https://linkedin.com/feed/update/..."
              required
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-1">Post Title</label>
            <input
              type="text"
              value={formData.postTitle}
              onChange={(e) => setFormData({ ...formData, postTitle: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="Optional title for reference"
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-1">Keywords (comma-separated)</label>
            <input
              type="text"
              value={formData.keywords}
              onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="BUILD, WANT, YES"
              required
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-1">CTA Type</label>
            <select
              value={formData.ctaType}
              onChange={(e) => setFormData({ ...formData, ctaType: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
            >
              <option value="link">Link</option>
              <option value="lead_magnet">Lead Magnet</option>
              <option value="booking">Booking</option>
            </select>
          </div>
          <div>
            <label className="block text-gray-300 mb-1">CTA Value</label>
            <input
              type="text"
              value={formData.ctaValue}
              onChange={(e) => setFormData({ ...formData, ctaValue: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="URL or description"
              required
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-1">
              AI Reply Prompt
              <span className="text-gray-500 text-sm ml-2">(Optional)</span>
            </label>
            <textarea
              value={formData.replyStyle}
              onChange={(e) => setFormData({ ...formData, replyStyle: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white h-24 resize-none"
              placeholder="Custom instructions for how the AI should reply to comments. E.g.: 'Be enthusiastic and mention that we offer a free consultation. Keep replies under 50 words.'"
            />
            <p className="text-gray-500 text-xs mt-1">
              Guide the AI on tone, style, and what to include in replies
            </p>
          </div>
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-3 rounded">
              {error}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
