/**
 * Shared Prisma client.
 *
 * Every route, library and script imports this one instance instead of calling
 * `new PrismaClient()` itself. Each PrismaClient opens its own connection pool,
 * so the previous one-per-file pattern (46 of them) meant dozens of independent
 * pools against the same MySQL server — fine on localhost, but it exhausts
 * `max_connections` in production once several routes are hit concurrently.
 *
 * The globalThis cache exists because Next.js hot-reloading re-evaluates modules
 * on every edit in development. Without it, each reload would leak another pool
 * until the database refuses new connections. In production the module is
 * evaluated once, so the cache is skipped.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
