import { useCallback, useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@pro-now/api-client";
import {
  AddressPickerBody,
  SUGGEST_MIN_CHARS,
  type AddressPickerResult,
  type AddressSuggestionsState,
  type LiveLocationState,
  type SavedAddress,
} from "@pro-now/ui";
import type { CreateAddressInput } from "@pro-now/validation";
import { useNavigate } from "react-router";

import { api } from "../api";
import { IL_MOBILE, resolveAddress, useOrderTarget } from "../orderTarget";
import { ErrorScreen, LoadingScreen } from "../states";
import { useFrame } from "../frame";

const addressesKey = ["addresses"] as const;
/** Long enough to skip the letters of a word being typed, short enough to feel instant. */
const SUGGEST_DEBOUNCE_MS = 150;

/**
 * `onDone`: opened over an order in progress (the service page or the form,
 * as in the demo's AddressLine "שינוי"), confirming or going back returns
 * there with everything kept. Without it this is the /addresses screen.
 */
export function Addresses({ onDone }: { onDone?: () => void } = {}) {
  const { width, height } = useFrame();
  const navigate = useNavigate();
  const done = () => (onDone ? onDone() : navigate("/", { replace: true }));
  const queryClient = useQueryClient();
  const addresses = useQuery({ queryKey: addressesKey, queryFn: api.getAddresses });
  /*
   * Where the next request goes, and who will be at the door — chosen here,
   * as in the demo, not on the request form (docs/DEMO-SYNC.md, 2026-10-01 C3).
   */
  const { target, setTarget } = useOrderTarget();
  const setOrderTarget = (addressId: string, r: AddressPickerResult) =>
    setTarget({ addressId, onSite: r.forSomeoneElse ? { name: r.recipientNameHe, phone: r.recipientPhone } : null });
  const [live, setLive] = useState<LiveLocationState>({ status: "idle" });
  const [liveFix, setLiveFix] = useState<{ lat: number; lng: number } | null>(null);
  const [errorHe, setErrorHe] = useState<string | null>(null);

  // What the box holds, settled for a moment before the server is asked.
  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSettled(query.trim()), SUGGEST_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);
  const streets = useQuery({
    queryKey: ["streets", settled],
    queryFn: () => api.suggestStreets(settled),
    enabled: settled.length >= SUGGEST_MIN_CHARS,
    staleTime: Infinity,
    // The last answer stays up while the next is on its way, as in any maps search box.
    placeholderData: keepPreviousData,
  });
  const typing = query.trim();
  const suggestionsState: AddressSuggestionsState =
    typing.length < SUGGEST_MIN_CHARS
      ? "idle"
      : streets.isError
        ? "error"
        : streets.isFetching || settled !== typing
          ? "loading"
          : "ready";
  const suggestions = typing.length >= SUGGEST_MIN_CHARS ? (streets.data?.suggestions ?? []) : [];

  const save = useMutation({
    mutationFn: ({ input }: { input: CreateAddressInput; result: AddressPickerResult }) => api.createAddress(input),
    onSuccess: async ({ address }, { result }) => {
      setOrderTarget(address.id, result);
      await queryClient.invalidateQueries({ queryKey: addressesKey });
      done();
    },
    onError: (error) => {
      setErrorHe(
        error instanceof ApiError && error.code === "ADDRESS_NOT_ON_MAP"
          ? "המפה עוד לא מכירה את הרחוב הזה, ולא נשלח מקצוען לנקודה משוערת. בחרו רחוב אחר בקרבת מקום, או את המיקום שלי עכשיו."
          : !navigator.onLine
            ? "אין חיבור לאינטרנט. נסו שוב כשהחיבור יחזור."
            : "לא הצלחנו לשמור את הכתובת. נסו שוב בעוד רגע."
      );
    },
  });

  /*
   * The ×: off my list (audit v2 #4). A job that went there keeps it on the
   * server. If it was the one chosen for the next order, that choice and
   * the person at its door go with it: the order then goes to the newest
   * address still listed (resolveAddress), or asks for one, as in the demo.
   */
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAddress(id),
    onSuccess: async (_, id) => {
      if (target.addressId === id) setTarget({ addressId: null, onSite: null });
      await queryClient.invalidateQueries({ queryKey: addressesKey });
    },
    onError: () => {
      setErrorHe(!navigator.onLine ? "אין חיבור לאינטרנט. נסו שוב כשהחיבור יחזור." : "לא הצלחנו להסיר את הכתובת. נסו שוב בעוד רגע.");
    },
  });

  const saved: SavedAddress[] = (addresses.data?.addresses ?? []).map((address) => ({
    id: address.id,
    labelHe: address.label ?? "כתובת",
    formattedHe: address.formatted,
  }));

  const onUseLiveLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLive({ status: "unavailable" });
      return;
    }
    setLive({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        // The words are only for the card; the server names the place itself when it is saved.
        const { result } = await api.reverseGeocode({ lat: coords.latitude, lng: coords.longitude }).catch(() => ({ result: null }));
        setLiveFix({ lat: coords.latitude, lng: coords.longitude });
        setLive({ status: "ready", coarseLabelHe: result?.formattedAddress ?? "המיקום הנוכחי" });
      },
      (error) => setLive({ status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 10_000 }
    );
  }, []);

  if (addresses.isPending) return <LoadingScreen />;
  if (addresses.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void addresses.refetch()} />;

  return (
    <AddressPickerBody
      saved={saved}
      selectedId={resolveAddress(saved, target.addressId)?.id ?? null}
      liveLocation={live}
      forSomeoneElseEnabled
      suggestions={suggestions}
      suggestionsState={suggestionsState}
      onQueryChange={(text) => {
        setQuery(text);
        setErrorHe(null);
      }}
      saving={save.isPending}
      errorHe={errorHe}
      onUseLiveLocation={onUseLiveLocation}
      onRemove={(id) => {
        if (remove.isPending) return;
        setErrorHe(null);
        remove.mutate(id);
      }}
      onBack={() => (onDone ? onDone() : navigate(-1))}
      onConfirm={(r) => {
        if (save.isPending) return;
        setErrorHe(null);
        if (r.forSomeoneElse && !IL_MOBILE.test(r.recipientPhone)) {
          setErrorHe("כתבו מספר נייד ישראלי של מי שיהיה בבית — הוא יקבל קישור עם שם המקצוען וקוד לדלת.");
          return;
        }
        const { choice } = r;
        if (choice.kind === "saved") {
          setOrderTarget(choice.addressId, r);
          done();
        } else if (choice.kind === "street") {
          save.mutate({
            input: {
              kind: "street",
              localityCode: choice.suggestion.localityCode,
              streetCode: choice.suggestion.streetCode,
              houseNumber: choice.houseNumber || undefined,
              details: choice.detailsHe || undefined,
            },
            result: r,
          });
        } else if (liveFix) {
          save.mutate({ input: { kind: "location", ...liveFix, details: choice.detailsHe || undefined }, result: r });
        }
      }}
      width={width}
      height={height}
    />
  );
}
