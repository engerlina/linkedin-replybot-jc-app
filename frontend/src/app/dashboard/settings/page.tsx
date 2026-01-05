'use client';

import { useEffect, useState } from 'react';
import { api, Settings, LinkedInAccount } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  useAuth();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [accounts, setAccounts] = useState<LinkedInAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsData, accountsData] = await Promise.all([
        api.getSettings(),
        api.getAccounts(),
      ]);
      setSettings(settingsData);
      setAccounts(accountsData);
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await api.updateSettings(settings);
      alert('Settings saved successfully');
    } catch (err) {
      console.error('Failed to save settings', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (!confirm('Are you sure? This will delete all associated data.')) return;
    try {
      await api.deleteAccount(accountId);
      loadData();
    } catch (err) {
      console.error('Failed to delete account', err);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      <div className="space-y-8">
        {/* LinkedIn Accounts */}
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-white">LinkedIn Accounts</h2>
            <button
              onClick={() => setShowAccountForm(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
            >
              Add Account
            </button>
          </div>

          {showAccountForm && (
            <AddAccountForm
              onClose={() => setShowAccountForm(false)}
              onSuccess={() => {
                setShowAccountForm(false);
                loadData();
              }}
            />
          )}

          <div className="space-y-3">
            {accounts.length === 0 ? (
              <p className="text-gray-400">No accounts configured</p>
            ) : (
              accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex justify-between items-center bg-gray-700 rounded p-4"
                >
                  <div>
                    <p className="text-white font-medium">{account.name}</p>
                    <p className="text-gray-400 text-sm">{account.profileUrl}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        account.isActive ? 'bg-green-600' : 'bg-gray-600'
                      } text-white`}
                    >
                      {account.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => handleDeleteAccount(account.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Rate Limits */}
        {settings && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Rate Limits</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-gray-300 mb-1">Max Daily Comments</label>
                <input
                  type="number"
                  value={settings.maxDailyComments}
                  onChange={(e) =>
                    setSettings({ ...settings, maxDailyComments: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Max Daily Connections</label>
                <input
                  type="number"
                  value={settings.maxDailyConnections}
                  onChange={(e) =>
                    setSettings({ ...settings, maxDailyConnections: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Max Daily Messages</label>
                <input
                  type="number"
                  value={settings.maxDailyMessages}
                  onChange={(e) =>
                    setSettings({ ...settings, maxDailyMessages: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* Scheduler Settings */}
        {settings && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Scheduler</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-gray-300 mb-1">Reply Bot Interval (mins)</label>
                <input
                  type="number"
                  value={settings.replyBotIntervalMins}
                  onChange={(e) =>
                    setSettings({ ...settings, replyBotIntervalMins: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Comment Bot Interval (mins)</label>
                <input
                  type="number"
                  value={settings.commentBotIntervalMins}
                  onChange={(e) =>
                    setSettings({ ...settings, commentBotIntervalMins: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-gray-300">
                <input
                  type="checkbox"
                  checked={settings.replyBotEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, replyBotEnabled: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                Reply Bot Enabled
              </label>
              <label className="flex items-center gap-2 text-gray-300">
                <input
                  type="checkbox"
                  checked={settings.commentBotEnabled}
                  onChange={(e) =>
                    setSettings({ ...settings, commentBotEnabled: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                Comment Bot Enabled
              </label>
            </div>
          </div>
        )}

        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

function AddAccountForm({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: '',
    profileUrl: '',
    linkedApiToken: '',
    voiceTone: 'professional',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createAccount(formData);
      onSuccess();
    } catch (err) {
      console.error('Failed to create account', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-white mb-4">Add LinkedIn Account</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-300 mb-1">Display Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="My LinkedIn Account"
              required
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-1">Profile URL</label>
            <input
              type="url"
              value={formData.profileUrl}
              onChange={(e) => setFormData({ ...formData, profileUrl: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="https://linkedin.com/in/..."
              required
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-1">LinkedAPI Token</label>
            <input
              type="password"
              value={formData.linkedApiToken}
              onChange={(e) => setFormData({ ...formData, linkedApiToken: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="Your LinkedAPI account token"
              required
            />
          </div>
          <div>
            <label className="block text-gray-300 mb-1">Voice Tone</label>
            <select
              value={formData.voiceTone}
              onChange={(e) => setFormData({ ...formData, voiceTone: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="friendly">Friendly</option>
            </select>
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
              {submitting ? 'Adding...' : 'Add Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
