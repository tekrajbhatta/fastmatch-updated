import { describe, it, expect } from 'vitest';
import { cuidTime, importRunWindow } from '../importRow';

// Ids from the live site: a member who signed up on 9 Oct 2026 at 15:38:52.313
// (UTC, the createdAt shown for it) and three imported members, inserted by the
// import on 10 Nov (Sydney) although their createdAt is their old join date.
const SIGNED_UP = 'cmv14rjmh000bt5futfsefnwj';
const IMPORTED = ['cmw9jesmd03u413uv7odgl6od', 'cmw9jf4yv0wwy13uvjcojcp5z', 'cmw9jf70e121g13uvehfzy9l6'];

describe('cuidTime', () => {
  it('reads the insert time from an id', () => {
    expect(new Date(cuidTime(SIGNED_UP)!).toISOString()).toBe('2026-10-09T15:38:52.313Z');
    expect(new Date(cuidTime(IMPORTED[0])!).toISOString()).toBe('2026-11-09T17:30:43.429Z');
  });
  it('refuses anything that is not a cuid', () => {
    expect(cuidTime('not-an-id')).toBeNull();
    expect(cuidTime('')).toBeNull();
    expect(cuidTime('xmw9jesmd03u413uv7odgl6od')).toBeNull();
  });
});

describe('importRunWindow', () => {
  it('spans the import run, a minute either side', () => {
    const w = importRunWindow(IMPORTED)!;
    expect(w.from).toBe(cuidTime(IMPORTED[0])! - 60_000);
    expect(w.to).toBe(cuidTime(IMPORTED[2])! + 60_000);
  });
  it('holds every imported member and not a member who signed up another day', () => {
    const w = importRunWindow([IMPORTED[0], IMPORTED[2]])!;
    // Waide was inserted in between: counted although not used to find the run
    // (as someone who has chosen their own password since).
    const inRun = (id: string) => { const t = cuidTime(id)!; return t >= w.from && t <= w.to; };
    expect(inRun(IMPORTED[1])).toBe(true);
    expect(inRun(SIGNED_UP)).toBe(false);
  });
  it('is null when nobody holds the import password', () => {
    expect(importRunWindow([])).toBeNull();
    expect(importRunWindow(['junk'])).toBeNull();
  });
  it('copes with a whole import of ids', () => {
    const base = cuidTime(IMPORTED[0])!;
    const ids = Array.from({ length: 60_000 }, (_, i) => `c${(base + i).toString(36).padStart(8, '0')}${'0'.repeat(16)}`);
    const w = importRunWindow(ids)!;
    expect(w.to - w.from).toBe(59_999 + 120_000);
  });
});
