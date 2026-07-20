# NTAG213 and NFC Tools Guide

This guide writes the static ToWrite Device Hub V1 tap entry to an NTAG213. The tag only opens the HTTPS PWA. The Hub dynamically resolves the device's most recently acknowledged `displayed` selection, falling back to `selected` only before the first successful display ACK.

## Current capabilities and limits

The current V1 supports this development loop:

```text
saved ToThink / ToWrite card in Obsidian
→ locally privacy-filtered Hub candidate
→ Device Hub selected state
→ device simulator renders and ACKs it as displayed
→ an NTAG213 tap or Simulate tap opens the HTTPS PWA
→ the phone submits an answer
→ encrypted Capture queue
→ the online ToWrite Connector writes it back to Obsidian
```

The **Now → E-ink recommendation** card in the right sidebar previews the current title, prompt, recommendation reason, online state, and the `selected` / `displayed` difference. **Simulate tap** in settings opens the same PWA before a physical tag is written.

The real ESP32/e-ink display driver is not delivered yet. Private Tailscale Serve is reachable only by clients inside the tailnet: the phone and desktop can use it, as can a simulator running on a tailnet host. A normal ESP32 that has not joined the tailnet cannot reach this private origin, so use the simulator for now.

### Private HTTPS quick start with Tailscale Serve

The current development topology is:

```text
Device Hub http://127.0.0.1:8080
→ Tailscale Serve HTTPS :10000
→ https://desktop-lea3h79.taild09a3c.ts.net:10000
```

This is **tailnet-private HTTPS**, not a public Internet endpoint. Before continuing, confirm that:

- the desktop is signed in to Tailscale;
- the phone has Tailscale installed, connected, and signed in to the same tailnet;
- tailnet ACLs allow the phone to reach port 10000 on this desktop;
- Obsidian and the Device Hub run on this desktop;
- existing Serve mappings on 443 or 8443 are left intact; do not run `tailscale serve reset`.

From the Backend repository root, start the local Hub and cleanup worker:

```powershell
cd D:\Engineering\Project\ObsidianAI-Backend
.\cloud-relay\scripts\tailscale_dev_hub.ps1 -Action Setup `
  -PublicBaseUrl "https://desktop-lea3h79.taild09a3c.ts.net:10000"
```

Then use an Administrator PowerShell to add only the port-10000 Serve mapping:

```powershell
tailscale serve --bg --https=10000 http://127.0.0.1:8080
tailscale serve status
```

Verify both the managed processes and HTTPS endpoint:

```powershell
.\cloud-relay\scripts\tailscale_dev_hub.ps1 -Action Status
Invoke-RestMethod https://desktop-lea3h79.taild09a3c.ts.net:10000/health
```

Also open the following URL in a phone browser while that phone is connected to the same tailnet:

```text
https://desktop-lea3h79.taild09a3c.ts.net:10000/health
```

Use `-Action Stop` or `-Action Start` to stop or restart the local processes. To remove only this HTTPS mapping, run:

```powershell
tailscale serve --https=10000 off
```

### Generate the random IDs and NFC URL in ToWrite

Do not invent or type the `device_id`, `tap_id`, or device secret yourself. The Hub generates them with secure randomness during provisioning:

- `device_id` has the form `dev_<32 UUID4 hex characters>` and is a locator, not a credential;
- `tap_id` has the form `tap_<22 base64url characters>` and is the revocable, rotatable static tap entry;
- `device_secret` is a one-time 256-bit device credential for the simulator or future ESP32 and must never be written to NFC.

In Obsidian:

1. Open **Settings → ToWrite Open Questions → Device Hub**.
2. Enable **Connect ToWrite Device Hub**.
3. Set **Hub URL** to the complete origin:

   ```text
   https://desktop-lea3h79.taild09a3c.ts.net:10000
   ```

   Enter only the scheme, host, and port. Do not add `/t/v1/`, a query, or a fragment.
4. Under **Account sign-in and one-click pairing**, enter the same email used by the Tailscale identity and select **Send code**.
5. In private development mode, a development code is returned and auto-filled only when the identity injected by Tailscale matches that email. Select **Verify**. The account access token stays in memory for this settings session only.
6. Select **Provision and pair**. ToWrite creates a local P-256 receiver key when needed, and the Hub creates the Receiver, device, binding, and Tap URL.
7. The one-time `device_secret` is displayed only during this settings session. If you need the simulator, explicitly select **Copy for ESP32 / simulator** and store it safely; **do not paste it into NFC Tools**.
8. Find **NFC Tools payload (complete Tap URL)**. Confirm that it says the URL fits NTAG213 and is no more than `144 bytes`, then select **Copy complete URL**. This complete URL is the value to paste into NFC Tools.
9. Use **Simulate tap** and confirm that the PWA opens before writing a physical tag.

**Rotate NFC address** generates a new `tap_id` and revokes the old address immediately. The old physical tag then stops working and must be rewritten with the new complete URL. Rotation is not an ordinary refresh.

To simulate a real display ACK, run this command pattern from the Backend repository root. Use the `device_id` shown by ToWrite and the one-time `device_secret` saved during provisioning:

```powershell
.\.venv\Scripts\python.exe scripts\eink_device_simulator.py `
  --base-url https://desktop-lea3h79.taild09a3c.ts.net:10000 `
  --device-id dev_<32-hex-characters-shown-by-ToWrite> `
  --device-secret <one-time-device-secret>
```

