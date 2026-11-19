import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/lib/prisma';
import { put } from '../src/lib/storage/blob';
import { SNIFFED_IMAGE_EXTENSION, sniffImageType } from '../src/lib/security/file-signature';
import { assertScriptCanRun } from './lib/guard-production';
import { buildFiestaDesign, FIESTA, logoNameFromFile, type FiestaLogo } from './lib/fiesta-primavera';

/**
 * Crea el certamen «Fiesta de la Primavera Temuco» para CR Producciones con
 * su micrositio (acento Primavera: verde, dorado y rosado) y el estudio
 * visual ya armado después de la portada: cinta en movimiento, la historia de
 * la fiesta, las tradiciones, el carrusel de auspiciadores y la invitación a
 * postular o auspiciar. El contenido vive en `scripts/lib/fiesta-primavera.ts`.
 *
 * Lo deja SIN PUBLICAR: se revisa en el panel (Vista previa por dispositivos)
 * y se completa lo que solo sabe la productora (fecha y lugar de la gala,
 * contacto, paquetes de auspicio, convocatoria). `--publicar` lo publica.
 *
 * Logos de auspiciadores: `--logos <carpeta>` sube cada PNG/JPG/WEBP de la
 * carpeta (máx. 16, el tipo sale de la firma binaria) a
 * `pageant-site/{companyId}/` y el nombre del archivo es el nombre de la
 * marca. Sin logos, la sección del carrusel queda oculta hasta subirlos en el
 * estudio visual.
 *
 * Simulación por defecto. La `DATABASE_URL` local es la de PRODUCCIÓN
 * (CLAUDE.md §5): escribir exige `--commit`. Es aditivo: crea un proyecto y
 * no toca nada más; si el certamen ya existe en la empresa, se detiene.
 *
 * Uso:
 *   npx tsx scripts/crear-certamen-fiesta-primavera.ts --empresa "CR Producciones"
 *   npx tsx scripts/crear-certamen-fiesta-primavera.ts --empresa "76.123.456-7" --logos ./logos --commit
 */

function arg(name: string): string | null {
  const args = process.argv.slice(2);
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}

async function readLogos(folder: string): Promise<Array<{ name: string; bytes: Buffer; type: NonNullable<ReturnType<typeof sniffImageType>> }>> {
  const entries = (await readdir(folder)).filter((file) => !file.startsWith('.')).sort((a, b) => a.localeCompare(b, 'es'));
  const logos = [];
  for (const file of entries) {
    const bytes = await readFile(path.join(folder, file));
    const type = sniffImageType(new Uint8Array(bytes));
    if (!type) {
      console.warn(`  · ${file}: no es PNG, JPG ni WEBP (se omite).`);
      continue;
    }
    if (bytes.byteLength > 4 * 1024 * 1024) {
      console.warn(`  · ${file}: pesa más de 4 MB (se omite).`);
      continue;
    }
    logos.push({ name: logoNameFromFile(file), bytes, type });
  }
  if (logos.length > 16) console.warn(`  · Hay ${logos.length} logos: el carrusel admite 16, se usan los primeros.`);
  return logos.slice(0, 16);
}

