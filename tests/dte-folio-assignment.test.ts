import type { Prisma } from '@prisma/client';
import { assignSalesFolio, siiPaymentMode } from '@/modules/dte/services/stamping.service';

/**
 * Asignación de folios.
 *
 * Es la parte con consecuencias tributarias directas: un folio repetido
 * produce un documento que el SII rechaza cuando el cliente ya se llevó su
 * factura, y un folio saltado obliga a justificarlo ante el SII. Se testea
 * contra un cliente de transacción simulado porque lo que importa acá es la
 * aritmética y las transiciones de estado, no que Postgres sepa hacer un JOIN.
 */

interface CafRow {
  id: string;
  rangeFrom: number;
  rangeTo: number;
  lastAssignedFolio: number;
  siiCode: number;
  encryptedXml: string;
  status: string;
}

/**
 * El CAF se guarda cifrado, así que el servicio lo descifra y lo parsea al
 * asignar. Se fija una llave conocida y se guarda un CAF sintético válido.
 */
process.env.DTE_ENCRYPTION_KEY = 'clave-de-prueba-para-tests-1234567890';

import crypto from 'crypto';
import { encryptCafXml } from '@/lib/chile/dte/crypto';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
const CAF_XML = `<AUTORIZACION><CAF version="1.0"><DA><RE>76192083-9</RE><RS>DEMO</RS><TD>33</TD><RNG><D>101</D><H>103</H></RNG><FA>2026-01-15</FA><RSAPK><M>a</M><E>Aw==</E></RSAPK><IDK>300</IDK></DA><FRMA algoritmo="SHA1withRSA">X==</FRMA></CAF><RSASK>${privateKey
  .export({ type: 'pkcs1', format: 'pem' })
  .toString()}</RSASK><RSAPUBK>${publicKey.export({ type: 'spki', format: 'pem' }).toString()}</RSAPUBK></AUTORIZACION>`;

/** Construye un cliente de transacción simulado sobre un conjunto de CAF en memoria. */
function makeTx(cafs: CafRow[], sequence: { currentFolio: number } = { currentFolio: 0 }) {
  const upserts: number[] = [];

  const tx = {
    async $queryRaw() {
      // Reproduce el SELECT ... FOR UPDATE: el rango activo más antiguo que
      // todavía tenga folios libres.
      const candidato = cafs
        .filter((caf) => caf.status === 'ACTIVE' && caf.lastAssignedFolio < caf.rangeTo)
        .sort((a, b) => a.rangeFrom - b.rangeFrom)[0];
      return candidato ? [{ id: candidato.id }] : [];
    },
    dteCaf: {
      async findFirst({ where }: { where: { id: string } }) {
        return cafs.find((caf) => caf.id === where.id) ?? null;
      },
      async updateMany({ where, data }: { where: { id: string }; data: Partial<CafRow> }) {
        const fila = cafs.find((caf) => caf.id === where.id);
        if (fila) Object.assign(fila, data);
        return { count: fila ? 1 : 0 };
      },
    },
    folioSequence: {
      async upsert() {
        sequence.currentFolio += 1;
        upserts.push(sequence.currentFolio);
        return { currentFolio: sequence.currentFolio };
      },
    },
  };

  return { tx: tx as unknown as Prisma.TransactionClient, cafs, upserts, sequence };
}

