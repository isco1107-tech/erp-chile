import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

/**
 * Fase B.2 de PROMPT_ERP_V2.md: prueba que la base de datos rechaza cada
 * invariante contable POR SQL CRUDO, saltándose journal.service.ts por
 * completo. Si algo de esto pasara, un bug en la capa de aplicación podría
 * dejar un asiento descuadrado, editado o contabilizado contra una cuenta
 * agrupadora, y nada lo detendría.
 */

const RUN_TAG = `INV_VERIFY_${Date.now()}`;
let passed = 0;
let failed = 0;

async function expectRejected(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    failed += 1;
    console.log(`  FAIL ${label} — se esperaba que la base lo rechazara, pero se aceptó`);
  } catch (error) {
    passed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  OK   ${label} — rechazado: ${message.split('\n')[0]?.slice(0, 90)}`);
  }
}

async function expectAccepted(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  OK   ${label} — aceptado como se esperaba`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL ${label} — se esperaba que la base lo aceptara: ${message.split('\n')[0]}`);
  }
}

async function cleanupCompany(companyId: string): Promise<void> {
  // Los triggers de inmutabilidad bloquean DELETE sobre entries/lines
  // POSTED o REVERSED, así que la limpieza normal fallaría. Se hace por SQL
  // crudo con el trigger deshabilitado solo para esta sesión de limpieza.
  await prisma.$executeRawUnsafe(`ALTER TABLE "JournalLine" DISABLE TRIGGER "trg_journal_line_immutable"`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" DISABLE TRIGGER "trg_journal_entry_immutable"`);
  try {
    await prisma.journalLine.deleteMany({ where: { companyId } });
    await prisma.journalEntry.deleteMany({ where: { companyId } });
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "JournalLine" ENABLE TRIGGER "trg_journal_line_immutable"`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "JournalEntry" ENABLE TRIGGER "trg_journal_entry_immutable"`);
  }
  await prisma.accountMapping.deleteMany({ where: { companyId } });
  await prisma.account.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.deleteMany({ where: { companyId } });
  await prisma.journalEntrySequence.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
}

