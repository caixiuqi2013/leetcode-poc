// Observed Google dropdown labels and URL favoriteSlug values, 2026-09-17.
// Months, open-ended ranges and All intentionally have no fixed day count.
export const GOOGLE_RECENCIES: Readonly<Record<string, {label:string;days:number|null}>> = {
  'google-thirty-days': {label:'30 days',days:30},
  'google-three-months': {label:'3 months',days:null},
  'google-six-months': {label:'6 months',days:null},
  'google-more-than-six-months': {label:'More than 6 months',days:null},
  'google-all': {label:'All',days:null},
};
export function googleRecency(raw:string|null){
  return raw && Object.hasOwn(GOOGLE_RECENCIES,raw) ? GOOGLE_RECENCIES[raw] : null;
}
