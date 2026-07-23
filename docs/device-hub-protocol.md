# ToWrite Device Hub V1 Protocol and Agent Architecture

This document defines the V1 contract among ToWrite, an optional trusted AI Backend, the public Device Hub, eink devices, and the NFC/PWA capture flow. It does not replace the existing Quote0 integration, Push Feed, External API, or the legacy local `/device/go` entry point.

The words MUST, MUST NOT, and SHOULD are normative. Unless an endpoint says otherwise, JSON fields use `snake_case` and timestamps are timezone-qualified ISO 8601 UTC values.

## 1. Goals and scope

Device Hub V1 closes this loop:

```text
Obsidian candidate
  → Hub selected state
  → ESP32 long poll and display
  → display ACK
  → NFC opens the content physically on screen
  → PWA encrypts an answer
  → Receiver capture queue
  → ToWrite CaptureService writes back to the Vault
```

V1 deliberately has the following boundaries:

- Obsidian Markdown remains the source of truth. Local indexes, Backend SQLite data, and Hub snapshots are rebuildable derivatives.
- The Hub stores only display-ready snapshots that passed a local privacy gate; it does not receive a complete Vault.
- V1 specifies HTTPS long polling, acknowledgements, and a device simulator. It does not implement a particular ESP32 firmware or eink driver.
- Context inputs are limited to time, coarse Obsidian activity, device presence, manually confirmed semantic place/mode, and accepted habits. V1 does not claim to infer a forest, a walk, or daydreaming automatically.
- AI may rerank only a Connector-provided allowlist. It cannot invent a note or path, write the Vault, switch selected content, or request vibration.
- A static NFC tag is a revocable entry point, not an authentication factor and not proof of physical presence.

## 2. Four-layer architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ 1. Obsidian / ToWrite Connector                              │
│ Vault truth, local retrieval, habit approval, privacy, write │
└────────────────────────┬─────────────────────────────────────┘
                         │ at most 20 approved candidates
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Optional trusted AI Backend                               │
│ LiteLLM, Skills, Agent Registry; allowlist rerank/composition │
└────────────────────────┬─────────────────────────────────────┘
                         │ allowlisted IDs, order, explanation
                         ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Public Device Hub                                         │
│ tenant/Receiver/device boundaries, minimal snapshots,        │
│ context, selected/displayed state, Tap Router, E2EE queue     │
└────────────────┬──────────────────────────────┬──────────────┘
                 │ Device secret                │ tap_id/login
                 ▼                              ▼