function cafRow(overrides: Partial<CafRow> = {}): CafRow {
  return {
    id: 'caf_1',
    rangeFrom: 101,
    rangeTo: 103,
    lastAssignedFolio: 0,
    siiCode: 33,
    encryptedXml: encryptCafXml(CAF_XML),
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('Asignación de folio desde un CAF', () => {
  it('entrega rangeFrom como primer folio de un rango sin estrenar', async () => {
    // lastAssignedFolio = 0 significa "ninguno usado", no "se usó el folio 0":
    // confundirlo desperdicia el primer folio autorizado de cada CAF.
    const { tx, cafs } = makeTx([cafRow()]);

    const resultado = await assignSalesFolio(tx, 'cmp_1', 'FACTURA_33');

    expect(resultado.folio).toBe(101);
    expect(resultado.cafId).toBe('caf_1');
    expect(cafs[0].lastAssignedFolio).toBe(101);
  });

  it('avanza correlativamente dentro del rango', async () => {
    const { tx } = makeTx([cafRow()]);

    const primero = await assignSalesFolio(tx, 'cmp_1', 'FACTURA_33');
    const segundo = await assignSalesFolio(tx, 'cmp_1', 'FACTURA_33');

    expect(primero.folio).toBe(101);
    expect(segundo.folio).toBe(102);
  });

  it('marca el rango como agotado al entregar el último folio', async () => {
    const { tx, cafs } = makeTx([cafRow({ lastAssignedFolio: 102 })]);

    const resultado = await assignSalesFolio(tx, 'cmp_1', 'FACTURA_33');

    expect(resultado.folio).toBe(103);
    expect(cafs[0].status).toBe('EXHAUSTED');
  });

  it('pasa al rango siguiente cuando el anterior se agotó', async () => {
    // El SII espera que los folios se consuman en orden: primero se termina el
    // rango antiguo y recién ahí se entra al nuevo.
    const { tx } = makeTx([
      cafRow({ id: 'viejo', rangeFrom: 101, rangeTo: 101, lastAssignedFolio: 101, status: 'EXHAUSTED' }),
      cafRow({ id: 'nuevo', rangeFrom: 500, rangeTo: 600, lastAssignedFolio: 0 }),
    ]);

    const resultado = await assignSalesFolio(tx, 'cmp_1', 'FACTURA_33');

    expect(resultado.folio).toBe(500);
    expect(resultado.cafId).toBe('nuevo');
  });

  it('consume primero el rango más antiguo aunque exista uno nuevo', async () => {
    const { tx } = makeTx([
      cafRow({ id: 'nuevo', rangeFrom: 500, rangeTo: 600, lastAssignedFolio: 0 }),
      cafRow({ id: 'viejo', rangeFrom: 101, rangeTo: 103, lastAssignedFolio: 0 }),
    ]);

    const resultado = await assignSalesFolio(tx, 'cmp_1', 'FACTURA_33');

    expect(resultado.cafId).toBe('viejo');
    expect(resultado.folio).toBe(101);
  });

  it('devuelve el material de timbrado junto con el folio', async () => {
    const { tx } = makeTx([cafRow()]);

    const resultado = await assignSalesFolio(tx, 'cmp_1', 'FACTURA_33');

    expect(resultado.stamping).not.toBeNull();
    expect(resultado.stamping?.siiCode).toBe(33);
    expect(resultado.stamping?.cafBlockXml).toContain('<FRMA');
    expect(resultado.stamping?.privateKeyPem).toContain('BEGIN RSA PRIVATE KEY');
  });

  it('ignora rangos revocados', async () => {
    const { tx, upserts } = makeTx([cafRow({ status: 'REVOKED' })]);

    const resultado = await assignSalesFolio(tx, 'cmp_1', 'FACTURA_33');

    // Sin rangos utilizables cae al contador interno.
    expect(resultado.stamping).toBeNull();
    expect(upserts).toEqual([1]);
  });
});

describe('Respaldo con numeración interna', () => {
  it('usa el contador interno cuando la empresa no tiene ningún CAF', async () => {
    // Hay empresas operando hoy sin CAF cargado; exigirlo de golpe les
    // detendría la facturación. El documento queda sin timbre y eso se refleja
    // en `stamping: null`, no solo en la interfaz.
    const { tx } = makeTx([]);

    const resultado = await assignSalesFolio(tx, 'cmp_1', 'FACTURA_33');

    expect(resultado.folio).toBe(1);
    expect(resultado.cafId).toBeNull();
    expect(resultado.stamping).toBeNull();
  });

  it('nunca busca CAF para una cotización', async () => {
    // Una cotización no es un DTE: no lleva folio del SII ni timbre.
    const { tx } = makeTx([cafRow()], { currentFolio: 7 });

    const resultado = await assignSalesFolio(tx, 'cmp_1', 'COTIZACION');

    expect(resultado.folio).toBe(8);
    expect(resultado.stamping).toBeNull();
  });
});

describe('Forma de pago del SII', () => {
  it('traduce crédito a 2 y todo lo demás a contado', () => {
    expect(siiPaymentMode('CREDITO_30')).toBe(2);
    expect(siiPaymentMode('EFECTIVO')).toBe(1);
    expect(siiPaymentMode('TRANSFERENCIA')).toBe(1);
  });
});
