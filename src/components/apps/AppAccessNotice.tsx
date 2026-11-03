import Link from 'next/link';
import { Lock } from 'lucide-react';

interface Props {
  /** Qué falta: el módulo contratado por la empresa o el permiso del usuario. */
  missing: 'module' | 'permission';
  /** Nombre del módulo como lo ve el cliente («Punto de Venta», «Inventario»). */
  moduleName: string;
  /** Qué no puede hacer, en palabras simples («vender en caja», «usar la bodega»). */
  action: string;
  /** El dueño es quien contrata: a él se le dice dónde pedirlo, no «pídele al administrador». */
  isOwner: boolean;
}

/**
 * Pantalla de «no puedes entrar» de las apps (POS, Bodega). Antes decía lo
 * mismo en todos los casos («pide al administrador que habilite el módulo y el
 * permiso»), también al dueño, que ES quien decide: no sabía si faltaba
 * contratar algo o darle un permiso a alguien, ni dónde.
 */
export function AppAccessNotice({ missing, moduleName, action, isOwner }: Props) {
  return (
    <section className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
      <Lock className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-xl font-semibold">Todavía no puedes {action}</h1>
      {missing === 'module' ? (
        isOwner ? (
          <>
            <p className="text-muted-foreground">Tu empresa no tiene contratado el módulo «{moduleName}». Puedes pedirlo desde el ERP y te contactaremos para activarlo.</p>
            <Link href="/dashboard/settings/plans" className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground">
              Ver planes y módulos
            </Link>
          </>
        ) : (
          <p className="text-muted-foreground">Tu empresa no tiene contratado el módulo «{moduleName}». Avísale al dueño de la empresa: él puede pedirlo.</p>
        )
      ) : (
        <p className="text-muted-foreground">
          Tu usuario no tiene permiso para {action}. Pídeselo al dueño o a un administrador de tu empresa: se da en Configuración → Equipo &amp; Colaboradores.
        </p>
      )}
    </section>
  );
}
