import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  DescribeFaultBody,
  catalogServicePages,
  customerDarkTheme,
  pilotServiceById,
  photoPromptFor,
  spacing,
  type MarkName,
} from "@pro-now/ui";
import { api } from "../api";
import { composeDescription, detailsNoteHe, livePriceHe, priceRows } from "../order";
import { MediaUploadError, sendErrorHe } from "../sendErrors";
import { resolveAddress, useOrderTarget } from "../orderTarget";
import { mediaUploadInputs } from "../request-media";
import { resolveServiceId, ServiceCatalogueMismatchError, ServiceNotOpenError } from "../serviceResolver";
import { useWebMediaCapture } from "../useWebMediaCapture";
import { ErrorScreen, LoadingScreen } from "../states";
import { useFrame } from "../frame";

type Props = {
  serviceId: string;
  media: ReturnType<typeof useWebMediaCapture>;
  onBack: () => void;
  onOpenAddresses: () => void;
  onSent: (jobId: string) => void;
  /** What the customer typed on home before choosing; it starts the description (W5 QA #12). */
  initialText?: string;
  /** The space under the app header; the whole frame when omitted. */
  height?: number;
};

export function RequestComposer({ serviceId, media, onBack, onOpenAddresses, onSent, initialText = "", height: heightIn }: Props) {
  const frame = useFrame();
  const width = frame.width;
  const height = heightIn ?? frame.height;
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: api.getAddresses });
  /*
   * Where the professional goes and who will be there are chosen from home's
   * address chip and the address screen, as in the demo; this form only
   * describes the job (docs/DEMO-SYNC.md, 2026-10-01 C3).
   */
  const { target } = useOrderTarget();
  const address = resolveAddress(addresses.data?.addresses ?? [], target.addressId);
  const [needsAddress, setNeedsAddress] = useState(false);
  const [text, setText] = useState(initialText);
  /*
   * AS IN THE DEMO: no problem questions before calling (Amit, 2026-09-29) —
   * words, a recording, a photo; and where the work is priced by its kind, a
   * pick from the (example) price list. Where it goes somewhere, the
   * destination.
   */
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [destinationHe, setDestinationHe] = useState("");
  const [formH, setFormH] = useState(0);
  const [sending, setSending] = useState(false);
  const [errorHe, setErrorHe] = useState<string | null>(null);
  const idempotencyKey = useRef(`web-job-${crypto.randomUUID()}`).current;

  const page = catalogServicePages[serviceId];
  const service = pilotServiceById[serviceId];
  const serviceNameHe = page?.nameHe ?? service?.nameHe ?? "השירות שבחרת";
  const mark = (page?.mark ?? service?.mark ?? "handyman") as MarkName;
  const photos = useMemo(
    () =>
      media.photos.map((photo) => ({
        id: photo.id,
        uri: photo.uri,
        subjectHe: service?.photoSubjectHe ?? "צילום של המקום",
        mimeType: photo.blob.type,
      })),
    [media.photos, service?.photoSubjectHe]
  );
  const voice = media.voice ? { uri: null, seconds: media.voice.seconds, mimeType: media.voice.blob.type } : null;

  const onTogglePick = useCallback((id: string) => {
    setPickedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }, []);
  const priceList = useMemo(() => priceRows(serviceId), [serviceId]);
  const needsDestination = service?.needsDestination === true;

  // Set when a photo or recording failed to upload: the request can still go without them.
  const [uploadFailed, setUploadFailed] = useState(false);
  const send = useCallback((withoutMedia = false) => {
    void (async () => {
      if (sending) return;
      if (!address) {
        setErrorHe("עוד אין כתובת שמורה. הוסיפו כתובת כדי שנדע לאן לשלוח את המקצוען.");
        setNeedsAddress(true);
        return;
      }
      setSending(true);
      setErrorHe(null);
      setUploadFailed(false);
      try {
        const dispatchServiceId = await resolveServiceId(serviceId);
        const mediaRefs: string[] = [];
        if (!withoutMedia) {
          try {
            for (const item of mediaUploadInputs(media.photos, media.voice)) {
              const { upload } = await api.uploadMedia(item);
              mediaRefs.push(upload.id);
            }
          } catch (error) {
            throw new MediaUploadError(error);
          }
        }
        const { job } = await api.createJob(
          {
            serviceId: dispatchServiceId,
            addressId: address.id,
            description: composeDescription(serviceId, text, pickedIds, needsDestination ? destinationHe : null),
            mediaRefs,
            structuredAnswers: {
              ...(pickedIds.length > 0 ? { exampleListPicks: pickedIds } : {}),
              ...(needsDestination && destinationHe.trim() ? { destination: destinationHe.trim() } : {}),
            },
            ...(target.onSite ? { onSite: { name: target.onSite.name.trim(), phone: target.onSite.phone.trim() } } : {}),
          },
          idempotencyKey
        );
        onSent(job.id);
      } catch (error) {
        if (error instanceof ServiceNotOpenError) {
          setErrorHe(error.reasonHe);
        } else if (error instanceof ServiceCatalogueMismatchError) {
          setErrorHe("יש אי־התאמה בין הקטלוג לשרת. זו תקלה אצלנו, לא אצלך.");
        } else {
          setUploadFailed(error instanceof MediaUploadError);
          setErrorHe(sendErrorHe(error, mediaUploadInputs(media.photos, media.voice).length));
        }
      } finally {
        setSending(false);
      }
    })();
  }, [address, destinationHe, idempotencyKey, media.photos, media.voice, needsDestination, onSent, pickedIds, sending, serviceId, target.onSite, text]);

  if (addresses.isPending) return <LoadingScreen />;
  if (addresses.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void addresses.refetch()} />;

  return (
    <View style={[styles.screen, { width, height, backgroundColor: customerDarkTheme.colors.bg }]}>
      {errorHe ? <Text accessibilityRole="alert" style={styles.error}>{errorHe}</Text> : null}
      {needsAddress && !address ? (
        <Pressable onPress={onOpenAddresses} accessibilityRole="button" style={styles.sendWithout}>
          <Text style={styles.sendWithoutText}>הוספת כתובת</Text>
        </Pressable>
      ) : null}
      {uploadFailed && !sending ? (
        <Pressable onPress={() => send(true)} accessibilityRole="button" style={styles.sendWithout}>
          <Text style={styles.sendWithoutText}>שליחת הקריאה בלי הקבצים</Text>
        </Pressable>
      ) : null}
      {sending ? <Text style={styles.sending}>מעלים את הפרטים ושולחים…</Text> : null}
      {/* The form takes whatever the panels above leave, measured rather than estimated. */}
      <View style={styles.formArea} onLayout={(e) => setFormH(Math.round(e.nativeEvent.layout.height))}>
        {formH > 0 ? (
          <DescribeFaultBody
            serviceNameHe={serviceNameHe}
            mark={mark}
            symptomsHe={[]}
            photoPromptHe={photoPromptFor(serviceId)}
            voiceExampleHe={service?.symptomsHe[0] ?? null}
            priceList={priceList}
            pickedIds={pickedIds}
            onTogglePick={onTogglePick}
            destination={
              needsDestination
                ? {
                    valueHe: destinationHe,
                    onChange: setDestinationHe,
                    placeholderHe:
                      serviceId === "svc-towing"
                        ? "למשל: מוסך בבני ברק, או הבית"
                        : serviceId === "svc-courier"
                          ? "למשל: רחוב הרצל 10, תל אביב"
                          : "למשל: רחוב הרצל 10, קומה 2",
                  }
                : null
            }
            livePriceHe={livePriceHe(serviceId, pickedIds)}
            detailsNoteHe={detailsNoteHe(serviceId)}
            text={text}
            onChangeText={setText}
            photos={photos}
            onAddPhoto={media.capture.onAddPhoto}
            onAddFromLibrary={media.capture.onAddFromLibrary}
            onRemovePhoto={media.removePhoto}
            voice={voice}
            recording={media.capture.recording}
            recordSeconds={media.capture.recordSeconds}
            canRecord={media.capture.canRecord}
            recordBlockedHe={media.capture.recordBlockedHe}
            onStartRecord={media.capture.onStartRecord}
            onStopRecord={media.capture.onStopRecord}
            onDeleteVoice={media.capture.onDeleteVoice}
            onSend={() => send()}
            typing={frame.typing}
            onBack={onBack}
            width={width}
            height={formH}
          />
        ) : null}
      </View>
    </View>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  screen: { overflow: "hidden" },
  formArea: { flex: 1 },
  sendWithout: { alignSelf: "flex-end", marginHorizontal: spacing.md, marginTop: spacing.xs, paddingVertical: spacing.xs },
  sendWithoutText: { color: customerDarkTheme.colors.action, fontWeight: "600", textAlign: "right", writingDirection: "rtl" },
  error: { color: colors.statusDanger, paddingHorizontal: spacing.md, paddingTop: spacing.sm, textAlign: "right", writingDirection: "rtl" },
  sending: { color: colors.trust, paddingHorizontal: spacing.md, paddingTop: spacing.sm, textAlign: "right", writingDirection: "rtl" },
});
