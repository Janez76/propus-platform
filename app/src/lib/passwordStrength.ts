export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export function scorePassword(pw: string): PasswordScore {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 10) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s as PasswordScore;
}

export const strengthLabelKeys = [
  "profile.strength.weak",
  "profile.strength.fair",
  "profile.strength.good",
  "profile.strength.strong",
] as const;
