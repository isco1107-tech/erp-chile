/**
 * Promueve a un usuario existente a superadministrador de la plataforma.
 *
 *   npx tsx prisma/promote-superadmin.ts admin@prueba.local
 *
 * Es un script de línea de comandos a propósito, no un endpoint: un endpoint de
 * auto-promoción —por más protegido que esté— es una escalada de privilegios
 * esperando a ser encontrada. Para ejecutarlo hace falta acceso a la conexión de
 * la base de datos, que es exactamente el nivel de confianza que corresponde.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Uso: npx tsx prisma/promote-superadmin.ts <email>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, isSuperAdmin: true, isActive: true },
  });

  if (!user) {
    console.error(`No existe un usuario con el correo ${email}`);
    process.exit(1);
  }

  if (user.isSuperAdmin) {
    console.log(`${user.email} ya es superadministrador.`);
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { isSuperAdmin: true } });
    console.log(`${user.email} promovido a superadministrador.`);
  }

  if (!user.isActive) {
    console.warn('Aviso: la cuenta está suspendida; reactívala para que pueda iniciar sesión.');
  }

  const total = await prisma.user.count({ where: { isSuperAdmin: true } });
  console.log(`Superadministradores en la plataforma: ${total}`);
  console.log('Debe cerrar sesión y volver a entrar para que el portal /superadmin aparezca en el menú.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
