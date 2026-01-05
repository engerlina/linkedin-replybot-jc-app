'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export function useAuth() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = api.getToken();
    if (!token) {
      router.push('/');
      return;
    }

    try {
      await api.checkAuth();
      setIsAuthenticated(true);
    } catch {
      api.clearToken();
      router.push('/');
    }
  };

  return { isAuthenticated };
}
