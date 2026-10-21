'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import type { CompanyFeatureFlags } from '@/lib/auth/modules';
import { formatCurrency } from '@/lib/chile/tax';
import {
  BASE_PLATFORM,
  EXTRA_USER_PRICE,
  INCLUDED_IN_BASE,
  PRICED_MODULES,
  PRICING_CATEGORIES,
  PRICING_PLANS,
  type PlanId,
} from '@/lib/pricing/catalog';
import { buildQuote, comparePlan, isModuleContracted } from '@/lib/pricing/quote';
import { requestModulesAction } from '@/modules/workspace/actions/plans.actions';
import { cn } from '@/lib/utils';

export default function PlansAndModulesClient({ features }: { features: CompanyFeatureFlags }) {
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planId, setPlanId] = useState<PlanId | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const plan = useMemo(() => PRICING_PLANS.find((p) => p.id === planId) ?? null, [planId]);
  const inPlan = useMemo(() => new Set(plan?.moduleIds ?? []), [plan]);
  const quote = useMemo(() => buildQuote([...selected], planId, features), [selected, planId, features]);
  const hasSelection = quote.plan !== null || quote.items.length > 0;

  function toggleModule(id: string) {
    setSent(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePlan(id: PlanId) {
    setSent(false);
    setPlanId((prev) => (prev === id ? null : id));
  }

  async function handleSubmit() {
    const lines = [...(quote.plan ? [`Plan ${quote.plan.label}`] : []), ...quote.items.map((m) => m.label)];
    const ok = await confirm({
      title: '¿Enviar la solicitud a Aether?',
      description: (
        <>
          <span className="block">{lines.join(' · ')}</span>
          <span className="mt-2 block">
            {formatCurrency(quote.net)} + IVA al mes ({formatCurrency(quote.total)} con IVA). Un ejecutivo te contactará para activarlo; no se cobra nada hasta entonces.
          </span>
        </>
      ),
      confirmLabel: 'Enviar solicitud',
      destructive: false,
    });
    if (!ok) return;

    setSending(true);
    try {
      const result = await requestModulesAction({ itemIds: quote.items.map((m) => m.id), planId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? 'Solicitud enviada');
      setSent(true);
      setSelected(new Set());
      setPlanId(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-8 pb-24">
      <section aria-labelledby="plans-heading" className="space-y-3">
        <div>
          <h2 id="plans-heading" className="text-lg font-semibold text-foreground">Planes</h2>
          <p className="text-sm text-muted-foreground">
            Un plan agrupa módulos con ahorro frente a contratarlos uno a uno. Incluye la plataforma base ({formatCurrency(BASE_PLATFORM.price)} por separado, con {BASE_PLATFORM.includedUsers} usuarios).
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PRICING_PLANS.map((p) => {
            const cmp = comparePlan(p, features);
            const active = planId === p.id;
            const savingsPct = Math.round(cmp.savings * 100);
            return (
              <article
                key={p.id}
                className={cn(
                  'flex min-w-0 flex-col rounded-lg border bg-card p-4 shadow-card transition-colors',
                  active ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                )}
              >
                <h3 className="text-base font-semibold text-foreground">{p.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                  {formatCurrency(p.price)}
                  <span className="text-sm font-normal text-muted-foreground"> /mes + IVA</span>
                </p>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <li>{p.includedUsers} usuarios incluidos</li>
                  <li>{p.moduleIds.length} módulos</li>
                  {savingsPct > 0 && (
                    <li>
                      <span className="font-medium text-success">Ahorras {savingsPct}%</span> frente a {formatCurrency(cmp.separateTotal)} por separado
                    </li>
                  )}
                  <li>
                    {cmp.missing.length === 0
                      ? 'Ya tienes todos sus módulos'
                      : `Ya tienes ${cmp.owned} de ${p.moduleIds.length}; te faltan ${cmp.missing.length}`}
                  </li>
                </ul>
                <Button
                  type="button"
                  variant={active ? 'default' : 'outline'}
                  className="mt-4 w-full"
                  onClick={() => togglePlan(p.id)}
                  aria-pressed={active}
                  disabled={cmp.missing.length === 0}
                >
                  {active ? (
                    <>
                      <Check aria-hidden="true" /> Plan elegido
                    </>
                  ) : (
                    'Elegir este plan'
                  )}
                </Button>
              </article>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="modules-heading" className="space-y-4">
        <div>
          <h2 id="modules-heading" className="text-lg font-semibold text-foreground">Módulos por separado</h2>
          <p className="text-sm text-muted-foreground">
            Marca los que quieras sumar a tu cuenta. Precios mensuales en CLP, más IVA. Cada usuario adicional sobre los {BASE_PLATFORM.includedUsers} incluidos cuesta {formatCurrency(EXTRA_USER_PRICE)} al mes.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Incluido en tu plataforma base: {INCLUDED_IN_BASE.map((m) => m.label).join(' y ')}.
          </p>
        </div>

        {PRICING_CATEGORIES.map((category) => {
          const items = PRICED_MODULES.filter((m) => m.category === category);
          return (
            <section key={category} className="rounded-lg border border-border bg-card shadow-card">
              <header className="border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">{category}</h3>
              </header>
              <ul className="divide-y divide-border">
                {items.map((item) => {
                  const contracted = isModuleContracted(item, features);
                  const covered = !contracted && inPlan.has(item.id);
                  const checked = !contracted && !covered && selected.has(item.id);
                  const inputId = `module-${item.id}`;
                  return (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <input
                        id={inputId}
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-primary"
                        checked={checked || covered}
                        disabled={contracted || covered}
                        onChange={() => toggleModule(item.id)}
                      />
                      <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{item.label}</span>
                          {contracted && <StatusBadge tone="success">Ya lo tienes</StatusBadge>}
                          {covered && <StatusBadge tone="info">Incluido en el plan elegido</StatusBadge>}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{item.summary}</span>
                      </label>
                      <p className="shrink-0 text-right text-sm font-medium text-foreground">
                        {formatCurrency(item.price)}
                        <span className="block text-xs font-normal text-muted-foreground">/mes + IVA</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </section>

      {sent && !hasSelection && (
        <p className="rounded-lg border border-success/30 bg-success-soft p-4 text-sm text-success" role="status">
          Recibimos tu solicitud. Tu ejecutivo de Aether te contactará para activar lo que elegiste; cuando lo haga, los módulos aparecerán en tu menú.
        </p>
      )}

      {hasSelection && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 py-3 shadow-popover backdrop-blur-md lg:pl-[276px]">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-end gap-x-6 gap-y-2">
            <div className="mr-auto min-w-0 text-sm">
              <p className="font-medium text-foreground">
                {quote.plan ? `Plan ${quote.plan.label}` : ''}
                {quote.plan && quote.items.length > 0 ? ' + ' : ''}
                {quote.items.length > 0 ? `${quote.items.length} módulo${quote.items.length === 1 ? '' : 's'}` : ''}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(quote.net)} + IVA al mes · {formatCurrency(quote.total)} con IVA
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelected(new Set());
                setPlanId(null);
              }}
              disabled={sending}
            >
              Limpiar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={sending}>
              <Send aria-hidden="true" />
              {sending ? 'Enviando…' : 'Solicitar contratación'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
