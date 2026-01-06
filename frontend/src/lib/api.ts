const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('auth_token');
    }
    return null;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.clearToken();
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      // Handle FastAPI validation errors (422) which return detail as array
      let message = 'Request failed';
      if (typeof error.detail === 'string') {
        message = error.detail;
      } else if (Array.isArray(error.detail) && error.detail.length > 0) {
        // FastAPI validation error format: [{loc: [...], msg: "...", type: "..."}]
        message = error.detail.map((e: { loc?: string[]; msg: string }) => {
          const field = e.loc ? e.loc[e.loc.length - 1] : '';
          return field ? `${field}: ${e.msg}` : e.msg;
        }).join(', ');
      }
      throw new Error(message);
    }

    return response.json();
  }

  // Auth
  async login(password: string) {
    const data = await this.request<{ token: string; expiresAt: string }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ password }) }
    );
    this.setToken(data.token);
    return data;
  }

  async logout() {
    await this.request('/api/auth/logout', { method: 'POST' });
    this.clearToken();
  }

  async checkAuth() {
    return this.request<{ authenticated: boolean }>('/api/auth/me');
  }

  // Stats
  async getStats() {
    return this.request<DashboardStats>('/api/stats');
  }

  // Accounts
  async getAccounts() {
    return this.request<LinkedInAccount[]>('/api/accounts');
  }

  async createAccount(data: CreateAccountRequest) {
    return this.request<LinkedInAccount>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAccount(id: string, data: Partial<LinkedInAccount>) {
    return this.request<LinkedInAccount>(`/api/accounts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteAccount(id: string) {
    return this.request(`/api/accounts/${id}`, { method: 'DELETE' });
  }

  // Reply Bot
  async getMonitoredPosts(accountId?: string) {
    const query = accountId ? `?accountId=${accountId}` : '';
    return this.request<MonitoredPost[]>(`/api/reply-bot/posts${query}`);
  }

  async createMonitoredPost(data: CreatePostRequest) {
    return this.request<MonitoredPost>('/api/reply-bot/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateMonitoredPost(id: string, data: UpdatePostRequest) {
    return this.request<MonitoredPost>(`/api/reply-bot/posts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteMonitoredPost(id: string) {
    return this.request(`/api/reply-bot/posts/${id}`, { method: 'DELETE' });
  }

  async triggerPoll(postId: string) {
    return this.request<PollResult>(`/api/reply-bot/posts/${postId}/poll`, {
      method: 'POST',
    });
  }

  async getPostComments(postId: string, matchesOnly: boolean = false) {
    const query = matchesOnly ? '?matchesOnly=true' : '';
    return this.request<ProcessedComment[]>(`/api/reply-bot/posts/${postId}/comments${query}`);
  }

  // Comment Bot
  async getWatchedAccounts(accountId?: string) {
    const query = accountId ? `?accountId=${accountId}` : '';
    return this.request<WatchedAccount[]>(`/api/comment-bot/watched${query}`);
  }

  async createWatchedAccount(data: CreateWatchedRequest) {
    return this.request<WatchedAccount>('/api/comment-bot/watched', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWatchedAccount(id: string, data: Partial<WatchedAccount>) {
    return this.request<WatchedAccount>(`/api/comment-bot/watched/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteWatchedAccount(id: string) {
    return this.request(`/api/comment-bot/watched/${id}`, { method: 'DELETE' });
  }

  async getEngagements(watchedAccountId: string) {
    return this.request<Engagement[]>(`/api/comment-bot/watched/${watchedAccountId}/engagements`);
  }

  // Leads
  async getLeads(filters?: LeadFilters) {
    const params = new URLSearchParams();
    if (filters?.connectionStatus) params.set('connectionStatus', filters.connectionStatus);
    if (filters?.dmStatus) params.set('dmStatus', filters.dmStatus);
    if (filters?.accountId) params.set('accountId', filters.accountId);
    const query = params.toString() ? `?${params}` : '';
    return this.request<Lead[]>(`/api/leads${query}`);
  }

  async updateLead(id: string, data: UpdateLeadRequest) {
    return this.request<Lead>(`/api/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteLead(id: string) {
    return this.request(`/api/leads/${id}`, { method: 'DELETE' });
  }

  // Logs
  async getLogs(limit = 50) {
    return this.request<ActivityLog[]>(`/api/logs?limit=${limit}`);
  }

  // Settings
  async getSettings() {
    return this.request<Settings>('/api/stats/settings');
  }

  async updateSettings(data: Partial<Settings>) {
    return this.request<Settings>('/api/stats/settings', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();

// Types
export interface DashboardStats {
  totalLeads: number;
  leadsToday: number;
  commentsToday: number;
  connectionsToday: number;
  dmsSentToday: number;
  activeMonitoredPosts: number;
  activeWatchedAccounts: number;
}

export interface LinkedInAccount {
  id: string;
  name: string;
  profileUrl: string;
  identificationToken: string;  // LinkedAPI identification-token (per LinkedIn account)
  isActive: boolean;
  voiceTone: string;
  voiceTopics: string[];
  sampleComments: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountRequest {
  name: string;
  identificationToken: string;  // LinkedAPI identification-token (per LinkedIn account)
  profileUrl?: string;
  voiceTone?: string;
  voiceTopics?: string[];
  sampleComments?: string[];
}

export interface MonitoredPost {
  id: string;
  accountId: string;
  postUrl: string;
  postTitle: string | null;
  keywords: string[];
  ctaType: string;
  ctaValue: string;
  ctaMessage: string | null;
  replyStyle: string | null;
  isActive: boolean;
  totalComments: number;
  totalMatches: number;
  totalLeads: number;
  lastPolledAt: string | null;
  createdAt: string;
  updatedAt: string;
  account?: LinkedInAccount;
}

export interface CreatePostRequest {
  accountId: string;
  postUrl: string;
  postTitle?: string;
  keywords: string[];
  ctaType: string;
  ctaValue: string;
  ctaMessage?: string;
  replyStyle?: string;
}

export interface UpdatePostRequest {
  postTitle?: string;
  keywords?: string[];
  ctaType?: string;
  ctaValue?: string;
  ctaMessage?: string;
  replyStyle?: string;
  isActive?: boolean;
}

export interface ProcessedComment {
  id: string;
  postId: string;
  commenterUrl: string;
  commenterName: string;
  commenterHeadline: string | null;
  commentText: string;
  commentTime: string;
  matchedKeyword: string | null;
  wasMatch: boolean;
  repliedAt: string | null;
  replyText: string | null;
  createdAt: string;
}

export interface PollResult {
  commentsFound: number;
  matchesFound: number;
}

export interface WatchedAccount {
  id: string;
  accountId: string;
  targetUrl: string;
  targetName: string;
  targetHeadline: string | null;
  isActive: boolean;
  commentStyle: string | null;
  topicsToEngage: string[];
  checkIntervalMins: number;
  totalEngagements: number;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
  account?: LinkedInAccount;
}

export interface CreateWatchedRequest {
  accountId: string;
  targetUrl: string;
  targetName: string;
  targetHeadline?: string;
  commentStyle?: string;
  topicsToEngage?: string[];
  checkIntervalMins?: number;
}

export interface Engagement {
  id: string;
  watchedAccountId: string;
  postUrl: string;
  postText: string | null;
  postTime: string | null;
  reacted: boolean;
  reactionType: string | null;
  commented: boolean;
  commentText: string | null;
  engagedAt: string;
}

export interface Lead {
  id: string;
  accountId: string;
  postId: string | null;
  name: string;
  linkedInUrl: string;
  headline: string | null;
  sourceKeyword: string | null;
  sourcePostUrl: string | null;
  connectionStatus: string;
  connectionSentAt: string | null;
  connectedAt: string | null;
  dmStatus: string;
  dmSentAt: string | null;
  dmText: string | null;
  ctaSent: boolean;
  ctaSentAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  account?: LinkedInAccount;
  post?: MonitoredPost;
}

export interface LeadFilters {
  connectionStatus?: string;
  dmStatus?: string;
  accountId?: string;
}

export interface UpdateLeadRequest {
  notes?: string;
  connectionStatus?: string;
  dmStatus?: string;
}

export interface ActivityLog {
  id: string;
  accountId: string | null;
  action: string;
  status: string;
  details: Record<string, unknown>;
  createdAt: string;
  account?: LinkedInAccount;
}

export interface Settings {
  id: string;
  maxDailyComments: number;
  maxDailyConnections: number;
  maxDailyMessages: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  replyBotIntervalMins: number;
  commentBotIntervalMins: number;
  connectionCheckMins: number;
  replyBotEnabled: boolean;
  commentBotEnabled: boolean;
  updatedAt: string;
}
