import { prisma } from '../prisma';

/**
 * How fast blast emails go out.
 *
 * Mailgun refuses more than 26 recipients in 30 seconds from our domain
 * (found on 28 Nov 2026: "421 … recipient limit (26) exceeded, try again
 * after …"). Blasts went out as fast as the connection allowed, about 3 a
 * second, so after the first 26 of every 30 seconds the rest were refused:
 * 77 of 252 on 27 and 28 Nov. Now each blast email waits for its turn, one
 * every 1.5 seconds by default (20 in 30 seconds), which also leaves room
 * under Mailgun's limit for booking confirmations and password resets sent
 * meanwhile.
 *
 * The turns are kept in the database (a row in RateLimit), so the web server
 * (which sends a blast's first batch) and the scheduled job (which carries
 * on) share them, as do two blasts going at once.
 *
 * BLAST_EMAILS_PER_30S in .env changes the rate, if Mailgun ever raises the
 * limit. Too fast is safe, only slower: refused emails wait and are tried
 * again (src/lib/emails/retry.ts).
 */
export const DEFAULT_BLAST_EMAILS_PER_30S = 20;

/** Blast emails allowed in 30 seconds: BLAST_EMAILS_PER_30S, or 20. */
export function blastEmailsPer30s(value: string | undefined = process.env.BLAST_EMAILS_PER_30S): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : DEFAULT_BLAST_EMAILS_PER_30S;
}

/** Time between two blast emails. */
export const blastGapMs = (perWindow: number = blastEmailsPer30s()) => Math.ceil(30_000 / perWindow);

const SLOT_KEY = 'blast-email-slot';

/** The next turn: `next` if it's still to come, otherwise now. */
export const takeSlot = (next: Date | null | undefined, now: Date): Date => (next && next > now ? next : now);

/**
 * Waits for this sender's turn to send one blast email. The turn is booked
 * (and the next one moved on by the gap) in one locked step, so two senders
 * never get the same moment.
 */
export async function waitForBlastSlot(): Promise<void> {
  const gap = blastGapMs();
  const turn = await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.$executeRaw`INSERT IGNORE INTO \`RateLimit\` (\`key\`, \`count\`, \`resetAt\`) VALUES (${SLOT_KEY}, 0, ${now})`;
    const rows = await tx.$queryRaw<{ resetAt: Date }[]>`SELECT \`resetAt\` FROM \`RateLimit\` WHERE \`key\` = ${SLOT_KEY} FOR UPDATE`;
    const at = takeSlot(rows[0]?.resetAt, now);
    await tx.$executeRaw`UPDATE \`RateLimit\` SET \`resetAt\` = ${new Date(at.getTime() + gap)} WHERE \`key\` = ${SLOT_KEY}`;
    return at;
  });
  const wait = turn.getTime() - Date.now();
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
}
