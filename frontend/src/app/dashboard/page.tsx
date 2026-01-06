'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, DashboardStats, ActivityLog } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatRelativeTime, formatAction } from '@/lib/utils';

export default function DashboardPage() {
  useAuth(); // Redirect if not authenticated

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [statsData, logsData] = await Promise.all([
        api.getStats(),
        api.getLogs(20),
      ]);
      setStats(statsData);
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Leads Today" value={stats?.leadsToday || 0} />
        <StatCard title="Comments Today" value={stats?.commentsToday || 0} />
        <StatCard title="Connections Sent" value={stats?.connectionsToday || 0} />
        <StatCard title="DMs Sent" value={stats?.dmsSentToday || 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Automations */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Active Automations</h2>
          <div className="space-y-3">
            <div className="flex justify-between text-gray-300">
              <span>Monitored Posts (Reply Bot)</span>
              <span className="font-medium">{stats?.activeMonitoredPosts || 0}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Watched Accounts (Comment Bot)</span>
              <span className="font-medium">{stats?.activeWatchedAccounts || 0}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Total Leads</span>
              <span className="font-medium">{stats?.totalLeads || 0}</span>
            </div>
          </div>

          {/* Pending Items */}
          {(stats?.pendingReplies || stats?.pendingComments) ? (
            <div className="mt-6 pt-4 border-t border-gray-700">
              <h3 className="text-sm font-medium text-yellow-400 mb-3">Awaiting Review</h3>
              <div className="space-y-2">
                {stats?.pendingReplies > 0 && (
                  <Link
                    href="/dashboard/review-queue"
                    className="flex justify-between items-center text-gray-300 hover:text-white p-2 rounded hover:bg-gray-700"
                  >
                    <span>Pending Replies</span>
                    <span className="bg-yellow-600 px-2 py-1 rounded text-sm font-medium">
                      {stats.pendingReplies}
                    </span>
                  </Link>
                )}
                {stats?.pendingComments > 0 && (
                  <div className="flex justify-between items-center text-gray-300 p-2">
                    <span>Pending Comments</span>
                    <span className="bg-yellow-600 px-2 py-1 rounded text-sm font-medium">
                      {stats.pendingComments}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-400 text-sm">No recent activity</p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between text-sm py-2 border-b border-gray-700"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        log.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="text-gray-300">{formatAction(log.action)}</span>
                  </div>
                  <span className="text-gray-500 text-xs">
                    {formatRelativeTime(log.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <p className="text-gray-400 text-sm">{title}</p>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}
