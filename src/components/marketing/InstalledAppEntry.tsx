'use client';

import { useEffect } from 'react';

export default function InstalledAppEntry() {
  useEffect(() => {
    // Compatibility with already distributed Tauri builds, whose user agent
    // predates AetherDesktop. Standalone also covers installed web apps.
    const installed = '__TAURI_INTERNALS__' in window || '__TAURI__' in window
      || window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (installed && window.location.pathname === '/') window.location.replace('/dashboard');
  }, []);
  return null;
}
