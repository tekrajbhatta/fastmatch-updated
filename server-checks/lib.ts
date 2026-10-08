/**
 * Shared bits for the server check scripts (see README.md in this folder).
 * They run on the server, from the deployed site's folder, as the site's own
 * user, so they see exactly what the site sees.
 */
import fs from 'fs';
import path from 'path';

/**
 * The site's settings from its .env (on the server, a link to shared/.env),
 * for any not already set. Read before any of the site's code is loaded.
 */
export function loadEnv(file = path.join(process.cwd(), '.env')): void {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    console.log(`[CHECK] Couldn't read ${file}. Run this through the .sh script, from the site's folder (README.md).`);
    process.exit(1);
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in process.env) continue;
    const quoted = m[2].match(/^(["'])(.*)\1$/);
    process.env[m[1]] = quoted ? quoted[2] : m[2];
  }
}

const tally = { ok: 0, look: 0 };

export function section(title: string): void {
  console.log(`\n==================== ${title} ====================`);
}

/** As it should be. */
export function ok(message: string): void {
  tally.ok++;
  console.log(`[OK]    ${message}`);
}

/** Needs a look (or a fix). */
export function look(message: string): void {
  tally.look++;
  console.log(`[CHECK] ${message}`);
}

/** For the record. */
export function info(message: string): void {
  console.log(`[INFO]  ${message}`);
}

export function printTally(): void {
  console.log(`\n${tally.ok} OK, ${tally.look} to look at.`);
}

/** "5 min ago", "3 h ago", "2 days ago". */
export function ago(date: Date, now = new Date()): string {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  if (minutes < 120) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
}

/** A date as Sydney reads it, e.g. "Wed 8 Oct 2026, 7:30 pm". */
export function sydney(date: Date): string {
  return date.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** An error's message, without anything else it carries. */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
