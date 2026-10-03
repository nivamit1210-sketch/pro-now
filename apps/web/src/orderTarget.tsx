import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * WHERE THE NEXT REQUEST GOES, AND WHO WILL BE THERE.
 *
 * As in the demo, the address is chosen from the home screen's chip and the
 * person at the door ("for someone else") on the address screen; the
 * request form only describes the job (docs/DEMO-SYNC.md, 2026-10-01 C3).
 *
 * Kept for the browser tab's session, so a reload does not quietly send the
 * professional to a different address. The server stays the truth for the
 * job itself: this is only what the next request will ask for.
 */
export interface OnSite {
  name: string;
  phone: string;
}
export interface OrderTarget {
  addressId: string | null;
  onSite: OnSite | null;
}

const KEY = "pn.orderTarget";
const EMPTY: OrderTarget = { addressId: null, onSite: null };

function load(): OrderTarget {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as OrderTarget) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

const Ctx = createContext<{ target: OrderTarget; setTarget: (t: OrderTarget) => void }>({
  target: EMPTY,
  setTarget: () => {},
});

export function OrderTargetProvider({ children }: { children: ReactNode }) {
  const [target, setState] = useState<OrderTarget>(load);
  const setTarget = useCallback((t: OrderTarget) => {
    setState(t);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(t));
    } catch {
      /* private mode: the choice lasts until reload */
    }
  }, []);
  return <Ctx.Provider value={{ target, setTarget }}>{children}</Ctx.Provider>;
}

export const useOrderTarget = () => useContext(Ctx);

/** The saved address the request goes to: the chosen one while it still exists, else the first. */
export function resolveAddress<T extends { id: string }>(addresses: readonly T[], chosenId: string | null): T | null {
  return addresses.find((a) => a.id === chosenId) ?? addresses[0] ?? null;
}

/**
 * What the order's "לאן" line says (the demo's AddressLine): the saved
 * address as written, else its label; null asks for one ("בחירה").
 */
export function orderAddressHe(address: { formatted: string; label?: string | null } | null): string | null {
  return address ? address.formatted.trim() || address.label?.trim() || null : null;
}

/** An Israeli mobile number: the person at home gets a link on their phone. */
export const IL_MOBILE = /^(\+972-?|0)5\d-?\d{3}-?\d{4}$/;
