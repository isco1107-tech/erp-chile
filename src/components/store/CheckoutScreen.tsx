'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { newIdempotencyKey } from '@/lib/ecommerce/checkout';
import { REGION_NAMES, comunasOf } from '@/lib/ecommerce/shipping';
import { orderHref, storeScreenHref } from '@/lib/ecommerce/store-href';
import { checkoutUrl, postJson } from './store-api';
import { Notice, ProductImage, StoreFrame, StoreTitle, money } from './ui';
import { useCart, useHydrated } from './use-cart';
import { useQuote } from './use-quote';
import { cx } from '@/components/web-sites/site/parts';

interface FormState {
  name: string;
  email: string;
  phone: string;
  rut: string;
  delivery: 'SHIPPING' | 'PICKUP' | null;
  region: string;
  comuna: string;
  street: string;
  extra: string;
  rateId: string;
  documentType: 'BOLETA' | 'FACTURA';
  billRut: string;
  billName: string;
  billGiro: string;
  billAddress: string;
  billComuna: string;
  payment: string;
  notes: string;
  terms: boolean;
  /** Señuelo anti-bots: una persona nunca lo ve ni lo llena. */
  website: string;
}

const EMPTY: FormState = {
  name: '', email: '', phone: '', rut: '', delivery: null, region: '', comuna: '', street: '', extra: '', rateId: '',
  documentType: 'BOLETA', billRut: '', billName: '', billGiro: '', billAddress: '', billComuna: '', payment: '', notes: '', terms: false, website: '',
};

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="ws-muted text-xs">{hint}</p>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="ws-card min-w-0 p-5 @2xl:p-6">
      {/* El título flota para quedar DENTRO de la tarjeta (un legend normal se dibuja encima del borde). */}
      <legend className="ws-h float-left mb-4 w-full p-0 text-lg">{title}</legend>
      <div className="clear-both min-w-0 space-y-4">{children}</div>
    </fieldset>
  );
}

function Choice({ name, value, checked, onChange, title, description, extra }: { name: string; value: string; checked: boolean; onChange: () => void; title: string; description?: string; extra?: ReactNode }) {
  return (
    <label className="ws-choice !flex !items-start !rounded-[var(--ws-radius)] !px-4 !py-3">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-1" />
      <span className="min-w-0 grow">
        <span className="block font-semibold break-words">{title}</span>
        {description && <span className="ws-muted block text-sm font-normal break-words">{description}</span>}
      </span>
      {extra && <span className="shrink-0 font-semibold tabular-nums">{extra}</span>}
    </label>
  );
}

/**
 * La clave del intento de compra vive en `sessionStorage` junto con la firma del carrito: recargar
 * o reintentar el mismo carrito reutiliza la clave (el servidor devuelve el pedido ya creado en vez
 * de duplicarlo) y cambiar el carrito la renueva.
 */
function attemptKey(siteSlug: string, signature: string, renew = false): string {
  const storageKey = `aether-ck:${siteSlug}`;
  try {
    if (!renew) {
      const saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? 'null') as { sig?: string; key?: string } | null;
      if (saved?.sig === signature && typeof saved.key === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(saved.key)) return saved.key;
    }
    const key = newIdempotencyKey(() => crypto.randomUUID());
    window.sessionStorage.setItem(storageKey, JSON.stringify({ sig: signature, key }));
    return key;
  } catch {
    return newIdempotencyKey(() => crypto.randomUUID());
  }
}

