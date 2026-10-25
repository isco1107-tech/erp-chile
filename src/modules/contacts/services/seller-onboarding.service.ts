import 'server-only';
import { prisma } from '@/lib/prisma';
import { LOCKING_TX_OPTIONS } from '@/lib/prisma-tx';
import type { ContactCreateInput } from '../schema';
import type { SellerInvitationInput } from '@/lib/supplier-portal/identity';
import { createContact } from './contacts.service';
import {
  prepareSupplierInvitation,
  deliverSupplierInvitation,
  type InviteActor,
} from '@/modules/inventory/services/seller-center.service';

/** Contact and access commit together; transport failures never undo a saved seller. */
export async function createSellerWithInvitation(
  companyId: string,
  actor: InviteActor,
  input: ContactCreateInput,
  access: SellerInvitationInput,
) {
  const prepared = await prisma.$transaction(async (tx) => {
    const contact = await createContact(companyId, input, tx);
    const invitation = await prepareSupplierInvitation(
      companyId,
      contact.id,
      actor,
      access,
      new Date(),
      tx,
    );
    return { contact, invitation };
  }, LOCKING_TX_OPTIONS);
  const onboarding = await deliverSupplierInvitation(prepared.invitation);
  return { contact: prepared.contact, onboarding };
}
