'use client';

import { useEffect, useState } from 'react';
import { api, Settings, LinkedInAccount, CookieStatus } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  useAuth();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [accounts, setAccounts] = useState<LinkedInAccount[]>([]);
  const [cookieStatuses, setCookieStatuses] = useState<CookieStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [validatingAccountId, setValidatingAccountId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsData, accountsData, cookieData] = await Promise.all([
        api.getSettings(),
        api.getAccounts(),
        api.getCookieStatus(),
      ]);
      setSettings(settingsData);
      setAccounts(accountsData);
      setCookieStatuses(cookieData.accounts || []);
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  };

  const getCookieStatusForAccount = (accountId: string): CookieStatus | undefined => {
    return cookieStatuses.find(cs => cs.accountId === accountId);
  };

  const handleValidateCookies = async (accountId: string) => {
    setValidatingAccountId(accountId);
    try {
      const result = await api.validateCookies(accountId);
      if (result.success) {
        alert(`Cookies valid! Connected as: ${result.profileName || result.publicIdentifier || 'Unknown'}`);
      } else {
        alert(`Validation failed: ${result.message || 'Unknown error'}`);
      }
      loadData();
    } catch (err) {
      console.error('Validation failed', err);
      alert(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setValidatingAccountId(null);
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
              accounts.map((account) => {
                const cookieStatus = getCookieStatusForAccount(account.id);
                return (
                  <div
                    key={account.id}
                    className="bg-gray-700 rounded p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-white font-medium">{account.name}</p>
                        {/* Cookie Sync Status */}
                        <div className="mt-2 space-y-1">
                          {cookieStatus?.hasCookies ? (
                            <>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-block w-2 h-2 rounded-full ${
                                    cookieStatus.isValid ? 'bg-green-500' : 'bg-red-500'
                                  }`}
                                />
                                <span className={`text-sm ${cookieStatus.isValid ? 'text-green-400' : 'text-red-400'}`}>
                                  {cookieStatus.isValid ? 'Cookies synced & valid' : 'Cookies expired'}
                                </span>
                              </div>
                              {cookieStatus.capturedAt && (
                                <p className="text-gray-400 text-xs">
                                  Last synced: {new Date(cookieStatus.capturedAt).toLocaleString()}
                                </p>
                              )}
                              {cookieStatus.lastError && (
                                <p className="text-red-400 text-xs">
                                  Error: {cookieStatus.lastError}
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
                              <span className="text-yellow-400 text-sm">
                                No cookies synced - use Chrome extension
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            account.isActive ? 'bg-green-600' : 'bg-gray-600'
                          } text-white`}
                        >
                          {account.isActive ? 'Active' : 'Inactive'}
                        </span>
                        {cookieStatus?.hasCookies && (
                          <button
                            onClick={() => handleValidateCookies(account.id)}
                            disabled={validatingAccountId === account.id}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs"
                          >
                            {validatingAccountId === account.id ? 'Testing...' : 'Test'}
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteAccount(account.id)}
                          className="text-red-400 hover:text-red-300 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Chrome Extension Instructions */}
          <div className="mt-4 p-4 bg-gray-700/50 rounded border border-gray-600">
            <h3 className="text-white font-medium mb-2">How to Sync LinkedIn Cookies</h3>
            <ol className="text-gray-400 text-sm space-y-1 list-decimal list-inside">
              <li>Install the LinkedIn Reply Bot Chrome extension</li>
              <li>Log in to LinkedIn in your browser</li>
              <li>Click the extension icon and authenticate with your dashboard password</li>
              <li>Cookies will automatically sync when you&apos;re logged into LinkedIn</li>
            </ol>
            <p className="text-gray-500 text-xs mt-2">
              The extension captures your LinkedIn session cookies to enable automated actions.
              Cookies are re-synced automatically every 5 minutes while logged in.
            </p>
          </div>
        </div>

        {/* AI DM Generation */}
        {settings && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-white mb-4">AI DM Generation</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 mb-1">About You / Your Business</label>
                <textarea
                  value={settings.dmUserContext || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, dmUserContext: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white h-24"
                  placeholder="I'm a startup founder helping entrepreneurs scale their SaaS businesses. I offer consulting services and have a free course on product-led growth..."
                />
                <p className="text-gray-500 text-xs mt-1">
                  Context about you and your business that the AI will use to craft personalized DMs.
                </p>
              </div>
              <div>
                <label className="block text-gray-300 mb-1">DM Generation Instructions</label>
                <textarea
                  value={settings.dmAiPrompt || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, dmAiPrompt: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white h-32"
                  placeholder="Write a friendly, personalized DM to start a conversation. Mention their comment if relevant. Keep it short (2-3 sentences). End with a soft call-to-action like asking if they'd be open to chatting..."
                />
                <p className="text-gray-500 text-xs mt-1">
                  Instructions for how the AI should write DMs. The AI will have access to the lead&apos;s name, headline, and the post they commented on.
                </p>
              </div>
            </div>
          </div>
        )}

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
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      // Create account without token - cookies will be synced via extension
      await api.createAccount({ ...formData, identificationToken: '' });
      onSuccess();
    } catch (err) {
      console.error('Failed to create account', err);
      setError(err instanceof Error ? err.message : 'Failed to add account');
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
            <label className="block text-gray-300 mb-1">Account Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
              placeholder="My LinkedIn Account"
              required
            />
            <p className="text-gray-500 text-xs mt-1">A friendly name to identify this account</p>
          </div>
          <div className="bg-gray-700/50 rounded p-3">
            <p className="text-gray-300 text-sm mb-2">Next Steps:</p>
            <ol className="text-gray-400 text-xs space-y-1 list-decimal list-inside">
              <li>Create this account</li>
              <li>Install the Chrome extension</li>
              <li>Log into LinkedIn in your browser</li>
              <li>Click the extension to sync your session cookies</li>
            </ol>
          </div>
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
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
              {submitting ? 'Adding...' : 'Add Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
