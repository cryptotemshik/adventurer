// Minimal, conservative blocklist for names/tickers/descriptions. Admin can additionally hide markets.
const BLOCKED = [
  "nigger",
  "nigga",
  "faggot",
  "kike",
  "retard",
  "chink",
  "spic",
  "tranny",
  "rape",
  "pedo",
  "hitler",
  "nazi",
  "isis",
  "cp",
];
const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s" };

export function normalizeForFilter(s: string): string {
  return s
    .toLowerCase()
    .split("")
    .map((c) => LEET[c] ?? c)
    .join("")
    .replace(/[^a-z]/g, " ");
}

export function containsBlockedWord(...texts: string[]): string | null {
  for (const t of texts) {
    const n = normalizeForFilter(t);
    const words = n.split(/\s+/);
    const squashed = n.replace(/\s+/g, "");
    for (const b of BLOCKED) {
      if (words.includes(b)) return b;
      if (b.length >= 5 && squashed.includes(b)) return b;
    }
  }
  return null;
}
