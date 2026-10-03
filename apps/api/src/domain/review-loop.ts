/**
 * THE REVIEW LOOP'S RULES (docs/10 §Review loop). Pure functions: which
 * items an application has, their stable names, and whether a save really
 * changed one (only a real change counts as a fix).
 */
export type ItemKey = string;
export const ITEM_NAMES = ["IDENTITY", "DETAILS", "AREA", "PORTRAIT", "SHOP"] as const;
export const REASON_MIN = 3;
export const REASON_MAX = 500;

export const credentialItem = (serviceId: string, requirement: string): ItemKey => `CREDENTIAL:${serviceId}:${requirement}`;
export const serviceItem = (serviceId: string): ItemKey => `SERVICE:${serviceId}`;
export const documentItem = (kind: string): ItemKey => `DOCUMENT:${kind}`;

export type ParsedItem =
  | { kind: (typeof ITEM_NAMES)[number] }
  | { kind: "DOCUMENT"; documentKind: string }
  | { kind: "CREDENTIAL"; serviceId: string; requirement: string }
  | { kind: "SERVICE"; serviceId: string };

export function parseItem(key: string): ParsedItem | null {
  if ((ITEM_NAMES as readonly string[]).includes(key)) return { kind: key as (typeof ITEM_NAMES)[number] };
  const [head, ...rest] = key.split(":");
  if (head === "DOCUMENT" && rest.length === 1 && rest[0]) return { kind: "DOCUMENT", documentKind: rest[0] };
  if (head === "SERVICE" && rest.length === 1 && rest[0]) return { kind: "SERVICE", serviceId: rest[0] };
  // A requirement may itself contain a colon (LICENSE:PLUMBING).
  if (head === "CREDENTIAL" && rest.length >= 2 && rest[0] && rest.slice(1).join(":")) {
    return { kind: "CREDENTIAL", serviceId: rest[0], requirement: rest.slice(1).join(":") };
  }
  return null;
}

export interface ApplicationItems {
  hasIdentity: boolean;
  hasArea: boolean;
  hasPortrait: boolean;
  hasShop: boolean;
  documentKinds: string[];
  services: Array<{ serviceId: string; requirements: string[] }>;
}

export function itemExists(key: ItemKey, items: ApplicationItems): boolean {
  const p = parseItem(key);
  if (!p) return false;
  switch (p.kind) {
    case "IDENTITY": return items.hasIdentity;
    case "DETAILS": return true;
    case "AREA": return items.hasArea;
    case "PORTRAIT": return items.hasPortrait;
    case "SHOP": return items.hasShop;
    case "DOCUMENT": return items.documentKinds.includes(p.documentKind);
    case "SERVICE": return items.services.some((s) => s.serviceId === p.serviceId);
    case "CREDENTIAL": return items.services.some((s) => s.serviceId === p.serviceId && s.requirements.includes(p.requirement));
  }
}

const norm = (v: unknown) => (v instanceof Date ? v.getTime() : v === undefined ? null : v);

/** Did a save really change anything? Shallow, over the union of keys. */
export function valuesChanged(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) if (norm(before[k]) !== norm(after[k])) return true;
  return false;
}
