import { describe, expect, it, vi } from "vitest";

import { cleanupUploads } from "../src/domain/storage/media-cleanup.js";

describe("cleanupUploads", () => {
  it("deletes stale pending and retained media only after storage deletion succeeds", async () => {
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const store = {
      upload: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "pending", storageKey: "k-pending" }])
          .mockResolvedValueOnce([{ id: "ready", storageKey: "k-ready" }]),
        delete: vi.fn().mockResolvedValue({}),
      },
      jobMedia: { deleteMany: vi.fn().mockResolvedValue({}) },
      professionalDocument: { updateMany: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
      professionalCredential: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await expect(
      cleanupUploads(store, { delete: deleteObject }, new Date("2026-10-10T00:00:00.000Z"))
    ).resolves.toEqual({ pendingDeleted: 1, retainedDeleted: 1, failed: 0 });
    expect(deleteObject).toHaveBeenCalledWith("k-pending");
    expect(deleteObject).toHaveBeenCalledWith("k-ready");
    expect(store.upload.delete).toHaveBeenCalledTimes(2);
    expect(store.jobMedia.deleteMany).toHaveBeenCalledWith({ where: { uploadId: "ready" } });
  });

  it("keeps a row when the bucket cannot delete it, so the next sweep retries", async () => {
    const store = {
      upload: {
        findMany: vi.fn().mockResolvedValueOnce([{ id: "pending", storageKey: "k-pending" }]).mockResolvedValueOnce([]),
        delete: vi.fn(),
      },
      jobMedia: { deleteMany: vi.fn() },
      professionalDocument: { updateMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
      professionalCredential: { findMany: vi.fn().mockResolvedValue([]) },
    };

    await expect(
      cleanupUploads(store, { delete: vi.fn().mockRejectedValue(new Error("temporary storage outage")) }, new Date())
    ).resolves.toEqual({ pendingDeleted: 0, retainedDeleted: 0, failed: 1 });
    expect(store.upload.delete).not.toHaveBeenCalled();
  });

  it("never sweeps a professional's documents: an approval rests on them (W8)", async () => {
    const findMany = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const store = {
      upload: { findMany, delete: vi.fn() },
      jobMedia: { deleteMany: vi.fn() },
      professionalDocument: { updateMany: vi.fn(), findMany: vi.fn().mockResolvedValue([{ uploadId: "id-card" }]) },
      professionalCredential: { findMany: vi.fn().mockResolvedValue([{ documentRef: "licence" }]) },
    };
    await cleanupUploads(store, { delete: vi.fn() }, new Date());
    expect(findMany.mock.calls[1]![0].where.id).toEqual({ notIn: ["id-card", "licence"] });
  });
});
