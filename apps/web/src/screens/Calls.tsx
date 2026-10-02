import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { CallsListBody } from "@pro-now/ui";

import { api } from "../api";
import { callsFromJobs, onTheWayJobIds, type CallMatch } from "../callsList";
import { useFrame } from "../frame";
import { ErrorScreen, LoadingScreen } from "../states";
import { jobKey } from "./Job";

/**
 * הקריאות שלי — the customer's calls (the demo's `calls` tab), from the
 * server's own list of their jobs. Every row opens that job's screen: the
 * live one its tracking, a finished one waiting for stars its review, a
 * closed one its summary. Same query as home's capsule, so both agree.
 *
 * A call with somebody on the way shows its minutes, as the demo's does:
 * that job's match is read (the job screen's and the capsule's own query,
 * so they share the cache) and counted down between reads.
 */
export function Calls() {
  const navigate = useNavigate();
  const { width, height } = useFrame();
  const myJobs = useQuery({ queryKey: ["my-jobs"], queryFn: api.listMyJobs, refetchInterval: 30_000 });
  const onTheWay = onTheWayJobIds(myJobs.data?.jobs ?? []);
  const matchReads = useQueries({
    queries: onTheWay.map((id) => ({
      queryKey: [...jobKey(id), "match"],
      queryFn: () => api.getJobMatch(id),
      refetchInterval: 30_000,
    })),
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const counting = onTheWay.length > 0;
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(t);
  }, [counting]);

  if (myJobs.isPending) return <LoadingScreen />;
  if (myJobs.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void myJobs.refetch()} />;

  const matches: Record<string, CallMatch | undefined> = {};
  onTheWay.forEach((id, i) => {
    matches[id] = matchReads[i]?.data;
  });
  const { calls, historyTitleHe } = callsFromJobs(myJobs.data.jobs, new Date(nowMs), matches);
  const openJob = (id: string) => navigate(`/jobs/${id}`);
  return (
    <CallsListBody
      calls={calls}
      historyTitleHe={historyTitleHe}
      onOpen={openJob}
      // The job's own screen is where its review and its quote are answered.
      onRate={openJob}
      onApproveQuote={openJob}
      onNewCall={() => navigate("/")}
      // Back to the menu it was opened from, as in the demo.
      onBack={() => navigate("/", { state: { menu: true } })}
      width={width}
      height={height}
    />
  );
}
