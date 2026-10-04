/**
 * One CSV cell, quoted. Text that starts with = + - @ (or a tab or carriage
 * return) is something Excel and Google Sheets run as a formula when the file
 * is opened — and members choose their own names and mobiles, so one could
 * plant =HYPERLINK(...) to leak the rest of the row. Such text gets a leading
 * apostrophe, which spreadsheets read as "this is text". (A mobile written as
 * +61... shows that apostrophe; a price of course isn't involved here.)
 */
export function csvCell(value: unknown): string {
  const s = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}
