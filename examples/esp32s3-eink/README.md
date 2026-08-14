# ESP32-S3 e-ink: Today deck and three-button protocol

This example implements the local-device side of `towrite-device/v2`:

1. poll the card that ToWrite wants the screen to show;
2. refresh the physical e-ink panel;
3. acknowledge the exact tuple that was actually rendered;
4. send single, double, or long button gestures only against that acknowledged tuple.

That order is important. If ToWrite has selected card B while the pixels still
show card A, a button event continues to target A. Merely downloading B never
changes the firmware's authoritative `displayedTuple`.

The three Today pages are:

- `daily_overview`: date, theme, current task, the next two tasks, smallest next
  step, and total completed/total progress;
- `daily_plan_item`: one task with its goal, next step, estimate, and start time;
- `daily_result`: completed and remaining tasks, without the full backlog or
  writing statistics.

Echo and ToThink/ToWrite cards remain compatible with the same renderer.

## Button behavior

Wire three momentary buttons between GPIO and GND. The sketch enables
`INPUT_PULLUP`.

| Button | Single click | Double click | Long press |
| --- | --- | --- | --- |
| Left | Previous page | Previous task card | Start / pause / resume current task |
| Main | Start/open the displayed note | Send the frozen card to the phone PWA | Recording reserved |
| Right | Next page | Next task card | Safely complete displayed task |

The firmware uses:

- 45 ms debounce;
- 320 ms double-click window;
- 700 ms long-press threshold.

A single click is emitted only after the 320 ms window expires. A long press
cancels any pending click. The server remains authoritative: for example,
right-long is accepted only on the currently acknowledged task card.

## Obsidian setup

Enable the External API:

```text
External API = on
Bind host = 0.0.0.0
Port = 48321
```

Create one device target per screen and generate a target-scoped token. Do not
put the External API administrator token on the device. Query-token access can
remain disabled because the sketch sends the scoped token only in the
`Authorization` header.

Configure the sketch:

```cpp
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_BASE_URL = "http://192.168.1.20:48321";
const char* DEVICE_TARGET_ID = "local-web";
const char* DEVICE_TOKEN = "THE_TARGET_SCOPED_TOKEN";

const int MAIN_BUTTON_PIN = 6;
const int LEFT_BUTTON_PIN = 5;
const int RIGHT_BUTTON_PIN = 4;
```

Choose GPIOs that are free on your exact ESP32-S3 board and display carrier.
Install `ArduinoJson` and the driver for your panel, such as `GxEPD2`.

The checked-in `towrite-panel-driver.h` is intentionally fail-closed and never
reports a successful refresh. Identify the controller and carrier first, then
implement that hardware boundary. Until `begin()` and the render methods return
real controller results, the sketch sends no display ACK and accepts no gesture.

A normal ESP32 is not itself a Tailscale node, so a private `*.ts.net` Serve
origin is usually not directly reachable. Use the same LAN, a computer hotspot,
or a subnet router unless your network explicitly routes the tailnet to the
microcontroller.

## Poll, render, and display ACK

The device polls:

```http
GET /api/v1/eink?targetId=local-web&limit=1&cursor=0
Authorization: Bearer <target-scoped-token>
```

In addition to the card in `focus[0]`, the response contains an exact desired
tuple:

```json
{
  "playlist": {
    "desired": {
      "deviceId": "local-web",
      "selectionId": "sel_local_...",
      "stateVersion": 12,
      "contentId": "cnt_local_...",
      "revisionId": "rev_local_...",
      "cardId": "daily-overview:2026-07-24",
      "playlistRevision": "einkrev_..."
    }
  }
}
```

The sketch verifies that `focus[0].id` matches `desired.cardId`, then calls
`renderCard()`. Serial output is diagnostic only; the provided panel driver
template returns `false`. Return `true` only after the physical controller
successfully finishes the refresh.

Only after that does it send:

```http
POST /api/v1/device/display-acks
Authorization: Bearer <target-scoped-token>
Content-Type: application/json

{
  "eventId": "ack-unique-id",
  "deviceId": "local-web",
  "selectionId": "sel_local_...",
  "stateVersion": 12,
  "contentId": "cnt_local_...",
  "revisionId": "rev_local_...",
  "cardId": "daily-overview:2026-07-24",
  "playlistRevision": "einkrev_..."
}
```

The firmware copies this tuple into local `displayedTuple` only after HTTP 200.
As soon as new pixels are rendered, the older tuple is invalidated. If ACK
fails, the new rendered tuple is kept separately for an ACK retry and gestures
remain disabled. A conflict clears the local tuple and forces a fresh render.

## Schema-v2 gesture event

Every gesture sends the complete acknowledged tuple:

```http
POST /api/v1/device/events
Authorization: Bearer <target-scoped-token>
Content-Type: application/json

{
  "schemaVersion": 2,
  "eventId": "evt-unique-id",
  "targetId": "local-web",
  "deviceId": "local-web",
  "selectionId": "sel_local_...",
  "stateVersion": 12,
  "contentId": "cnt_local_...",
  "revisionId": "rev_local_...",
  "cardId": "daily-overview:2026-07-24",
  "playlistRevision": "einkrev_...",
  "button": "primary",
  "gesture": "single"
}
```

The server derives the action from `button + gesture`; the device does not send
an arbitrary action. Duplicate `eventId` values are idempotent. A stale tuple
returns HTTP 409 rather than opening or completing a different card.

The JSON response's `commandStatus` and `displayMessage` are shown through the
`renderCommandStatus()` partial-refresh hook. An application-level
`commandStatus: "conflict"` may intentionally arrive with HTTP 200 for
idempotent replay; the sample still clears the displayed tuple, refreshes and
ACKs again. The sample reduces common
responses to short statuses such as:

- `Opened`
- `Waiting for computer`
- `Computer offline`
- `Conflict - refreshing`
- `Recording unavailable`

Replace `renderCard()`, `renderEmpty()`, `renderCommandStatus()`,
`renderConnectionStatus()`, and `renderError()` with your real display calls.
Keep command and connectivity updates in a narrow partial-refresh area so a
healthy five-second poll does not refresh the full screen.

## Security and troubleshooting

- The scoped device token never enters a URL or JSON body and is never logged.
- Give each screen a distinct target/token pair; rotating one screen's token
  should not affect another.
- HTTP 401/403 means the target and token are not authorized together.
- HTTP 409 means the physical screen tuple is stale; the sample immediately
  polls, redraws, and ACKs the new state.
- HTTP 200 with `commandStatus: "conflict"` is handled the same way; do not
  treat transport success as command success.
- `Computer offline` means Wi-Fi could not reach Obsidian's External API.
- `Recording unavailable` is the intentional V1 result of main-long; no fake
  audio session is created.

Never commit real Wi-Fi credentials, tokens, or private device addresses.
