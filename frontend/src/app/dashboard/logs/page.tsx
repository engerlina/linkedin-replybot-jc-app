'use client';

import { useEffect, useState } from 'react';
import { api, ActivityLog } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatDateTime, formatAction } from '@/lib/utils';

export default function LogsPage() {
  useAuth();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const data = await api.getLogs(100);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load logs', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Activity Logs</h1>

      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-700 text-gray-300 text-sm">
              <th className="px-4 py-3 text-left">Time</th>
              <th className="px-4 py-3 text-left">Action</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  No activity logs yet
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-t border-gray-700 text-sm">
                  <td className="px-4 py-3 text-gray-400">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-white">
                    {formatAction(log.action)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        log.status === 'success'
                          ? 'bg-green-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {log.details && Object.keys(log.details).length > 0 ? (
                      <details className="cursor-pointer">
                        <summary className="text-blue-400 hover:underline">
                          View Details
                        </summary>
                        <pre className="mt-2 text-xs bg-gray-900 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      '-'
                    )}
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
