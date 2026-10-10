/**
 * Listing URLs look like /phones/iphone-14-pro-256gb-accra-k3f9a2x1.
 * The trailing 8-character key is permanent; the descriptive part may change
 * (e.g. when the city is edited) and old URLs redirect to the canonical one.
 */
export function listingPath(slug: string, slugKey: string): string {
  return `/phones/${slug}-${slugKey}`;
}

export function parseListingParam(param: string): { slug: string; key: string } | null {
  const match = /^(?:([a-z0-9-]+)-)?([a-z0-9]{8})$/.exec(param.toLowerCase());
  if (!match) return null;
  return { slug: match[1] ?? "", key: match[2]! };
}

export function slugify(input: string, maxLength = 60): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}
