import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { Quote0Client } from "./client";

describe("Quote0Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists devices with bearer authorization", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      json: [
        {
          alias: "Desk",
          location: "Office",
          series: "quote",
          model: "quote_0",
          edition: 2,
          id: "ABCD1234"
        }
      ]
    } as never);
    const client = makeClient();

    const devices = await client.listDevices();
    const request = requestUrlSpy.mock.calls[0]?.[0] as { url?: string; method?: string; headers?: Record<string, string> } | undefined;

    expect(request).toMatchObject({
      url: "https://dot.mindreset.tech/api/authV2/open/devices",
      method: "GET"
    });
    expect(request?.headers?.authorization).toBe("Bearer dot_app_secret");
    expect(devices[0]).toMatchObject({ id: "ABCD1234", model: "quote_0" });
  });

  it("sends text content to a selected device", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      json: { message: "ok" }
    } as never);
    const client = makeClient();

    await client.sendTextContent("AB/CD", {
      title: "Hello",
      message: "World",
      link: "http://127.0.0.1:48321/device/input?token=q0"
    });
    const request = requestUrlSpy.mock.calls[0]?.[0] as { url?: string; body?: string; throw?: boolean } | undefined;

    expect(request?.url).toBe("https://dot.mindreset.tech/api/authV2/open/device/AB%2FCD/text");
    expect(request?.throw).toBe(false);
    expect(JSON.parse(String(request?.body))).toMatchObject({
      title: "Hello",
      message: "World"
    });
  });

  it("sends image content to a selected device", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      json: { message: "ok" }
    } as never);
    const client = makeClient();

    await client.sendImageContent("AB/CD", {
      refreshNow: true,
      image: "data:image/png;base64,abc",
      link: "http://127.0.0.1:48321/device/input?token=q0",
      border: 0,
      ditherType: "NONE",
      taskKey: "image_task_1"
    });
    const request = requestUrlSpy.mock.calls[0]?.[0] as { url?: string; body?: string; throw?: boolean } | undefined;

    expect(request?.url).toBe("https://dot.mindreset.tech/api/authV2/open/device/AB%2FCD/image");
    expect(request?.throw).toBe(false);
    expect(JSON.parse(String(request?.body))).toMatchObject({
      image: "data:image/png;base64,abc",
      ditherType: "NONE",
      taskKey: "image_task_1"
    });
  });

  it("sends canvas content to a selected device", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      json: { message: "ok" }
    } as never);
    const client = makeClient();

    await client.sendCanvasContent("AB/CD", {
      refreshNow: true,
      taskAlias: "ToWrite Dashboard",
      data: { title: "Dashboard" },
      windowData: {
        default: [{ type: "div", props: { children: "Dashboard" } }]
      },
      link: "http://127.0.0.1:48321/device/input?token=q0",
      border: 0
    });
    const request = requestUrlSpy.mock.calls[0]?.[0] as { url?: string; body?: string; throw?: boolean } | undefined;

    expect(request?.url).toBe("https://dot.mindreset.tech/api/authV2/open/device/AB%2FCD/canvas");
    expect(request?.throw).toBe(false);
    expect(JSON.parse(String(request?.body))).toMatchObject({
      taskAlias: "ToWrite Dashboard",
      data: { title: "Dashboard" },
      border: 0
    });
  });

  it("switches a device to the next content item", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 200,
      json: { message: "switched" }
    } as never);
    const client = makeClient();

    await client.switchToNextContent("AB/CD");
    const request = requestUrlSpy.mock.calls[0]?.[0] as { url?: string; method?: string; body?: string } | undefined;

    expect(request).toMatchObject({
      url: "https://dot.mindreset.tech/api/authV2/open/device/AB%2FCD/next",
      method: "POST"
    });
    expect(request?.body).toBeUndefined();
  });

  it("throws sanitized errors without leaking the API key", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 401,
      json: { message: "Invalid key" }
    } as never);
    const client = makeClient();

    await expect(client.listDevices()).rejects.toThrow("HTTP 401: Invalid key");
    await expect(client.listDevices()).rejects.not.toThrow("dot_app_secret");
  });

  it("preserves Dot API validation messages for bad text payloads", async () => {
    const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
    requestUrlSpy.mockResolvedValue({
      status: 400,
      json: { message: "Invalid icon format" }
    } as never);
    const client = makeClient();

    await expect(client.sendTextContent("ABCD1234", {
      title: "Bad icon",
      icon: "✎"
    })).rejects.toThrow("HTTP 400: Invalid icon format");
  });
});

function makeClient(): Quote0Client {
  return new Quote0Client(() => ({
    apiBaseUrl: "https://dot.mindreset.tech/",
    apiKey: "dot_app_secret"
  }));
}