async function main() {
  console.log(`=== Verificación de invariantes contables por SQL crudo (${RUN_TAG}) ===\n`);

  const company = await prisma.company.create({
    data: { rut: `${Date.now()}-K`.slice(0, 12), businessName: `${RUN_TAG} Empresa` },
  });
  const otherCompany = await prisma.company.create({
    data: { rut: `${Date.now() + 1}-K`.slice(0, 12), businessName: `${RUN_TAG} Empresa Ajena` },
  });

  const period = await prisma.accountingPeriod.create({
    data: { companyId: company.id, year: 2026, month: 1, status: 'OPEN' },
  });

  const cash = await prisma.account.create({
    data: { companyId: company.id, code: '1101', name: 'Caja', type: 'ASSET', nature: 'DEBIT', isPostable: true },
  });
  const sales = await prisma.account.create({
    data: { companyId: company.id, code: '4101', name: 'Ventas', type: 'REVENUE', nature: 'CREDIT', isPostable: true },
  });
  const groupAccount = await prisma.account.create({
    data: { companyId: company.id, code: '1', name: 'Activo', type: 'ASSET', nature: 'DEBIT', isPostable: false },
  });
  const foreignAccount = await prisma.account.create({
    data: { companyId: otherCompany.id, code: '1101', name: 'Caja Ajena', type: 'ASSET', nature: 'DEBIT', isPostable: true },
  });

  let seq = 0;
  const nextEntry = () =>
    prisma.journalEntry.create({
      data: {
        companyId: company.id,
        entryNumber: ++seq,
        year: 2026,
        date: new Date('2026-01-15'),
        description: `${RUN_TAG} asiento ${seq}`,
        periodId: period.id,
        sourceType: 'MANUAL',
        status: 'DRAFT',
      },
    });

  console.log('1. Restricción de signos (CHECK debit/credit)');
  {
    const entry = await nextEntry();
    await expectRejected('Ambos debit y credit > 0 en la misma línea', () =>
      prisma.journalLine.create({
        data: { companyId: company.id, entryId: entry.id, accountId: cash.id, debit: 100, credit: 50, lineNumber: 1 },
      })
    );
    await expectRejected('debit y credit ambos en cero', () =>
      prisma.journalLine.create({
        data: { companyId: company.id, entryId: entry.id, accountId: cash.id, debit: 0, credit: 0, lineNumber: 1 },
      })
    );
    await expectRejected('debit negativo', () =>
      prisma.journalLine.create({
        data: { companyId: company.id, entryId: entry.id, accountId: cash.id, debit: -50, credit: 0, lineNumber: 1 },
      })
    );
  }

  console.log('\n2. Solo cuentas hoja reciben líneas');
  {
    const entry = await nextEntry();
    await expectRejected('Línea contra una cuenta agrupadora (isPostable=false)', () =>
      prisma.journalLine.create({
        data: { companyId: company.id, entryId: entry.id, accountId: groupAccount.id, debit: 100, credit: 0, lineNumber: 1 },
      })
    );
    await expectRejected('Línea contra una cuenta de otra empresa', () =>
      prisma.journalLine.create({
        data: { companyId: company.id, entryId: entry.id, accountId: foreignAccount.id, debit: 100, credit: 0, lineNumber: 1 },
      })
    );
  }

  console.log('\n3. Cuadratura al contabilizar (POSTED)');
  {
    const entry = await nextEntry();
    await prisma.journalLine.create({
      data: { companyId: company.id, entryId: entry.id, accountId: cash.id, debit: 100, credit: 0, lineNumber: 1 },
    });
    await prisma.journalLine.create({
      data: { companyId: company.id, entryId: entry.id, accountId: sales.id, debit: 0, credit: 70, lineNumber: 2 },
    });
    await expectRejected('Asiento descuadrado (100 debe vs 70 haber) al pasar a POSTED', () =>
      prisma.journalEntry.update({ where: { id: entry.id }, data: { status: 'POSTED', postedAt: new Date() } })
    );

    const emptyEntry = await nextEntry();
    await expectRejected('Asiento sin líneas al pasar a POSTED', () =>
      prisma.journalEntry.update({ where: { id: emptyEntry.id }, data: { status: 'POSTED', postedAt: new Date() } })
    );
  }

  console.log('\n4. Inmutabilidad de un asiento POSTED');
  let postedEntryId = '';
  {
    const entry = await nextEntry();
    await prisma.journalLine.create({
      data: { companyId: company.id, entryId: entry.id, accountId: cash.id, debit: 100, credit: 0, lineNumber: 1 },
    });
    const line2 = await prisma.journalLine.create({
      data: { companyId: company.id, entryId: entry.id, accountId: sales.id, debit: 0, credit: 100, lineNumber: 2 },
    });
    await expectAccepted('Asiento cuadrado (100=100) pasa a POSTED', () =>
      prisma.journalEntry.update({ where: { id: entry.id }, data: { status: 'POSTED', postedAt: new Date() } })
    );
    postedEntryId = entry.id;

    await expectRejected('Editar la descripción de un asiento POSTED', () =>
      prisma.journalEntry.update({ where: { id: entry.id }, data: { description: 'intento de edición' } })
    );
    await expectRejected('Borrar un asiento POSTED', () => prisma.journalEntry.delete({ where: { id: entry.id } }));
    await expectRejected('Editar una línea de un asiento POSTED', () =>
      prisma.journalLine.update({ where: { id: line2.id }, data: { credit: 999 } })
    );
    await expectRejected('Borrar una línea de un asiento POSTED', () =>
      prisma.journalLine.delete({ where: { id: line2.id } })
    );
    await expectRejected('Hacer retroceder un asiento POSTED a DRAFT', () =>
      prisma.journalEntry.update({ where: { id: entry.id }, data: { status: 'DRAFT' } })
    );
  }

  console.log('\n5. La única transición permitida desde POSTED es a REVERSED');
  {
    await expectAccepted('POSTED -> REVERSED (sin tocar otros campos)', () =>
      prisma.journalEntry.update({ where: { id: postedEntryId }, data: { status: 'REVERSED' } })
    );
    await expectRejected('Un asiento ya REVERSED no se puede modificar más', () =>
      prisma.journalEntry.update({ where: { id: postedEntryId }, data: { description: 'otro intento' } })
    );
  }

  console.log('\n=== Limpieza ===');
  await cleanupCompany(company.id);
  await cleanupCompany(otherCompany.id);
  console.log('Empresas y datos de prueba eliminados');

  await prisma.$disconnect();
  console.log(`\n=== RESULTADO: ${passed} OK, ${failed} FAIL ===`);
  if (failed > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error('\nERROR FATAL:', error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
