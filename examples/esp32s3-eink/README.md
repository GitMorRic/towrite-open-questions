# ESP32-S3 e-ink: template-first paging

This sketch uses ToWrite's local External API to display one shared small-screen playlist:

1. saved Echo template cards with **Screen paging** enabled;
2. eligible ToThink / ToWrite cards;
3. wrap back to the first card.

The right button advances, the optional left button goes back, and a manual **Show now** action in Obsidian becomes visible within about five seconds. Unchanged polls do not redraw the e-ink panel.

## Obsidian setup

Enable the External API:

```text
External API = on
Bind host = 0.0.0.0
Port = 48321
```

Create a `local-web` Push target with `buttons` capability and mappings:

```text
right: next
left: prev
```

Generate a separate token for that target. The sketch uses it in the `Authorization` header; query-token access can remain disabled. Do not put the full External API administrator token on the device.

In **Inbox & device library → Echo e-ink cards**, save each card and enable **Screen paging**. A template chooser creates only a draft; it does not enter the device queue until it is saved.

## Sketch configuration

Install `ArduinoJson` plus the driver for your panel, then edit:

```cpp
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_BASE_URL = "http://192.168.1.20:48321";
const char* DEVICE_TARGET_ID = "local-web";
const char* DEVICE_TOKEN = "THE_TARGET_SCOPED_TOKEN";

const int NEXT_BUTTON_PIN = 4;
const int PREVIOUS_BUTTON_PIN = 5; // or -1 when absent
```

Wire each button between its GPIO and GND. The sketch enables `INPUT_PULLUP`. Choose pins that are free on your exact ESP32-S3 board and display carrier.

A normal ESP32 is not a Tailscale node, so a private `*.ts.net` Serve origin is usually unreachable directly. Use the same LAN, a computer hotspot, or a subnet router unless your hardware network architecture explicitly provides tailnet access.

## Requests

The display polls:

```http
GET /api/v1/eink?targetId=local-web&limit=1&cursor=0
Authorization: Bearer <target-token>
```

The right button posts:

```http
POST /api/v1/device/events
Authorization: Bearer <target-token>
Content-Type: application/json

{
  "schemaVersion": 1,
  "eventId": "unique-per-press",
  "targetId": "local-web",
  "deviceId": "esp32-chip-id",
  "button": "right"
}
```

ToWrite commits the shared cursor before returning `200`, and duplicate event IDs are idempotent. The device then polls cursor zero again to render the selected card.

Replace `renderCard()` with your GxEPD2, Waveshare, or LilyGo drawing code. Echo cards expose `sourceType: "echo"`; annotation cards expose `sourceType: "question"`.

If annotation cards work but templates do not, verify that the template was saved, **Screen paging** is enabled, the target ID matches its token, and the firmware is polling the new single-card playlist URL.
