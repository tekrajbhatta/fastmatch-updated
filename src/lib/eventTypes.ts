import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// An event type is a single name ("Professionals speed dating"). Inner runs
// of spaces collapse so "Speed  dating" can't sit beside "Speed dating".
export const eventTypeSchema = z.object({
  name: z.string().transform((v) => v.trim().replace(/\s+/g, ' ')).pipe(z.string().min(1).max(100)),
});

/** Another event type already has this name, ignoring capitals. */
export async function duplicateEventType(name: string, exceptId?: string): Promise<boolean> {
  const all = await prisma.eventTheme.findMany({ select: { id: true, name: true } });
  const wanted = name.toLowerCase();
  return all.some((t) => t.id !== exceptId && t.name.toLowerCase() === wanted);
}
