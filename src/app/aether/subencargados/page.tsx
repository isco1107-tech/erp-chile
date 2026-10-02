import LegalDocumentLayout from '@/components/legal/LegalDocumentLayout';
import { SCOPE_LABELS, SUBPROCESSORS } from '@/lib/privacy/subprocessors';

export const metadata = { title: 'Subencargados del tratamiento — Aether ERP Solutions' };

/**
 * Lista pública de proveedores que tratan datos personales por cuenta de la
 * plataforma o de las empresas. Sale del mismo registro que usa el código
 * (`src/lib/privacy/subprocessors.ts`): si un servicio cambia, esta página
 * cambia con él.
 */
export default function SubencargadosPage() {
  return (
    <LegalDocumentLayout
      eyebrow="Aether ERP Solutions"
      title="Subencargados del tratamiento"
      lastUpdated="2 de octubre de 2026"
      backHref="/aether/privacidad"
      backLabel="Volver a la política de privacidad"
    >
      <p>
        Estos son los proveedores que pueden tratar datos personales para que la plataforma funcione. «Plataforma» significa que Aether los usa para todas
        las empresas; «Cuenta de la empresa» significa que la empresa conecta su propia cuenta; «Opcional» significa que solo se usan si se configuran.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pr-3">Proveedor</th>
              <th className="py-2 pr-3">Servicio</th>
              <th className="py-2 pr-3">Datos que recibe</th>
              <th className="py-2 pr-3">Ubicación</th>
              <th className="py-2">Alcance</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((provider) => (
              <tr key={provider.id} className="border-b border-border align-top">
                <td className="py-2 pr-3 font-medium">{provider.name}</td>
                <td className="py-2 pr-3">{provider.service}</td>
                <td className="py-2 pr-3">{provider.data}</td>
                <td className="py-2 pr-3">{provider.location}</td>
                <td className="py-2">{SCOPE_LABELS[provider.scope]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Si se agrega o cambia un subencargado, esta página se actualiza. Las empresas usuarias pueden revisar el detalle de sus obligaciones en el{' '}
        <a href="/aether/encargado">contrato de encargo de tratamiento</a>.
      </p>
    </LegalDocumentLayout>
  );
}
