'use client';

import { useEffect, useRef, useState } from 'react';
import { Ticket, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { formatCurrency } from '@/lib/chile/tax';
import { publicTicketPurchaseSchema, TICKET_PURCHASE_HONEYPOT_FIELD } from '@/modules/ticketing/schema';
import { getPublicTicketingProjectAction } from '@/modules/ticketing/actions/public-ticketing.actions';
import type { PublicTicketingProjectInfo } from '@/modules/ticketing/services/ticketing.service';

/**
 * Página pública de venta de entradas (`/tickets/[token]`). Sin pasarela de
 * pago: al enviar el formulario se crea la orden en `UNPAID` y se muestran
 * los datos de transferencia (`bankTransferInfo`) para que el comprador pague
 * fuera del sistema — el staff confirma el pago a mano desde el panel.
 *
 * A diferencia de `CandidateRegistrationClient` (landing de certamen con
 * diseño propio), esta página usa los mismos primitivos de UI (shadcn) que el
 * resto del ERP: no es una pieza de marketing del certamen, es un formulario
 * de compra funcional.
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
      if (result.data.ticketTypes.length > 0) setTicketTypeId(result.data.ticketTypes[0]!.id);
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

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-lg font-semibold">Link de venta de entradas inválido o expirado</p>
        <p className="text-sm text-muted-foreground">Contacta a la organización del evento para obtener uno vigente.</p>
      </div>
    );
  }

  if (confirmation) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <CheckCircle2 className="mb-2 size-10 text-green-600" />
            <CardTitle>¡Recibimos tu compra!</CardTitle>
            <CardDescription>{project.projectName} · {project.companyName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p>Tipo de entrada: <strong>{confirmation.ticketTypeName}</strong></p>
              <p>Cantidad: <strong>{confirmation.quantity}</strong></p>
              <p>Total a transferir: <strong>{formatCurrency(confirmation.totalAmount)}</strong></p>
            </div>
            <div>
              <p className="mb-1 font-semibold">Datos para transferencia</p>
              {project.bankTransferInfo ? (
                <p className="whitespace-pre-line rounded-lg border border-dashed border-border p-3 text-muted-foreground">{project.bankTransferInfo}</p>
              ) : (
                <p className="text-muted-foreground">La organización te contactará con los datos para transferir.</p>
              )}
            </div>
            <p className="text-muted-foreground">
              Te enviamos una copia a tu correo. Una vez que transfieras y el equipo organizador confirme tu pago, recibirás
              el código QR de tu entrada por correo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Ticket className="mb-2 size-8 text-primary" />
          <CardTitle>{project.projectName}</CardTitle>
          <CardDescription>{project.companyName} · Venta de entradas</CardDescription>
        </CardHeader>
        <CardContent>
          {project.ticketTypes.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Todavía no hay tipos de entrada disponibles para este evento.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                ref={honeypotRef}
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute h-0 w-0 overflow-hidden opacity-0"
                name={TICKET_PURCHASE_HONEYPOT_FIELD}
              />

              <div className="space-y-1.5">
                <Label htmlFor="ticketTypeId">Tipo de entrada</Label>
                <select
                  id="ticketTypeId"
                  value={ticketTypeId}
                  onChange={(e) => setTicketTypeId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                >
                  {project.ticketTypes.map((t) => (
                    <option key={t.id} value={t.id} disabled={!t.salesOpen || t.soldOut}>
                      {t.name} — {formatCurrency(t.price)}
                      {t.soldOut ? ' (agotado)' : !t.salesOpen ? ' (cerrado)' : ''}
                    </option>
                  ))}
                </select>
                {errors.ticketTypeId && <p className="text-xs text-destructive">{errors.ticketTypeId}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="quantity">Cantidad</Label>
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  max={20}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value) || 1)}
                />
                {errors.quantity && <p className="text-xs text-destructive">{errors.quantity}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="buyerName">Nombre completo</Label>
                <Input id="buyerName" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
                {errors.buyerName && <p className="text-xs text-destructive">{errors.buyerName}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="buyerEmail">Correo electrónico</Label>
                <Input id="buyerEmail" type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
                {errors.buyerEmail && <p className="text-xs text-destructive">{errors.buyerEmail}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="buyerPhone">Teléfono (opcional)</Label>
                <Input id="buyerPhone" type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="+56 9 1234 5678" />
                {errors.buyerPhone && <p className="text-xs text-destructive">{errors.buyerPhone}</p>}
              </div>

              {selectedType && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p>Total a pagar: <strong>{formatCurrency(total)}</strong></p>
                </div>
              )}

              {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}

              <Button type="submit" className="w-full" disabled={saving || !selectedType || selectedType.soldOut || !selectedType.salesOpen}>
                {saving ? 'Procesando…' : 'Confirmar compra'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
