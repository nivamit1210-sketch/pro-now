import { describe, expect, it, vi } from "vitest";

import { PORTRAIT_LINK_SECONDS, portraitForViewer } from "../src/domain/portrait.js";

describe("portraitForViewer (D1)", () => {
  const storage = { createPresignedGet: vi.fn(async ({ key }: { key: string }) => `https://store.test/${key}?X-Amz-Expires=900`) };

  it("a ready photo becomes a short-lived link", async () => {
    const face = await portraitForViewer(storage, { portraitKind: "PHOTO", portraitUpload: { storageKey: "faces/1.jpg", status: "READY" } });
    expect(face).toEqual({ photoUrl: "https://store.test/faces/1.jpg?X-Amz-Expires=900", portraitKind: "PHOTO" });
    expect(storage.createPresignedGet).toHaveBeenLastCalledWith({ key: "faces/1.jpg", expiresInSeconds: PORTRAIT_LINK_SECONDS });
  });

  it("a photo that is not ready, or is gone, shows no face rather than a broken one", async () => {
    expect(await portraitForViewer(storage, { portraitKind: "PHOTO", portraitUpload: { storageKey: "x", status: "PENDING" } })).toEqual({ photoUrl: null, portraitKind: null });
    expect(await portraitForViewer(storage, { portraitKind: "PHOTO", portraitUpload: null })).toEqual({ photoUrl: null, portraitKind: null });
  });

  it("the character is named, never linked; nothing chosen is nothing", async () => {
    expect(await portraitForViewer(storage, { portraitKind: "CHARACTER", portraitUpload: null })).toEqual({ photoUrl: null, portraitKind: "CHARACTER" });
    expect(await portraitForViewer(storage, { portraitKind: null, portraitUpload: null })).toEqual({ photoUrl: null, portraitKind: null });
  });
});
