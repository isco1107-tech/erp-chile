import React from 'react';

// El libro Excel básico viene con el Core y la página valida su permiso. F29 y
// RCV piden Reportes Avanzados: lo aplican sus propios layouts.
export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
