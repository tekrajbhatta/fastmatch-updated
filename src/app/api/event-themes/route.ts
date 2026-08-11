import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/event-themes — public, used by event creation and browsing filters
export const GET = withErrorHandling(async () => {
  const themes = await prisma.eventTheme.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  return NextResponse.json(themes);
});
