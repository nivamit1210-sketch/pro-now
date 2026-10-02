import type { StorageProvider } from "@pro-now/types";

const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const READY_RETENTION_MS = 4 * 24 * 60 * 60 * 1000;

interface CleanupUpload {
  id: string;
  storageKey: string;
}

export interface UploadCleanupStore {
  upload: {
    findMany(args: { where: { status: string; createdAt: { lt: Date }; id?: { notIn: string[] } } }): Promise<CleanupUpload[]>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
  jobMedia: { deleteMany(args: { where: { uploadId: string } }): Promise<unknown> };
  professionalDocument: {
    updateMany(args: { where: { uploadId: string }; data: { uploadId: null } }): Promise<unknown>;
    findMany(args: { where: { uploadId: { not: null } }; select: { uploadId: true } }): Promise<Array<{ uploadId: string | null }>>;
  };
  professionalCredential: {
    findMany(args: { where: { documentRef: { not: null } }; select: { documentRef: true } }): Promise<Array<{ documentRef: string | null }>>;
  };
  identityVerification: {
    findMany(args: { where: { status: { in: string[] } }; select: { uploadIds: true } }): Promise<Array<{ uploadIds: string[] }>>;
  };
}

export interface MediaCleanupResult {
  pendingDeleted: number;
  retainedDeleted: number;
  failed: number;
}

export async function cleanupUploads(
  store: UploadCleanupStore,
  storage: Pick<StorageProvider, "delete">,
  now = new Date()
): Promise<MediaCleanupResult> {
  const pending = await store.upload.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - PENDING_MAX_AGE_MS) } },
  });
  /*
   * THE 4 DAYS ARE FOR WHAT A CUSTOMER SENT (D3: photos, voice, text),
   * not for the documents a professional's approval rests on. W7 stores
   * those as uploads too, and a sweep by age alone deleted an ID or a
   * licence four days after it arrived — before review, or right after
   * approval, taking the evidence with it. Their retention is part of the
   * open data-retention decision (docs/18 §Open decisions).
   * Identity photos are evidence only until a decision; the decision deletes them itself (docs/10).
   */
  const evidence = [
    ...(await store.professionalDocument.findMany({ where: { uploadId: { not: null } }, select: { uploadId: true } })).map((d) => d.uploadId),
    ...(await store.professionalCredential.findMany({ where: { documentRef: { not: null } }, select: { documentRef: true } })).map((c) => c.documentRef),
    ...(await store.identityVerification.findMany({ where: { status: { in: ["MANUAL_REVIEW", "PENDING"] } }, select: { uploadIds: true } })).flatMap((v) => v.uploadIds),
  ].filter((id): id is string => Boolean(id));
  const retained = await store.upload.findMany({
    where: { status: "READY", createdAt: { lt: new Date(now.getTime() - READY_RETENTION_MS) }, id: { notIn: evidence } },
  });
  const result: MediaCleanupResult = { pendingDeleted: 0, retainedDeleted: 0, failed: 0 };

  for (const upload of pending) {
    if (await deleteUpload(store, storage, upload, false)) result.pendingDeleted += 1;
    else result.failed += 1;
  }
  for (const upload of retained) {
    if (await deleteUpload(store, storage, upload, true)) result.retainedDeleted += 1;
    else result.failed += 1;
  }
  return result;
}

async function deleteUpload(
  store: UploadCleanupStore,
  storage: Pick<StorageProvider, "delete">,
  upload: CleanupUpload,
  removeLinks: boolean
): Promise<boolean> {
  try {
    await storage.delete(upload.storageKey);
    if (removeLinks) {
      await store.jobMedia.deleteMany({ where: { uploadId: upload.id } });
      await store.professionalDocument.updateMany({ where: { uploadId: upload.id }, data: { uploadId: null } });
    }
    await store.upload.delete({ where: { id: upload.id } });
    return true;
  } catch {
    return false;
  }
}
