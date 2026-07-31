import { NextRequest } from 'next/server';
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
