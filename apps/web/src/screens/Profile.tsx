import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CustomerProfileBody } from "@pro-now/ui";

import { api } from "../api";
import { shortAddressHe } from "../addressLabel";
import { useFrame } from "../frame";
import { displayNameFor, profileFromJobs } from "../profile";
import { ErrorScreen, LoadingScreen } from "../states";

/**
 * החשבון שלי — the customer's profile (the demo's `card` tab), from the
 * server: who they are, their open and finished calls, and the address the
 * next request goes to. As the demo shows it, and no more.
 *
 * No payment method: the customer pays the professional directly (D1) and
 * the payment vendor is an open decision (CLAUDE.md §4), so the payment row
 * is shown without a way to add one rather than leading nowhere.
 */
export function Profile() {
  const navigate = useNavigate();
  const { width, height } = useFrame();

  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const myJobs = useQuery({ queryKey: ["my-jobs"], queryFn: api.listMyJobs, refetchInterval: 30_000 });
  const addresses = useQuery({ queryKey: ["addresses"], queryFn: api.getAddresses });

  if (me.isPending || myJobs.isPending || addresses.isPending) return <LoadingScreen />;
  if (me.isError || myJobs.isError || addresses.isError)
    return (
      <ErrorScreen
        offline={!navigator.onLine}
        onRetry={() => {
          void me.refetch();
          void myJobs.refetch();
          void addresses.refetch();
        }}
      />
    );

  const { openCalls, history, lifetimeSpendMinorUnits } = profileFromJobs(myJobs.data.jobs, new Date());
  const firstAddress = addresses.data.addresses[0];

  return (
    <CustomerProfileBody
      displayNameHe={displayNameFor(me.data)}
      seed={me.data.user.id}
      homeAreaLabelHe={firstAddress ? shortAddressHe(firstAddress) : null}
      paymentLabelHe={null}
      openCalls={openCalls}
      history={history}
      lifetimeSpendMinorUnits={lifetimeSpendMinorUnits}
      onOpenCall={(id) => navigate(`/jobs/${id}`)}
      onEditAddresses={() => navigate("/addresses")}
      // Back to the menu it was opened from, as the calls list does.
      onBack={() => navigate("/", { state: { menu: true } })}
      width={width}
      height={height}
    />
  );
}
