import { describe, expect, it } from "vitest";
import { decryptHubCapture, encryptHubCapture, generateHubCaptureKeyPair } from "./crypto";
import type { HubCapturePlaintext } from "./types";

describe("Device Hub encrypted capture envelope", () => {
  it("round-trips a capture with ephemeral P-256 ECDH and AES-GCM", async () => {
    const recipient = await generateHubCaptureKeyPair();
    const payload = capturePayload();

    const envelope = await encryptHubCapture(payload, recipient.publicKey);
    const decrypted = await decryptHubCapture(envelope, recipient.privateKey);

    expect(envelope).toMatchObject({
      version: 1,
      algorithm: "ECDH-P256+HKDF-SHA256+A256GCM",
      ephemeralPublicKey: { kty: "EC", crv: "P-256" }
    });
    expect(JSON.stringify(envelope)).not.toContain(payload.body);
    expect(decrypted).toEqual(payload);
  });

  it("rejects tampered ciphertext and a different recipient key", async () => {
    const recipient = await generateHubCaptureKeyPair();
    const other = await generateHubCaptureKeyPair();
    const envelope = await encryptHubCapture(capturePayload(), recipient.publicKey);
    const first = envelope.ciphertext[0] === "A" ? "B" : "A";
    const tampered = { ...envelope, ciphertext: first + envelope.ciphertext.slice(1) };

    await expect(decryptHubCapture(tampered, recipient.privateKey)).rejects.toThrow(/authentication failed/iu);
    await expect(decryptHubCapture(envelope, other.privateKey)).rejects.toThrow(/authentication failed/iu);
  });

  it("authenticates additional data", async () => {
    const recipient = await generateHubCaptureKeyPair();
    const envelope = await encryptHubCapture(capturePayload(), recipient.publicKey, { additionalData: "selection:sel_test" });
    const modified = { ...envelope, additionalData: envelope.additionalData!.replace(/^./u, envelope.additionalData![0] === "A" ? "B" : "A") };

    await expect(decryptHubCapture(modified, recipient.privateKey)).rejects.toThrow(/authentication failed/iu);
  });
});

function capturePayload(): HubCapturePlaintext {
  return {
    protocolVersion: "1",
    captureId: "cap_test",
    selectionId: "sel_test",
    contentId: "cnt_test",
    intent: "respond",
    body: "A private answer that is encrypted before relay upload.",
    writeTargetRef: "ht_test",
    targetRevision: "rev_test",
    createdAt: "2026-07-19T00:00:00Z"
  };
}