Never screenshot the device secret, commit it to Git, or copy it to the NFC tag.

### How an Obsidian selection becomes a device card

A temporary editor selection is not uploaded while typing or highlighting. The real flow is:

1. Select text in Markdown. PDF selection cards remain local under the V1 attachment privacy rule and do not enter the Hub by default.
2. Use the selection toolbar or command to save it as a **ToThink** or **ToWrite** card.
3. The active saved card automatically enters the sidebar's **Device library**. This is not another copy of the note: Markdown/sidecar stays authoritative and the card stores only membership, Agent/rotation eligibility, and an optional daily time window. Resolved, hidden, explicitly removed, or newly private/no-cloud cards leave the eligible set.
4. Use the monitor-with-up-arrow action to **show now**. Click or right-click the library action to add/remove the card, change Agent/rotation eligibility, or set a daily `HH:mm` display time.
5. The sidebar offers **Manual**, **Agent**, **Cycle**, and **Schedule**. Agent reranks only the local allowlist of at most 20 items; Cycle uses stable order; Schedule uses each card's daily window. A manual show has priority and holds for 30 minutes by default from the successful display ACK. No automatic mode can overwrite a pending unacknowledged display.
6. The sidebar's e-ink card previews the selected title, prompt, and reason. When selected and displayed differ, it also previews the card still visible on the physical screen.
7. Once the simulator ACKs the card, `displayed` matches `selected`; the rotation interval starts from that ACK. Tapping NFC opens the PWA for the card actually on screen.
8. After answering in the PWA, keep the Obsidian Connector online and sync again. The encrypted queue delivers the answer to CaptureService, which safely appends it to the source note's Captures section using the frozen target. V1 does not yet also add that answer to the ToThink/ToWrite card activity stream.

Cycle and Schedule borrow Quote0's playlist experience but not its "advance after API send" cursor semantics: Device Hub waits for a real `display ACK`. The V1 scheduler runs in the Obsidian connector, so it pauses while Obsidian is closed and keeps the last screen content. Always-on Agent/Cycle/Schedule still requires a later Hub revision with persisted programs, eligibility withdrawal, and a server worker.

**Share approved display snippets** is off by default. In that state, the Hub receives only the display title, generic prompt, actions, score, and reason; highlighting text alone does not upload full note content. When the user explicitly enables this option, a saved candidate that passes include/exclude and `private`, `no-ai`, and `no-cloud` privacy rules may send a truncated, approved display snippet. Absolute Vault paths and long-lived tokens are never sent.

### Tailscale Serve versus Funnel

| Mode | Who can reach it | Current use | Authentication requirement |
|---|---|---|---|
| Tailscale Serve | Devices in the same tailnet and allowed by ACLs | Current phone, desktop, and simulator testing | May use the Tailscale-identity-bound development email code |
| Tailscale Funnel | The public Internet | Future ESP32 or phones without Tailscale | Must configure real SMTP, disable development codes, and review rate limits, logging, and public exposure |
| Custom domain / reverse proxy | Deployment-dependent | Production | Valid HTTPS, a stable canonical origin, and complete production authentication |

The current configuration uses `TAILSCALE_SERVE_DEV_LOGIN=true` and relies on the `Tailscale-User-Login` identity header supplied by Serve. Funnel does not provide that private identity guarantee, so **do not expose the current port-10000 setup with Funnel**. Before going public, configure SMTP, disable development login, and complete a public threat-model and dual-platform test. Tailscale restricts Funnel HTTPS ports; common supported choices are 443, 8443, and 10000.

## What the tag contains

Write exactly one URI record:

```text
<PUBLIC_BASE_URL>/t/v1/<tap_id>
```

Example:

```text
https://hub.example.com/t/v1/tap_Rm8Tt6mS5fWl3zXvQq4G1A
```

For the current private Serve setup, the URL copied by ToWrite has this form; the final segment must be the real value generated by the plugin:

```text
https://desktop-lea3h79.taild09a3c.ts.net:10000/t/v1/tap_<22-character-random-id>
```

