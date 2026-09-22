"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { captureException } from '@/lib/observability';

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      router.push('/login');
    } catch (e) {
      captureException(e, { module: 'auth', extra: { reason: 'logout-button' } });
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={handleLogout} disabled={loading} className="px-3 py-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">
      {loading ? 'Saliendo...' : 'Cerrar sesión'}
    </button>
  );
}
