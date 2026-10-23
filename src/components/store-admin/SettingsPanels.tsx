'use client';

import { useState, type ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Switch } from '@/components/ui/switch';
import { nativeSelectClass, textareaClass } from '@/components/ui/field-classes';
import { MAX_TRANSFER_HOLD_HOURS, MIN_TRANSFER_HOLD_HOURS, PAYMENT_PROVIDER_INFO } from '@/lib/ecommerce/payment';
import { MAX_SHIPPING_RATES, REGION_NAMES } from '@/lib/ecommerce/shipping';
import type { StoreSettingsView } from '@/modules/ecommerce/services/store-settings.service';
import type { SettingsDraft } from './settings-draft';

interface PanelProps {
  draft: SettingsDraft;
  patch: (changes: Partial<SettingsDraft>) => void;
  settings: StoreSettingsView;
  disabled: boolean;
}

function Card({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="max-w-2xl text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm font-medium">
      {label}
      {children}
      {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

let rateCounter = 0;
const newRateId = () => `t${Date.now().toString(36)}${(rateCounter++).toString(36)}`;

// ---------------------------------------------------------------------------
// Envíos y retiro
// ---------------------------------------------------------------------------

export function ShippingPanel({ draft, patch, disabled }: PanelProps) {
  const setRate = (index: number, changes: Partial<SettingsDraft['shippingRates'][number]>) => patch({ shippingRates: draft.shippingRates.map((rate, i) => (i === index ? { ...rate, ...changes } : rate)) });
  return (
    <div className="space-y-5">
      <Card title="Retiro en tienda" description="El comprador retira sin costo en la dirección que indiques. Es necesario para ofrecer «Pagar al retirar».">
        <div className="flex items-center gap-3">
          <Switch checked={draft.pickupEnabled} onCheckedChange={(value) => patch({ pickupEnabled: value })} disabled={disabled} label="Ofrecer retiro en tienda" />
          <span className="text-sm">{draft.pickupEnabled ? 'Ofreces retiro' : 'No ofreces retiro'}</span>
        </div>
        {draft.pickupEnabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dirección de retiro"><Input value={draft.pickupAddress} onChange={(event) => patch({ pickupAddress: event.target.value })} maxLength={200} disabled={disabled} placeholder="Av. Alemania 0123, Temuco" /></Field>
            <Field label="Horario o instrucciones" hint="Opcional. Lo ve el comprador al elegir retiro."><Input value={draft.pickupInstructions} onChange={(event) => patch({ pickupInstructions: event.target.value })} maxLength={300} disabled={disabled} placeholder="Lunes a viernes de 9 a 18" /></Field>
          </div>
        )}
      </Card>

      <Card
        title="Despacho a domicilio"
        description="Tú fijas el precio de cada tarifa (con IVA incluido) y a qué regiones llega. Aether no consulta a ningún courier: el valor es el que quieras cobrar."
        action={<Switch checked={draft.shippingEnabled} onCheckedChange={(value) => patch({ shippingEnabled: value })} disabled={disabled} label="Ofrecer despacho a domicilio" />}
      >
        {draft.shippingEnabled && (
          <div className="space-y-4">
            {draft.shippingRates.length === 0 && <p className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">Todavía no tienes tarifas. Crea la primera para poder despachar.</p>}
            {draft.shippingRates.map((rate, index) => (
              <fieldset key={rate.id} disabled={disabled} className="space-y-3 rounded-lg border border-border p-4">
                <legend className="px-1 text-xs font-medium text-muted-foreground">Tarifa {index + 1}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nombre"><Input value={rate.name} onChange={(event) => setRate(index, { name: event.target.value })} maxLength={60} placeholder="Despacho a Santiago" /></Field>
                  <Field label="Precio con IVA" hint="0 = despacho gratis."><CurrencyInput value={rate.price} onChange={(value) => setRate(index, { price: value })} /></Field>
                  <Field label="Gratis desde (compra con IVA)" hint="Vacío = nunca es gratis."><CurrencyInput value={rate.freeOver ?? 0} onChange={(value) => setRate(index, { freeOver: value > 0 ? value : null })} placeholder="Sin envío gratis" /></Field>
                  <Field label="Nota para el comprador (opcional)"><Input value={rate.note} onChange={(event) => setRate(index, { note: event.target.value })} maxLength={160} /></Field>
                  <Field label="Plazo mínimo (días hábiles)"><Input type="number" min={0} max={60} value={rate.minDays ?? ''} onChange={(event) => setRate(index, { minDays: event.target.value === '' ? null : Math.max(0, Math.min(60, Number(event.target.value) || 0)) })} /></Field>
                  <Field label="Plazo máximo (días hábiles)"><Input type="number" min={0} max={60} value={rate.maxDays ?? ''} onChange={(event) => setRate(index, { maxDays: event.target.value === '' ? null : Math.max(0, Math.min(60, Number(event.target.value) || 0)) })} /></Field>
                </div>
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">{rate.regions.length === 0 ? 'Llega a todo Chile' : `Llega a ${rate.regions.length} ${rate.regions.length === 1 ? 'región' : 'regiones'}`}</summary>
                  <div className="mt-2 space-y-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setRate(index, { regions: [] })}>Todo Chile</Button>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {REGION_NAMES.map((name) => (
                        <li key={name}>
                          <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={rate.regions.includes(name)} onChange={(event) => setRate(index, { regions: event.target.checked ? [...rate.regions, name] : rate.regions.filter((region) => region !== name) })} />{name}</label>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">Sin ninguna marcada, la tarifa llega a todo Chile.</p>
                  </div>
                </details>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => patch({ shippingRates: draft.shippingRates.filter((_, i) => i !== index) })}>
                  <Trash2 className="size-4" aria-hidden="true" /> Quitar tarifa
                </Button>
              </fieldset>
            ))}
            {draft.shippingRates.length < MAX_SHIPPING_RATES && (
              <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => patch({ shippingRates: [...draft.shippingRates, { id: newRateId(), name: '', regions: [], price: 0, freeOver: null, minDays: null, maxDays: null, note: '' }] })}>
                <Plus className="size-4" aria-hidden="true" /> Agregar tarifa
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Medios de pago
// ---------------------------------------------------------------------------

export function PaymentsPanel({ draft, patch, settings, disabled }: PanelProps) {
  const [editingSecret, setEditingSecret] = useState(false);
  const has = (provider: SettingsDraft['paymentMethods'][number]) => draft.paymentMethods.includes(provider);
  const toggle = (provider: SettingsDraft['paymentMethods'][number], on: boolean) => patch({ paymentMethods: on ? [...draft.paymentMethods, provider] : draft.paymentMethods.filter((item) => item !== provider) });
  const webpayReady = Boolean(draft.webpayCommerceCode.trim() && ((settings.webpayHasSecret && !draft.clearWebpaySecret) || draft.webpayApiSecret));

  return (
    <div className="space-y-5">
      <Card
        title={PAYMENT_PROVIDER_INFO.KHIPU.label}
        description="Pago por transferencia desde la app del banco. Usa la llave de Khipu de tu empresa, la misma del cobro de cuotas."
        action={<Switch checked={has('KHIPU')} onCheckedChange={(value) => toggle('KHIPU', value)} disabled={disabled} label="Cobrar con Khipu" />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={settings.khipuConfigured ? 'success' : 'warning'}>{settings.khipuConfigured ? 'Khipu conectado' : 'Khipu sin conectar'}</StatusBadge>
          {!settings.khipuConfigured && <p className="text-xs text-muted-foreground">Conéctalo en Configuración → Datos de la empresa → «Cobro en línea (Khipu)». Mientras no esté conectado, este medio no se ofrece.</p>}
        </div>
      </Card>

      <Card
        title={PAYMENT_PROVIDER_INFO.WEBPAY.label}
        description="Débito, crédito y prepago en el sitio seguro de Transbank. Necesitas tu código de comercio y tu llave secreta (te las entrega Transbank)."
        action={<Switch checked={has('WEBPAY')} onCheckedChange={(value) => toggle('WEBPAY', value)} disabled={disabled} label="Cobrar con Webpay Plus" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Código de comercio"><Input value={draft.webpayCommerceCode} onChange={(event) => patch({ webpayCommerceCode: event.target.value.replace(/\D/g, '') })} maxLength={20} inputMode="numeric" disabled={disabled} autoComplete="off" /></Field>
          <div className="space-y-1">
            <label htmlFor="webpay-secret" className="block text-sm font-medium">Llave secreta</label>
            {settings.webpayHasSecret && !draft.clearWebpaySecret && !editingSecret ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="success">Llave guardada</StatusBadge>
                <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setEditingSecret(true)}>Reemplazar</Button>
                <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => patch({ clearWebpaySecret: true, webpayApiSecret: '' })}>Borrar</Button>
              </div>
            ) : (
              <>
                <Input id="webpay-secret" type="password" value={draft.webpayApiSecret} onChange={(event) => patch({ webpayApiSecret: event.target.value, clearWebpaySecret: false })} maxLength={200} autoComplete="new-password" disabled={disabled} />
                <p className="text-xs text-muted-foreground">Se guarda cifrada y nunca se vuelve a mostrar.{draft.clearWebpaySecret && ' La llave guardada se borrará al guardar.'}</p>
              </>
            )}
          </div>
        </div>
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">Ambiente</legend>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="webpay-env" checked={!draft.webpayProduction} onChange={() => patch({ webpayProduction: false })} /> Integración (pruebas, no cobra de verdad)</label>
            <label className="flex items-center gap-2 text-sm"><input type="radio" name="webpay-env" checked={draft.webpayProduction} onChange={() => patch({ webpayProduction: true })} /> Producción</label>
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={webpayReady ? 'success' : 'warning'}>{webpayReady ? 'Webpay configurado' : 'Faltan datos de Webpay'}</StatusBadge>
          {draft.webpayProduction && <p className="text-xs text-muted-foreground">En producción cada compra cobra dinero real.</p>}
        </div>
      </Card>

      <Card
        title={PAYMENT_PROVIDER_INFO.TRANSFER.label}
        description="El comprador ve tus datos bancarios y transfiere; tú confirmas el pago a mano en el pedido, y recién ahí se emite la venta."
        action={<Switch checked={has('TRANSFER')} onCheckedChange={(value) => toggle('TRANSFER', value)} disabled={disabled} label="Cobrar por transferencia bancaria" />}
      >
        <Field label="Datos para transferir" hint="Banco, tipo y número de cuenta, titular, RUT y correo. Se muestra solo después de que el comprador hace su pedido.">
          <textarea className={textareaClass} value={draft.bankTransferInfo} onChange={(event) => patch({ bankTransferInfo: event.target.value })} maxLength={600} rows={4} disabled={disabled} />
        </Field>
        <Field label="Horas que guardamos su pedido esperando el pago" hint={`Entre ${MIN_TRANSFER_HOLD_HOURS} y ${MAX_TRANSFER_HOLD_HOURS} horas. Pasado ese tiempo el pedido vence y el stock se libera.`}>
          <Input type="number" min={MIN_TRANSFER_HOLD_HOURS} max={MAX_TRANSFER_HOLD_HOURS} value={draft.transferHoldHours} onChange={(event) => patch({ transferHoldHours: Math.max(MIN_TRANSFER_HOLD_HOURS, Math.min(MAX_TRANSFER_HOLD_HOURS, Number(event.target.value) || MIN_TRANSFER_HOLD_HOURS)) })} disabled={disabled} className="max-w-32" />
        </Field>
      </Card>

      <Card
        title={PAYMENT_PROVIDER_INFO.PAY_ON_PICKUP.label}
        description="Reservas el pedido y el comprador paga cuando lo retira. Solo sirve con retiro en tienda; tú confirmas el cobro al entregarlo."
        action={<Switch checked={has('PAY_ON_PICKUP')} onCheckedChange={(value) => toggle('PAY_ON_PICKUP', value)} disabled={disabled} label="Permitir pagar al retirar" />}
      >
        {has('PAY_ON_PICKUP') && !draft.pickupEnabled && <p className="text-xs text-danger">Para usarlo, habilita el retiro en la pestaña «Envíos».</p>}
      </Card>

      <Card title="Documento tributario" description="Por defecto el comprador recibe una boleta. Con esto encendido puede pedir factura (te da sus datos de empresa).">
        <div className="flex items-center gap-3">
          <Switch checked={draft.invoiceEnabled} onCheckedChange={(value) => patch({ invoiceEnabled: value })} disabled={disabled} label="Permitir pedir factura" />
          <span className="text-sm">{draft.invoiceEnabled ? 'El comprador puede pedir factura' : 'Solo se emite boleta'}</span>
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ajustes generales
// ---------------------------------------------------------------------------

export function GeneralPanel({ draft, patch, disabled, warehouses }: PanelProps & { warehouses: Array<{ id: string; name: string }> }) {
  return (
    <div className="space-y-5">
      <Card title="Bodega y contacto">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bodega de la que sale lo que vendes" hint="Su stock es el que se muestra y el que se descuenta al cobrar.">
            <select className={nativeSelectClass} value={draft.warehouseId} onChange={(event) => patch({ warehouseId: event.target.value })} disabled={disabled}>
              <option value="">Elige una bodega</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </Field>
          <Field label="Compra mínima (con IVA)" hint="0 = sin mínimo."><CurrencyInput value={draft.minOrderAmount} onChange={(value) => patch({ minOrderAmount: value })} disabled={disabled} /></Field>
          <Field label="Teléfono o WhatsApp para dudas" hint="Aparece en el carrito y en el seguimiento del pedido."><Input value={draft.supportPhone} onChange={(event) => patch({ supportPhone: event.target.value })} maxLength={30} inputMode="tel" disabled={disabled} /></Field>
          <Field label="Correo de avisos" hint="Recibe un aviso de cada pedido nuevo. Vacío = solo la campanita del panel."><Input type="email" value={draft.notifyEmail} onChange={(event) => patch({ notifyEmail: event.target.value })} maxLength={120} disabled={disabled} /></Field>
        </div>
      </Card>
      <Card title="Términos y devoluciones" description="El comprador acepta los términos al pagar. Te protegen a ti: cuenta los plazos de despacho, los cambios y las devoluciones.">
        <Field label="Términos de la compra"><textarea className={textareaClass} value={draft.termsText} onChange={(event) => patch({ termsText: event.target.value })} maxLength={6000} rows={5} disabled={disabled} /></Field>
        <Field label="Cambios y devoluciones" hint="Se muestra en la ficha de cada producto."><textarea className={textareaClass} value={draft.returnsText} onChange={(event) => patch({ returnsText: event.target.value })} maxLength={6000} rows={4} disabled={disabled} /></Field>
      </Card>
    </div>
  );
}
