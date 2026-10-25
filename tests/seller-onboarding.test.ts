import {
  normalizeSellerPhone,
  sellerIdentifierSchema,
  sellerInvitationSchema,
  sellerDeliveryMessage,
} from '@/lib/supplier-portal/identity';
import { contactCreateWithAccessSchema } from '@/modules/contacts/schema';

describe('identidad e invitación de Seller Center', () => {
  it.each(['912345678', '9 1234 5678', '56912345678', '+56 (9) 1234-5678'])(
    'normaliza el celular chileno %s',
    (value) => {
      expect(normalizeSellerPhone(value)).toBe('+56912345678');
    },
  );
  it.each([
    '',
    '+0 123456789',
    '++56912345678',
    '56+912345678',
    'fono 912345678',
    '123',
    '912345678x',
    '000000000',
  ])('rechaza un identificador ambiguo %s', (value) => {
    expect(normalizeSellerPhone(value)).toBeNull();
  });
  it('admite otros países con prefijo y normaliza el correo', () => {
    expect(sellerIdentifierSchema.parse('+54 9 11 1234 5678')).toBe(
      '+5491112345678',
    );
    expect(sellerIdentifierSchema.parse(' ROSA@CAMPO.CL ')).toBe(
      'rosa@campo.cl',
    );
  });
  it('no permite vincular un correo y un teléfono a una identidad por una invitación administrativa', () => {
    expect(
      sellerInvitationSchema.safeParse({
        name: 'Rosa',
        email: 'rosa@campo.cl',
        phone: '+56912345678',
      }).success,
    ).toBe(false);
    expect(
      sellerInvitationSchema.parse({ name: ' Rosa ', phone: '9 1234 5678' }),
    ).toEqual({ name: 'Rosa', phone: '+56912345678' });
  });
  it('un contacto normal no implica dar acceso; el alta con acceso valida su destinatario', () => {
    const contact = {
      rut: '12.345.678-5',
      razonSocial: 'Miel del Sur',
      isConsignor: true,
      consignmentCommissionBps: 2000,
    };
    expect(
      contactCreateWithAccessSchema.parse(contact).sellerCenterAccess,
    ).toBeUndefined();
    expect(
      contactCreateWithAccessSchema.safeParse({
        ...contact,
        sellerCenterAccess: { name: 'Rosa', phone: '123' },
      }).success,
    ).toBe(false);
  });
  it('distingue correo enviado, pendiente de configuración, fallo y WhatsApp manual', () => {
    expect(sellerDeliveryMessage('sent')).toContain('enviada por correo');
    expect(sellerDeliveryMessage('logged')).toContain(
      'no tiene el envío de correos configurado',
    );
    expect(sellerDeliveryMessage('failed')).toContain('no pudo enviarse');
    expect(sellerDeliveryMessage('whatsapp')).toContain('Compártela');
  });
});
