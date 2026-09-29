import { describe, expect, it } from "vitest";
import { ApiError, createApiClient } from "../src/index";

function fakeFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("api client", () => {
  it("calls the API under /api/v1 with the session cookie and no token", async () => {
    const f = fakeFetch(200, { user: { id: "u" } });
    await createApiClient({ fetch: f.fn }).me();
    expect(f.calls[0]!.url).toBe("/api/v1/me");
    expect(f.calls[0]!.init.credentials).toBe("include");
    expect(new Headers(f.calls[0]!.init.headers).get("authorization")).toBeNull();
  });

  it("sends a JSON body typed by the shared schema", async () => {
    const f = fakeFetch(200, { ok: true });
    await createApiClient({ fetch: f.fn }).saveOnboarding({ introSeen: true });
    expect(f.calls[0]!.init.method).toBe("PATCH");
    expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ introSeen: true });
  });

  it("turns a refusal into an ApiError with the server's code", async () => {
    const f = fakeFetch(403, { code: "FORBIDDEN", message: "This account cannot do that" });
    const err = await createApiClient({ fetch: f.fn }).me().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("survives a body that is not JSON", async () => {
    const fn = (async () => new Response("<html>bad gateway</html>", { status: 502 })) as unknown as typeof fetch;
    const err = await createApiClient({ fetch: fn }).me().catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: "HTTP_502" });
  });

  it("exposes address and geocoding calls under the shared API prefix", async () => {
    const f = fakeFetch(200, { results: [] });
    const client = createApiClient({ fetch: f.fn });
    await client.getAddresses();
    await client.searchAddresses("הרצל 5");
    await client.reverseGeocode({ lat: 32.1, lng: 34.8 });
    expect(f.calls.map((call) => call.url)).toEqual([
      "/api/v1/me/addresses",
      "/api/v1/geo/search?q=%D7%94%D7%A8%D7%A6%D7%9C%205",
      "/api/v1/geo/reverse?lat=32.1&lng=34.8",
    ]);
  });

  it("loads the server catalogue under the shared API prefix", async () => {
    const f = fakeFetch(200, { marketCode: "IL-TLV", departments: [] });
    await createApiClient({ fetch: f.fn }).getCatalog();
    expect(f.calls[0]!.url).toBe("/api/v1/catalog");
  });

  it("uploads media through a presigned PUT and completes it", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (calls.length === 1) {
        return new Response(
          JSON.stringify({
            upload: { id: "up1", status: "PENDING" },
            uploadUrl: "https://storage.test/up1",
            expiresInSeconds: 300,
          }),
          { status: 201 }
        );
      }
      if (calls.length === 2) return new Response(null, { status: 200 });
      return new Response(JSON.stringify({ upload: { id: "up1", status: "READY" } }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await createApiClient({ fetch: fetchImpl }).uploadMedia({
      kind: "PHOTO",
      mime: "image/jpeg",
      body: new Blob(["jpeg"], { type: "image/jpeg" }),
    });

    expect(result.upload).toMatchObject({ id: "up1", status: "READY" });
    expect(calls.map((call) => [call.url, call.init.method])).toEqual([
      ["/api/v1/uploads", "POST"],
      ["https://storage.test/up1", "PUT"],
      ["/api/v1/uploads/up1/complete", "POST"],
    ]);
    expect(calls[1]!.init.headers).toMatchObject({ "Content-Type": "image/jpeg" });
  });

  it("creates a job with the ready media references", async () => {
    const f = fakeFetch(200, { job: { id: "job1" }, dispatch: { outcome: "NO_MATCH" } });
    await createApiClient({ fetch: f.fn }).createJob(
      {
        serviceId: "service1",
        addressId: "address1",
        description: "יש נזילה",
        mediaRefs: ["upload1", "upload2"],
      },
      "job-key-1"
    );

    expect(f.calls[0]!.url).toBe("/api/v1/jobs");
    expect(f.calls[0]!.init.method).toBe("POST");
    expect(f.calls[0]!.init.headers).toMatchObject({ "Idempotency-Key": "job-key-1" });
    expect(JSON.parse(String(f.calls[0]!.init.body))).toMatchObject({
      serviceId: "service1",
      addressId: "address1",
      description: "יש נזילה",
      mediaRefs: ["upload1", "upload2"],
    });
  });

  it("uploads straight to storage without sending the session cookie (W7 QA #1)", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/uploads")) {
        return new Response(JSON.stringify({ upload: { id: "u1" }, uploadUrl: "https://storage.example/put?sig=1" }), { status: 201 });
      }
      if (url.startsWith("https://storage.example")) return new Response(null, { status: 200 });
      return new Response(JSON.stringify({ upload: { id: "u1", status: "READY" } }), { status: 200 });
    }) as unknown as typeof fetch;
    await createApiClient({ fetch: fn }).uploadMedia({ kind: "DOCUMENT", mime: "application/pdf", body: new ArrayBuffer(4) });
    const put = calls.find((c) => c.url.startsWith("https://storage.example"))!;
    expect(put.init.method).toBe("PUT");
    expect(put.init.credentials).toBe("omit");
  });
});
