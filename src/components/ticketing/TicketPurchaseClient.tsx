'use client';

import { useEffect, useRef, useState } from 'react';
import { Ticket, Minus, Plus, ShieldCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/chile/tax';
import { publicTicketPurchaseSchema, TICKET_PURCHASE_HONEYPOT_FIELD } from '@/modules/ticketing/schema';
import { getPublicTicketingProjectAction } from '@/modules/ticketing/actions/public-ticketing.actions';
import type { PublicTicketingProjectInfo } from '@/modules/ticketing/services/ticketing.service';
import {
  PublicBadge,
  PublicButton,
  PublicCard,
  PublicCardHeader,
  PublicField,
  PublicFooter,
  PublicPage,
  PublicRow,
  PublicShell,
  PublicStatus,
  PublicTopBar,
  PublicTotal,
} from '@/components/public/PublicShell';

/**
 * Página pública de venta de entradas (`/tickets/[token]`). Sin pasarela de
 * pago: al enviar el formulario se crea la orden en `UNPAID` y se muestran
 * los datos de transferencia (`bankTransferInfo`) para que el comprador pague
 * fuera del sistema — el staff confirma el pago a mano desde el panel.
 *
 * Diseño: `@/components/public/PublicShell`, el sistema compartido por todos
 * los links públicos del certamen (antes usaba los primitivos shadcn del
 * dashboard, que hacían ver esta pantalla como una vista interna del ERP).
 * El selector de tipo de entrada dejó de ser un `<select>` nativo: con 2–5
 * opciones que tienen precio, estado y cupo, las tarjetas de opción muestran
 * toda esa información sin obligar a abrir el desplegable.
 */
export default function TicketPurchaseClient({ token }: { token: string }) {
  const [project, setProject] = useState<PublicTicketingProjectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [ticketTypeId, setTicketTypeId] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<{ ticketTypeName: string; quantity: number; totalAmount: number } | null>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const result = await getPublicTicketingProjectAction(token);
      if (!result.success) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setProject(result.data);
      const firstAvailable = result.data.ticketTypes.find((t) => t.salesOpen && !t.soldOut) ?? result.data.ticketTypes[0];
      if (firstAvailable) setTicketTypeId(firstAvailable.id);
      setLoading(false);
    })();
  }, [token]);

  const selectedType = project?.ticketTypes.find((t) => t.id === ticketTypeId) ?? null;
  const total = selectedType ? selectedType.price * quantity : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (honeypotRef.current?.value) return; // bot: se ignora sin dar pistas.

    const parsed = publicTicketPurchaseSchema.safeParse({ ticketTypeId, buyerName, buyerEmail, buyerPhone: buyerPhone || undefined, quantity });
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
    setSaving(true);
    try {
      const res = await fetch(`/api/public/tickets/${token}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, [TICKET_PURCHASE_HONEYPOT_FIELD]: honeypotRef.current?.value ?? '' }),
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { ticketTypeName: string; quantity: number; totalAmount: number };
        error?: string;
      };
      if (!json.success || !json.data) {
        setErrors({ form: json.error ?? 'No se pudo procesar tu compra. Intenta de nuevo.' });
        return;
      }
      setConfirmation(json.data);
    } catch {
      setErrors({ form: 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PublicStatus accent="violet" variant="loading" message="Cargando las entradas disponibles…" />;

  if (notFound || !project) {
    return (
      <PublicStatus
        accent="violet"
        variant="error"
        title="Link de entradas inválido o expirado"
        message="Contacta a la organización del evento para obtener uno vigente."
      />
    );
  }

  if (confirmation) {
    return (
      <PublicPage accent="violet">
        <PublicTopBar brand={project.companyName} right={project.projectName} />
        <PublicShell>
          <PublicCard glow>
            <PublicCardHeader
              icon={<Ticket size={22} strokeWidth={1.6} />}
              eyebrow="Compra registrada"
              title="¡Recibimos tu compra!"
              subtitle={`${project.projectName} · ${project.companyName}`}
            />
            <div className="pub-panel">
              <PublicRow label="Tipo de entrada" value={confirmation.ticketTypeName} />
              <PublicRow label="Cantidad" value={confirmation.quantity} />
              <PublicRow label="Total a transferir" value={formatCurrency(confirmation.totalAmount)} strong />
            </div>
            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <p className="pub-eyebrow" style={{ margin: 0 }}>Datos para transferencia</p>
              {project.bankTransferInfo ? (
                <p className="pub-transfer">{project.bankTransferInfo}</p>
              ) : (
                <p className="pub-hint">La organización te contactará con los datos para transferir.</p>
              )}
              <p className="pub-hint">
                Te enviamos una copia a tu correo. Cuando transfieras y el equipo organizador confirme el pago, recibirás
                el código QR de tu entrada por correo.
              </p>
            </div>
          </PublicCard>
        </PublicShell>
        <PublicFooter>{project.companyName} · Venta oficial de entradas</PublicFooter>
      </PublicPage>
    );
  }

  return (
    <PublicPage accent="violet">
      <PublicTopBar brand={project.companyName} right="Venta oficial" />
      <PublicShell>
        <PublicCard glow>
          <PublicCardHeader
            icon={<Ticket size={22} strokeWidth={1.6} />}
            eyebrow="Entradas"
            title={project.projectName}
            subtitle="Elige tu entrada, reserva tu cupo y paga por transferencia."
          />

          {project.ticketTypes.length === 0 ? (
            <p className="pub-hint" style={{ textAlign: 'center' }}>
              Todavía no hay tipos de entrada disponibles para este evento.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="pub-form" noValidate>
              <input
                ref={honeypotRef}
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="pub-honeypot"
                name={TICKET_PURCHASE_HONEYPOT_FIELD}
              />

              <fieldset className="pub-optionset">
                <legend>Tipo de entrada</legend>
                {project.ticketTypes.map((t) => {
                  const unavailable = t.soldOut || !t.salesOpen;
                  return (
                    <label
                      key={t.id}
                      className={`pub-option ${ticketTypeId === t.id ? 'is-selected' : ''} ${unavailable ? 'is-disabled' : ''}`}
                    >
                      <input
                        type="radio"
                        name="ticketTypeId"
                        value={t.id}
                        checked={ticketTypeId === t.id}
                        disabled={unavailable}
                        onChange={() => setTicketTypeId(t.id)}
                      />
                      <span className="pub-option-body">
                        <span className="pub-option-name">{t.name}</span>
                        <span className="pub-option-meta">
                          {t.soldOut ? (
                            <PublicBadge tone="warn">Agotada</PublicBadge>
                          ) : !t.salesOpen ? (
                            <PublicBadge>Venta cerrada</PublicBadge>
                          ) : (
                            <PublicBadge tone="ok">Disponible</PublicBadge>
                          )}
                        </span>
                      </span>
                      <span className="pub-option-price">{formatCurrency(t.price)}</span>
                    </label>
                  );
                })}
                {errors.ticketTypeId && <p className="pub-error">{errors.ticketTypeId}</p>}
              </fieldset>

              <PublicField id="quantity" label="Cantidad" error={errors.quantity}>
                <div className="pub-stepper">
                  <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Quitar una entrada">
                    <Minus size={16} strokeWidth={2} />
                  </button>
                  <input
                    id="quantity"
                    type="number"
                    min={1}
                    max={20}
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
                  />
                  <button type="button" onClick={() => setQuantity((q) => Math.min(20, q + 1))} aria-label="Agregar una entrada">
                    <Plus size={16} strokeWidth={2} />
                  </button>
                </div>
              </PublicField>

              <PublicField id="buyerName" label="Nombre completo" error={errors.buyerName}>
                <input id="buyerName" autoComplete="name" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
              </PublicField>

              <PublicField id="buyerEmail" label="Correo electrónico" error={errors.buyerEmail} hint="Ahí te llega el QR de tu entrada.">
                <input id="buyerEmail" type="email" autoComplete="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
              </PublicField>

              <PublicField id="buyerPhone" label="Teléfono" optional error={errors.buyerPhone}>
                <input id="buyerPhone" type="tel" autoComplete="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+56 9 1234 5678" />
              </PublicField>

              {selectedType && (
                <PublicTotal
                  label="Total a pagar"
                  value={formatCurrency(total)}
                  note={`${quantity} × ${selectedType.name} · ${formatCurrency(selectedType.price)} c/u`}
                />
              )}

              {errors.form && <p className="pub-error-form">{errors.form}</p>}

              <PublicButton type="submit" full disabled={saving || !selectedType || selectedType.soldOut || !selectedType.salesOpen}>
                {saving ? 'Procesando…' : 'Confirmar compra'}
              </PublicButton>

              <p className="pub-hint" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}>
                <ShieldCheck size={14} strokeWidth={1.7} /> No se pide ningún dato de tarjeta en esta página.
              </p>
            </form>
          )}
        </PublicCard>
      </PublicShell>
      <PublicFooter>{project.companyName} · Venta oficial de entradas</PublicFooter>
    </PublicPage>
  );
}