┌────────────────────────────┐   ┌─────────────────────────────┐
│ 4a. ESP32 / eink display    │   │ 4b. phone NFC / HTTPS PWA  │
│ poll → render → display ACK │   │ inspect, answer, encrypt   │
└────────────────────────────┘   └─────────────────────────────┘
```

The minimum-knowledge rule applies at every boundary:

| Component | May know | Must not receive or retain |
| --- | --- | --- |
| Connector | Vault paths, note bodies, local evidence, write targets | Unnecessary remote secrets |
| AI Backend | Authorized fields and allowlisted candidate IDs | Complete Vault, private body, exact location, unauthorized paths |
| Hub | account/Receiver/device bindings, display snapshot, opaque refs, selections and ACKs | Absolute Vault paths, full notes, keystrokes, SSIDs, exact coordinates |
| ESP32 | current desired card, state version, display policy | Connector/Receiver tokens and Vault paths |
| NFC tag | one revocable Tap URL | device secret, API token, content ID, Vault path |
| PWA | frozen Tap card, short-lived session, entered answer | Other devices or unrelated Vault content |

## 3. Identifiers, revisions, and credentials

### 3.1 Non-sequential identifiers

Public identifiers use a type prefix and cryptographically random value. An identifier locates an object; it never grants access.

| Object | Format | Entropy |
| --- | --- | --- |
| Device | `dev_<32 lowercase UUID4 hex>` | UUIDv4 (122 random bits) |
| Content | `cnt_<32 lowercase UUID4 hex>` | UUIDv4 (122 random bits) |
| Revision | `rev_<32 lowercase UUID4 hex>` | UUIDv4 (122 random bits) |
| Selection | `sel_<32 lowercase UUID4 hex>` | UUIDv4 (122 random bits) |
| Delivery | `dlv_<32 lowercase UUID4 hex>` | UUIDv4 (122 random bits) |
| Tap | `tap_<22 base64url characters>` | at least 128 random bits |

Internal IDs such as `bat_`, `obs_`, `ctx_`, `tps_`, `mbx_`, `sky_`, `evt_`, and `ack_` follow the same rule. Sequential forms such as `/device/1` or `cnt_2` are forbidden.

### 3.2 Immutable revisions and integrity

- `content_id` identifies logical content. Any display snapshot change creates a new immutable `revision_id`.
- Canonical display fields have a SHA-256 `content_hash`.
- Desired responses use an `ETag`; an ACK may report the SHA-256 `render_hash` produced by the device.
- Each device has a monotonically increasing `state_version`, incremented only when the server commits a new selection.
- IDs, hashes, ETags, and versions are not credentials.

### 3.3 Device authentication

Pairing creates a 256-bit `device_secret` that is shown once:

```http
Authorization: Device <device_secret>
```

The Hub stores only a secure hash bound to one user and one `device_id`. The device ID in the path and that exact device's secret are both required for:

- `GET /v1/hub/devices/{deviceId}/desired`
- `POST /v1/hub/devices/{deviceId}/display-acks`
- `POST /v1/hub/devices/{deviceId}/events`

Knowing a device ID or Tap ID is insufficient. A secret from another device must be rejected. Rotation immediately invalidates the old secret; revocation immediately denies all device calls.

### 3.4 Authentication domains

| Caller | Authentication | Scope |
| --- | --- | --- |
| ToWrite Connector / account PWA | `Authorization: Bearer <access_token>` | authorized Receivers, devices, selections, state, and writeback |
| Receiver Connector | Bearer, or migration-only `X-Receiver-Token` | candidates/context for one Receiver |
| ESP32 | `Authorization: Device <device_secret>` | desired, ACK, and bounded button feedback for exactly one device |
| Guest sender | `Authorization: Sender <sender_key>` | `messages:create` for exactly one mailbox |
| Tap page | URL contains only `tap_id`; writes additionally require login and CSRF | read the frozen card; submit a response for that session |

Long-lived credentials MUST NOT appear in URLs, NFC records, QR codes, redirects, logs, or Referrer headers.

## 4. Core data model

### 4.1 Recommendation content

V1 content types are:

```text
question_prompt      note_continue       title_only
blank_capture        excerpt             quote
on_this_day          stale_note_nudge    character_letter
human_message        wellbeing_reminder
```

An uploaded candidate has the following shape:

```json
{
  "candidate_ref": "hc_bIY8pY-0FQmRr3jL9aI3cQ",
  "type": "note_continue",
  "display": {
    "title": "Continue the character motivation",
    "body": "This display text was explicitly approved by the user.",
    "prompt": "Add one moment that changes the character's decision."
  },
  "source_ref": "hs_BSC3GLQq73fhdCjpxRgv0Q",
  "write_target_ref": "ht_qB4B5cFbI_OieR6wDGnB0w",
  "allowed_actions": ["open", "respond", "useful", "later", "skip"],
  "sensitivity": "normal",
  "reason_code": "stale_note",
  "score": 0.72,
  "urgency": 0,
  "context_states": [],
  "policy_basis": "general",
  "expires_at": "2026-07-20T12:00:00Z"
}
```

`source_ref` and `write_target_ref` are opaque values produced by the Connector. The Hub cannot convert them into paths; only the originating Connector can resolve them locally. `policy_basis` is deterministic Connector policy (`general`, `due`, or `accepted_habit`), is preserved across optional AI reranking, and cannot be `manual`; only the explicit selection route may grant the manual notification basis.

### 4.2 Context observations and snapshots

V1 context states are:

```text
unknown            desk_focus       desk_idle
walking            outdoors         commuting
exercising         resting          do_not_disturb
```

An observation contains a source, semantic state, confidence, TTL, and optional coarse semantic metadata. It never contains exact coordinates, SSIDs, network names, or contacts. Fusion creates a snapshot with the selected state, confidence, and bounded evidence.

### 4.3 Content selection

A selection records:

- `selection_id`, `delivery_id`, device, Receiver, content, and revision;
- monotonic `state_version`;
- reason, rule score, and context snapshot;
- `policy_version` and `model_version`;
- vibration permission, selected time, and expiry.

### 4.4 Display acknowledgement

After a successful render the device sends:

```json
{
  "ack_id": "ack_2c4d6c5ac3d945d783b4b6d7ee8dd8dc",
  "selection_id": "sel_13a3de58a28a45a6b976f8f692d95d3f",
  "state_version": 8,
  "content_id": "cnt_c117d7f1c50944ba88dfd77dd0d58da2",
  "revision_id": "rev_b66f2ed0684a4df7a4dbad4b05529d50",
  "status": "displayed",
  "render_hash": "<64 lowercase SHA-256 hex characters>",
  "firmware_version": "towrite-eink/0.1.0",
  "battery_percent": 74
}
```

`status: "failed"` may include a non-sensitive `error_summary`. A failed acknowledgement is audited but never advances displayed state.

## 5. Authoritative selected and displayed semantics

This is the central protocol invariant:

- `selected_content_id` is the server's authoritative desired state.
- `displayed_content_id` is what the device has successfully displayed. Only an exact successful device ACK may advance it.
- Committing a new selection increments `state_version` in a transaction and updates selected. It does not pretend the display has changed.
- A device renders only a version greater than the highest version it has applied locally.
- An ACK is accepted only when `status=displayed` and `selection_id`, `state_version`, `content_id`, and `revision_id` exactly match current selected state.
- Exact duplicate ACKs are idempotent by `ack_id`; reusing an ID with a different tuple, status, or payload returns `409`. Late, reordered, cross-device, failed, or mismatched ACKs are auditable but cannot overwrite newer selected or displayed state.
- A server restart, device outage, or retry does not reset or roll back either state.

Example:

```text
v7 selected=A, displayed=A
server selects B → v8 selected=B, displayed remains A
NFC tap → opens A, matching the physical screen
device renders B and ACKs v8 → selected=B, displayed=B
later NFC tap → opens B
late A/v7 ACK → stale audit only; no state change
```

The Tap Router freezes the most recent successfully displayed selection. It falls back to selected only when the device has never produced a successful ACK.

## 6. HTTP API

### 6.1 Capability discovery

```http
GET /v1/hub/capabilities
```

Returns the protocol version, maximum candidate count, supported content/context types, maximum long-poll wait, ACK support, `device_events`, and authentication requirements. An incompatible major version causes clients to stop using the Hub and keep local behavior.

### 6.2 Upload a candidate batch

```http
POST /v1/hub/receivers/{receiverId}/candidate-batches
Authorization: Bearer <connector_token>
Content-Type: application/json
```

```json
{
  "protocol_version": "1",
  "batch_id": "bat_client_01",
  "generated_at": "2026-07-19T10:30:00Z",
  "device_id": "dev_0123456789abcdef0123456789abcdef",
  "candidates": ["<1 to 20 recommendation candidates>"],
  "auto_select": true,
  "policy_version": "rules-v1",
  "model_version": "local-rules"
}
```

The Hub validates user, Receiver, and optional device binding; upserts logical content; creates immutable revisions when display data changes; and returns candidate mappings plus an optional automatic selection. The Connector must apply include/exclude, `private`/`no-ai`/`no-cloud`, attachment, field-preview, and explicit display-body gates before upload. Flattened fields such as `content_type`, `title`, and `actions` are accepted only as legacy aliases; new clients use the shape in section 4.1.

### 6.3 Submit a context observation

```http
POST /v1/hub/context/observations
Authorization: Bearer <connector_token>
```

```json
{
  "protocol_version": "1",
  "observations": [{
    "observation_id": "obs_0123456789abcdef0123456789abcdef",
    "receiver_id": "rcv_…",
    "device_id": "dev_…",
    "source": "manual",
    "state": "walking",
    "confidence": 1,
    "ttl_seconds": 1800,
    "place_label": "riverside-park",
    "local_hour": 17,
    "habit_id": "",
    "note_type": "mindflow",
    "workflow_stage": "sparks"
  }]
}
```

Manual corrections must have confidence `1`. A `confirmed_habit` observation must name an accepted `habit_id`. The response contains an observation ID and fused ContextSnapshot. V1 retains raw observations and snapshots for no more than 30 days by default.

### 6.4 Create a selection as the account owner

```http
POST /v1/hub/devices/{deviceId}/selections
Authorization: Bearer <access_token>
```

```json
{
  "content_id": "cnt_…",
  "revision_id": "rev_…",
  "reason": "User selected Send to screen in Obsidian",
  "score": 1,
  "policy_version": "manual-v1",
  "model_version": "none",
  "request_vibration": true,
  "expires_at": ""
}
```

The content must belong to a Receiver bound to the device. A successful transaction creates `selection_id` and `delivery_id`, and increments `state_version`. An explicit request uses the `manual` notification basis. DND and quiet hours never reject the selection: they set `allow_vibration=false` so the card is still delivered silently.

### 6.5 Long-poll desired state from a device

```http
GET /v1/hub/devices/{deviceId}/desired?after=<local_version>&wait=25
Authorization: Device <device_secret>
If-None-Match: "hub-<version>-<hash-prefix>"
```

Semantics:

- `after` is the highest version the device has processed; `wait` is clamped to 0–25 seconds.
- If `state_version > after`, return the selection and card immediately with `ETag` and `Cache-Control: no-store`.
- A selection created while polling is returned within the same polling window. The simulator acceptance target is receipt within five seconds of a state change.
- If the wait expires without an update, return `204 No Content`.
- If the entity tag remains valid, `304 Not Modified` may be returned.
- Network failures use jittered exponential backoff. A device never decreases its local version.

Example response:

```json
{
  "selection_id": "sel_…",
  "delivery_id": "dlv_…",
  "state_version": 8,
  "selected_at": "2026-07-19T10:30:00Z",
  "expires_at": "",
  "score": 0.87,
  "reason": "Current workflow stage matches this candidate",
  "policy_version": "rules-v1",
  "model_version": "local-rules",
  "allow_vibration": false,
  "card": {
    "content_id": "cnt_…",
    "revision_id": "rev_…",
    "content_type": "note_continue",
    "title": "Continue this note",
    "body": "…",
    "prompt": "…",
    "actions": ["open", "respond", "later", "skip"],
    "reason": "…",
    "content_hash": "<sha256>",
    "expires_at": ""
  }
}
```

### 6.6 Submit a display ACK

```http
POST /v1/hub/devices/{deviceId}/display-acks
Authorization: Device <device_secret>
Content-Type: application/json
```

The body is specified in section 4.4. The response reports `accepted`, `duplicate`, and a reason. The device sends the ACK after a complete successful refresh, never before rendering. A failed refresh should send `failed` for diagnostics while retaining the previous local displayed/version state.

#### 6.6.1 Submit bounded device feedback

```http
POST /v1/hub/devices/{deviceId}/events
Authorization: Device <device_secret>
Content-Type: application/json
```

```json
{
  "event_id": "evt_2bfa6e1ac43d4827b946a13b06663303",
  "selection_id": "sel_…",
  "state_version": 8,
  "action": "skip"
}
```

Only `useful`, `later`, and `skip` are accepted. The event ID must be `evt_` plus 32 lowercase hexadecimal characters. The selection and version must exactly match current desired state or the Hub returns `409`. Replaying the same complete event is idempotent; reusing its ID for different data returns `409`. A successful `skip` may commit a later selection, but the response contains only `desired_changed` and the resulting `state_version`; the device must fetch that card through `desired` and ACK it normally.

### 6.7 Read owner-visible device state

```http
GET /v1/hub/devices/{deviceId}/state
Authorization: Bearer <access_token>
```

Returns selected, displayed, `in_sync`, `last_seen_at`, the Tap URL, actual NDEF storage bytes, and whether the URL fits NTAG213. It does not accept Device authentication and never returns a secret or Vault path.

### 6.8 Submit selection feedback

```http
POST /v1/hub/selections/{selectionId}/feedback
Authorization: Bearer <access_token>
```

```json
{
  "event_id": "evt_2bfa6e1ac43d4827b946a13b06663303",
  "action": "later",
  "at": "2026-07-19T10:35:00Z",
  "note_written": false
}
```

Supported feedback is `useful`, `skipped`, `later`, `answered`, `opened`, and `opened_no_write`. `event_id` makes retries idempotent. Feedback affects cooldown and later rule scores, but cannot implicitly accept a habit candidate.

### 6.9 Tap Router and short-lived session

```http
GET /t/v1/{tapId}
```

The Hub resolves displayed first and selected only as a fallback, creates an approximately five-minute server-side Tap session, and freezes its selection, content, and revision. The page sends at least:

```text
Cache-Control: no-store
Referrer-Policy: no-referrer
Content-Security-Policy: minimal page-specific policy
```

Reading the page or the following endpoint does not consume the session:

```http
GET /v1/hub/tap-sessions/{sessionId}
```

It returns the frozen card and `requires_login_to_write: true`. A successful feedback or Capture submission consumes the session. Expired or consumed sessions cannot be used to write again.

### 6.10 Tap feedback and encrypted Capture

```http
POST /v1/hub/tap-sessions/{sessionId}/feedback
Authorization: Bearer <access_token>
X-CSRF-Token: <tap_session_csrf>
```

```http
POST /v1/hub/tap-sessions/{sessionId}/captures
Authorization: Bearer <access_token>
X-CSRF-Token: <tap_session_csrf>
```

Capture example:

```json
{
  "idempotency_key": "cap-client-uuid",
  "receiver_id": "rcv_…",
  "ciphertext": "<base64url ciphertext>",
  "encryption": {
    "version": 1,
    "algorithm": "ECDH-P256+HKDF-SHA256+A256GCM",
    "ephemeral_public_key": {},
    "nonce": "<12-byte base64url>",
    "salt": "<16-byte base64url>",
    "additional_data": "dG93cml0ZS1odWItY2FwdHVyZS12MQ"
  },
  "size_bytes": 512,
  "intent": "respond",
  "target_revision": "rev_frozen-content-revision"
}
```

Plaintext is encrypted in the client and contains `protocolVersion`, a unique `captureId`, the frozen `selectionId` and `contentId`, `intent`, answer `body`, opaque `writeTargetRef`, frozen `targetRevision`, and `createdAt`. HKDF `info` and AES-GCM AAD are the UTF-8 bytes of `towrite-hub-capture-v1`; `additional_data` is that value in base64url, and AES-GCM ciphertext includes its 128-bit tag. The Hub reuses the existing E2EE Capture queue and stores only ciphertext, necessary encryption metadata, and opaque linkage. The Connector decrypts a pulled capture and delegates append, create, question answer, conflict checks, idempotency, and safe undo to CaptureService.

Encryption metadata must not contain `vault_path`, `absolute_path`, `selection_text`, `clipboard`, or equivalent private fields. Retrying the same `idempotency_key` returns the original capture rather than creating a second write.

### 6.11 Device secret and Tap ID rotation

Account-owner endpoints are:

```http
POST /v1/hub/devices/{deviceId}/secret/rotate
POST /v1/hub/devices/{deviceId}/tap-id/rotate
Authorization: Bearer <access_token>
```

A new device secret is shown once and immediately invalidates the old value. Rotating the Tap ID revokes the old tag URL; the physical tag then needs to be rewritten.

### 6.12 Mailbox and guest messages

Account-owner endpoints:

```http
POST /v1/hub/mailboxes
POST /v1/hub/mailboxes/{mailboxId}/sender-keys
DELETE /v1/hub/mailboxes/{mailboxId}/sender-keys/{senderKeyId}
Authorization: Bearer <access_token>
```

Guest endpoint:

```http
POST /v1/hub/mailboxes/{mailboxId}/messages
Authorization: Sender <sender_key>
```

```json
{
  "title": "Remember dinner",
  "body": "It is getting late. Please take a break and eat.",
  "prompt": "",
  "request_display": true,
  "idempotency_key": "sender-client-uuid"
}
```

A sender key grants only `messages:create` for one mailbox. It supports expiry, revocation, per-key rate limiting, and idempotency. It cannot read devices, selected/displayed state, ACKs, notes, Receiver queues, or settings. Untrusted messages enter moderation/the candidate stream. Only an explicitly trusted sender policy may request automatic display, and it remains subject to do-not-disturb and vibration rules.

### 6.13 First-run pairing and Connector writeback

The plugin's first-run wizard uses account-authenticated Cloud Relay endpoints in this order:

```http
POST /v1/auth/email/start
POST /v1/auth/email/verify
POST /v1/receivers
POST /v1/devices
POST /v1/pairing/sessions
POST /v1/pairing/claim
POST /v1/hub/devices/{deviceId}/tap-id/rotate
```

The account access token exists only in the settings dialog's memory; it is not written to plugin data. The Receiver pull token and P-256 private key stay in local plugin data. The 256-bit device secret is displayed once for provisioning the ESP32 and is not persisted by the plugin.

The Connector later pulls encrypted mobile answers with `GET /v1/receivers/{receiverId}/captures/pending` using the Receiver credential. After local decryption and a successful conflict-checked CaptureService commit, it calls `POST /v1/captures/{captureId}/ack` with an empty body. No Vault path crosses that ACK. Failed or conflicting items stay queued for inspection/retry.

## 7. Context and recommendation Agent

### 7.1 Fixed pipeline

```text
Context Fusion
  → Candidate Retrieval
  → Privacy / Policy Gate
  → local rule score
  → optional AI allowlist rerank
  → Selection Store
  → Device Delivery
  → Feedback