export default function CheckoutScreen({ siteSlug, basePath, termsText }: { siteSlug: string; basePath: string; termsText: string }) {
  const cart = useCart(siteSlug);
  const hydrated = useHydrated();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  // Primera lectura del quote: sin entrega elegida se pide solo lo básico (qué ofrece la tienda).
  const [probe, setProbe] = useState<{ shipping: boolean; pickup: boolean } | null>(null);
  const delivery = form.delivery ?? (probe ? (probe.shipping ? 'SHIPPING' : probe.pickup ? 'PICKUP' : null) : null);
  const { quote, loading, error, notices } = useQuote(siteSlug, cart.lines, cart, {
    region: delivery === 'SHIPPING' ? form.region || undefined : undefined,
    deliveryMethod: delivery ?? undefined,
    shippingRateId: delivery === 'SHIPPING' ? form.rateId || undefined : undefined,
  });
  useEffect(() => {
    if (quote) setProbe({ shipping: quote.shippingEnabled, pickup: quote.pickup !== null });
  }, [quote]);

  const options = quote?.shippingOptions ?? [];
  const rateId = options.some((option) => option.id === form.rateId) ? form.rateId : '';
  // Si la tarifa elegida ya no existe (cambió de región) o aún no se eligió, se deja la más barata; el quote se repite con ella.
  useEffect(() => {
    if (!quote) return;
    const ids = quote.shippingOptions.map((option) => option.id);
    setForm((current) => (ids.includes(current.rateId) ? current : { ...current, rateId: ids[0] ?? '' }));
  }, [quote]);
  const providers = (quote?.paymentProviders ?? []).filter((provider) => !provider.requiresPickup || delivery === 'PICKUP');
  const payment = providers.some((provider) => provider.id === form.payment) ? form.payment : (providers[0]?.id ?? '');
  const comunas = comunasOf(form.region);
  const regions = quote?.shippingRegions === null || quote?.shippingRegions === undefined ? REGION_NAMES : REGION_NAMES.filter((name) => quote.shippingRegions!.includes(name));
  const signature = JSON.stringify(cart.lines);
  const pricing = quote?.pricing ?? null;
  const online = payment === 'KHIPU' || payment === 'WEBPAY';

  useEffect(() => {
    // Nuevo carrito = nuevo intento de compra.
    keyRef.current = null;
  }, [signature]);

  if (!hydrated) {
    return (
      <StoreFrame label="Finalizar compra">
        <StoreTitle title="Finalizar compra" />
        <p className="ws-muted" role="status">
          Cargando tu compra…
        </p>
      </StoreFrame>
    );
  }
  if (cart.lines.length === 0) {
    return (
      <StoreFrame label="Finalizar compra" width="narrow">
        <StoreTitle title="Tu carrito está vacío" intro="Agrega productos para poder finalizar tu compra." />
        <a href={storeScreenHref(basePath, 'catalog')} className="ws-btn ws-btn-main">
          Ver el catálogo
        </a>
      </StoreFrame>
    );
  }

  const invalid = (field: string) => (badField === field ? true : undefined);
  const canSubmit = Boolean(quote?.ready) && !submitting && !loading && Boolean(delivery) && Boolean(payment) && (delivery !== 'SHIPPING' || Boolean(rateId));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!quote || !delivery || !payment || !canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    setBadField(null);
    keyRef.current ??= attemptKey(siteSlug, signature);
    const result = await postJson<{ number: number; orderToken: string; redirectUrl: string | null }>(checkoutUrl(siteSlug), {
      idempotencyKey: keyRef.current,
      lines: cart.lines,
      customer: { name: form.name, email: form.email, phone: form.phone, rut: form.rut || undefined },
      documentType: form.documentType,
      billing: form.documentType === 'FACTURA' ? { rut: form.billRut, razonSocial: form.billName, giro: form.billGiro, address: form.billAddress, comuna: form.billComuna } : undefined,
      deliveryMethod: delivery,
      address: delivery === 'SHIPPING' ? { region: form.region, comuna: form.comuna, street: form.street, extra: form.extra } : undefined,
      shippingRateId: delivery === 'SHIPPING' ? rateId : undefined,
      paymentProvider: payment,
      notes: form.notes || undefined,
      acceptTerms: form.terms,
      website: form.website,
    });
    if (!result.ok) {
      setSubmitting(false);
      setSubmitError(result.error);
      if (result.field) {
        setBadField(result.field);
        document.getElementById(`co-${result.field}`)?.focus();
      }
      // Una respuesta de la tienda que rechaza la compra cierra el intento (el pedido no se creó o se canceló): el
      // próximo es nuevo. Sin respuesta, con un error de infraestructura o un 500 inesperado el pedido pudo haberse
      // creado: se conserva la clave y reintentar devuelve ese pedido en vez de duplicarlo.
      if (result.fromApp && result.status !== 500) keyRef.current = attemptKey(siteSlug, signature, true);
      return;
    }
    // Compra hecha: la próxima es otra, no puede heredar la clave (devolvería este mismo pedido).
    keyRef.current = null;
    try {
      window.sessionStorage.removeItem(`aether-ck:${siteSlug}`);
    } catch {
      /* sin almacenamiento: no hay clave guardada que borrar */
    }
    cart.clear();
    window.location.assign(result.data.redirectUrl ?? orderHref(basePath, result.data.orderToken));
  }

  return (
    <StoreFrame label="Finalizar compra">
      <StoreTitle title="Finalizar compra" />
      {notices.length > 0 && (
        <div className="mb-5">
          <Notice>{[...new Set(notices)].join(' ')}</Notice>
        </div>
      )}
      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <form onSubmit={submit} className="grid gap-8 @4xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <Group title="Tus datos">
            <div className="grid gap-4 @xl:grid-cols-2">
              <Field id="co-name" label="Nombre completo">
                <input id="co-name" className="ws-field" required minLength={3} maxLength={80} autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={invalid('name')} />
              </Field>
              <Field id="co-email" label="Correo" hint="Te enviamos la confirmación y el seguimiento.">
                <input id="co-email" type="email" className="ws-field" required maxLength={120} autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} aria-invalid={invalid('email')} />
              </Field>
              <Field id="co-phone" label="Teléfono">
                <input id="co-phone" type="tel" className="ws-field" required minLength={7} maxLength={20} autoComplete="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} aria-invalid={invalid('phone')} />
              </Field>
              <Field id="co-rut" label="RUT (opcional)">
                <input id="co-rut" className="ws-field" maxLength={14} autoComplete="off" placeholder="12.345.678-9" value={form.rut} onChange={(e) => set('rut', e.target.value)} aria-invalid={invalid('rut')} />
              </Field>
            </div>
          </Group>

          <Group title="Entrega">
            <div className="space-y-3">
              {quote?.shippingEnabled && <Choice name="delivery" value="SHIPPING" checked={delivery === 'SHIPPING'} onChange={() => set('delivery', 'SHIPPING')} title="Despacho a domicilio" description="Lo llevamos a tu dirección." />}
              {quote?.pickup && (
                <Choice
                  name="delivery"
                  value="PICKUP"
                  checked={delivery === 'PICKUP'}
                  onChange={() => set('delivery', 'PICKUP')}
                  title="Retiro en tienda"
                  description={[quote.pickup.address, quote.pickup.instructions].filter(Boolean).join(' · ') || 'Retiras tu pedido sin costo.'}
                  extra="Gratis"
                />
              )}
              {quote && !quote.shippingEnabled && !quote.pickup && <Notice tone="error">Esta tienda aún no configura cómo entregar los pedidos. Escríbenos para ayudarte.</Notice>}
            </div>
            {delivery === 'SHIPPING' && (
              <div className="space-y-4 border-t border-[color:var(--s-line)] pt-4">
                <div className="grid gap-4 @xl:grid-cols-2">
                  <Field id="co-region" label="Región">
                    <select
                      id="co-region"
                      className="ws-field ws-field-select"
                      required
                      autoComplete="address-level1"
                      value={form.region}
                      onChange={(e) => setForm((current) => ({ ...current, region: e.target.value, comuna: '', rateId: '' }))}
                      aria-invalid={invalid('region')}
                    >
                      <option value="">Elige tu región</option>
                      {regions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="co-comuna" label="Comuna">
                    <input id="co-comuna" className="ws-field" required maxLength={60} autoComplete="address-level2" list="co-comunas" value={form.comuna} onChange={(e) => set('comuna', e.target.value)} aria-invalid={invalid('comuna')} />
                    <datalist id="co-comunas">
                      {comunas.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  </Field>
                  <Field id="co-street" label="Calle y número">
                    <input id="co-street" className="ws-field" required minLength={4} maxLength={120} autoComplete="address-line1" value={form.street} onChange={(e) => set('street', e.target.value)} aria-invalid={invalid('street')} />
                  </Field>
                  <Field id="co-extra" label="Depto, casa u oficina (opcional)">
                    <input id="co-extra" className="ws-field" maxLength={120} autoComplete="address-line2" value={form.extra} onChange={(e) => set('extra', e.target.value)} />
                  </Field>
                </div>
                {form.region && options.length === 0 && !loading && <Notice tone="error">Por ahora no despachamos a esa región. Elige otra o retira en tienda.</Notice>}
                {options.length > 0 && (
                  <div className="space-y-3" role="radiogroup" aria-label="Forma de despacho">
                    {options.map((option) => (
                      <Choice
                        key={option.id}
                        name="rate"
                        value={option.id}
                        checked={rateId === option.id}
                        onChange={() => set('rateId', option.id)}
                        title={option.name}
                        description={[option.eta, option.note].filter(Boolean).join(' · ') || undefined}
                        extra={option.price === 0 ? 'Gratis' : money(option.price)}
                      />
                    ))}
                  </div>
                )}
                {!form.region && <p className="ws-muted text-sm">Elige tu región para ver las opciones y el costo de despacho.</p>}
              </div>
            )}
          </Group>

          {quote?.invoiceEnabled && (
            <Group title="Documento">
              <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Tipo de documento">
                <label className="ws-choice">
                  <input type="radio" name="documentType" checked={form.documentType === 'BOLETA'} onChange={() => set('documentType', 'BOLETA')} /> Boleta
                </label>
                <label className="ws-choice">
                  <input type="radio" name="documentType" checked={form.documentType === 'FACTURA'} onChange={() => set('documentType', 'FACTURA')} /> Factura
                </label>
              </div>
              {form.documentType === 'FACTURA' && (
                <div className="grid gap-4 @xl:grid-cols-2">
                  <Field id="co-billrut" label="RUT de la empresa">
                    <input id="co-billrut" className="ws-field" required maxLength={14} value={form.billRut} onChange={(e) => set('billRut', e.target.value)} />
                  </Field>
                  <Field id="co-billname" label="Razón social">
                    <input id="co-billname" className="ws-field" required minLength={2} maxLength={120} value={form.billName} onChange={(e) => set('billName', e.target.value)} />
                  </Field>
                  <Field id="co-billgiro" label="Giro">
                    <input id="co-billgiro" className="ws-field" required minLength={2} maxLength={120} value={form.billGiro} onChange={(e) => set('billGiro', e.target.value)} />
                  </Field>
                  <Field id="co-billaddress" label="Dirección de la empresa">
                    <input id="co-billaddress" className="ws-field" required minLength={4} maxLength={160} value={form.billAddress} onChange={(e) => set('billAddress', e.target.value)} />
                  </Field>
                  <Field id="co-billcomuna" label="Comuna">
                    <input id="co-billcomuna" className="ws-field" required minLength={2} maxLength={60} value={form.billComuna} onChange={(e) => set('billComuna', e.target.value)} />
                  </Field>
                </div>
              )}
            </Group>
          )}

          <Group title="Pago">
            {providers.length === 0 ? (
              <Notice tone="error">Esta tienda todavía no tiene un medio de pago disponible. Escríbenos para ayudarte.</Notice>
            ) : (
              <div className="space-y-3" role="radiogroup" aria-label="Medio de pago">
                {providers.map((provider) => (
                  <Choice key={provider.id} name="payment" value={provider.id} checked={payment === provider.id} onChange={() => set('payment', provider.id)} title={provider.label} description={provider.description} />
                ))}
              </div>
            )}
            <Field id="co-notes" label="Indicaciones para tu pedido (opcional)">
              <textarea id="co-notes" className="ws-field !min-h-20" maxLength={300} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </Group>

          <div className="space-y-3">
            {/* Señuelo anti-bots: fuera de la vista y del teclado. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
              <label htmlFor="co-website">No completar este campo</label>
              <input id="co-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} />
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input id="co-acceptTerms" type="checkbox" required checked={form.terms} onChange={(e) => set('terms', e.target.checked)} className="mt-1 size-4" aria-invalid={invalid('acceptTerms')} />
              <span>Acepto las condiciones de compra de esta tienda.</span>
            </label>
            {termsText && (
              <details className="ws-muted text-sm">
                <summary className="cursor-pointer font-semibold">Leer las condiciones de compra</summary>
                <p className="mt-2 break-words whitespace-pre-line">{termsText}</p>
              </details>
            )}
          </div>
        </div>

        <aside aria-label="Resumen de tu pedido" className="ws-card h-fit min-w-0 space-y-4 p-5 @4xl:sticky @4xl:top-24">
          <h2 className="ws-h text-lg">Tu pedido</h2>
          <ul className="space-y-3">
            {(quote?.lines ?? []).map((line) => (
              <li key={line.productId} className="flex gap-3 text-sm">
                <ProductImage src={line.imageUrl} alt="" className="size-12 shrink-0 rounded-[var(--ws-radius)] object-cover" />
                <span className="min-w-0 grow break-words">
                  {line.name} <span className="ws-muted">× {line.quantity}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{money(line.displayTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-2 border-t border-[color:var(--s-line)] pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="ws-muted">Productos</dt>
              <dd className="tabular-nums">{quote ? money(quote.subtotal) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="ws-muted">{delivery === 'PICKUP' ? 'Retiro' : 'Despacho'}</dt>
              <dd className="text-right tabular-nums">{delivery === 'PICKUP' ? 'Gratis' : pricing && delivery === 'SHIPPING' && rateId ? (pricing.shippingTotal === 0 ? 'Gratis' : money(pricing.shippingTotal)) : 'Elige tu región'}</dd>
            </div>
            {pricing && pricing.rounding !== 0 && (
              <div className="flex justify-between gap-3">
                <dt className="ws-muted">Ajuste por redondeo</dt>
                <dd className="tabular-nums">{money(pricing.rounding)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-[color:var(--s-line)] pt-3 text-base">
              <dt className="font-semibold">Total</dt>
              <dd className="ws-h font-bold [color:var(--s-mark)] tabular-nums">{pricing ? money(pricing.total) : '—'}</dd>
            </div>
          </dl>
          {quote?.belowMinimum && <Notice>La compra mínima de esta tienda es de {money(quote.minOrderAmount)}.</Notice>}
          {quote?.lines.some((line) => line.problem === 'OUT_OF_STOCK') && <Notice>Hay productos agotados en tu carrito. Quítalos desde el carrito para poder continuar.</Notice>}
          {submitError && <Notice tone="error">{submitError}</Notice>}
          <button type="submit" disabled={!canSubmit} className={cx('ws-btn ws-btn-main w-full', !canSubmit && 'opacity-60')}>
            {submitting ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : null}
            {submitting ? 'Procesando…' : online && pricing ? `Pagar ${money(pricing.total)}` : 'Confirmar pedido'}
          </button>
          <p className="ws-muted text-center text-xs">Los precios incluyen IVA. {online ? 'Te llevaremos a la pasarela para pagar.' : 'Te mostraremos cómo completar tu pago.'}</p>
          <a href={storeScreenHref(basePath, 'cart')} className="ws-muted block text-center text-sm underline underline-offset-4">
            Volver al carrito
          </a>
        </aside>
      </form>
    </StoreFrame>
  );
}
