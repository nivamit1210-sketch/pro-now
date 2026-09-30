import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Better Auth's client (docs/21 W1). Same origin: the dev server proxies
 * /api to Fastify, and in production Fastify serves this app itself, so the
 * session cookie is first-party and never readable from JavaScript.
 */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [magicLinkClient()],
});

export const useSession = authClient.useSession;

/**
 * Signing out on this device, from either side. The session ends on the
 * server, the screen goes to the welcome, and every cached answer is
 * dropped: the next person to sign in on this tab must never see the last
 * one's application, jobs or inbox, not even for a frame.
 */
export async function signOutHere(queryClient: QueryClient, goToWelcome: () => void): Promise<void> {
  await authClient.signOut();
  goToWelcome();
  queryClient.clear();
}
