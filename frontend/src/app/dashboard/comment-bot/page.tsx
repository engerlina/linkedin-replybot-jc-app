'use client';

import { useEffect, useState } from 'react';
import { api, WatchedAccount, LinkedInAccount } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatRelativeTime } from '@/lib/utils';

export default function CommentBotPage() {
  useAuth();

  const [watchedAccounts, setWatchedAccounts] = useState<WatchedAccount[]>([]);
  const [accounts, setAccounts] = useState<LinkedInAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [watchedData, accountsData] = await Promise.all([
        api.getWatchedAccounts(),
        api.getAccounts(),
      ]);
      setWatchedAccounts(watchedData);
      setAccounts(accountsData);
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (watched: WatchedAccount) => {
    try {
      await api.updateWatchedAccount(watched.id, { isActive: !watched.isActive });
      loadData();
    } catch (err) {
      console.error('Failed to toggle watched account', err);
    }
  };

  const handleDelete = async (watchedId: string) => {
    if (!confirm('Are you sure you want to stop watching this account?')) return;
    try {
      await api.deleteWatchedAccount(watchedId);
      loadData();
    } catch (err) {
      console.error('Failed to delete watched account', err);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Comment Bot</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
        >
          Watch Account
        </button>
      </div>

      {showForm && (
        <AddWatchedForm
          accounts={accounts}
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            loadData();
          }}
        />
      )}

      <div className="space-y-4">
        {watchedAccounts.length === 0 ? (
          <p className="text-gray-400">No watched accounts yet</p>
        ) : (
          watchedAccounts.map((watched) => (
            <div key={watched.id} className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-white font-medium">{watched.targetName}</h3>
                  <p className="text-gray-400 text-sm">{watched.targetHeadline}</p>
                  <a
                    href={watched.targetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-sm hover:underline"
                  >
                    View Profile
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(watched)}
                    className={`px-3 py-1 rounded text-sm ${
                      watched.isActive
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-600 text-gray-300'
                    }`}
                  >
                    {watched.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => handleDelete(watched.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Check Interval:</span>
                  <p className="text-white mt-1">{watched.checkIntervalMins} minutes</p>
                </div>
                <div>
                  <span className="text-gray-400">Engagements:</span>
                  <p className="text-white mt-1">{watched.totalEngagements}</p>
                </div>
                <div>
                  <span className="text-gray-400">Last Checked:</span>
                  <p className="text-white mt-1">
                    {watched.lastCheckedAt
                      ? formatRelativeTime(watched.lastCheckedAt)
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

function AddWatchedForm({
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
    targetUrl: '',
    targetName: '',
    targetHeadline: '',
    checkIntervalMins: 30,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createWatchedAccount(formData);
      onSuccess();
    } catch (err) {
      console.error('Failed to create watched account', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-white mb-4">Watch Account</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-300 mb-1">Your Account</label>
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
            <label className="block text-gray-300 mb-1">Target Profile URL</label>
            <input
              type="url"
              value={formData.targetUrl}
              onChange={(e) => setFormData({ ...formData, targetUrl: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="https://linkedin.com/in/..."
              required
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-1">Target Name</label>
            <input
              type="text"
              value={formData.targetName}
              onChange={(e) => setFormData({ ...formData, targetName: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="John Doe"
              required
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-1">Target Headline</label>
            <input
              type="text"
              value={formData.targetHeadline}
              onChange={(e) => setFormData({ ...formData, targetHeadline: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="CEO at Company"
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-1">Check Interval (minutes)</label>
            <input
              type="number"
              value={formData.checkIntervalMins}
              onChange={(e) =>
                setFormData({ ...formData, checkIntervalMins: parseInt(e.target.value) })
              }
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              min={15}
              max={120}
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
              {submitting ? 'Adding...' : 'Watch Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