async function main() {
  assertScriptCanRun('crear-certamen-fiesta-primavera');
  const commit = process.argv.includes('--commit');
  const publish = process.argv.includes('--publicar');
  const search = arg('--empresa')?.trim() || 'CR Producciones';
  const logosFolder = arg('--logos');

  const companies = await prisma.company.findMany({
    where: { OR: [{ rut: search }, { businessName: { contains: search, mode: 'insensitive' } }] },
    select: { id: true, businessName: true, rut: true, status: true, features: { select: { hasEventProjects: true, hasCandidates: true, hasSponsorships: true } } },
  });
  if (companies.length !== 1) {
    console.error(
      companies.length === 0
        ? `No hay ninguna empresa que coincida con «${search}». Usa --empresa con el RUT exacto o parte de la razón social.`
        : `«${search}» coincide con ${companies.length} empresas; usa el RUT exacto:\n${companies.map((c) => `  - ${c.businessName} (${c.rut})`).join('\n')}`
    );
    process.exit(1);
  }
  const company = companies[0]!;
  console.log(`Empresa: ${company.businessName} (${company.rut}) · estado ${company.status}`);
  if (!company.features?.hasEventProjects) console.warn('  ! La empresa no tiene el módulo de Eventos encendido: el micrositio no se verá hasta activarlo desde la Supersuite.');
  if (!company.features?.hasCandidates) console.warn('  ! Sin el módulo de Candidatas el sitio no ofrece «Ser candidata» (el botón «Quiero ser candidata» lleva a un ancla vacía).');
  if (!company.features?.hasSponsorships) console.warn('  ! Sin el módulo de Auspicios el sitio no muestra paquetes ni el formulario «Quiero ser sponsor».');

  const existing = await prisma.project.findFirst({
    where: { companyId: company.id, OR: [{ code: FIESTA.code }, { name: FIESTA.name }] },
    select: { id: true, name: true },
  });
  if (existing) {
    console.error(`La empresa ya tiene el certamen «${existing.name}» (${existing.id}). No se crea otro: edítalo desde el panel.`);
    process.exit(1);
  }
  const slugOwner = await prisma.project.findUnique({ where: { publicSlug: FIESTA.slug }, select: { companyId: true } });
  const slug = slugOwner ? `${FIESTA.slug}-${new Date().getFullYear()}` : FIESTA.slug;
  if (slugOwner && (await prisma.project.findUnique({ where: { publicSlug: slug }, select: { id: true } }))) {
    console.error(`Las direcciones /certamen/${FIESTA.slug} y /certamen/${slug} ya están en uso. Elige otra en el panel.`);
    process.exit(1);
  }

  const files = logosFolder ? await readLogos(logosFolder) : [];
  console.log(`Dirección del micrositio: /certamen/${slug} (${publish ? 'se publica' : 'queda sin publicar'})`);
  console.log(`Logos de auspiciadores: ${files.length ? files.map((f) => f.name).join(', ') : 'ninguno (el carrusel queda oculto hasta subirlos)'}`);

  // Validación completa del diseño antes de escribir nada (mismo esquema del panel).
  const preview = buildFiestaDesign(files.map((f) => ({ name: f.name, url: `https://ejemplo.invalid/${encodeURIComponent(f.name)}` })));
  console.log(`Secciones del estudio visual: ${preview.blocks.map((b) => `${b.type}${b.hidden ? ' (oculta)' : ''}`).join(' → ')}`);

  if (!commit) {
    console.log('\nSIMULACIÓN: no se escribió nada. Repite con --commit para crear el certamen.');
    return;
  }

  const startDate = new Date();
  const project = await prisma.project.create({
    data: {
      companyId: company.id,
      code: FIESTA.code,
      name: FIESTA.name,
      startDate,
      status: 'PLANNING',
      notes: 'Creado con scripts/crear-certamen-fiesta-primavera.ts. Falta: fecha y lugar de la gala, contacto público, paquetes de auspicio y convocatoria.',
    },
    select: { id: true },
  });

  const logos: FiestaLogo[] = [];
  for (const file of files) {
    const pathname = `pageant-site/${company.id}/${project.id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${SNIFFED_IMAGE_EXTENSION[file.type]}`;
    const blob = await put(pathname, new Blob([new Uint8Array(file.bytes)], { type: file.type }), { access: 'public', contentType: file.type, addRandomSuffix: false });
    logos.push({ name: file.name, url: blob.url });
  }

  const design = buildFiestaDesign(logos);
  await prisma.project.updateMany({
    where: { id: project.id, companyId: company.id },
    data: {
      publicSlug: slug,
      publicSiteEnabled: publish,
      publicTagline: FIESTA.tagline,
      publicDescription: FIESTA.description,
      publicAccent: FIESTA.accent,
      publicSiteDesign: design,
      showCandidatesPublic: true,
      showSponsorsPublic: true,
      sponsorLeadFormEnabled: true,
    },
  });
  await prisma.auditLog.create({
    data: {
      companyId: company.id,
      userEmail: 'script:crear-certamen-fiesta-primavera',
      action: 'CREATE',
      entity: 'Project',
      entityId: project.id,
      metadata: { code: FIESTA.code, name: FIESTA.name, publicSlug: slug, publicSiteEnabled: publish, logos: logos.length },
    },
  });

  console.log(`\nCertamen creado: ${project.id}`);
  console.log(`Panel: /dashboard/projects/${project.id} · Micrositio: /certamen/${slug}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
