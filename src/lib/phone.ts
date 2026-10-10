/**
 * Phone number normalisation to E.164. Ghana local numbers (0XX XXX XXXX)
 * become +233XXXXXXXXX. Operator prefixes are deliberately not hard-coded
 * because numbering plans change: any 9-digit national number is accepted.
 * International numbers in +<country><number> form are kept as entered.
 */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s().-]/g, "");
  if (cleaned === "") return null;
  let e164: string;
  if (/^0\d{9}$/.test(cleaned)) e164 = `+233${cleaned.slice(1)}`;
  else if (/^233\d{9}$/.test(cleaned)) e164 = `+${cleaned}`;
  else if (/^00[1-9]\d{7,14}$/.test(cleaned)) e164 = `+${cleaned.slice(2)}`;
  else if (/^\+[1-9]\d{7,14}$/.test(cleaned)) e164 = cleaned;
  else return null;
  if (e164.startsWith("+233") && e164.length !== 13) return null;
  return e164;
}

export function formatGhanaPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  if (e164.startsWith("+233") && e164.length === 13) {
    const n = e164.slice(4);
    return `+233 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
  }
  return e164;
}