```

Candidate sources include WorkflowIndex, LocalKnowledgeIndex, the question store, CaptureService, HabitLearningService, and Backend CaptureCore. A Connector sends at most 20 privacy-filtered candidates.

### 7.2 State entry, hysteresis, and exit

- A manual `do_not_disturb` observation takes effect immediately.
- Other manual corrections have confidence `1` and outrank automatic evidence until TTL expiry.
- A normal state enters only after confidence reaches `0.75` for two consecutive observations.
- An entered state remains while confidence is at least `0.45`.
- It exits to `unknown` only after remaining below `0.45` for five minutes.
- Every observation has a TTL; expired observations never participate in fusion.
- `semantic_place` is a coarse user label, not precise geolocation.

### 7.3 Habit approval

- A pending habit appears only in the suggestion center; it cannot affect ranking, notifications, or vibration.
- Only a habit that meets local evidence thresholds and is accepted by the user may produce `confirmed_habit` context or `accepted_habit` policy.
- AI may merge or rewrite a candidate explanation, but cannot change its acceptance state.
- Clearing learning data cannot leave an undisclosed database as the only surviving copy.

### 7.4 Hold, cooldown, and vibration

- An automatic selection is held for at least 30 minutes by default.
- Explicit user selection, content expiry, or a high-priority due item may break the hold.
- Recent display, skip, and repetition enter cooldown; `later` and `skipped` reduce short-term score.
- Automatic display state does not advance during do-not-disturb.
- Only due items, accepted habits, or explicitly trusted sender rules may request vibration.
- Default quiet hours are 23:00–08:00, during which vibration is denied.
- Accepted-habit vibration is capped at three per day.

### 7.5 AI and Skill permissions

The trusted Backend may use LiteLLM, Skills, and Agent Registry only under these constraints:

- Input contains only Connector-supplied candidate IDs and fields approved in the send preview.
- Output contains only allowlisted IDs, ordering, and bounded explanations.
- Unknown, duplicate, or unauthorized IDs are discarded. Timeout, offline, model error, or protocol mismatch immediately falls back to local rule order.
- AI cannot invent notes, `source_ref`, `write_target_ref`, devices, paths, or habit acceptance.
- AI cannot call selection, vibration, Vault write, or mailbox capabilities.
- `character_letter` is an explicitly enabled Composer Skill, and its output still passes the privacy and policy gates as an ordinary candidate.

## 8. Privacy, logging, and retention

The Connector excludes system directories, templates, attachments, and content marked `private`, `no-ai`, `no-cloud`, or equivalent frontmatter by default. The send preview shows provider, exact fields, and candidate count.

The following are not uploaded or logged by default:

- full note body, selection, or clipboard content;
- absolute or recoverable Vault paths;
- key content or key counts;
- contacts, SSIDs, or network names;
- exact coordinates or continuous background location;
- device secret, Connector token, or Receiver token;
- an unconfirmed habit as a durable rule.

The editor keystroke path performs only constant-time in-memory marking. Candidate construction, indexing, and network activity run in debounced background work and never block typing.

Application logs redact Authorization, cookies, CSRF, Tap sessions, URL query data, and sensitive encryption metadata; reverse-proxy/CDN access logs must be configured separately. Tap pages suppress Referrer leakage. The hourly cleanup worker keeps raw context and candidate-batch metadata for at most 30 days, removes unlinked Tap sessions one day after expiry, removes expired Capture ciphertext using the configured pending/ACKed retention, and keeps non-current selection/display audit records for 90 days. Account deletion revokes credentials and physically removes Hub-domain rows; device deletion immediately revokes that device, Tap, mailbox, and sender credentials while leaving sibling devices intact.

## 9. ESP32 and simulator integration

### 9.1 Device state machine

Persist securely:

```text
device_id
device_secret
applied_state_version
displayed content/revision/selection
last ETag
```

Recommended loop:

```text
1. GET desired?after=applied_state_version&wait=25
2. On 204/304, immediately issue the next long poll
3. On 200, validate JSON, content_hash, and version > local version
4. Layout off-screen and refresh the eink panel
5. On successful refresh, POST a displayed ACK
6. On accepted=true, persist the new local version and displayed tuple
7. On render/ACK failure, retain old state and retry with jittered backoff
```

Never persist a new applied version before rendering, ACK before rendering, accept a lower version, map an ACK back into selected state, or print the complete secret.

### 9.2 HTTPS and power behavior

- Public deployments use HTTPS with certificate and clock validation.
- The client timeout should exceed the server poll window by a small margin, for example 35 seconds.
- `204`/`304` may be followed immediately; network errors back off with jitter (for example 1, 2, 4, 8 seconds with a ceiling).
- `allow_vibration=false` is authoritative; the device may still refresh silently.
- Long text is truncated to the physical layout with an ellipsis rather than scrolled on a small eink display.

### 9.3 Device simulator

The simulator is delivered in the separate ObsidianAI-Backend repository. From that repository root use the following pattern; the script's `--help` is authoritative:

```powershell
python scripts/eink_device_simulator.py `
  --base-url https://hub.example.com `
  --device-id dev_0123456789abcdef0123456789abcdef `
  --device-secret <one-time-pairing-secret>
```

