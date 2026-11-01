// HOW A COUNT IS WRITTEN WHEN IT GETS BIG (owner, 2026-11-01, one of the polish tweaks): a five-digit
// number is hard to parse as a wall of figures, so every group of three gets a thin space —
// "12 400". It is a NARROW NO-BREAK SPACE (U+202F), which cannot wrap, so a number never breaks
// across two lines inside a tile or the Territory entry.
//
// Four digits and under are left alone: in a small box "1240" reads faster than "1 240". Pure, and
// shared by the profile and the menu so the same balance looks the same in both.
export const groupDigits = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  const value = Math.trunc(n);
  const digits = String(Math.abs(value));
  if (digits.length <= 4) return String(value);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');
  return value < 0 ? `-${grouped}` : grouped;
};
