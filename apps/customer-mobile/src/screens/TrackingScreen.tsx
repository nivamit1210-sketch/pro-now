import React, { useEffect, useMemo, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { ArrivalSignals } from "@pro-now/types";
import { TrackingBody, customerDarkTheme } from "@pro-now/ui";

import type { CustomerStackParamList } from "../navigation/types";
import { useJobWatch } from "../api/useJobWatch";
import { worldSources } from "../world/worldSources";

type Props = NativeStackScreenProps<CustomerStackParamList, "Tracking">;

/**
 * C10/C11 — somebody is on the way.
 *
 * ---------------------------------------------------------------------
 * WHAT THIS SCREEN USED TO SAY
 * ---------------------------------------------------------------------
 * "יוסי בדרך אליך", "11 דקות", and a button labelled "המשך (דמו)" that
 * navigated to a job called `"demo"`. It took no props, made no requests,
 * and knew nothing about the job it claimed to be tracking. A name and an
 * ETA written into a component are the two things /CLAUDE.md §3 names
 * first — real supply only, real ETA only — and this was both, in the app
 * that would have gone to the stores.
 *
 * Everything on it now comes from `/v1/jobs/:id` and `/v1/jobs/:id/match`,
 * or is absent. There is no fallback name and no fallback number: until
 * the server has a professional, this screen has no professional, and it
 * says so by showing the world without one rather than by inventing Yossi.
 *
 * ---------------------------------------------------------------------
 * ARRIVAL ASSURANCE IS NOT DECIDED HERE
 * ---------------------------------------------------------------------
 * `TrackingBody` deliberately takes SIGNALS rather than a phase, and asks
 * `assessArrival` itself, so the customer's screen and the server's
 * dispatch logic cannot disagree about whether an arrival is in trouble.
 * This screen's only job is to report the signals honestly — including
 * `promisedArrivalMs: null` when no ETA was ever computed, which is a
 * state the assessment already knows how to handle and a screen would be
 * tempted to paper over.
 */
export function TrackingScreen({ route, navigation }: Props) {
  const { jobId } = route.params;
  const { width, height } = useWindowDimensions();
  const { status, match, departmentCode, etaSecondsAtAssignment } = useJobWatch(jobId);

  /*
   * A clock that ticks so lateness is noticed.
   *
   * `assessArrival` compares the promise to now, so without something
   * advancing `nowMs` a professional could be twenty minutes late on a
   * screen that still looked calm. Once a minute is enough — the
   * assessment's thresholds are in minutes, and a per-second timer would
   * re-render the whole world sixty times for nothing.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (status === "WAITING_QUOTE_APPROVAL") navigation.replace("Quote", { jobId });
    else if (status === "COMPLETION_PENDING" || status === "COMPLETED") {
      navigation.replace("Complete", { jobId });
    }
  }, [status, jobId, navigation]);

  /**
   * The facts the assessment reasons over.
   *
   * `promisedArrivalMs` is computed from the server's ETA and the moment
   * the server computed it — never from "now plus the ETA", which would
   * slide the promise forward every time the screen re-rendered and make
   * lateness structurally impossible to detect.
   */
  const arrival: ArrivalSignals = useMemo(() => {
    const eta = match?.eta ?? null;
    return {
      promisedArrivalMs: eta ? Date.parse(eta.computedAt) + eta.etaSeconds * 1000 : null,
      /*
       * When the professional's position last updated. There is no
       * location feed on this client yet, so this is honestly null — and
       * `assessArrival` treats an unknown last-seen as unknown rather than
       * as stale, which is why it can be null rather than a guess.
       */
      lastLocationMs: null,
      nowMs,
    };
  }, [match, nowMs]);

  /*
   * No professional, no tracking screen content — and that is a real
   * state, not an error. A job can be assigned a beat before the match
   * endpoint answers, and the honest thing in that beat is the world
   * without a face on it.
   */
  if (!match) {
    return <View style={{ flex: 1, backgroundColor: customerDarkTheme.colors.bg }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: customerDarkTheme.colors.bg }}>
      <TrackingBody
        status={status}
        serviceNameHe={match.serviceNameHe}
        professional={match.professional}
        professionalFemale={match.professional.addressAs === "F"}
        eta={match.eta}
        arrival={arrival}
        worldSources={worldSources}
        departmentCode={departmentCode ?? null}
        etaSecondsAtAssignment={etaSecondsAtAssignment}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        width={width}
        height={height}
      />
    </View>
  );
}
