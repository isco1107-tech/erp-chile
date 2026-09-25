import React from 'react';
import ModuleGate from '@/components/ModuleGate';

/**
 * Fuera de `/dashboard/purchases` a propósito: pedir una compra es para todo
 * el equipo (`purchases:request`), mientras el resto de Compras exige
 * `purchases:read`.
 */
export default function PurchaseRequestsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ModuleGate moduleKey="hasPurchases" permission="purchases:request">
      {children}
    </ModuleGate>
  );
}
