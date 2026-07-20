import {
  request as httpRequest,
  type ClientRequest,
  type IncomingHttpHeaders,
  type IncomingMessage
} from "node:http";
import { request as httpsRequest } from "node:https";

const MAX_HUB_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * Uses a cancellable desktop transport for Tailnet and loopback Hub calls.
 * Chromium can block these private destinations before emitting a CORS/PNA
 * preflight. Node's HTTP client bypasses that renderer policy, never follows
 * redirects automatically, sends no cookies/referrer, and destroys the
 * underlying request when the caller's deadline aborts.
 *
 * Public Hub origins retain fetch so browser redirect and credential policies
 * stay intact. Tests can inject a fetch implementation for either path.
 */
export function requestHub(
  input: string,
  init: RequestInit,
  injectedFetch?: typeof fetch
): Promise<Response> {
  if (injectedFetch) {
    return injectedFetch(input, init);
  }
  if (!needsDesktopTransport(input)) {
    return fetch(input, init);
  }
  return requestHubFromDesktop(input, init);
}

export function needsDesktopTransport(value: string): boolean {
  const parsed = new URL(value);
  const hostname = parsed.hostname.toLowerCase();
  return hostname.endsWith(".ts.net")
    || hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "127.0.0.1"
    || hostname === "[::1]";
}

function requestHubFromDesktop(input: string, init: RequestInit): Promise<Response> {
  const parsed = new URL(input);
  const transport = parsed.protocol === "https:"
    ? httpsRequest
    : parsed.protocol === "http:"
      ? httpRequest
      : undefined;
  if (!transport) {
    return Promise.reject(new Error("Device Hub URL must use HTTP or HTTPS."));
  }
  if (init.signal?.aborted) {
    return Promise.reject(abortError());
  }

  const headers = headersToRecord(init.headers);
  const body = normalizeBody(init.body);
  if (body && headers["content-length"] === undefined) {
    headers["content-length"] = String(body.byteLength);
  }

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    let request: ClientRequest | undefined;
    const cleanup = () => {
      init.signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      const error = abortError();
      request?.destroy(error);
      fail(error);
    };
    const complete = (response: IncomingMessage, payload: Buffer) => {
      if (settled) {
        return;
      }
      const status = response.statusCode ?? 0;
      if (status < 200 || status > 599) {
        fail(new Error("Device Hub returned an invalid HTTP status."));
        return;
      }
      settled = true;
      cleanup();
      const noBody = status === 204 || status === 205 || status === 304;
      const responseBody = new ArrayBuffer(payload.byteLength);
      new Uint8Array(responseBody).set(payload);
      resolve(new Response(noBody ? null : responseBody, {
        status,
        statusText: response.statusMessage,
        headers: responseHeaders(response.headers)
      }));
    };

    try {
      request = transport(parsed, {
        method: init.method ?? "GET",
        headers
      }, (response) => {
        const chunks: Buffer[] = [];
        let received = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          received += buffer.byteLength;
          if (received > MAX_HUB_RESPONSE_BYTES) {
            const error = new Error("Device Hub response exceeded the safe size limit.");
            response.destroy(error);
            fail(error);
            return;
          }
          chunks.push(buffer);
        });
        response.once("aborted", () => fail(new Error("Device Hub response was interrupted.")));
        response.once("error", fail);
        response.once("end", () => complete(response, Buffer.concat(chunks)));
      });
    } catch (error) {
      fail(error);
      return;
    }

    try {
      request.once("error", fail);
      init.signal?.addEventListener("abort", onAbort, { once: true });
      if (body) {
        request.write(body);
      }
      request.end();
    } catch (error) {
      request.destroy();
      fail(error);
    }
  });
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) {
    return result;
  }
  new Headers(headers).forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function responseHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
    } else if (value !== undefined) {
      result.set(key, value);
    }
  }
  return result;
}

function normalizeBody(body: BodyInit | null | undefined): Buffer | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }
  if (typeof body === "string") {
    return Buffer.from(body, "utf8");
  }
  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }
  throw new Error("Device Hub request body type is unsupported.");
}

function abortError(): Error {
  const error = new Error("The Device Hub request was aborted.");
  error.name = "AbortError";
  return error;
}
