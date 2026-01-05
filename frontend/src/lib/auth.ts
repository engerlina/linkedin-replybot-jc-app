import { api } from './api';

export async function checkAuthentication(): Promise<boolean> {
  const token = api.getToken();
  if (!token) return false;

  try {
    await api.checkAuth();
    return true;
  } catch {
    api.clearToken();
    return false;
  }
}

export function isAuthenticated(): boolean {
  return !!api.getToken();
}
