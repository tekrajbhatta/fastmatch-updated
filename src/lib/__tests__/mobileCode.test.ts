import { describe, it, expect } from 'vitest';
import { newMobileCode } from '@/lib/mobileCode';

describe('newMobileCode', () => {
  it('is always six digits, never starting with 0', () => {
    for (let i = 0; i < 2000; i++) expect(newMobileCode()).toMatch(/^[1-9]\d{5}$/);
  });

  it('varies', () => {
    expect(new Set(Array.from({ length: 200 }, newMobileCode)).size).toBeGreaterThan(190);
  });
});
