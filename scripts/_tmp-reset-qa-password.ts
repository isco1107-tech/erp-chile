import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@prueba.local' },
    select: { id: true, isActive: true, totpEnabled: true, role: true, companyId: true },
  });
  if (!user) {
    console.log('NOT_FOUND');
    return;
  }
  console.log('before:', user);
  const passwordHash = await bcrypt.hash('QaTemp123!', 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, isActive: true } });
  console.log('password reset ok');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
