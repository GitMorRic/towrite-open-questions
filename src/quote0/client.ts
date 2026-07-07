import { requestUrl } from "obsidian";
import type { ToWriteQuote0Settings } from "../core/settings";

export interface Quote0Device {
  alias?: string;
  location?: string;
  series: string;
  model: string;
  edition: number;
  id: string;
}

export interface Quote0DeviceStatus {
  deviceId: string;
  alias?: string | null;
  location?: string | null;
  status?: {
    version?: string;
    current?: string;
    description?: string;
    battery?: string;
    wifi?: string;
  };
  renderInfo?: unknown;
}

export interface Quote0TextPayload {
  refreshNow?: boolean;
  title?: string;
  message?: string;
  signature?: string;
  icon?: string;
  link?: string;
  taskKey?: string;
  taskAlias?: string | number | null;
  styles?: {
    title?: Quote0TextStyle;
    message?: Quote0TextStyle & { lineHeight?: number };
    signature?: Quote0TextStyle;
  };
}

export interface Quote0TextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
}

export interface Quote0DeviceSettingsPatch {
  alias?: string | null;
  location?: string | null;
  timezone?: string;
  interval?: {
    powerMs?: number;
    batteryMs?: number;
  };
  sleep?: {
    enabled: boolean;
    start: string;
    end: string;
  };
}

interface Quote0MessageResponse {
  message?: string;
}

export class Quote0ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface Quote0ClientLike {
  listDevices(): Promise<Quote0Device[]>;
  getDeviceStatus(deviceId: string): Promise<Quote0DeviceStatus>;
  sendTextContent(deviceId: string, payload: Quote0TextPayload): Promise<Quote0MessageResponse>;
  switchToNextContent(deviceId: string): Promise<Quote0MessageResponse>;
  updateDeviceSettings(deviceId: string, patch: Quote0DeviceSettingsPatch): Promise<unknown>;
}

export class Quote0Client implements Quote0ClientLike {
  constructor(private readonly getSettings: () => Pick<ToWriteQuote0Settings, "apiBaseUrl" | "apiKey">) {}

  async listDevices(): Promise<Quote0Device[]> {
    return this.requestJson<Quote0Device[]>("/api/authV2/open/devices", "GET");
  }

  async getDeviceStatus(deviceId: string): Promise<Quote0DeviceStatus> {
    return this.requestJson<Quote0DeviceStatus>(`/api/authV2/open/device/${encodeURIComponent(deviceId)}/status`, "GET");
  }

  async sendTextContent(deviceId: string, payload: Quote0TextPayload): Promise<Quote0MessageResponse> {
    return this.requestJson<Quote0MessageResponse>(
      `/api/authV2/open/device/${encodeURIComponent(deviceId)}/text`,
      "POST",
      payload
    );
  }

  async switchToNextContent(deviceId: string): Promise<Quote0MessageResponse> {
    return this.requestJson<Quote0MessageResponse>(
      `/api/authV2/open/device/${encodeURIComponent(deviceId)}/next`,
      "POST"
    );
  }

  async updateDeviceSettings(deviceId: string, patch: Quote0DeviceSettingsPatch): Promise<unknown> {
    return this.requestJson<unknown>(
      `/api/authV2/open/device/${encodeURIComponent(deviceId)}/settings`,
      "POST",
      patch
    );
  }

  private async requestJson<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
    const settings = this.getSettings();
    const apiKey = settings.apiKey.trim();
    if (!apiKey) {
      throw new Quote0ApiError(401, "Quote0 API key is missing.");
    }

    const response = await requestUrl({
      url: settings.apiBaseUrl.replace(/\/+$/u, "") + path,
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Quote0ApiError(
        response.status,
        `Quote0 API request failed with HTTP ${response.status}${readErrorMessage(response.json)}`
      );
    }

    return response.json as T;
  }
}

function readErrorMessage(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const message = (value as Record<string, unknown>).message ?? (value as Record<string, unknown>).error;
  return typeof message === "string" && message.trim() ? `: ${message.trim().slice(0, 240)}` : "";
}
