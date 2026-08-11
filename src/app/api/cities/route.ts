import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandling } from '@/lib/withErrorHandling';

// GET /api/cities — public, used by registration, event browsing/creation forms
export const GET = withErrorHandling(async () => {
  const cities = await prisma.city.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json(cities);
});
