'use client';

import { useEffect, useState } from 'react';
import { api, Lead, DMPreviewResponse } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatRelativeTime } from '@/lib/utils';

export default function LeadsPage() {
  useAuth();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState({
    connectionStatus: '',
    dmStatus: '',
  });
  const [activeQueue, setActiveQueue] = useState<'all' | 'connection' | 'dm'>('all');

  // DM Preview Modal state
  const [dmPreviewModal, setDmPreviewModal] = useState<{
    show: boolean;
    leadId: string;
    leadName: string;
    preview: DMPreviewResponse | null;
    editedMessage: string;
    loading: boolean;
    sending: boolean;
  }>({
    show: false,
    leadId: '',
    leadName: '',
    preview: null,
    editedMessage: '',
    loading: false,
    sending: false,
  });

  useEffect(() => {
    loadData();
  }, [filter]);

  const loadData = async () => {
    try {
      const data = await api.getLeads({
        connectionStatus: filter.connectionStatus || undefined,
        dmStatus: filter.dmStatus || undefined,
      });
      setLeads(data);
    } catch (err) {
      console.error('Failed to load leads', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (leadId: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    try {
      await api.deleteLead(leadId);
      loadData();
    } catch (err) {
      console.error('Failed to delete lead', err);
    }
  };

  const handleCheckConnection = async (leadId: string) => {
    setActionLoading((prev) => ({ ...prev, [leadId]: 'check' }));
    try {
      await api.checkLeadConnection(leadId);
      loadData();
    } catch (err) {
      alert('Failed to check connection: ' + (err as Error).message);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[leadId];
        return next;
      });
    }
  };

  const handleSendConnection = async (leadId: string) => {
    setActionLoading((prev) => ({ ...prev, [leadId]: 'connect' }));
    try {
      const result = await api.sendLeadConnection(leadId);
      alert(result.message);
      loadData();
    } catch (err) {
      alert('Failed to send connection: ' + (err as Error).message);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[leadId];
        return next;
      });
    }
  };

  const handlePreviewDM = async (lead: Lead) => {
    setDmPreviewModal({
      show: true,
      leadId: lead.id,
      leadName: lead.name,
      preview: null,
      editedMessage: '',
      loading: true,
      sending: false,
    });

    try {
      const preview = await api.previewLeadDM(lead.id);
      setDmPreviewModal((prev) => ({
        ...prev,
        preview,
        editedMessage: preview.message,
        loading: false,
      }));
    } catch (err) {
      alert('Failed to generate DM preview: ' + (err as Error).message);
      setDmPreviewModal((prev) => ({ ...prev, show: false, loading: false }));
    }
  };

  const handleSendDMFromModal = async () => {
    const { leadId, editedMessage } = dmPreviewModal;
    setDmPreviewModal((prev) => ({ ...prev, sending: true }));

    try {
      // First queue the DM with the edited message (if edited)
      if (dmPreviewModal.preview && editedMessage !== dmPreviewModal.preview.message) {
        await api.queueLeadDM(leadId, editedMessage);
      }
      // Then send it
      const result = await api.sendLeadDM(leadId);
      alert(result.message);
      setDmPreviewModal((prev) => ({ ...prev, show: false, sending: false }));
      loadData();
    } catch (err) {
      alert('Failed to send DM: ' + (err as Error).message);
      setDmPreviewModal((prev) => ({ ...prev, sending: false }));
    }
  };

  const handleSendDM = async (leadId: string) => {
    // Find the lead and open preview modal
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      handlePreviewDM(lead);
    }
  };

  const handleMarkSent = async (leadId: string) => {
    setActionLoading((prev) => ({ ...prev, [leadId]: 'mark' }));
    try {
      await api.markLeadDMSent(leadId);
      loadData();
    } catch (err) {
      alert('Failed to mark as sent: ' + (err as Error).message);
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[leadId];
        return next;
      });
    }
  };

  const setQueue = (queue: 'all' | 'connection' | 'dm') => {
    setActiveQueue(queue);
    if (queue === 'all') {
      setFilter({ connectionStatus: '', dmStatus: '' });
    } else if (queue === 'connection') {
      setFilter({ connectionStatus: 'not_connected', dmStatus: '' });
    } else if (queue === 'dm') {
      setFilter({ connectionStatus: 'connected', dmStatus: 'not_sent' });
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Leads</h1>

      {/* Quick Queue Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setQueue('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeQueue === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          All Leads
        </button>
        <button
          onClick={() => setQueue('connection')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeQueue === 'connection'
              ? 'bg-yellow-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Connection Queue
        </button>
        <button
          onClick={() => setQueue('dm')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeQueue === 'dm'
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          DM Queue
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={filter.connectionStatus}
          onChange={(e) => {
            setActiveQueue('all');
            setFilter({ ...filter, connectionStatus: e.target.value });
          }}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
        >
          <option value="">All Connection Status</option>
          <option value="connected">Connected</option>
          <option value="pending">Pending</option>
          <option value="not_connected">Not Connected</option>
        </select>
        <select
          value={filter.dmStatus}
          onChange={(e) => {
            setActiveQueue('all');
            setFilter({ ...filter, dmStatus: e.target.value });
          }}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
        >
          <option value="">All DM Status</option>
          <option value="not_sent">Not Sent</option>
          <option value="sent">Sent</option>
          <option value="replied">Replied</option>
        </select>
      </div>

      {/* Leads Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-700 text-gray-300 text-sm">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Headline</th>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Connection</th>
              <th className="px-4 py-3 text-left">DM Status</th>
              <th className="px-4 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No leads found
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr key={lead.id} className="border-t border-gray-700 text-sm">
                  <td className="px-4 py-3">
                    {lead.linkedInUrl ? (
                      <a
                        href={lead.linkedInUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline"
                      >
                        {lead.name}
                      </a>
                    ) : (
                      <span className="text-gray-400" title="Missing LinkedIn URL">
                        {lead.name} <span className="text-yellow-500 text-xs">(No URL)</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {lead.headline || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {lead.sourceKeyword && (
                      <span className="bg-gray-700 px-2 py-1 rounded text-xs text-white">
                        {lead.sourceKeyword}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.connectionStatus} type="connection" />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.dmStatus} type="dm" />
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {formatRelativeTime(lead.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* Check connection status */}
                      <button
                        onClick={() => handleCheckConnection(lead.id)}
                        disabled={!!actionLoading[lead.id] || !lead.linkedInUrl}
                        title={lead.linkedInUrl ? "Check connection status" : "No LinkedIn URL - cannot check connection"}
                        className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {actionLoading[lead.id] === 'check' ? (
                          <LoadingSpinner />
                        ) : (
                          <RefreshIcon />
                        )}
                      </button>

                      {/* Send connection request */}
                      {lead.connectionStatus !== 'connected' && (
                        <button
                          onClick={() => handleSendConnection(lead.id)}
                          disabled={!!actionLoading[lead.id] || !lead.linkedInUrl}
                          title={lead.linkedInUrl ? "Send connection request" : "No LinkedIn URL - cannot send connection"}
                          className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {actionLoading[lead.id] === 'connect' ? (
                            <LoadingSpinner />
                          ) : (
                            <ConnectIcon />
                          )}
                        </button>
                      )}

                      {/* Send DM - always show but with different states */}
                      {lead.dmStatus !== 'sent' && (
                        <button
                          onClick={() => handleSendDM(lead.id)}
                          disabled={!!actionLoading[lead.id] || !lead.linkedInUrl || lead.connectionStatus !== 'connected'}
                          title={
                            !lead.linkedInUrl
                              ? "No LinkedIn URL"
                              : lead.connectionStatus !== 'connected'
                              ? `Cannot DM - ${lead.connectionStatus === 'unknown' ? 'Check connection first' : 'Not connected'}`
                              : "Preview and send DM"
                          }
                          className={`p-1.5 rounded text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                            lead.connectionStatus === 'connected'
                              ? 'bg-green-600 hover:bg-green-500'
                              : 'bg-gray-600'
                          }`}
                        >
                          {actionLoading[lead.id] === 'dm' ? (
                            <LoadingSpinner />
                          ) : (
                            <MessageIcon />
                          )}
                        </button>
                      )}
                      {lead.dmStatus === 'sent' && (
                        <span className="text-green-400 text-xs px-2">DM Sent</span>
                      )}

                      {/* Mark as sent manually */}
                      {lead.dmStatus !== 'sent' && (
                        <button
                          onClick={() => handleMarkSent(lead.id)}
                          disabled={!!actionLoading[lead.id]}
                          title="Mark DM as sent"
                          className="p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white disabled:opacity-50 transition-colors"
                        >
                          {actionLoading[lead.id] === 'mark' ? (
                            <LoadingSpinner />
                          ) : (
                            <CheckIcon />
                          )}
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(lead.id)}
                        title="Delete lead"
                        className="p-1.5 rounded bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white transition-colors"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* DM Preview Modal */}
      {dmPreviewModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg mx-4">
            <h2 className="text-xl font-bold text-white mb-4">
              Send DM to {dmPreviewModal.leadName}
            </h2>

            {dmPreviewModal.loading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
                <span className="ml-2 text-gray-400">Generating personalized message...</span>
              </div>
            ) : (
              <>
                {dmPreviewModal.preview && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-gray-400 text-sm">Source:</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        dmPreviewModal.preview.source === 'ai_generated'
                          ? 'bg-purple-600 text-white'
                          : dmPreviewModal.preview.source === 'template'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-600 text-white'
                      }`}>
                        {dmPreviewModal.preview.source === 'ai_generated'
                          ? 'AI Generated'
                          : dmPreviewModal.preview.source === 'template'
                          ? 'Template'
                          : 'Pending'}
                      </span>
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-gray-300 mb-2">Message (edit if needed):</label>
                  <textarea
                    value={dmPreviewModal.editedMessage}
                    onChange={(e) =>
                      setDmPreviewModal((prev) => ({
                        ...prev,
                        editedMessage: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white h-40 resize-none"
                    placeholder="Enter your message..."
                  />
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() =>
                      setDmPreviewModal((prev) => ({ ...prev, show: false }))
                    }
                    className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500"
                    disabled={dmPreviewModal.sending}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendDMFromModal}
                    disabled={
                      dmPreviewModal.sending || !dmPreviewModal.editedMessage.trim()
                    }
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 disabled:opacity-50 flex items-center gap-2"
                  >
                    {dmPreviewModal.sending ? (
                      <>
                        <LoadingSpinner />
                        Sending...
                      </>
                    ) : (
                      <>
                        <MessageIcon />
                        Send DM
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, type }: { status: string; type: 'connection' | 'dm' }) {
  const colors = {
    connection: {
      connected: 'bg-green-600',
      pending: 'bg-yellow-600',
      not_connected: 'bg-gray-600',
      unknown: 'bg-gray-600',
    },
    dm: {
      sent: 'bg-green-600',
      replied: 'bg-blue-600',
      not_sent: 'bg-gray-600',
      queued: 'bg-yellow-600',
    },
  };

  const colorMap = colors[type];
  const color = colorMap[status as keyof typeof colorMap] || 'bg-gray-600';

  return (
    <span className={`${color} px-2 py-1 rounded text-xs text-white capitalize`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// Icon Components
function LoadingSpinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function ConnectIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
