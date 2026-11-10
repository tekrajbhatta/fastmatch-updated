import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { publicUpcomingWhere } from '@/lib/eventAvailability';

/**
 * /sitemap.xml, for search engines: the public pages and every event a
 * visitor can see listed (publicUpcomingWhere, the same rule as the Upcoming
 * Events list, so a hidden, draft or cancelled event is never in it).
 *
 * Built on each request: it reads APP_URL and the database when it's asked
 * for, never at build time (the build has neither).
 */
export const dynamic = 'force-dynamic';

const PAGES: { path: string; changeFrequency: 'daily' | 'monthly' | 'yearly'; priority: number }[] = [
  { path: '/', changeFrequency: 'monthly', priority: 1 },
  { path: '/events', changeFrequency: 'daily', priority: 0.9 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = (process.env.APP_URL ?? '').replace(/\/+$/, '');
  const events = await prisma.event.findMany({
    where: publicUpcomingWhere(),
    select: { id: true, updatedAt: true },
    orderBy: { startsAt: 'asc' },
  });
  return [
    ...PAGES.map((p) => ({ url: `${site}${p.path}`, changeFrequency: p.changeFrequency, priority: p.priority })),
    ...events.map((e) => ({ url: `${site}/events/${e.id}`, lastModified: e.updatedAt, changeFrequency: 'weekly' as const, priority: 0.7 })),
  ];
}
