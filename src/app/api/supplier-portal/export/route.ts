import { NextResponse } from 'next/server';
import { santiagoDateParts } from '@/lib/chile/timezone';
import { captureException } from '@/lib/observability';
import { isMonthKey } from '@/lib/supplier-portal/accounts';
import { currentSupplierAccount } from '@/lib/supplier-portal/current-account';
import { getSellerCenterView } from '@/modules/inventory/services/seller-center-view.service';
import { buildSellerCenterWorkbook } from '@/modules/inventory/services/seller-center-export.service';
import { json } from '../http';

/** El mes del Seller Center a Excel, para la persona con sesión. Lo mismo que ve en pantalla. */
export async function GET(req: Request) {
  const account = await currentSupplierAccount();
  if (!account) return json({ success: false, error: 'Tu sesión venció. Vuelve a ingresar' }, 401);
  try {
    const requested = new URL(req.url).searchParams.get('mes');
    const today = santiagoDateParts(new Date());
    const month = isMonthKey(requested) ? requested : `${today.year}-${String(today.month).padStart(2, '0')}`;
    const view = await getSellerCenterView(account, month);
    const buffer = await buildSellerCenterWorkbook(view, { company: account.company.name, supplier: account.supplier.name });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="portal-proveedor-${month}.xlsx"`,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    captureException(error, { module: 'portal-proveedores', companyId: account.companyId, extra: { reason: 'seller-center-export' } });
    return json({ success: false, error: 'No se pudo generar el archivo' }, 500);
  }
}
