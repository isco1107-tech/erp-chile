import { z } from 'zod';

export type CalendarItemType = 'PROJECT' | 'STAGE_BLOCK' | 'CANDIDATE_BIRTHDAY';

export interface CalendarCandidateInfo {
  id: string;
  fullName: string;
  stageName: string | null;
  photoUrl: string | null;
  birthDate: Date;
  turningAge: number;
  daysUntil: number;
  phone: string | null;
  email: string | null;
}

export interface CalendarItem {
  id: string;
  type: CalendarItemType;
  title: string;
  description: string;
  startDate: Date;
  endDate?: Date;
  isAllDay: boolean;
  location?: string;
  googleCalendarUrl: string;
  candidate?: CalendarCandidateInfo;
  project?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface CalendarFeedData {
  companyName: string;
  adminEmail: string;
  syncToken: string;
  httpsUrl: string;
  webcalUrl: string;
  googleCalendarSubscribeUrl: string;
  items: CalendarItem[];
  upcomingBirthdays: CalendarCandidateInfo[];
  upcomingEvents: CalendarItem[];
}

export const reminderConfigSchema = z.object({
  targetEmail: z.string().email('Correo inválido').optional(),
});

export type ReminderConfigInput = z.infer<typeof reminderConfigSchema>;
