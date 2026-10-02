import React, { useCallback, useEffect, useState } from "react";
import { Alert, useWindowDimensions, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Location from "expo-location";

import { AddressPickerBody, customerDarkTheme, type AddressPickerResult, type LiveLocationState, type SavedAddress } from "@pro-now/ui";

import type { CustomerStackParamList } from "../navigation/types";
import { api } from "../api/client";
import {
  resolveServiceId,
  ServiceNotOpenError,
  ServiceCatalogueMismatchError,
} from "../api/serviceResolver";

type Props = NativeStackScreenProps<CustomerStackParamList, "Address">;

/**
 * C07 — where to send somebody, and the step that did not exist.
 *
 * ---------------------------------------------------------------------
 * THE GAP THIS CLOSES
 * ---------------------------------------------------------------------
 * `POST /v1/jobs` requires an `addressId` and checks it belongs to the
 * caller — correctly, because sending a professional to a stranger's door
 * is the worst thing this product can get wrong. But no endpoint could
 * create an address and none could list one, so a customer who installed
 * the app could not request anybody at all. The request screen hid it by
 * sending the literal string `"demo-address"`, which worked against a
 * seeded development database and against nothing else.
 *
 * Both halves were confident, which is exactly why it survived: the
 * server was right to refuse and the client never saw the refusal,
 * because in development the row happened to exist.
 *
 * ---------------------------------------------------------------------
 * NO GEOCODING, AND SAYING SO
 * ---------------------------------------------------------------------
 * Turning typed text into a coordinate needs a maps vendor, and choosing
 * one is an open business decision (/CLAUDE.md §4). The device's own
 * location needs no vendor, so "use where I am" is the path that produces
 * a real coordinate today — and a typed address without one is offered
 * only alongside it, never as a silent substitute, because an address
 * with no position cannot be dispatched against.
 */
export function AddressScreen({ route, navigation }: Props) {
  const { serviceId, describedHe, intakeAnswers, media = [] } = route.params;
  const { width, height } = useWindowDimensions();

  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [live, setLive] = useState<LiveLocationState>({ status: "idle" });
  const [liveFix, setLiveFix] = useState<{ lat: number; lng: number; labelHe: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getAddresses()
      .then(({ addresses }) => {
        if (!alive) return;
        setSaved(
          addresses.map((a) => ({
            id: a.id,
            // The label is optional on the server because most people have
            // one address and naming it is ceremony. "כתובת" is a noun,
            // not an invented nickname.
            labelHe: a.label ?? "כתובת",
            formattedHe: a.formatted,
          }))
        );
        if (addresses.length === 1) setSelectedId(addresses[0].id);
      })
      .catch(() => {
        /* An empty list and a failed request are different; neither is a
         * reason to block the live-location path. */
      });
    return () => {
      alive = false;
    };
  }, []);

  const onUseLiveLocation = useCallback(() => {
    void (async () => {
      setLive({ status: "asking" });
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          setLive({ status: "denied" });
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        /*
         * Reverse geocoding on the device, not through a vendor. Expo asks
         * the operating system, which already knows — so there is a
         * readable street here without anybody choosing a maps provider.
         * When the OS has nothing, the coordinate still stands and the
         * label says so rather than inventing a street name.
         */
        let labelHe = "המיקום הנוכחי";
        try {
          const [place] = await Location.reverseGeocodeAsync(pos.coords);
          const parts = [place?.street, place?.streetNumber, place?.city].filter(Boolean);
          if (parts.length > 0) labelHe = parts.join(" ");
        } catch {
          /* Keep the honest generic label. */
        }

        setLiveFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, labelHe });
        setLive({ status: "ready", coarseLabelHe: labelHe });
      } catch {
        setLive({ status: "unavailable" });
      }
    })();
  }, []);

  const onConfirm = useCallback(
    (result: AddressPickerResult) => {
      void (async () => {
        if (sending) return;
        setSending(true);
        try {
          const { choice } = result;
          let addressId: string;

          if (choice.kind === "saved") {
            addressId = choice.addressId;
          } else if (choice.kind === "street") {
            // The server places the street on the map, or refuses it.
            const { address } = await api.createAddress({
              kind: "street",
              localityCode: choice.suggestion.localityCode,
              streetCode: choice.suggestion.streetCode,
              houseNumber: choice.houseNumber || undefined,
              details: choice.detailsHe || undefined,
            });
            addressId = address.id;
          } else {
            /*
             * The device's own location; the floor and flat the customer
             * typed are exactly what a GPS fix does not carry.
             */
            if (!liveFix) {
              Alert.alert(
                "צריך מיקום",
                "כדי לשלוח מקצוען לכתובת חדשה צריך לאשר גישה למיקום. אפשר גם לבחור כתובת שמורה."
              );
              return;
            }
            const { address } = await api.createAddress({
              kind: "location",
              lat: liveFix.lat,
              lng: liveFix.lng,
              details: choice.detailsHe || undefined,
            });
            addressId = address.id;
          }

          /*
           * IDEMPOTENCY PER REQUEST, NOT PER TAP.
           *
           * The old key was `Date.now()` plus a random, which is unique
           * per press — so a double tap, or a retry after a timeout that
           * had actually succeeded, created two jobs and dispatched two
           * professionals to one door. Derived from what the request IS,
           * so the same request is the same key.
           */
          /*
           * The catalogue the screens are built from and the catalogue the
           * server dispatches from are two different tables with two sets
           * of ids. `serviceId` here is the first kind — `svc-leak` — and
           * `POST /v1/jobs` wants the second. Posting one as the other is
           * what this screen did, so every request it has ever sent was
           * refused with SERVICE_NOT_FOUND.
           */
          const dispatchServiceId = await resolveServiceId(serviceId);

          const key = `job_${dispatchServiceId}_${addressId}`;
          const { job } = await api.createJob(
            {
              serviceId: dispatchServiceId,
              // The catalogue name the customer picked is the one shown after ordering (audit v2 #1).
              catalogServiceId: serviceId,
              addressId,
              description: describedHe?.trim() || undefined,
              mediaRefs: (await Promise.all(media.map((item) => api.uploadMedia(item)))).map(
                ({ upload }) => upload.id
              ),
              /*
               * Keyed by question id, which is the shape `structuredAnswers`
               * has on the job and the shape `buildIntakeBrief` reads back.
               * An unanswered question is absent rather than present and
               * empty — the professional's card omits a line rather than
               * showing a question with a blank beside it.
               */
              structuredAnswers: Object.fromEntries(
                (intakeAnswers ?? []).map((a) => [a.questionId, a])
              ),
            },
            key
          );
          navigation.replace("Searching", { jobId: job.id });
        } catch (err) {
          /*
           * A trade the platform has not opened is not an error the
           * customer caused, and it is not "something went wrong" either.
           * It has its own sentence, and no "try again" — trying again
           * will not open it.
           */
          if (err instanceof ServiceNotOpenError) {
            Alert.alert("השירות הזה עדיין לא זמין", err.reasonHe);
          } else if (err instanceof ServiceCatalogueMismatchError) {
            // Ours, not theirs. Say so plainly rather than blaming the area.
            Alert.alert(
              "לא הצלחנו לשלוח את הבקשה",
              "יש אי-התאמה בין הקטלוג לשרת. זו תקלה אצלנו, לא אצלך."
            );
          } else {
            const message = err instanceof Error ? err.message : "שגיאה לא צפויה";
            Alert.alert("לא הצלחנו לשלוח את הבקשה", message);
          }
        } finally {
          setSending(false);
        }
      })();
    },
    [sending, liveFix, serviceId, describedHe, intakeAnswers, media, navigation]
  );

  return (
    <View style={{ flex: 1, backgroundColor: customerDarkTheme.colors.bg }}>
      <AddressPickerBody
        saved={saved}
        selectedId={selectedId}
        liveLocation={live}
        forSomeoneElseEnabled={false}
        onUseLiveLocation={onUseLiveLocation}
        onSelect={setSelectedId}
        onConfirm={onConfirm}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        width={width}
        height={height}
      />
    </View>
  );
}
