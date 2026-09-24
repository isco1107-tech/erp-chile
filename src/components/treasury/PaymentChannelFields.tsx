'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { nativeSelectClass } from '@/components/ui/field-classes';
import { PAYMENT_METHOD_TYPES, PAYMENT_METHOD_TYPE_LABELS } from '@/modules/treasury/schema';
import { listTreasuryAccountOptionsAction, type AccountChoiceContext } from '@/modules/treasury/actions/accounts.actions';
import { pickDefaultAccount, type MoneyMethod, type TreasuryAccountChoice } from './MoneyMovementDialog';

export interface PaymentChannel {
  paymentMethod: MoneyMethod;
  treasuryAccountId: string;
}

export const DEFAULT_PAYMENT_CHANNEL: PaymentChannel = { paymentMethod: 'TRANSFERENCIA', treasuryAccountId: '' };

/**
 * "¿Cómo se pagó y dónde entró el dinero?" en dos selectores. Se usa en las
 * pantallas que registran pagos sin pasar por el diálogo completo de
 * Tesorería (entradas, votos, pagarés, auspicios): así cada cobro llega a la
 * caja o banco correcto y el saldo de cada cuenta cuadra.
 */
export default function PaymentChannelFields({
  context,
  value,
  onChange,
  idPrefix = 'channel',
}: {
  context: AccountChoiceContext;
  value: PaymentChannel;
  onChange: (value: PaymentChannel) => void;
  idPrefix?: string;
}) {
  const [accounts, setAccounts] = useState<TreasuryAccountChoice[]>([]);

  useEffect(() => {
    let active = true;
    listTreasuryAccountOptionsAction(context).then((result) => {
      if (!active || !result.success) return;
      setAccounts(result.data);
      if (!value.treasuryAccountId) onChange({ ...value, treasuryAccountId: pickDefaultAccount(result.data, value.paymentMethod) });
    });
    return () => {
      active = false;
    };
    // Carga única al montar; los cambios posteriores los maneja cada selector.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor={`${idPrefix}-method`}>Medio de pago</Label>
        <select
          id={`${idPrefix}-method`}
          className={nativeSelectClass}
          value={value.paymentMethod}
          onChange={(e) => {
            const paymentMethod = e.target.value as MoneyMethod;
            onChange({ paymentMethod, treasuryAccountId: pickDefaultAccount(accounts, paymentMethod) });
          }}
        >
          {PAYMENT_METHOD_TYPES.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_TYPE_LABELS[method]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-account`}>Entra a</Label>
        <select id={`${idPrefix}-account`} className={nativeSelectClass} value={value.treasuryAccountId} onChange={(e) => onChange({ ...value, treasuryAccountId: e.target.value })}>
          <option value="">Sin especificar</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
