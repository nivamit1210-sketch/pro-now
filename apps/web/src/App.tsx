import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient, useMe } from "./api";
import { useSession } from "./auth";
import { Frame } from "./frame";
import { WithHeader } from "./CustomerHeader";
import { OrderTargetProvider } from "./orderTarget";
import { ErrorScreen, LoadingScreen } from "./states";
import { Home } from "./screens/Home";
import { Job } from "./screens/Job";
import { OnSite } from "./screens/OnSite";
import { ProHome } from "./screens/pro/ProHome";
import { ProJoin } from "./screens/pro/ProJoin";
import { ProJob } from "./screens/pro/ProJob";
import { Admin } from "./screens/admin/Admin";
import { Inbox } from "./screens/Inbox";
import { Calls } from "./screens/Calls";
import { Profile } from "./screens/Profile";
import { useUserChannel } from "./useUserChannel";
import { Addresses } from "./screens/Addresses";
import { Avatar, Intro } from "./screens/Onboarding";
import { SignIn } from "./screens/SignIn";
import { Welcome } from "./screens/Welcome";
import { World } from "./screens/World";

/**
 * Who may see what is decided by the server's session, never by the client
 * (CLAUDE.md §3): these guards only choose which screen to draw while the
 * API enforces access on every call.
 */
function SignedIn({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  if (isPending) return <LoadingScreen />;
  return data ? children : <Navigate to="/welcome" replace />;
}

function SignedOut({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  if (isPending) return <LoadingScreen />;
  return data ? <Navigate to="/" replace /> : children;
}

/**
 * The first-run steps come before home, once each, in the demo's order:
 * intro, then the character. Where the person stands is the server's answer
 * (`GET /api/v1/me`).
 */
function FirstRun({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isPending) return <LoadingScreen />;
  if (me.isError) return <ErrorScreen offline={!navigator.onLine} onRetry={() => void me.refetch()} />;
  // Someone registered as a professional lands on their own page (Amit,
  // 2026-09-30); "?as=customer" is how a professional orders for themselves.
  if (me.data.roles.includes("PROFESSIONAL") && new URLSearchParams(location.search).get("as") !== "customer") {
    return <Navigate to="/pro" replace />;
  }
  const c = me.data.customer;
  if (c && !c.introSeen) return <Navigate to="/intro" replace />;
  if (c && !c.avatarAnswered) return <Navigate to="/avatar" replace />;
  return children;
}

/** The person's own live channel, open while signed in (docs/21 W9). */
function LiveChannel() {
  useUserChannel();
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <LiveChannel />
        <Frame>
          <OrderTargetProvider>
          <Routes>
            <Route path="/welcome" element={<SignedOut><Welcome /></SignedOut>} />
            <Route path="/sign-in" element={<SignedOut><SignIn /></SignedOut>} />
            <Route path="/intro" element={<SignedIn><Intro /></SignedIn>} />
            <Route path="/avatar" element={<SignedIn><Avatar /></SignedIn>} />
            <Route path="/addresses" element={<SignedIn><Addresses /></SignedIn>} />
            <Route path="/world" element={<SignedIn><FirstRun><World /></FirstRun></SignedIn>} />
            <Route path="/jobs/:id" element={<SignedIn><WithHeader><Job /></WithHeader></SignedIn>} />
            {/* הקריאות שלי: every job of theirs, under the same header (the demo's calls tab). */}
            <Route path="/calls" element={<SignedIn><WithHeader><Calls /></WithHeader></SignedIn>} />
            {/* החשבון שלי: who they are, their calls, and deleting the account (the demo's card tab). */}
            <Route path="/profile" element={<SignedIn><WithHeader><Profile /></WithHeader></SignedIn>} />
            {/* The professional's side (docs/21 W7). */}
            <Route path="/pro" element={<SignedIn><ProHome /></SignedIn>} />
            <Route path="/pro/earnings" element={<SignedIn><ProHome /></SignedIn>} />
            <Route path="/pro/documents" element={<SignedIn><ProHome /></SignedIn>} />
            <Route path="/pro/profile" element={<SignedIn><ProHome /></SignedIn>} />
            <Route path="/pro/pricing" element={<SignedIn><ProHome /></SignedIn>} />
            <Route path="/pro/join" element={<SignedIn><ProJoin /></SignedIn>} />
            <Route path="/pro/jobs/:id" element={<SignedIn><ProJob /></SignedIn>} />
            {/* The admin (docs/21 W8); the server enforces ADMIN on every call. */}
            <Route path="/admin" element={<SignedIn><Admin /></SignedIn>} />
            <Route path="/inbox" element={<SignedIn><Inbox /></SignedIn>} />
            {/* The person at home: no account (docs/21 W6). */}
            <Route path="/s/:token" element={<OnSite />} />
            <Route path="/" element={<SignedIn><FirstRun><Home /></FirstRun></SignedIn>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </OrderTargetProvider>
        </Frame>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
