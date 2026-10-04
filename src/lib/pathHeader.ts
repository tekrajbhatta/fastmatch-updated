/**
 * The address asked for, set by middleware on requests for member-only pages
 * and read by the admin layout, which can't otherwise see it: a session that
 * turns out to be expired goes back to login with it. Middleware always sets
 * it, so a value sent by the browser is never the one used.
 */
export const PATH_HEADER = 'x-fm-path';
