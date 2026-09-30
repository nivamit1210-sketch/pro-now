import type { StorageProvider } from "@pro-now/types";

/** Long enough to outlast a screen's refetches, short enough not to be a public address. */
export const PORTRAIT_LINK_SECONDS = 15 * 60;

/**
 * The face a professional chose while joining, as the people they are sent
 * to see it (D1, Dvir 2026-09-30): the photo, approved as it is for now,
 * through a short-lived link; or "CHARACTER", which the screen draws as the
 * job's trade character. Nothing chosen: no face, and the screen shows the
 * monogram.
 */
export async function portraitForViewer(
  storage: Pick<StorageProvider, "createPresignedGet">,
  pro: { portraitKind: string | null; portraitUpload: { storageKey: string; status: string } | null }
): Promise<{ photoUrl: string | null; portraitKind: "PHOTO" | "CHARACTER" | null }> {
  if (pro.portraitKind === "CHARACTER") return { photoUrl: null, portraitKind: "CHARACTER" };
  if (pro.portraitKind === "PHOTO" && pro.portraitUpload?.status === "READY") {
    return {
      photoUrl: await storage.createPresignedGet({ key: pro.portraitUpload.storageKey, expiresInSeconds: PORTRAIT_LINK_SECONDS }),
      portraitKind: "PHOTO",
    };
  }
  return { photoUrl: null, portraitKind: null };
}