The simulator prints the card, ETag, and state version, then posts a display ACK. Acceptance criteria: it receives a new selection within five seconds, owner state becomes `in_sync` after ACK, and an old ACK cannot change state.

## 10. NFC entry summary

NTAG213 V1 contains exactly one URI record:

```text
<PUBLIC_BASE_URL>/t/v1/<tap_id>
```

It never contains a device secret, API key, access token, selected/content ID, or Vault path. V1 is an HTTPS PWA and has no Android Application Record. The owner state endpoint reports the actual NDEF byte count and whether it fits NTAG213's 144-byte user area; generation/writing is rejected when it does not fit.

See the [NTAG213 and NFC Tools guide](ntag213-nfc-tools.md) ([中文](ntag213-nfc-tools.zh-CN.md)) for the physical write procedure.

## 11. Compatibility and acceptance checklist

- Quote0, Push Feed, the legacy External API, and existing Capture clients remain compatible.
- Device ID alone, a wrong token, or a cross-device token is rejected.
- Old values stop working immediately after secret or Tap rotation.
- selected/displayed/state version survive server restart.
- Polls, ACKs, feedback, and captures are safely retryable using their idempotency identifiers.
- Reordered ACKs never roll back displayed; no ACK modifies selected.
- Before ACK, a Tap opens what is still displayed; without any ACK it falls back to selected.
- URLs, logs, redirects, and Referrer never contain long-lived credentials.
- Private/excluded content, full bodies, selections, exact paths, and exact location never reach Hub or AI payloads.
- Unauthorized AI IDs, timeout, offline mode, and missing models safely fall back to local rules.
- Pending habits do not rank; accepted habits do.
- Do-not-disturb, quiet hours, vibration caps, and low-confidence context are enforced.
- A sender key cannot read devices, ACKs, notes, or settings, and passes rate-limit, revocation, and malicious-content tests.
- Editor input performs no synchronous I/O, network request, or full-Vault scan.
- End-to-end path passes: candidate → selected → simulator ACK → NFC/PWA → encrypted queue → CaptureService writeback.

## 12. Evolution

Incompatible changes require a new major path or protocol version. Optional JSON fields may be added within V1, and clients ignore unknown fields. Future native-phone motion/location, Android App Links/AAR, NTAG 424 DNA, and real panel drivers must preserve the V1 invariants: minimum Hub knowledge, server-authoritative selected state, ACK-only displayed state, and no long-lived credential on the tag.
