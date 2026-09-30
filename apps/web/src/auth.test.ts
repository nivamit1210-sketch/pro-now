import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const signOut = vi.fn(async () => ({ data: { success: true }, error: null }));
vi.mock("better-auth/react", () => ({ createAuthClient: () => ({ signOut, useSession: () => null }) }));

const { signOutHere } = await import("./auth");

describe("signOutHere", () => {
  it("ends the session, leaves for the welcome, and forgets every cached answer", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["pro-application"], { profile: { displayName: "the last person" } });
    queryClient.setQueryData(["my-jobs"], { jobs: [{ id: "j1" }] });
    const order: string[] = [];
    signOut.mockImplementationOnce(async () => {
      order.push("server");
      return { data: { success: true }, error: null };
    });

    await signOutHere(queryClient, () => order.push("welcome"));

    expect(order).toEqual(["server", "welcome"]);
    expect(queryClient.getQueryData(["pro-application"])).toBeUndefined();
    expect(queryClient.getQueryData(["my-jobs"])).toBeUndefined();
  });
});