The same tag remains valid as recommendations change. A rotated Tap ID revokes the old URL and requires rewriting the physical tag.

`PUBLIC_BASE_URL` already includes `https://`. It is a fixed canonical HTTPS origin with a valid certificate. It may be publicly reachable or, as in the current Serve setup, reachable only inside a tailnet.

Never write any of the following to the tag:

- device ID or device secret;
- account, Receiver, Backend, or External API token;
- selected/displayed/content/selection ID;
- Vault name, path, note title, or answer text;
- query parameters, fragments, tracking values, or a local IP address for production.

## Why V1 has no AAR

V1 is a standard HTTPS PWA, so it has no Android Application Record and must not use Quote0's `tech.mindreset.dot.alpha` package. An AAR consumes NDEF space and would bind the tag to an unrelated app. If ToWrite later ships its own Android app, evaluate Android App Links first and add an AAR only with ToWrite's own package name. See the [Android NFC documentation](https://developer.android.com/develop/connectivity/nfc/nfc).

## NTAG213 capacity

[NXP specifies](https://www.nxp.com/products/NTAG213_215_216) 144 bytes of user memory for NTAG213. The visible URL is not the complete storage cost: NDEF record headers, the URI type, and the TLV wrapper also consume bytes. ToWrite calculates the actual NDEF size, including URI-prefix compression, and shows:

```text
NDEF bytes: 71 / 144
NTAG213 fits: yes
```

Do not write when the result exceeds 144 bytes. Do not rely on NFC Tools to truncate it. A third-party writer can choose a different URI compression form, so always perform a Read verification after writing.

## Before writing

Confirm all of the following:

1. `PUBLIC_BASE_URL` is the final canonical HTTPS origin. HTTP is permitted only for localhost development and is unsuitable for a phone tag.
2. The origin has no username, password, API path, query, or fragment.
3. ToWrite is paired with the intended Receiver and device.
4. The Device Hub state shows a Tap URL in `/t/v1/tap_...` form.
5. The NDEF size is at most 144 bytes.
6. The URL opens the PWA without redirecting to a credential-bearing URL.

Do not lock a development tag. Finalize the domain, route, TLS, reverse proxy, and iPhone/Android behavior first.

## NFC Tools steps

The labels vary slightly by language and platform, but the sequence is fixed:

1. Open **NFC Tools** and choose **Write**.
2. Choose **Add a record**.
3. Choose **URL/URI**. Do not choose Text, Custom data, Application, or AAR.
4. Paste the Tap URL generated by ToWrite.
5. Confirm the pending list contains only this one URI record.
6. Choose **Write**.
7. Hold the NTAG213 at the phone's NFC antenna until NFC Tools reports success.
8. Choose **Read** and scan the tag again.
9. Verify the record is a URI, exactly matches the generated URL, and contains no token, query, fragment, AAR, or extra text.
10. Close NFC Tools and test a normal tap on both iPhone and Android.

In short: `Write → Add a record → URL/URI → paste → Write → Read → test on iPhone and Android`.

## Screen-consistency acceptance test

1. On question card A in Obsidian, select **Send this card to the e-ink screen**.
2. Let the device/simulator render A and send a successful ACK.
3. Confirm `selected=A`, `displayed=A`, and `in_sync=true`.
4. Tap the tag; the PWA must open A.
5. Use the same card action for B while the device/simulator is stopped.
6. Confirm `selected=B`, `displayed=A`, and `in_sync=false`.
7. Tap again; the PWA must still open A because that is what the screen shows.
8. Resume the device, render B, and ACK it.
9. Tap again; the PWA must now open B.

If step 7 opens B, the Tap Router is incorrectly resolving only `selected`; do not lock or deploy the tag.

## Platform checks

On iPhone, test with the screen awake and scan near the upper back of the phone. On Android, confirm NFC is enabled and scan near the manufacturer's antenna location. On both platforms verify:

- the OS opens an HTTPS page without a custom-app dependency;
- the address bar never contains a token, secret, or Vault path;
- the login and encrypted answer flow works;
- `Ctrl/Cmd+Enter` sends when a hardware keyboard is attached and `Shift+Enter` adds a line;
- reload/back navigation does not create duplicate Vault writes.

## Do not lock during development

NFC read-only locking is usually irreversible. Keep the tag writable until:

- the production domain and TLS certificate are stable;
- the Tap URL fits the tag and passes Read verification;
- Tap rotation/revocation has been tested;
- both iPhone and Android pass the selected/displayed consistency test;
- the physical tag is attached to the correct device.

Only then consider the NFC Tools read-only operation. Record the physical tag/device mapping separately, but never print the device secret on the enclosure.

## Clone boundary

NTAG213 can be copied. Possession of `tap_id` proves only that someone obtained the entry URL; it does not prove an on-site physical tap. Within the reachability boundary of the chosen ingress, opening the frozen card is protected only by the Tap ID's entropy, while writing to the Vault still requires an authenticated, paired phone session, CSRF validation, and an idempotent encrypted Capture. With private Serve, the caller must additionally be inside the tailnet and allowed by its ACLs.

If a tag may have been copied, rotate the Tap ID, rewrite the trusted physical tag, and review Tap/Capture audit data. Rotating the device secret is a separate operation and does not replace Tap rotation. For cryptographic anti-cloning and dynamic tap authentication, move to NTAG 424 DNA with a new key-injection and server-verification design.

## Troubleshooting

### HTTPS works on the desktop but not on the phone

1. Confirm that the phone's Tailscale app is connected and that the phone and desktop belong to the same tailnet.
2. Run `tailscale serve status` and confirm that port 10000 forwards to `http://127.0.0.1:8080`.
3. Run `tailscale_dev_hub.ps1 -Action Status` and confirm that the API, worker, and local health check are running.
4. Open `/health` directly in the phone browser before troubleshooting NFC, and make sure `:10000` is present in the URL.
5. Check tailnet ACLs, the phone's Tailscale account, and the MagicDNS/FQDN. Do not replace `desktop-lea3h79.taild09a3c.ts.net` with `127.0.0.1` or a plain LAN HTTP address.

### ToWrite rejects the Hub URL

- Use a complete canonical origin such as `https://desktop-lea3h79.taild09a3c.ts.net:10000`.
- Do not enter `/health`, `/v1`, `/t/v1/...`, credentials, a query, or a fragment.
- The phone/NFC path requires HTTPS. HTTP is accepted only for localhost development on the same desktop.

### The code is not auto-filled or one-click pairing fails

- Private Serve development login requires the requested email to match `Tailscale-User-Login` exactly. Confirm that Obsidian calls `https://...ts.net:10000`, not `127.0.0.1:8080` directly.
- The account token is memory-only for the current settings session; reopening settings may require another email-code sign-in.
- Use **Test connection**, then inspect Backend `cloud-relay/data/logs/` and `tailscale serve status`.
- If a Receiver and device already exist, the UI shows rotation controls instead of **Provision and pair**.

### The sidebar has no E-ink recommendation or selected text

- Enable Device Hub, finish Receiver/device provisioning, then use **Sync now** or **Refresh state**.
- A temporary selection is not a Hub candidate. Save it as a ToThink/ToWrite card first.
- Check include/exclude folders, tags, frontmatter, and the `private`, `no-ai`, and `no-cloud` rules. Excluded cards never leave the desktop.
- Display snippets are off by default. A title without the selected body is expected until **Share approved display snippets** is explicitly enabled.

### The PWA opens, but the answer does not reach Obsidian

- Confirm that the phone completed PWA sign-in/pairing and that submission did not report CSRF, expired Tap session, or conflict errors.
- Keep Obsidian and the ToWrite Connector online and use **Sync now** to drain the encrypted queue.
- Confirm that the PWA writeback E2EE receiver key still matches the Receiver. Drain old answers before rotating it.
- If the target note changed after preview, CaptureService preserves a conflict instead of overwriting it. Resolve it in ToWrite and preview/submit again.

### The simulator works, but the ESP32 does not

This is expected with the current private Serve setup. A normal ESP32 that has not joined the tailnet cannot access the private `*.ts.net:10000` origin. Continue using the simulator for `desired → ACK → displayed` acceptance testing, then migrate to Funnel, a custom domain, or another protected public ingress only after the hardware and production authentication are ready.

- **Capacity error:** shorten the canonical domain, remove extra records, or use a larger tag. Never remove HTTPS or add a URL shortener you do not control.
- **Phone does nothing:** verify the record type is URI rather than plain text, test antenna placement, and confirm NFC is enabled.
- **404:** the Tap ID may be mistyped, rotated, revoked, or not yet associated with a selection.
- **Phone shows the wrong card:** inspect selected/displayed state and verify the device's ACK tuple exactly matched selection, version, content, and revision.
- **Suspected copy:** rotate only the Tap ID first, rewrite the trusted tag, and review access. Do not expose or share the device secret.

## Delivery record

Record only non-secret deployment facts:

```text
Device label:
Tap URL suffix (last 6 characters only):
NDEF bytes: ___ / 144
Read verification: pass / fail
iPhone test: pass / fail
Android test: pass / fail
selected/displayed consistency: pass / fail
Tag locked: no / yes (date)
```

Never include a device secret, Bearer token, Receiver token, PWA cookie, or Vault path in this record.
