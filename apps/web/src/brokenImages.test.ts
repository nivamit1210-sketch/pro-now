import { describe, expect, it } from "vitest";

import { hideBrokenImages } from "./brokenImages";

type Listener = (e: Event) => void;

function fakeDocument() {
  const listeners: Record<string, { fn: Listener; capture: boolean }[]> = {};
  return {
    listeners,
    addEventListener(type: string, fn: Listener, capture?: boolean) {
      (listeners[type] ??= []).push({ fn, capture: Boolean(capture) });
    },
    fire(type: string, target: unknown) {
      for (const l of listeners[type] ?? []) l.fn({ target } as unknown as Event);
    },
  };
}

const element = (tagName: string) => ({ tagName, style: { visibility: "" } });

describe("hideBrokenImages", () => {
  it("hides an image that failed to load instead of leaving Safari's \"?\"", () => {
    const doc = fakeDocument();
    hideBrokenImages(doc as unknown as Document);
    const img = element("IMG");
    doc.fire("error", img);
    expect(img.style.visibility).toBe("hidden");
  });

  it("listens in the capture phase, since error does not bubble", () => {
    const doc = fakeDocument();
    hideBrokenImages(doc as unknown as Document);
    expect(doc.listeners.error?.every((l) => l.capture)).toBe(true);
  });

  it("shows the image again once it loads", () => {
    const doc = fakeDocument();
    hideBrokenImages(doc as unknown as Document);
    const img = element("IMG");
    doc.fire("error", img);
    doc.fire("load", img);
    expect(img.style.visibility).toBe("");
  });

  it("leaves other elements alone", () => {
    const doc = fakeDocument();
    hideBrokenImages(doc as unknown as Document);
    const script = element("SCRIPT");
    doc.fire("error", script);
    expect(script.style.visibility).toBe("");
  });
});
