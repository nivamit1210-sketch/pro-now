import { useEffect, useRef } from "react";

import { api } from "../../api";
import { compressImage, requestVoiceStream, VoiceRecorderSession } from "../../media";
import { pickFile } from "../../pickFile";

/**
 * What the professional found, for a quote ordered for someone else (the
 * demo's quote builder, "התקלה בתמונות ובקול"): photos from the camera and
 * an optional voice note, kept on the phone until the quote is sent, then
 * uploaded and attached by their upload ids.
 */
export function useQuoteEvidence() {
  const blobs = useRef(new Map<string, Blob>());
  const session = useRef<VoiceRecorderSession | null>(null);
  useEffect(
    () => () => {
      session.current?.dispose();
      blobs.current.forEach((_, uri) => URL.revokeObjectURL(uri));
    },
    [],
  );

  const keep = (blob: Blob) => {
    const uri = URL.createObjectURL(blob);
    blobs.current.set(uri, blob);
    return uri;
  };

  const onPickPhoto = async (): Promise<string | null> => {
    const file = await pickFile("image/*", "environment");
    return file ? keep(await compressImage(file)) : null;
  };

  const voiceRecorder = {
    start: async (): Promise<boolean> => {
      if (typeof MediaRecorder === "undefined") return false;
      try {
        session.current = new VoiceRecorderSession(await requestVoiceStream(), MediaRecorder);
        session.current.start();
        return true;
      } catch {
        session.current?.dispose();
        session.current = null;
        return false;
      }
    },
    stop: async (): Promise<{ uri: string; seconds: number } | null> => {
      const s = session.current;
      if (!s) return null;
      const seconds = s.seconds;
      const blob = await s.stop();
      s.dispose();
      session.current = null;
      return blob.size > 0 ? { uri: keep(blob), seconds } : null;
    },
  };

  /** Uploads what is on screen at sending and returns the upload ids, photos first. */
  const upload = async (media: { photos: string[]; voice: { uri: string } | null } | undefined): Promise<string[]> => {
    if (!media) return [];
    const photos = media.photos.map((uri) => ({ blob: blobs.current.get(uri), kind: "PHOTO" as const }));
    const voice = media.voice ? [{ blob: blobs.current.get(media.voice.uri), kind: "VOICE_NOTE" as const }] : [];
    const ids: string[] = [];
    for (const { blob, kind } of [...photos, ...voice]) {
      if (!blob) continue;
      const mime = kind === "PHOTO" ? "image/jpeg" : (blob.type.split(";")[0] || "audio/webm");
      ids.push((await api.uploadMedia({ kind, mime, body: blob })).upload.id);
    }
    return ids;
  };

  return { onPickPhoto, voiceRecorder, upload };
}
