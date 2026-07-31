import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

/**
 * Wraps a route handler so a bad/missing ID (findUniqueOrThrow on a record
 * that doesn't exist — Prisma error P2025) returns a clean 404 instead of
 * an unhandled exception. Also catches anything else unexpected as a 500
 * with a safe message, rather than leaking a stack trace to the response.
 *
 * Found in review: most routes in this codebase use findUniqueOrThrow
 * without this wrapper — an invalid :id in the URL currently crashes with
 * Next.js's raw error page instead of a proper JSON 404. Apply this wrapper
 * across all routes before production; a handful are done as the pattern
 * example (see admin/events/[id]/route.ts).
 */
export function withErrorHandling<T extends (req: NextRequest, ctx: any) => Promise<NextResponse>>(
  handler: T
): T {
  return (async (req: NextRequest, ctx: any) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      console.error(err);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  }) as T;
}
