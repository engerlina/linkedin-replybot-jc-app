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
    try {
      const result = await api.triggerPoll(postId);
      alert(`Found ${result.commentsFound} comments, ${result.matchesFound} matches`);
      loadData();
    } catch (err) {
      console.error('Failed to poll', err);
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
                <div>
                  <h3 className="text-white font-medium">
                    {post.postTitle || 'Untitled Post'}
                  </h3>
                  <a
                    href={post.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-sm hover:underline"
                  >
                    {post.postUrl}
                  </a>
                </div>
                <div className="flex items-center gap-2">
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
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
                  >
                    Poll Now
                  </button>
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Keywords:</span>
                  <div className="text-white mt-1">
                    {post.keywords.map((kw, i) => (
                      <span
                        key={i}
                        className="inline-block bg-gray-700 px-2 py-1 rounded mr-1 mb-1"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">CTA Type:</span>
                  <p className="text-white mt-1">{post.ctaType}</p>
                </div>
                <div>
                  <span className="text-gray-400">Matches:</span>
                  <p className="text-white mt-1">{post.totalMatches}</p>
                </div>
                <div>
                  <span className="text-gray-400">Last Polled:</span>
                  <p className="text-white mt-1">
                    {post.lastPolledAt
                      ? formatRelativeTime(post.lastPolledAt)
                      : 'Never'}
                  </p>
                </div>
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
    accountId: accounts[0]?.id || '',
    postUrl: '',
    postTitle: '',
    keywords: '',
    ctaType: 'link',
    ctaValue: '',
    ctaMessage: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createMonitoredPost({
        ...formData,
        keywords: formData.keywords.split(',').map((k) => k.trim()),
      });
      onSuccess();
    } catch (err) {
      console.error('Failed to create post', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
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
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
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
