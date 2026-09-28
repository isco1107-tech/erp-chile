'use server';

import { authErrorMessage, requireAuthWithPermission } from '@/lib/auth/guards';
import { captureException } from '@/lib/observability';
import {
  listContingencyProducts,
  listContingencySuppliers,
  listContingencyWarehouses,
  listReceivableOrders,
  type ContingencyOrder,
  type ContingencyProduct,
  type ContingencySupplier,
  type ContingencyWarehouse,
} from '../services/contingency-data.service';

export type ActionResult<T> = { success: true; data: T; message?: string } | { success: false; error: string };

export interface StockContingencyData {
  warehouses: ContingencyWarehouse[];
  products: ContingencyProduct[];
}

export interface PurchaseContingencyData {
  warehouses: ContingencyWarehouse[];
  products: ContingencyProduct[];
  suppliers: ContingencySupplier[];
}

export interface ReceiptContingencyData {
  warehouses: ContingencyWarehouse[];
  orders: ContingencyOrder[];
}

/*
 * Una acción por formulario, cada una con el MISMO permiso que la acción que
 * después aplica la operación al sincronizar: quien no puede registrar una
 * compra tampoco recibe la lista de proveedores para prepararla.
 */

export async function getStockContingencyDataAction(): Promise<ActionResult<StockContingencyData>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('inventory:write');
    companyId = session.companyId;
    const [warehouses, products] = await Promise.all([listContingencyWarehouses(session.companyId), listContingencyProducts(session.companyId)]);
    return { success: true, data: { warehouses, products } };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'offline', companyId, extra: { data: 'stock' } });
    return { success: false, error: 'No se pudieron cargar las bodegas y productos' };
  }
}

export async function getPurchaseContingencyDataAction(): Promise<ActionResult<PurchaseContingencyData>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:write');
    companyId = session.companyId;
    const [warehouses, products, suppliers] = await Promise.all([
      listContingencyWarehouses(session.companyId),
      listContingencyProducts(session.companyId),
      listContingencySuppliers(session.companyId),
    ]);
    return { success: true, data: { warehouses, products, suppliers } };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'offline', companyId, extra: { data: 'purchase' } });
    return { success: false, error: 'No se pudieron cargar los proveedores y productos' };
  }
}

export async function getReceiptContingencyDataAction(): Promise<ActionResult<ReceiptContingencyData>> {
  let companyId: string | undefined;
  try {
    const session = await requireAuthWithPermission('purchases:orders');
    companyId = session.companyId;
    const [warehouses, orders] = await Promise.all([listContingencyWarehouses(session.companyId), listReceivableOrders(session.companyId)]);
    return { success: true, data: { warehouses, orders } };
  } catch (error) {
    const authMessage = authErrorMessage(error);
    if (authMessage) return { success: false, error: authMessage };
    captureException(error, { module: 'offline', companyId, extra: { data: 'receipt' } });
    return { success: false, error: 'No se pudieron cargar las órdenes de compra' };
  }
}
