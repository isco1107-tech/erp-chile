'use client';

import { useMemo, useRef, useState } from 'react';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/chile/tax';
import { formatRut, validateRut } from '@/lib/chile/rut';
import { INSTALLMENT_PORTAL_HONEYPOT_FIELD, publicInstallmentCheckoutSchema } from '@/modules/payment-plans/schema';
import type { PublicLookupResult, PublicPortalInfo } from '@/modules/payment-plans/services/online-payment.service';
import {
  PublicBadge,
  PublicButton,
  PublicCard,
  PublicCardHeader,
  PublicField,
  PublicFooter,
  PublicPage,
  PublicShell,
  PublicTopBar,
  PublicTotal,
} from '@/components/public/PublicShell';

/**
 * Portal público de pago de cuotas (`/pagar/[token]`). Dos pasos, sin cuenta:
 * 1) RUT de la candidata → 2) elegir cuotas y datos de quien paga → redirige
 * a Khipu. El monto lo calcula el servidor; acá solo se muestra.
 */

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: 'short', year: 'numeric' });
}

export default function InstallmentPortalClient({ token, portal }: { token: string; portal: PublicPortalInfo }) {
  const [rut, setRut] = useState('');
  const [lookup, setLookup] = useState<PublicLookupResult | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [payerName, setPayerName] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const allInstallments = useMemo(() => lookup?.plans.flatMap((p) => p.installments) ?? [], [lookup]);
  const total = allInstallments.filter((i) => selected.includes(i.id)).reduce((sum, i) => sum + i.pendingAmount, 0);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!validateRut(rut)) {
      setErrors({ rut: 'El RUT no es válido. Revisa el dígito verificador.' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch(`/api/public/installments/${token}/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut }),
      });
      const json = (await res.json()) as ApiResponse<PublicLookupResult>;
      if (!json.success || !json.data) {
        setErrors({ rut: json.error ?? 'No pudimos consultar las cuotas. Intenta de nuevo.' });
        return;
      }
      setLookup(json.data);
      // Preselecciona la cuota más antigua: es la que casi siempre se viene a pagar.
      const first = json.data.plans[0]?.installments[0];
      setSelected(first ? [first.id] : []);
    } catch {
      setErrors({ rut: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.' });
    } finally {
      setBusy(false);
    }
  }

  function toggleInstallment(planId: string, installmentId: string) {
    setSelected((current) => {
      // Una orden cubre un solo plan: marcar una cuota de otro plan reinicia la selección.
      const planIds = new Set(lookup?.plans.find((p) => p.planId === planId)?.installments.map((i) => i.id));
      const samePlan = current.filter((id) => planIds.has(id));
      return samePlan.includes(installmentId) ? samePlan.filter((id) => id !== installmentId) : [...samePlan, installmentId];
    });
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (honeypotRef.current?.value) return;

    const parsed = publicInstallmentCheckoutSchema.safeParse({ rut, installmentIds: selected, payerName, payerEmail });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await fetch(`/api/public/installments/${token}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, [INSTALLMENT_PORTAL_HONEYPOT_FIELD]: honeypotRef.current?.value ?? '' }),
      });
      const json = (await res.json()) as ApiResponse<{ paymentUrl: string }>;
      if (!json.success || !json.data) {
        setErrors({ form: json.error ?? 'No pudimos iniciar el pago. Intenta de nuevo.' });
        setBusy(false);
        return;
      }
      window.location.assign(json.data.paymentUrl);
    } catch {
      setErrors({ form: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.' });
      setBusy(false);
    }
  }

  function reset() {
    setLookup(null);
    setSelected([]);
    setErrors({});
  }

  return (
    <PublicPage accent="gold">
      <PublicTopBar brand={portal.companyName} right="Pago de cuotas" />
      <PublicShell>
        <PublicCard glow>
          {!lookup ? (
            <>
              <PublicCardHeader
                icon={<CreditCard size={22} strokeWidth={1.6} />}
                eyebrow="Cuotas y mensualidades"
                title="Paga las cuotas de una candidata"
                subtitle="Ingresa el RUT de la candidata para ver sus cuotas pendientes."
              />
              <form onSubmit={handleLookup} className="pub-form" noValidate>
                <PublicField id="rut" label="RUT de la candidata" error={errors.rut} hint="Ejemplo: 12.345.678-5">
                  <input
                    id="rut"
                    inputMode="text"
                    autoComplete="off"
                    value={rut}
                    onChange={(e) => setRut(e.target.value)}
                    onBlur={() => rut && setRut(formatRut(rut))}
                    placeholder="12.345.678-5"
                  />
                </PublicField>
                <PublicButton type="submit" full disabled={busy || rut.trim().length < 3}>
                  {busy ? 'Consultando…' : 'Ver cuotas'}
                </PublicButton>
              </form>
            </>
          ) : lookup.plans.length === 0 ? (
            <>
              <PublicCardHeader
                icon={<CreditCard size={22} strokeWidth={1.6} />}
                eyebrow="Sin cuotas pendientes"
                title="No encontramos cuotas por pagar"
                subtitle={`No hay cuotas pendientes asociadas al RUT ${formatRut(rut)}. Si crees que es un error, contacta a la organización.`}
              />
              <PublicButton type="button" variant="ghost" full onClick={reset}>
                Consultar otro RUT
              </PublicButton>
            </>
          ) : (
            <>
              <PublicCardHeader
                icon={<CreditCard size={22} strokeWidth={1.6} />}
                eyebrow="Cuotas pendientes"
                title={lookup.candidateName ?? 'Candidata'}
                subtitle={`RUT ${formatRut(rut)}`}
              />
              <form onSubmit={handlePay} className="pub-form" noValidate>
                <input
                  ref={honeypotRef}
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="pub-honeypot"
                  name={INSTALLMENT_PORTAL_HONEYPOT_FIELD}
                />

                {lookup.plans.map((plan) => (
                  <fieldset key={plan.planId} className="pub-optionset">
                    <legend>
                      {plan.projectName ?? 'Plan de pago'} · {plan.paidCount} de {plan.installmentCount} cuotas pagadas
                    </legend>
                    {plan.installments.map((installment) => {
                      const isSelected = selected.includes(installment.id);
                      return (
                        <label key={installment.id} className={`pub-option ${isSelected ? 'is-selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!portal.onlinePaymentsEnabled}
                            onChange={() => toggleInstallment(plan.planId, installment.id)}
                          />
                          <span className="pub-option-body">
                            <span className="pub-option-name">
                              Cuota N° {installment.installmentNumber} de {plan.installmentCount}
                            </span>
                            <span className="pub-option-meta">
                              <span className="pub-hint">Vence {formatDueDate(installment.dueDate)}</span>
                              {installment.inProgress ? (
                                <PublicBadge tone="accent">Pago en curso</PublicBadge>
                              ) : installment.overdue ? (
                                <PublicBadge tone="warn">Vencida</PublicBadge>
                              ) : null}
                            </span>
                          </span>
                          <span className="pub-option-price">{formatCurrency(installment.pendingAmount)}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                ))}
                {errors.installmentIds && <p className="pub-error">{errors.installmentIds}</p>}

                {portal.onlinePaymentsEnabled ? (
                  <>
                    <PublicField id="payerName" label="Tu nombre" error={errors.payerName}>
                      <input id="payerName" autoComplete="name" value={payerName} onChange={(e) => setPayerName(e.target.value)} />
                    </PublicField>
                    <PublicField
                      id="payerEmail"
                      label="Tu correo"
                      error={errors.payerEmail}
                      hint="Ahí te enviaremos el comprobante cuando se confirme el pago."
                    >
                      <input id="payerEmail" type="email" autoComplete="email" value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} />
                    </PublicField>

                    <PublicTotal
                      label="Total a pagar"
                      value={formatCurrency(total)}
                      note={`${selected.length} ${selected.length === 1 ? 'cuota' : 'cuotas'} · pago por transferencia vía Khipu`}
                    />

                    {errors.form && <p className="pub-error-form">{errors.form}</p>}

                    <PublicButton type="submit" full disabled={busy || selected.length === 0}>
                      {busy ? 'Conectando con el banco…' : `Pagar ${formatCurrency(total)}`}
                    </PublicButton>
                    <p className="pub-hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                      <ShieldCheck size={14} strokeWidth={1.7} /> Pagas en Khipu desde tu banco. Esta página no pide claves ni tarjetas.
                    </p>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <p className="pub-eyebrow" style={{ margin: 0 }}>Datos para transferencia</p>
                    {portal.bankTransferInfo ? (
                      <p className="pub-transfer">{portal.bankTransferInfo}</p>
                    ) : (
                      <p className="pub-hint">El pago en línea aún no está habilitado. Contacta a la organización para pagar.</p>
                    )}
                  </div>
                )}

                <PublicButton type="button" variant="ghost" full onClick={reset}>
                  Consultar otro RUT
                </PublicButton>
              </form>
            </>
          )}
        </PublicCard>
      </PublicShell>
      <PublicFooter>{portal.companyName} · Pago oficial de cuotas</PublicFooter>
    </PublicPage>
  );
}
