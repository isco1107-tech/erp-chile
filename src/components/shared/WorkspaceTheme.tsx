'use client';

import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';

const ThemeContext = createContext<{ style?: CSSProperties } | null>(null);

export function WorkspaceTheme({ style, children }: { style?: CSSProperties; children: ReactNode }) {
  return <ThemeContext.Provider value={{ style }}>{children}</ThemeContext.Provider>;
}

/** Los portales salen del contenedor del dashboard: reponer su tema y marca. */
export function PortalTheme({ children }: { children: ReactNode }) {
  const theme = useContext(ThemeContext);
  if (!theme) return <>{children}</>;
  return <div className="theme-saas-light contents" style={{ ...theme.style, minHeight: 0 }}>{children}</div>;
}
