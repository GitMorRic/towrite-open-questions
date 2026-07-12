# Obsidian AI Backend × ToWrite v1 contract

This document is the server-side handoff for the optional integration implemented by ToWrite `0.3.0-beta.1`. The plugin remains fully functional when these endpoints are absent.

## Repository safety note

In the inspected Backend checkout, `backend/` and `apps/obsidian-capture-lite/` are the canonical sources copied by `scripts/build_capture_app.ps1`. They currently differ materially from `dist/obsidian-ai-capture-app`, which contains dist-only behavior. Do not run the packaging script until those trees are reconciled; it clears and rebuilds the distribution directory.

## Authentication and protocol

All endpoints use `X-Capture-Token` and protocol major version `1`:

- `GET /capture/integrations/towrite/v1/capabilities`
- `POST /capture/integrations/towrite/v1/recommend-targets`
- `POST /capture/integrations/towrite/v1/suggest-habits`

The capabilities response is:

```json
{
  "protocolVersion": "1",
  "features": {
    "recommendTargets": true,
    "suggestHabits": true,
    "mobileCapture": true
  }
}
```

An incompatible version, timeout, authentication failure, or offline Backend leaves the plugin's local result unchanged.

## Target reranking

The request contains at most 20 locally authorized candidates. It deliberately omits capture body text, selections, links, source paths, question ids, and candidate paths.

```json
{
  "protocolVersion": "1",
  "draft": {
    "id": "capture_...",
    "intent": "new",
    "title": "Optional title",
    "tags": ["project"],
    "source": {
      "hasFile": true,
      "headingDepth": 2,
      "hasQuestion": false,
      "entryPoint": "sidebar"
    }
  },
  "candidates": [
    {
      "id": "opaque-local-id",
      "kind": "existingNote",
      "action": "append",
      "heading": "Captures",
      "stageId": "processing",
      "localScore": 18,
      "localConfidence": "strong",
      "localReason": "Matches the current workflow stage."
    }
  ]
}
```

The response may only reorder request ids and improve bounded display metadata:

```json
{
  "protocolVersion": "1",
  "candidates": [
    {
      "id": "opaque-local-id",
      "reason": "Concise explanation",
      "confidence": "strong",
      "score": 19
    }
  ]
}
```

Unknown or duplicate ids must be discarded. Reasons must be limited to 300 characters, confidence to `strong | medium | weak`, and scores to finite numbers. The Backend must never synthesize a path or target id.

## Habit wording

The request contains at most five pending, rule-generated candidates with only their id, current copy, structured rule, and aggregate evidence. The response may contain only `{candidateId, label?, description?}` for ids in that request. It must not return or change `rule`, `status`, or acceptance state. LLM failure returns an empty suggestion list.

## Existing Capture PWA

These endpoints do not replace the Backend PWA's route preview/commit pipeline and must not write a Vault. Native Obsidian capture is committed by the ToWrite plugin; mobile voice and attachments continue through the existing PWA.

## `/capture/status` hardening

Remove `/capture/status` from the Backend's public path allow-list, require `X-Capture-Token`, and stop returning an absolute Vault path. Update the Obsidian Capture Lite callers to use their authenticated request helper. If a compatibility window is unavoidable, unauthenticated status may expose only a minimal health/version/token-required response—never Vault paths, runtime configuration, object-store details, or feature flags.

## Required server tests

- missing/invalid token is rejected;
- protocol major `1` is required;
- more than 20 rerank candidates or five habit candidates is rejected or truncated safely;
- unknown and duplicate LLM ids are removed;
- invalid confidence, non-finite score, oversized copy, rule/status fields are removed;
- LLM failure preserves local order or returns no wording changes;
- `/capture/status` does not reveal an absolute Vault path.
