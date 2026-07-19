import { describe, expect, it, vi } from "vitest";
import { HubAdminClient, HubAdminError } from "./admin";

describe("HubAdminClient", () => {
  it("starts and verifies email auth without putting credentials in URLs", async () => {
    const responses: unknown[] = [
      { challenge_id: "chal_test", expires_at: "2026-07-19T01:00:00Z", delivery: "email" },
      { access_token: "account-access-secret", refresh_token: "intentionally-not-exposed", token_type: "bearer" }
    ];
    const fetcher = vi.fn(async () => jsonResponse(responses.shift()));
    const client = new HubAdminClient("https://hub.example.com/", { fetch: fetcher as typeof fetch });

    await expect(client.startEmailAuth(" Writer@Example.com ")).resolves.toEqual({
      challengeId: "chal_test",
      expiresAt: "2026-07-19T01:00:00Z",
      delivery: "email",
      developmentCode: undefined
    });
    await expect(client.verifyEmailAuth("Writer@example.com", "chal_test", "123456")).resolves.toEqual({
      accessToken: "account-access-secret",
      tokenType: "bearer"
    });

    const [startUrl, startInit] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const [verifyUrl, verifyInit] = fetcher.mock.calls[1] as unknown as [string, RequestInit];
    expect(startUrl).toBe("https://hub.example.com/v1/auth/email/start");
    expect(verifyUrl).toBe("https://hub.example.com/v1/auth/email/verify");
    expect(`${startUrl}${verifyUrl}`).not.toMatch(/secret|token|123456/iu);
    expect(new Headers(startInit.headers).get("authorization")).toBeNull();
    expect(new Headers(verifyInit.headers).get("authorization")).toBeNull();
    expect(JSON.parse(String(startInit.body))).toEqual({ email: "writer@example.com" });
    expect(JSON.parse(String(verifyInit.body))).toEqual({
      email: "writer@example.com",
      challenge_id: "chal_test",
      code: "123456"
    });
  });

  it("provisions receiver, e-ink device, binding, and tap in a fixed order", async () => {
    const responses: unknown[] = [
      { receiver_id: "recv_test", pull_token: "receiver-pull-secret" },
      { device_id: "dev_0123456789abcdef0123456789abcdef", device_secret: "one-time-device-secret" },
      { pairing_id: "pair_test", code: "PAIR-1234", expires_at: "2026-07-19T01:00:00Z" },
      { receiver_id: "recv_test", device_id: "dev_0123456789abcdef0123456789abcdef", paired: true },
      { tap_id: "tap_ABCDEFGHIJKLMNOPQRSTUV", url: "https://tap.example.com/t/v1/tap_ABCDEFGHIJKLMNOPQRSTUV" }
    ];
    const fetcher = vi.fn(async () => jsonResponse(responses.shift()));
    const client = new HubAdminClient("https://hub.example.com", { fetch: fetcher as typeof fetch });

    const result = await client.provisionPersonalHub("account-access-secret", {
      receiverPublicKey: publicJwk(),
      receiverName: "My Connector",
      deviceName: "Desk Display"
    });

    expect(result).toEqual({
      receiverId: "recv_test",
      pullToken: "receiver-pull-secret",
      deviceId: "dev_0123456789abcdef0123456789abcdef",
      deviceSecret: "one-time-device-secret",
      tapId: "tap_ABCDEFGHIJKLMNOPQRSTUV",
      tapUrl: "https://tap.example.com/t/v1/tap_ABCDEFGHIJKLMNOPQRSTUV"
    });

    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([url]) => url)).toEqual([
      "https://hub.example.com/v1/receivers",
      "https://hub.example.com/v1/devices",
      "https://hub.example.com/v1/pairing/sessions",
      "https://hub.example.com/v1/pairing/claim",
      "https://hub.example.com/v1/hub/devices/dev_0123456789abcdef0123456789abcdef/tap-id/rotate"
    ]);
    for (const [url, init] of calls) {
      expect(url).not.toMatch(/account-access-secret|receiver-pull-secret|one-time-device-secret|PAIR-1234/iu);
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer account-access-secret");
    }

    const receiverBody = bodyAt(calls, 0);
    const deviceBody = bodyAt(calls, 1);
    const pairingBody = bodyAt(calls, 2);
    const claimBody = bodyAt(calls, 3);
    expect(receiverBody).toMatchObject({ name: "My Connector" });
    expect(JSON.parse(String(receiverBody.public_key))).toEqual(publicJwk());
    expect(deviceBody).toEqual({ name: "Desk Display", kind: "eink" });
    expect(pairingBody).toEqual({ receiver_id: "recv_test" });
    expect(claimBody).toEqual({ code: "PAIR-1234", device_id: "dev_0123456789abcdef0123456789abcdef" });
    expect(JSON.stringify(calls.map(([, init]) => init.body))).not.toContain("account-access-secret");
    expect(JSON.stringify(calls.map(([, init]) => init.body))).not.toContain("one-time-device-secret");
  });

  it("does not resolve or continue after an intermediate provisioning failure", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ receiver_id: "recv_test", pull_token: "pull-secret" }))
      .mockResolvedValueOnce(jsonResponse({ detail: "capacity" }, 503));
    const client = new HubAdminClient("https://hub.example.com", { fetch: fetcher as typeof fetch });

    let failure: unknown;
    try {
      await client.provisionPersonalHub("account-access-secret", {
        receiverPublicKey: publicJwk()
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toEqual(expect.objectContaining<Partial<HubAdminError>>({
      operation: "create the e-ink device",
      status: 503,
      message: "Device Hub could not create the e-ink device (HTTP 503)."
    }));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String((failure as Error).message)).not.toContain("account-access-secret");
  });

  it("rotates device and tap secrets using account authorization only", async () => {
    const responses: unknown[] = [
      { device_id: "dev_test", device_secret: "new-device-secret" },
      { tap_id: "tap_ABCDEFGHIJKLMNOPQRSTUV", url: "https://hub.example.com/t/v1/tap_ABCDEFGHIJKLMNOPQRSTUV" }
    ];
    const fetcher = vi.fn(async () => jsonResponse(responses.shift()));
    const client = new HubAdminClient("https://hub.example.com", { fetch: fetcher as typeof fetch });

    await expect(client.rotateDeviceSecret("account-secret", "dev_test")).resolves.toEqual({
      deviceId: "dev_test",
      deviceSecret: "new-device-secret"
    });
    await expect(client.rotateTapId("account-secret", "dev_test")).resolves.toEqual({
      deviceId: "dev_test",
      tapId: "tap_ABCDEFGHIJKLMNOPQRSTUV",
      tapUrl: "https://hub.example.com/t/v1/tap_ABCDEFGHIJKLMNOPQRSTUV"
    });

    for (const [url, init] of fetcher.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(url).not.toContain("account-secret");
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer account-secret");
      expect(init.body).toBeUndefined();
    }
  });

  it("accepts HTTP only on localhost and rejects credential-bearing or path URLs", () => {
    expect(() => new HubAdminClient("http://localhost:8787")).not.toThrow();
    expect(() => new HubAdminClient("http://127.0.0.1:8787/")).not.toThrow();
    expect(() => new HubAdminClient("http://hub.example.com")).toThrow(/HTTPS/iu);
    expect(() => new HubAdminClient("https://user:pass@hub.example.com")).toThrow(/credentials/iu);
    expect(() => new HubAdminClient("https://hub.example.com?token=bad")).toThrow(/query/iu);
    expect(() => new HubAdminClient("https://hub.example.com/api")).toThrow(/without an API path/iu);
  });

  it("rejects a private receiver JWK before making a request", async () => {
    const fetcher = vi.fn();
    const client = new HubAdminClient("https://hub.example.com", { fetch: fetcher as typeof fetch });
    await expect(client.provisionPersonalHub("account-secret", {
      receiverPublicKey: { ...publicJwk(), d: "private-material" }
    })).rejects.toThrow(/public P-256 JWK/iu);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function publicJwk(): JsonWebKey {
  return {
    kty: "EC",
    crv: "P-256",
    x: "public-x",
    y: "public-y",
    ext: true,
    key_ops: []
  };
}

function bodyAt(calls: Array<[string, RequestInit]>, index: number): Record<string, unknown> {
  return JSON.parse(String(calls[index][1].body)) as Record<string, unknown>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
