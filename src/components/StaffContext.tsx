'use client';

import { createContext, useContext } from 'react';

/**
 * Who is using the admin, for its client pages (set by src/app/admin/layout.tsx):
 * Gil (isAdmin, every location) or a franchisee (their locations). Only for
 * what the pages show — their city choices, Gil-only buttons. The API routes
 * enforce the same limits themselves (src/lib/staff.ts).
 */
export interface StaffView {
  isAdmin: boolean;
  /** null: every location. A franchisee: theirs, A to Z. */
  cities: { id: string; name: string }[] | null;
  /** A franchisee's agreement, as "9/10/2026" (Sydney days): their reports cover only it. */
  agreement: { from: string; till: string } | null;
}

const StaffContext = createContext<StaffView>({ isAdmin: true, cities: null, agreement: null });

export function StaffProvider({ value, children }: { value: StaffView; children: React.ReactNode }) {
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff(): StaffView {
  return useContext(StaffContext);
}

/** The cities a form may offer: all of them for Gil, a franchisee's own otherwise. */
export function onlyMine<T extends { id: string }>(all: T[], cities: StaffView['cities']): T[] {
  if (!cities) return all;
  const mine = new Set(cities.map((c) => c.id));
  return all.filter((c) => mine.has(c.id));
}

/** The same, as a hook. */
export function useCityChoices<T extends { id: string }>(all: T[]): T[] {
  return onlyMine(all, useStaff().cities);
}
