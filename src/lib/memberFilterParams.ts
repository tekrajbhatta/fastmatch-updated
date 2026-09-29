/**
 * The Members screen's filter as URL query params — read and written in one
 * place, so the member list, its CSV export and "Click here to blast these
 * filtered members" can never disagree about who is in the filtered set.
 *
 * No Prisma import: this runs in the browser too.
 */
export interface MembersScreenFilter {
  search?: string; // name, email or mobile
  gender?: 'MALE' | 'FEMALE';
  cityId?: string;
  ageMin?: number;
  ageMax?: number;
}

const toAge = (v: string | null) => {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
};

export function memberFilterFromParams(params: URLSearchParams): MembersScreenFilter {
  const gender = params.get('gender');
  return {
    search: params.get('search')?.trim() || undefined,
    gender: gender === 'MALE' || gender === 'FEMALE' ? gender : undefined,
    cityId: params.get('cityId') || undefined,
    ageMin: toAge(params.get('ageMin')),
    ageMax: toAge(params.get('ageMax')),
  };
}

export function memberFilterToParams(f: MembersScreenFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.gender) params.set('gender', f.gender);
  if (f.cityId) params.set('cityId', f.cityId);
  if (f.ageMin != null) params.set('ageMin', String(f.ageMin));
  if (f.ageMax != null) params.set('ageMax', String(f.ageMax));
  return params;
}

/**
 * "First name like: Gil, Age: 20 to 60" — the old admin's "Filter currently
 * applied" line. Empty list = no filter (every member).
 */
export function describeMemberFilter(f: MembersScreenFilter, cityName?: string): string[] {
  const parts: string[] = [];
  if (f.search) parts.push(`Name, email or mobile contains “${f.search}”`);
  if (f.gender) parts.push(f.gender === 'MALE' ? 'Men' : 'Women');
  if (f.ageMin != null && f.ageMax != null) parts.push(`Age ${f.ageMin} to ${f.ageMax}`);
  else if (f.ageMin != null) parts.push(`Age ${f.ageMin} and over`);
  else if (f.ageMax != null) parts.push(`Age up to ${f.ageMax}`);
  if (f.cityId) parts.push(`City: ${cityName ?? '…'}`);
  return parts;
}
