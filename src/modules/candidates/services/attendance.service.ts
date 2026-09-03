import { prisma } from '@/lib/prisma';
import type { CandidateAttendance } from '@prisma/client';
import type { AttendanceCreateInput } from '../schema';

async function assertCandidateOwnership(companyId: string, candidateId: string): Promise<void> {
  const candidate = await prisma.candidate.findFirst({ where: { id: candidateId, companyId }, select: { id: true } });
  if (!candidate) throw new Error('Candidata no encontrada');
}

export async function addAttendance(
  companyId: string,
  candidateId: string,
  data: AttendanceCreateInput
): Promise<CandidateAttendance> {
  await assertCandidateOwnership(companyId, candidateId);
  return prisma.candidateAttendance.create({
    data: {
      companyId,
      candidateId,
      activityType: data.activityType,
      activityDate: data.activityDate,
      attended: data.attended,
      notes: data.notes || undefined,
    },
  });
}

export async function listAttendance(companyId: string, candidateId: string): Promise<CandidateAttendance[]> {
  return prisma.candidateAttendance.findMany({
    where: { companyId, candidateId },
    orderBy: { activityDate: 'desc' },
  });
}

export async function deleteAttendance(companyId: string, attendanceId: string): Promise<void> {
  const result = await prisma.candidateAttendance.deleteMany({ where: { id: attendanceId, companyId } });
  if (result.count === 0) throw new Error('Registro de asistencia no encontrado');
}
