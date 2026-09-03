'use client';

import { useRef, useState } from 'react';
import type { Company, CompanySettings } from '@prisma/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RutInput } from '@/components/ui/RutInput';
import { updateCompanyProfileAction, updateCompanySettingsAction } from '@/lib/actions/company';
import { extractBrandPalette } from '@/lib/branding/extract-color';

interface CompanyProfileFormProps {
  company: Company;
  settings: CompanySettings;
}

async function uploadLogo(file: File, brandPalette: string[]): Promise<string> {
  const form = new FormData();
  form.append('kind', 'logo');
  form.append('file', file);
  if (brandPalette.length > 0) form.append('brandPalette', JSON.stringify(brandPalette));
  const res = await fetch('/api/branding/upload', { method: 'POST', body: form });
  const json = await res.json();
  if (!json.success) throw new Error(json.error ?? 'No se pudo subir la imagen');
  return json.data.url as string;
}

export default function CompanyProfileForm({ company, settings }: CompanyProfileFormProps) {
  const [rut, setRut] = useState(company.rut);
  const [businessName, setBusinessName] = useState(company.businessName);
  const [giro, setGiro] = useState(company.giro ?? '');
  const [address, setAddress] = useState(company.address ?? '');
  const [comuna, setComuna] = useState(company.comuna ?? '');
  const [ciudad, setCiudad] = useState(company.ciudad ?? '');
  const [phone, setPhone] = useState(company.phone ?? '');
  const [logoUrl, setLogoUrl] = useState(company.logoUrl ?? '');
  const [brandPalette, setBrandPalette] = useState<string[]>(company.brandPalette ?? []);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [actividadEconomicaCodigo, setActividadEconomicaCodigo] = useState(company.actividadEconomicaCodigo ?? '');
  const [saving, setSaving] = useState(false);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const detectedPalette = await extractBrandPalette(file);
      const url = await uploadLogo(file, detectedPalette);
      setLogoUrl(url);
      setBrandPalette(detectedPalette);
      toast.success(detectedPalette.length > 0 ? 'Logo actualizado — panel personalizado con su paleta' : 'Logo actualizado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo subir el logo');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }
  const [industryType, setIndustryType] = useState(settings.industryType);
  const [allowNegativeStock, setAllowNegativeStock] = useState(settings.allowNegativeStock);
  const [ppmRate, setPpmRate] = useState(String(settings.ppmRateBasisPoints / 100));
  const [retentionRate, setRetentionRate] = useState(String(settings.honorariumRetentionBps / 100));
  const [fiscalYear, setFiscalYear] = useState(String(settings.fiscalYear));
  const [noApprovalThreshold, setNoApprovalThreshold] = useState(settings.purchaseApprovalThreshold == null);
  const [approvalThreshold, setApprovalThreshold] = useState(settings.purchaseApprovalThreshold ?? 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await updateCompanyProfileAction({
        rut,
        businessName,
        giro: giro || undefined,
        address: address || undefined,
        comuna: comuna || undefined,
        ciudad: ciudad || undefined,
        phone: phone || undefined,
        logoUrl: logoUrl || undefined,
        actividadEconomicaCodigo: actividadEconomicaCodigo || undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const settingsResult = await updateCompanySettingsAction({
        industryType,
        allowNegativeStock,
        ppmRateBasisPoints: Math.round(Number(ppmRate) * 100),
        honorariumRetentionBps: Math.round(Number(retentionRate) * 100),
        fiscalYear: Number(fiscalYear),
        purchaseApprovalThreshold: noApprovalThreshold ? null : approvalThreshold,
      });
      if (!settingsResult.success) {
        toast.error(settingsResult.error);
        return;
      }
      toast.success(result.message ?? 'Perfil actualizado');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4 rounded-xl border border-border p-4">
      <p className="text-sm text-muted-foreground">
        Estos datos se utilizan en el encabezado de las facturas y documentos tributarios electrónicos.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="businessName">Razón Social</Label>
          <Input id="businessName" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="rut">RUT Emisor</Label>
          <RutInput id="rut" value={rut} onChange={setRut} required />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="giro">Giro Comercial</Label>
          <Input id="giro" value={giro} onChange={(e) => setGiro(e.target.value)} placeholder="Ej: Venta al por menor de..." />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="address">Dirección</Label>
          <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="comuna">Comuna</Label>
          <Input id="comuna" value={comuna} onChange={(e) => setComuna(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="ciudad">Ciudad</Label>
          <Input id="ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="actividadEconomicaCodigo">Código Actividad Económica</Label>
          <Input id="actividadEconomicaCodigo" value={actividadEconomicaCodigo} onChange={(e) => setActividadEconomicaCodigo(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Logo de la empresa</Label>
        <div className="mt-1 flex items-center gap-3">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Logo de la empresa" className="size-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">Sin logo</span>
            )}
          </div>
          <div className="space-y-1">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={handleLogoChange}
            />
            <Button type="button" size="sm" variant="outline" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
              {uploadingLogo ? 'Subiendo...' : logoUrl ? 'Cambiar logo' : 'Subir logo'}
            </Button>
            <p className="text-xs text-muted-foreground">PNG, JPG, WEBP, GIF o SVG, hasta 5 MB. Se usa en el menú, documentos y como marca de agua del panel.</p>
            {brandPalette.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  {brandPalette.map((hex) => (
                    <span key={hex} className="inline-block size-3.5 rounded-full border border-border" style={{ backgroundColor: hex }} />
                  ))}
                </span>
                Paleta detectada en tu logo: la usamos para el texto, los acentos y los gráficos del panel.
              </p>
            )}
          </div>
        </div>
      </div>

      <Button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar Cambios'}</Button>
      <div className="border-t border-border pt-4">
        <p className="hud-label mb-3">Configuración operativa y tributaria</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><Label htmlFor="industryType">Industria</Label><select id="industryType" className="h-10 w-full rounded-xl border border-input bg-muted px-3 text-sm text-foreground" value={industryType} onChange={(e) => setIndustryType(e.target.value as typeof industryType)}><option value="SERVICES">Servicios</option><option value="COMMERCE">Comercio</option><option value="DISTRIBUTION">Distribución</option><option value="RETAIL">Retail</option><option value="LIGHT_MANUFACTURING">Manufactura ligera</option></select></div>
          <div><Label htmlFor="ppmRate">Tasa PPM (%)</Label><Input id="ppmRate" type="number" min="0" max="100" step="0.01" value={ppmRate} onChange={(e) => setPpmRate(e.target.value)} /></div>
          <div><Label htmlFor="retentionRate">Retención honorarios (%)</Label><Input id="retentionRate" type="number" min="0" max="100" step="0.01" value={retentionRate} onChange={(e) => setRetentionRate(e.target.value)} /></div>
          <div><Label htmlFor="fiscalYear">Año fiscal</Label><Input id="fiscalYear" type="number" min="2020" max="2100" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} /></div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={allowNegativeStock} onChange={(e) => setAllowNegativeStock(e.target.checked)} /> Permitir ventas con stock negativo</label>

        <div className="mt-4 border-t border-border pt-4">
          <Label htmlFor="approvalThreshold">Umbral de aprobación de compras</Label>
          <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={noApprovalThreshold} onChange={(e) => setNoApprovalThreshold(e.target.checked)} />
            Sin umbral (ninguna compra requiere aprobación)
          </label>
          {!noApprovalThreshold && (
            <>
              <CurrencyInput id="approvalThreshold" className="mt-1.5 max-w-xs" value={approvalThreshold} onChange={setApprovalThreshold} />
              <p className="mt-1 text-xs text-muted-foreground">
                Compras emitidas por sobre este monto quedan pendientes de aprobación (Dueño/Administrador) antes de afectar inventario.
              </p>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
