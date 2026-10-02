import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CallsListBody } from "@pro-now/ui";

import { api } from "../api";
import { callsFromJobs } from "../callsList";
import { useFrame } from "../frame";
import { ErrorScreen, LoadingScreen } from "../states";

/**
 * הקריאות שלי — the customer's calls (the demo's `calls` tab), from the
 * server's own list of their jobs. Every row opens that job's screen: the
 * live one its tracking, a finished one waiting for stars its review, a
 * closed one its summary. Same query as home's capsule, so both agree.
 */
export function Calls() {
  const navigate = useNavigate();
  const { width, height } = useFrame();
  const myJobs = useQuery({ queryKey: ["my-jobs"], queryFn: api.listMyJobs, refetchInterval: 30_000 });

  if (myJobs.isPending) return <LoadingScreen />;
  if (myJobs.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void myJobs.refetch()} />;

  const { calls, historyTitleHe } = callsFromJobs(myJobs.data.jobs, new Date());
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
