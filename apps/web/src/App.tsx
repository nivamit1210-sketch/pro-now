import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient, useMe } from "./api";
import { useSession } from "./auth";
import { Frame } from "./frame";
import { ErrorScreen, LoadingScreen } from "./states";
import { Home } from "./screens/Home";
import { Job } from "./screens/Job";
import { Addresses } from "./screens/Addresses";
import { Avatar, Intro } from "./screens/Onboarding";
import { SignIn } from "./screens/SignIn";
import { Welcome } from "./screens/Welcome";

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
  const c = me.data.customer;
  if (c && !c.introSeen) return <Navigate to="/intro" replace />;
  if (c && !c.avatarAnswered) return <Navigate to="/avatar" replace />;
  return children;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Frame>
          <Routes>
            <Route path="/welcome" element={<SignedOut><Welcome /></SignedOut>} />
            <Route path="/sign-in" element={<SignedOut><SignIn /></SignedOut>} />
            <Route path="/intro" element={<SignedIn><Intro /></SignedIn>} />
            <Route path="/avatar" element={<SignedIn><Avatar /></SignedIn>} />
            <Route path="/addresses" element={<SignedIn><Addresses /></SignedIn>} />
            <Route path="/jobs/:id" element={<SignedIn><Job /></SignedIn>} />
            <Route path="/" element={<SignedIn><FirstRun><Home /></FirstRun></SignedIn>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Frame>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
