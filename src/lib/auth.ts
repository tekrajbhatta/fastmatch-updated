import { cache } from 'react';
import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  // Fail loudly at startup rather than silently signing tokens with `undefined`
  throw new Error('JWT_SECRET is not set — check your .env file');
}

// Admin accounts are just Members with isAdmin = true (kept simple; a
// separate admin table isn't needed for a single-operator business).
// isAdmin is not exposed on any public API response.

export function signSession(memberId: string): string {
  return jwt.sign({ memberId }, JWT_SECRET, { expiresIn: '30d' });
}

function getTokenFromRequest(req: NextRequest): string | null {
  const cookie = req.cookies.get('fm_session')?.value;
  if (cookie) return cookie;
  const header = req.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export async function getSessionMember(req: NextRequest) {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { memberId: string };
    return await prisma.member.findUnique({ where: { id: payload.memberId } });
  } catch {
    return null; // expired/invalid token — treat as logged out, not an error
  }
}

export async function requireAdmin(req: NextRequest) {
  const member = await getSessionMember(req);
  if (!member || !member.isAdmin) return null;
  return member;
}

// Server-component-friendly variant — RSCs don't have a NextRequest, they
// read cookies via next/headers instead. Same session-cookie logic as
// getSessionMember, just a different way of getting the token.
// cache() memoises this for the duration of a single request render, so the
// root layout, the admin layout and a page can each ask "who is this?"
// without producing three identical lookups per page view. It is per-request
// only — nothing is shared between requests or users.
export const getCurrentMember = cache(async () => {
  // Next 15 made cookies() async (it returns a Promise); in Next 14 it was
  // synchronous. This must stay awaited while the project is on Next 15.
  const token = (await cookies()).get('fm_session')?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { memberId: string };
    return await prisma.member.findUnique({ where: { id: payload.memberId } });
  } catch {
    return null;
  }
});
