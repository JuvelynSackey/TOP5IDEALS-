/**
 * Money helpers. All amounts are integers in minor units (pesewas):
 * GH₵1.00 === 100. Never use floating point for stored values.
 */
export const CURRENCY = "GHS" as const;
export const MAX_AMOUNT_MINOR = 100_000_000; // GH₵1,000,000.00

const formatterWhole = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const formatterFraction = new Intl.NumberFormat("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Format pesewas as "GH₵8,500" (or "GH₵8,500.50" when there are pesewas). */
export function formatCedis(minor: number | null | undefined): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return "—";
  const whole = minor % 100 === 0;
  const value = minor / 100;
  return `GH₵${(whole ? formatterWhole : formatterFraction).format(value)}`;
}

/**
 * Parse user input in cedis ("8,500", "8500.5", "GH₵ 8 500") into pesewas.
 * Returns null for anything that is not a valid non-negative amount with at
 * most two decimal places.
 */
export function parseCedisToMinor(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const raw = String(input).replace(/GH₵|GHS|GH¢|¢|,|\s/gi, "").trim();
  if (raw === "" || !/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const [whole, fraction = ""] = raw.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) return null;
  return minor;
}

export function minorToCedisInput(minor: number | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}
