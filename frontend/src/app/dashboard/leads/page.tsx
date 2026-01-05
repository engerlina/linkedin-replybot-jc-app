'use client';

import { useEffect, useState } from 'react';
import { api, Lead } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatRelativeTime } from '@/lib/utils';

export default function LeadsPage() {
  useAuth();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    connectionStatus: '',
    dmStatus: '',
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

  if (loading) {
    return <div className="p-8 text-white">Loading...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Leads</h1>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <select
          value={filter.connectionStatus}
          onChange={(e) => setFilter({ ...filter, connectionStatus: e.target.value })}
          className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
        >
          <option value="">All Connection Status</option>
          <option value="connected">Connected</option>
          <option value="pending">Pending</option>
          <option value="not_connected">Not Connected</option>
        </select>
        <select
          value={filter.dmStatus}
          onChange={(e) => setFilter({ ...filter, dmStatus: e.target.value })}
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
                    <a
                      href={lead.linkedInUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {lead.name}
                    </a>
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
                    <button
                      onClick={() => handleDelete(lead.id)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
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
