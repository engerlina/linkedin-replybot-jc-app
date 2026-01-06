'use client';

import { useEffect, useState } from 'react';
import { api, PendingReply } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatRelativeTime } from '@/lib/utils';

export default function ReviewQueuePage() {
  useAuth();

  const [pendingReplies, setPendingReplies] = useState<PendingReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const loadData = async () => {
    try {
      const data = await api.getPendingReplies(statusFilter);
      setPendingReplies(data);
    } catch (err) {
      console.error('Failed to load pending replies', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await api.approvePendingReply(id);
      loadData();
    } catch (err) {
      console.error('Failed to approve reply', err);
      alert(err instanceof Error ? err.message : 'Failed to approve reply');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      await api.rejectPendingReply(id);
      loadData();
    } catch (err) {
      console.error('Failed to reject reply', err);
      alert(err instanceof Error ? err.message : 'Failed to reject reply');
    } finally {
      setProcessingId(null);
    }
  };

  const handleEdit = (reply: PendingReply) => {
    setEditingId(reply.id);
    setEditText(reply.editedText || reply.generatedReply);
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await api.updatePendingReply(id, { editedText: editText });
      setEditingId(null);
      loadData();
    } catch (err) {
      console.error('Failed to save edit', err);
      alert('Failed to save edit');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this pending reply?')) return;
    try {
      await api.deletePendingReply(id);
      loadData();
    } catch (err) {
      console.error('Failed to delete reply', err);
    }
  };

  if (loading) {
    return <div className="p-8 text-white">Loading...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Review Queue</h1>
        <div className="flex gap-2">
          {['pending', 'sent', 'rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded capitalize ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {pendingReplies.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">
            {statusFilter === 'pending'
              ? 'No pending replies to review'
              : `No ${statusFilter} replies`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingReplies.map((reply) => (
            <div key={reply.id} className="bg-gray-800 rounded-lg p-6">
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <a
                    href={reply.commenterUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white font-medium hover:text-blue-400 hover:underline"
                  >
                    {reply.commenterName}
                  </a>
                  <p className="text-gray-400 text-sm">{reply.commenterHeadline}</p>
                  <p className="text-gray-500 text-xs mt-1">
                    {formatRelativeTime(reply.createdAt)}
                    {reply.matchedKeyword && (
                      <span className="ml-2 text-blue-400">
                        Matched: {reply.matchedKeyword}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      reply.status === 'pending'
                        ? 'bg-yellow-600'
                        : reply.status === 'sent'
                        ? 'bg-green-600'
                        : 'bg-red-600'
                    } text-white capitalize`}
                  >
                    {reply.status}
                  </span>
                </div>
              </div>

              {/* Post info */}
              {reply.post && (
                <div className="bg-gray-900 rounded p-3 mb-4">
                  <p className="text-gray-400 text-xs mb-1">On post:</p>
                  <a
                    href={reply.post.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 text-sm hover:underline"
                  >
                    {reply.post.postTitle || reply.post.postUrl}
                  </a>
                </div>
              )}

              {/* Original comment */}
              <div className="mb-4">
                <p className="text-gray-400 text-xs mb-1">Original comment:</p>
                <div className="bg-gray-900 rounded p-3">
                  <p className="text-gray-300 text-sm">{reply.commentText}</p>
                </div>
              </div>

              {/* Generated/edited reply */}
              <div className="mb-4">
                <p className="text-gray-400 text-xs mb-1">
                  {reply.editedText ? 'Edited reply:' : 'Generated reply:'}
                </p>
                {editingId === reply.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm h-32 resize-y"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 bg-gray-600 text-white rounded text-sm"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(reply.id)}
                        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-900 rounded p-3 border border-gray-700">
                    <p className="text-white text-sm whitespace-pre-wrap">
                      {reply.editedText || reply.generatedReply}
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              {reply.status === 'pending' && editingId !== reply.id && (
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => handleEdit(reply)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleReject(reply.id)}
                    disabled={processingId === reply.id}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(reply.id)}
                    disabled={processingId === reply.id}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm disabled:opacity-50"
                  >
                    {processingId === reply.id ? 'Sending...' : 'Approve & Send'}
                  </button>
                </div>
              )}

              {reply.status !== 'pending' && (
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => handleDelete(reply.id)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
