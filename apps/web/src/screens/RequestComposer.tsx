import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { pilotIntakeByService } from "@pro-now/types";

import { api } from "../api";
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
};

export function RequestComposer({ serviceId, media, onBack, onOpenAddresses, onSent, initialText = "" }: Props) {
  const { width, height } = useFrame();
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: api.getAddresses });
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [text, setText] = useState(initialText);
  const [answers, setAnswers] = useState<Array<{ questionId: string; optionIds?: string[]; textValue?: string; numberValue?: number }>>([]);
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

  useEffect(() => {
    if (selectedAddressId === null && addresses.data?.addresses[0]) {
      setSelectedAddressId(addresses.data.addresses[0].id);
    }
  }, [addresses.data, selectedAddressId]);

  const onAnswer = useCallback((answer: (typeof answers)[number]) => {
    setAnswers((current) => [...current.filter((item) => item.questionId !== answer.questionId), answer]);
  }, []);

  const send = useCallback(() => {
    void (async () => {
      if (sending) return;
      if (!selectedAddressId) {
        setErrorHe("בחרו כתובת לפני שליחת הקריאה.");
        return;
      }
      setSending(true);
      setErrorHe(null);
      try {
        const dispatchServiceId = await resolveServiceId(serviceId);
        const mediaRefs: string[] = [];
        for (const item of mediaUploadInputs(media.photos, media.voice)) {
          const { upload } = await api.uploadMedia(item);
          mediaRefs.push(upload.id);
        }
        const { job } = await api.createJob(
          {
            serviceId: dispatchServiceId,
            addressId: selectedAddressId,
            description: text.trim() || undefined,
            mediaRefs,
            structuredAnswers: Object.fromEntries(answers.map((answer) => [answer.questionId, answer])),
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
          setErrorHe(error instanceof Error ? error.message : "לא הצלחנו לשלוח את הקריאה.");
        }
      } finally {
        setSending(false);
      }
    })();
  }, [answers, idempotencyKey, media.photos, media.voice, onSent, selectedAddressId, sending, serviceId, text]);

  if (addresses.isPending) return <LoadingScreen />;
  if (addresses.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void addresses.refetch()} />;

  return (
    <View style={[styles.screen, { width, height, backgroundColor: customerDarkTheme.colors.bg }]}>
      <AddressChoice
        addresses={addresses.data.addresses}
        selectedId={selectedAddressId}
        onSelect={setSelectedAddressId}
        onOpenAddresses={onOpenAddresses}
      />
      {errorHe ? <Text accessibilityRole="alert" style={styles.error}>{errorHe}</Text> : null}
      {sending ? <Text style={styles.sending}>מעלים את הפרטים ושולחים…</Text> : null}
      <DescribeFaultBody
        serviceNameHe={serviceNameHe}
        mark={mark}
        symptomsHe={[]}
        photoPromptHe={photoPromptFor(serviceId)}
        intake={pilotIntakeByService[serviceId]}
        answers={answers}
        onAnswer={onAnswer}
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
        onSend={send}
        onBack={onBack}
        width={width}
        height={height - 148}
      />
    </View>
  );
}

function AddressChoice({
  addresses,
  selectedId,
  onSelect,
  onOpenAddresses,
}: {
  addresses: Array<{ id: string; label: string | null; formatted: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenAddresses: () => void;
}) {
  return (
    <View style={styles.addressPanel}>
      <View style={styles.addressHeading}>
        <Text style={styles.addressTitle}>לאן שולחים את המקצוען?</Text>
        <Pressable onPress={onOpenAddresses} accessibilityRole="button">
          <Text style={styles.addressLink}>ניהול כתובות</Text>
        </Pressable>
      </View>
      {addresses.length > 0 ? (
        <View style={styles.addressRows}>
          {addresses.slice(0, 3).map((address) => {
            const selected = selectedId === address.id;
            return (
              <Pressable
                key={address.id}
                onPress={() => onSelect(address.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.addressRow, selected && styles.addressRowSelected]}
              >
                <View style={[styles.radio, selected && styles.radioSelected]} />
                <View style={styles.addressCopy}>
                  <Text style={styles.addressLabel}>{address.label ?? "כתובת"}</Text>
                  <Text style={styles.addressText} numberOfLines={1}>{address.formatted}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Pressable onPress={onOpenAddresses} accessibilityRole="button" style={styles.emptyAddress}>
          <Text style={styles.emptyAddressText}>אין עדיין כתובת שמורה — הוסיפו אחת כדי לשלוח קריאה.</Text>
        </Pressable>
      )}
    </View>
  );
}

const colors = customerDarkTheme.colors;
const styles = StyleSheet.create({
  screen: { overflow: "hidden" },
  addressPanel: { padding: spacing.md, backgroundColor: colors.surfaceElevated },
  addressHeading: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  addressTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "800", writingDirection: "rtl" },
  addressLink: { color: colors.trust, fontSize: 12, fontWeight: "800", writingDirection: "rtl" },
  addressRows: { gap: spacing.xs, marginTop: spacing.sm },
  addressRow: { flexDirection: "row-reverse", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: 12, backgroundColor: colors.bg },
  addressRowSelected: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.trust },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.textSecondary },
  radioSelected: { borderColor: colors.trust, backgroundColor: colors.trust },
  addressCopy: { flex: 1, alignItems: "flex-end" },
  addressLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "800", writingDirection: "rtl" },
  addressText: { color: colors.textSecondary, fontSize: 12, marginTop: 2, writingDirection: "rtl" },
  emptyAddress: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.bg, borderRadius: 12 },
  emptyAddressText: { color: colors.textSecondary, textAlign: "right", writingDirection: "rtl" },
  error: { color: colors.statusDanger, paddingHorizontal: spacing.md, paddingTop: spacing.sm, textAlign: "right", writingDirection: "rtl" },
  sending: { color: colors.trust, paddingHorizontal: spacing.md, paddingTop: spacing.sm, textAlign: "right", writingDirection: "rtl" },
});
