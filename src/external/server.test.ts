import { describe, expect, it, vi } from "vitest";
import {
  CaptureConflictError,
  CaptureUndoTokenError,
  type CaptureDraft,
  type CaptureTargetCandidate,
  type CaptureUndoResult
} from "../capture";
import type { OpenQuestion } from "../core/types";
import {
  DailyPlanConflictError,
  type DailyPlanItem,
  type DailyPlanNormalizationPreview
} from "../daily";
import {
  DailyTimerTransitionError,
  DailyTimerValidationError
} from "../daily/task-timer-service";
import type { DailyTaskTimingSnapshot } from "../daily/task-timer-types";
import type { PushFeedPayload } from "../push/types";
import { ToWriteExternalApiServer } from "./server";

const question: OpenQuestion = {
  id: "oq_one",
  title: "Old title",
  lane: "think",
  status: "open",
  kind: "research",
  tags: [],
  color: "amber",
  question: "Old body",
  source: {
    file: "note.md",
    headingPath: [],
    lineStart: 0,
    lineEnd: 0,
    rule: "selection"
  }
};

describe("external server", () => {
  it("exposes previous-task migration, focused location, and analytics through versioned Daily routes", async () => {
    const item = makeDailyItem("todo");
    const migrationRevision = { ...item.revision, date: "2026-07-23" };
    const migratePreviousDailyItems = vi.fn(async () => [{
      schemaVersion: 1 as const,
      migrationId: "mig_external_1",
      taskId: item.id,
      fromDate: "2026-07-23",
      toDate: "2026-07-24",
      fromSourcePath: "Daily/2026-07-23.md",
      toSourcePath: "Daily/2026-07-24.md",
      migratedAt: "2026-07-23T20:00:00.000Z",
      destinationTaskId: item.id
    }]);
    const analytics = {
      schemaVersion: 1 as const,
      from: "2026-07-01",
      to: "2026-07-31",
      generatedAt: "2026-07-31T12:00:00.000Z",
      days: [],
      totals: {
        planned: 0, completed: 0, completionRate: 0, activeMs: 0, wallMs: 0,
        pausedMs: 0, interruptions: 0, positiveWritingUnits: 0, netWritingUnits: 0,
        notesCreated: 0, notesModified: 0, trackingComplete: true, needsReview: false
      },
      byCategory: []
    };
    const server = makeServer({
      getPreviousDailyUnfinished: async () => [item],
      migratePreviousDailyItems,
      getDailyAnalyticsRange: async () => analytics,
      getDailyMonthlySummary: async (month) => ({ ...analytics, month }),
      locateCurrentFocusedTask: async () => true
    });
    const handle = server as unknown as {
      handleRequest(request: FakeRequest, response: FakeResponse): Promise<void>;
    };

    const previous = new FakeResponse();
    await handle.handleRequest(new FakeRequest(
      "GET",
      "/api/v1/daily/plans/2026-07-24/previous-unfinished",
      {}
    ), previous);
    expect(previous.statusCode).toBe(200);
    expect(JSON.parse(previous.body).data).toHaveLength(1);

    const migrated = new FakeResponse();
    await handle.handleRequest(new FakeRequest(
      "POST",
      "/api/v1/daily/plans/2026-07-24/migrate-previous",
      { selections: [{ id: item.id, revision: migrationRevision }] }
    ), migrated);
    expect(migrated.statusCode).toBe(200);
    expect(migratePreviousDailyItems).toHaveBeenCalledWith("2026-07-24", [{
      id: item.id,
      revision: migrationRevision
    }]);

    const invalidMigrationDate = new FakeResponse();
    await handle.handleRequest(new FakeRequest(
      "POST",
      "/api/v1/daily/plans/2026-07-24/migrate-previous",
      { selections: [{ id: item.id, revision: { ...migrationRevision, date: "2026-02-30" } }] }
    ), invalidMigrationDate);
    expect(invalidMigrationDate.statusCode).toBe(400);
    expect(migratePreviousDailyItems).toHaveBeenCalledTimes(1);

    const range = new FakeResponse();
    await handle.handleRequest(new FakeRequest(
      "GET",
      "/api/v1/daily/analytics?from=2026-07-01&to=2026-07-31",
      {}
    ), range);
    expect(range.statusCode).toBe(200);
    expect(JSON.parse(range.body).data.from).toBe("2026-07-01");

    const focused = new FakeResponse();
    await handle.handleRequest(new FakeRequest("POST", "/api/v1/daily/focus/locate", {}), focused);
    expect(JSON.parse(focused.body)).toEqual({ data: { located: true } });
  });

  it("previews and applies a date-bound Daily normalization contract", async () => {
    const preview = makeNormalizationPreview();
    const calls: Array<{ date: string; preview?: DailyPlanNormalizationPreview }> = [];
    const server = makeServer({
      previewDailyPlanNormalization: async (date) => {
        calls.push({ date });
        return preview;
      },
      normalizeDailyPlan: async (date, received) => {
        calls.push({ date, preview: received });
        return {
          preview: { ...received, changed: false, edits: [], diff: "" },
          revision: "plan_revision_after",
          undoToken: "undo_normalize_1"
        };
      }
    });
    const handle = server as unknown as {
      handleRequest(request: FakeRequest, response: FakeResponse): Promise<void>;
    };

    const previewResponse = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/daily/plans/2026-07-24/normalization-preview", {}),
      previewResponse
    );
    expect(previewResponse.statusCode).toBe(200);
    expect(JSON.parse(previewResponse.body).data).toMatchObject({
      date: "2026-07-24",
      expectedRevision: "plan_revision_before",
      changed: true
    });

    const normalizeResponse = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/daily/plans/2026-07-24/normalize", {
        preview
      }),
      normalizeResponse
    );
    expect(normalizeResponse.statusCode).toBe(200);
    expect(JSON.parse(normalizeResponse.body).data).toMatchObject({
      revision: "plan_revision_after",
      undoToken: "undo_normalize_1"
    });
    expect(calls).toEqual([
      { date: "2026-07-24" },
      { date: "2026-07-24", preview }
    ]);
  });

  it("rejects invalid, cross-date, and stale Daily normalization requests", async () => {
    const normalizeDailyPlan = vi.fn(async () => {
      throw new DailyPlanConflictError(
        "revision-changed",
        "The plan changed after normalization preview."
      );
    });
    const server = makeServer({ normalizeDailyPlan });
    const handle = server as unknown as {
      handleRequest(request: FakeRequest, response: FakeResponse): Promise<void>;
    };

    const invalid = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/daily/plans/2026-07-24/normalize", {
        preview: { schemaVersion: 1, date: "2026-07-24" }
      }),
      invalid
    );
    expect(invalid.statusCode).toBe(400);

    const crossDate = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/daily/plans/2026-07-25/normalize", {
        preview: makeNormalizationPreview()
      }),
      crossDate
    );
    expect(crossDate.statusCode).toBe(409);

    const stale = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/daily/plans/2026-07-24/normalize", {
        preview: makeNormalizationPreview()
      }),
      stale
    );
    expect(stale.statusCode).toBe(409);
    expect(JSON.parse(stale.body).error).toContain("changed");
    expect(normalizeDailyPlan).toHaveBeenCalledTimes(1);
  });

  it("serves timing and forwards idempotent start/pause/resume event IDs", async () => {
    const calls: unknown[] = [];
    const startedItem = makeDailyItem("in-progress");
    const pausedItem = makeDailyItem("todo");
    const resumedItem = makeDailyItem("in-progress");
    const timing = makeTimingSnapshot("paused");
    const server = makeServer({
      getDailyItemTiming: async (id, date) => {
        calls.push(["get", id, date]);
        return timing;
      },
      startDailyItem: async (id, revision, eventId, date, timingRevision, lineageRevision) => {
        calls.push(["start", id, revision, eventId, date, timingRevision, lineageRevision]);
        return startedItem;
      },
      pauseDailyItem: async (id, revision, eventId, date, timingRevision, lineageRevision) => {
        calls.push(["pause", id, revision, eventId, date, timingRevision, lineageRevision]);
        return pausedItem;
      },
      resumeDailyItem: async (id, revision, eventId, date, timingRevision, lineageRevision) => {
        calls.push(["resume", id, revision, eventId, date, timingRevision, lineageRevision]);
        return resumedItem;
      }
    });
    const handle = server as unknown as {
      handleRequest(request: FakeRequest, response: FakeResponse): Promise<void>;
    };

    const get = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("GET", "/api/v1/daily/items/daily%5Fone/timing?date=2026-07-24", {}),
      get
    );
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(get.body).data).toMatchObject({
      taskId: "daily_one",
      status: "paused",
      timingRevision: "timer_revision_1"
    });

    const revision = {
      value: "task_revision_1",
      sourcePath: "Daily/2026-07-24.md",
      blockId: "daily_one"
    };
    const start = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/daily/items/daily_one/start", {
        revision,
        eventId: "evt_start_once",
        date: "2026-07-24",
        timingRevision: "timer_revision_1",
        lineageRevision: "lineage_revision_1"
      }),
      start
    );
    expect(start.statusCode).toBe(200);

    const pause = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/daily/items/daily_one/pause", {
        revision,
        eventId: "evt_pause_once",
        date: "2026-07-24",
        timingRevision: "timer_revision_2",
        lineageRevision: "lineage_revision_1"
      }),
      pause
    );
    expect(pause.statusCode).toBe(200);

    const resume = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/daily/items/daily_one/resume", {
        revision,
        eventId: "evt_resume_once",
        date: "2026-07-24",
        timingRevision: "timer_revision_3",
        lineageRevision: "lineage_revision_1"
      }),
      resume
    );
    expect(resume.statusCode).toBe(200);
    expect(calls).toEqual([
      ["get", "daily_one", "2026-07-24"],
      ["start", "daily_one", revision, "evt_start_once", "2026-07-24", "timer_revision_1", "lineage_revision_1"],
      ["pause", "daily_one", revision, "evt_pause_once", "2026-07-24", "timer_revision_2", "lineage_revision_1"],
      ["resume", "daily_one", revision, "evt_resume_once", "2026-07-24", "timer_revision_3", "lineage_revision_1"]
    ]);
  });

  it("validates timing correction/reset payloads and maps timer conflicts to 409", async () => {
    const calls: unknown[] = [];
    const correctDailyItemTiming = vi.fn(async (
      id: string,
      revision: string,
      patch: unknown,
      date?: string
    ) => {
      calls.push([id, revision, patch, date]);
      return makeTimingSnapshot("paused", `timer_revision_${calls.length + 1}`);
    });
    const server = makeServer({ correctDailyItemTiming });
    const handle = server as unknown as {
      handleRequest(request: FakeRequest, response: FakeResponse): Promise<void>;
    };

    const correct = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("PATCH", "/api/v1/daily/items/daily_one/timing", {
        operation: "correct",
        timingRevision: "timer_revision_1",
        eventId: "evt_correct_once",
        at: "2026-07-24T11:01:00+08:00",
        targetEventId: "evt_pause_once",
        replacementAt: "2026-07-24T10:55:00+08:00",
        reason: "Corrected from the task timing panel",
        date: "2026-07-24"
      }),
      correct
    );
    expect(correct.statusCode).toBe(200);

    const reset = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("PATCH", "/api/v1/daily/items/daily_one/timing", {
        operation: "reset",
        timingRevision: "timer_revision_2",
        eventId: "evt_reset_once",
        at: "2026-07-24T11:02:00+08:00",
        date: "2026-07-24"
      }),
      reset
    );
    expect(reset.statusCode).toBe(200);
    expect(calls).toEqual([
      ["daily_one", "timer_revision_1", {
        operation: "correct",
        eventId: "evt_correct_once",
        at: "2026-07-24T11:01:00+08:00",
        source: "obsidian",
        targetEventId: "evt_pause_once",
        replacementAt: "2026-07-24T10:55:00+08:00",
        invalidateTarget: false,
        reason: "Corrected from the task timing panel"
      }, "2026-07-24"],
      ["daily_one", "timer_revision_2", {
        operation: "reset",
        options: {
          eventId: "evt_reset_once",
          at: "2026-07-24T11:02:00+08:00",
          source: "obsidian"
        }
      }, "2026-07-24"]
    ]);

    for (const body of [
      { operation: "correct", targetEventId: "evt_one", reason: "missing revision" },
      { operation: "correct", timingRevision: "timer_revision_2", targetEventId: "evt_one", reason: "missing change" },
      { operation: "unknown", timingRevision: "timer_revision_2" }
    ]) {
      const invalid = new FakeResponse();
      await handle.handleRequest(
        new FakeRequest("PATCH", "/api/v1/daily/items/daily_one/timing", body),
        invalid
      );
      expect(invalid.statusCode).toBe(400);
    }

    const conflictServer = makeServer({
      pauseDailyItem: async () => {
        throw new DailyTimerTransitionError("Task is not currently running.");
      },
      correctDailyItemTiming: async () => {
        throw new DailyTimerValidationError("Correction target does not exist.");
      }
    });
    const conflictHandle = conflictServer as unknown as {
      handleRequest(request: FakeRequest, response: FakeResponse): Promise<void>;
    };
    const transitionConflict = new FakeResponse();
    await conflictHandle.handleRequest(
      new FakeRequest("POST", "/api/v1/daily/items/daily_one/pause", {
        revision: "task_revision_1"
      }),
      transitionConflict
    );
    expect(transitionConflict.statusCode).toBe(409);

    const invalidCorrection = new FakeResponse();
    await conflictHandle.handleRequest(
      new FakeRequest("PATCH", "/api/v1/daily/items/daily_one/timing", {
        operation: "correct",
        timingRevision: "timer_revision_2",
        targetEventId: "evt_missing",
        replacementAt: "2026-07-24T11:00:00+08:00",
        reason: "Fix"
      }),
      invalidCorrection
    );
    expect(invalidCorrection.statusCode).toBe(400);
  });

  it("patches question title and body", async () => {
    let patch: { title?: string; question?: string; reminderAt?: string; reminderNote?: string } | undefined;
    const server = makeServer({
      updateQuestionFields: async (_id, nextPatch) => {
        patch = nextPatch;
        return {
          ...question,
          ...nextPatch
        };
      }
    });

    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("PATCH", "/api/v1/questions/oq_one", {
        title: "New title",
        body: "New body",
        reminderAt: "2026-06-30T10:00:00.000Z",
        reminderNote: "Ping me later"
      }), response);

    expect(response.statusCode).toBe(200);
    expect(patch).toEqual({
      title: "New title",
      question: "New body",
      reminderAt: "2026-06-30T10:00:00.000Z",
      reminderNote: "Ping me later"
    });
    expect(JSON.parse(response.body).data[0]).toMatchObject({
      title: "New title",
      question: "New body"
    });
  });

  it("creates device captures with authorization", async () => {
    let captureBody: unknown;
    const server = makeServer({
      createDeviceCapture: async (request) => {
        captureBody = request;
        return {
          filePath: "00-Raw/Device Inbox.md",
          title: request.title || "Quick idea",
          tags: request.tags,
          targetKind: request.target?.kind ?? "inboxFile",
          createdAt: "2026-06-30T00:00:00.000Z",
          openUri: "obsidian://open?vault=Vault&file=00-Raw%2FDevice%20Inbox.md"
        };
      }
    });

    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/captures", {
        title: "Phone idea",
        text: "Dictated from phone",
        tags: "capture, phone",
        target: { kind: "folderPath", folderPath: "01-Sparks" },
        clientId: "mobile",
        metadata: {
          target_id: "desk",
          candidate_id: "oq_one",
          delivery_id: "delivery_1",
          source_file: "note.md",
          source_line: "1",
          input_mode: "capture"
        }
      }), response);

    expect(response.statusCode).toBe(201);
    expect(captureBody).toEqual({
      title: "Phone idea",
      text: "Dictated from phone",
      tags: ["capture", "phone"],
      target: { kind: "folderPath", folderPath: "01-Sparks" },
      clientId: "mobile",
      metadata: {
        target_id: "desk",
        candidate_id: "oq_one",
        delivery_id: "delivery_1",
        source_file: "note.md",
        source_line: "1",
        input_mode: "capture",
        created_at: undefined,
        place_label: undefined,
        source_block_id: undefined,
        source_device: undefined,
        source_end_line: undefined,
        source_page: undefined
      }
    });
    expect(JSON.parse(response.body).data).toMatchObject({
      filePath: "00-Raw/Device Inbox.md",
      targetKind: "folderPath"
    });
    const legacy = captureBody as Record<string, unknown>;
    expect({
      captureId: legacy.captureId,
      candidateId: legacy.candidateId,
      action: legacy.action,
      targetRevision: legacy.targetRevision
    }).toEqual({
      captureId: undefined,
      candidateId: undefined,
      action: undefined,
      targetRevision: undefined
    });
  });

  it("returns normalized capture recommendations", async () => {
    let received: CaptureDraft | undefined;
    const candidates: CaptureTargetCandidate[] = [{
      schemaVersion: 1,
      id: "existing-launch",
      kind: "existingNote",
      action: "append",
      path: "Projects/Launch.md",
      heading: "Captures",
      reason: "Same project and tags",
      confidence: "strong",
      score: 18,
      targetRevision: "rev-before"
    }];
    const server = makeServer({
      recommendCapture: async (draft) => {
        received = draft;
        return candidates;
      }
    });

    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/capture/recommendations", {
        draft: {
          schemaVersion: 1,
          id: "capture-api-1",
          intent: "selection",
          body: "Capture this launch decision",
          title: "Launch decision",
          tags: ["launch", "decision"],
          links: ["https://example.com/source"],
          source: {
            file: "Projects/Source.md",
            headingPath: ["Plan"],
            questionId: "oq_one",
            entryPoint: "mobile",
            selection: "must not be forwarded"
          },
          createdAt: "2026-07-12T03:00:00.000Z"
        }
      }), response);

    expect(response.statusCode).toBe(200);
    expect(received).toEqual({
      schemaVersion: 1,
      id: "capture-api-1",
      intent: "selection",
      body: "Capture this launch decision",
      title: "Launch decision",
      tags: ["launch", "decision"],
      links: ["https://example.com/source"],
      source: {
        file: "Projects/Source.md",
        headingPath: ["Plan"],
        questionId: "oq_one",
        entryPoint: "mobile"
      },
      createdAt: "2026-07-12T03:00:00.000Z"
    });
    expect(JSON.stringify(received ?? {})).not.toContain("must not be forwarded");
    expect(JSON.parse(response.body)).toEqual({
      schemaVersion: 1,
      draftId: "capture-api-1",
      candidates
    });
  });

  it("forwards the versioned existing-note capture contract", async () => {
    let received: unknown;
    const result = {
      filePath: "Projects/Launch.md",
      title: "Launch decision",
      tags: ["capture", "launch"],
      targetKind: "existingNote" as const,
      createdAt: "2026-07-12T03:00:00.000Z",
      openUri: "obsidian://open?vault=Vault&file=Projects%2FLaunch.md",
      captureId: "capture-api-1",
      candidateId: "existing-launch",
      action: "append" as const,
      undoToken: "undo-token-1",
      targetRevision: "rev-after",
      idempotent: false
    };
    const server = makeServer({
      createDeviceCapture: async (request) => {
        received = request;
        return result;
      }
    });

    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/captures", {
        captureId: "capture-api-1",
        candidateId: "existing-launch",
        action: "append",
        targetRevision: "rev-before",
        title: "Launch decision",
        text: "Capture this launch decision",
        tags: ["capture", "launch"],
        target: {
          kind: "existingNote",
          filePath: "Projects/Launch.md",
          heading: "## Captures"
        },
        clientId: "mobile-v2"
      }), response);

    expect(response.statusCode).toBe(201);
    expect(received).toMatchObject({
      captureId: "capture-api-1",
      candidateId: "existing-launch",
      action: "append",
      targetRevision: "rev-before",
      title: "Launch decision",
      text: "Capture this launch decision",
      tags: ["capture", "launch"],
      target: {
        kind: "existingNote",
        filePath: "Projects/Launch.md",
        heading: "Captures"
      },
      clientId: "mobile-v2"
    });
    expect(JSON.parse(response.body)).toEqual({ data: result });
  });

  it("undoes a versioned capture by id and token", async () => {
    let call: { captureId: string; undoToken: string } | undefined;
    const result: CaptureUndoResult = {
      schemaVersion: 1,
      captureId: "capture:api-1",
      finalPath: "Projects/Launch.md",
      undone: true
    };
    const server = makeServer({
      undoCapture: async (captureId, undoToken) => {
        call = { captureId, undoToken };
        return result;
      }
    });

    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/captures/capture%3Aapi-1/undo", {
        undoToken: "undo-token-1"
      }), response);

    expect(response.statusCode).toBe(200);
    expect(call).toEqual({ captureId: "capture:api-1", undoToken: "undo-token-1" });
    expect(JSON.parse(response.body)).toEqual({ data: result });
  });

  it("maps invalid undo tokens and changed targets to safe client errors", async () => {
    const invalidTokenServer = makeServer({
      undoCapture: async () => { throw new CaptureUndoTokenError(); }
    });
    const invalidResponse = new FakeResponse();
    await (invalidTokenServer as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/captures/capture-api-1/undo", {
        undoToken: "invalid"
      }), invalidResponse);
    expect(invalidResponse.statusCode).toBe(400);

    const conflictServer = makeServer({
      createDeviceCapture: async () => {
        throw new CaptureConflictError("target-changed", "Refresh preview.");
      }
    });
    const conflictResponse = new FakeResponse();
    await (conflictServer as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/captures", { text: "Changed" }), conflictResponse);
    expect(conflictResponse.statusCode).toBe(409);
    expect(JSON.parse(conflictResponse.body)).toEqual({ error: "Refresh preview." });
  });

  it("rejects malformed versioned capture fields instead of falling back to Inbox", async () => {
    const server = makeServer();
    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/captures", {
        text: "Should not be written",
        action: "move",
        target: { kind: "existingNote" }
      }), response);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toContain("Capture action");
  });

  it("does not allow query-token writes for captures", async () => {
    const server = makeServer();
    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/captures?token=secret", {
        text: "Should fail"
      }, { authorization: undefined }), response);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: "Unauthorized." });
  });

  it("allows Quote0 restricted token to load input context and write notes", async () => {
    let appended: unknown;
    const server = makeServer({
      getRestrictedAccessToken: () => "quote0-token",
      appendQuestionNote: async (id, text, clientId, metadata) => {
        appended = { id, text, clientId, metadata };
        return question;
      }
    });

    const contextResponse = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/device-input-context?token=quote0-token&questionId=oq_one", {}, {
        authorization: undefined
      }), contextResponse);

    expect(contextResponse.statusCode).toBe(200);
    expect(JSON.parse(contextResponse.body).question).toMatchObject({ id: "oq_one" });

    const writeResponse = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/questions/oq_one/notes", {
        text: "Answered from NFC",
        clientId: "quote0",
        metadata: {
          target_id: "quote0",
          delivery_id: "delivery_nfc",
          input_mode: "answer"
        }
      }, { authorization: "Bearer quote0-token" }), writeResponse);

    expect(writeResponse.statusCode).toBe(200);
    expect(appended).toEqual({
      id: "oq_one",
      text: "Answered from NFC",
      clientId: "quote0",
      metadata: {
        target_id: "quote0",
        candidate_id: undefined,
        created_at: undefined,
        delivery_id: "delivery_nfc",
        input_mode: "answer",
        place_label: undefined,
        source_block_id: undefined,
        source_device: undefined,
        source_end_line: undefined,
        source_file: undefined,
        source_line: undefined,
        source_page: undefined
      }
    });
  });

  it("rejects Quote0 restricted token for full deck reads", async () => {
    const server = makeServer({
      getRestrictedAccessToken: () => "quote0-token"
    });
    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/deck?token=quote0-token", {}, {
        authorization: undefined
      }), response);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({ error: "Unauthorized." });
  });

  it("serves push feed with full API authorization", async () => {
    const server = makeServer({
      getPushFeed: (targetId) => ({
        schemaVersion: 1,
        generatedAt: "2026-07-07T00:00:00.000Z",
        target: {
          id: targetId || "local-web",
          name: "Local web",
          type: "local-web",
          profile: "mobile-eink",
          width: 390,
          height: 844,
          inches: 6.1,
          capabilities: ["pull"]
        },
        privacy: {
          level: "local-coarse",
          preciseLocationIncluded: false
        },
        context: {
          timeBucket: "morning",
          placeLabel: "desk"
        },
        decision: {
          candidateId: "oq_one",
          candidateType: "question",
          score: 42,
          reason: "active note",
          quiet: false
        },
        display: {
          variant: "question",
          icon: "?",
          title: "Old title",
          primary: "Old body",
          secondaryLines: ["Next: review"],
          metrics: [{ label: "? ToThink", value: 1 }],
          badges: ["Think"],
          footer: "Think · active note",
          link: "http://127.0.0.1:48321/device/input?token=q0&questionId=oq_one",
          titleText: "? Old title",
          message: "Old body",
          signature: "Think"
        }
      })
    });

    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/push/feed?targetId=phone", {}), response);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      target: { id: "phone" },
      privacy: { preciseLocationIncluded: false },
      decision: { candidateId: "oq_one" },
      display: {
        variant: "question",
        icon: "?",
        metrics: [{ label: "? ToThink", value: 1 }],
        badges: ["Think"]
      }
    });
  });

  it("serves article device feed items with workflow timing fields", async () => {
    const server = makeServer({
      getArticleSummaries: () => [{
        filePath: "note.md",
        title: "Note",
        open: 1,
        candidate: 0,
        resolved: 0,
        ignored: 0,
        think: 1,
        write: 0,
        needsWork: true,
        oldestOpenAgeDays: 4,
        topIssues: [question]
      }],
      getWorkflowPayload: () => ({
        schemaVersion: 1,
        generatedAt: "2026-07-07T00:00:00.000Z",
        vaultName: "Vault",
        enabled: true,
        counts: { stages: 1, uniqueFiles: 1 },
        stages: [{
          id: "processing",
          title: "Processing",
          description: "Active work",
          color: "sky",
          limit: 20,
          staleAfterDays: 7,
          count: 1,
          staleCount: 1,
          files: [{
            filePath: "note.md",
            title: "Note",
            description: "Needs a pass",
            tags: ["processing"],
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-03T00:00:00.000Z",
            ageDays: 4,
            stale: true,
            openQuestionCount: 1,
            thinkCount: 1,
            writeCount: 0,
            nextAction: "Review the question",
            openUri: "obsidian://open?vault=Vault&file=note.md"
          }]
        }]
      })
    });

    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/device-feed?page=articles", {}), response);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).screens[0].items[0]).toMatchObject({
      type: "article",
      stageTitle: "Processing",
      stale: true,
      ageDays: 4,
      oldestOpenAgeDays: 4,
      statusLabel: "stale"
    });
  });

  it("serves the compatibility e-ink playlist callback with cursor paging and legacy filters", async () => {
    let request: { limit: number; cursor: number; lane?: string[] } | undefined;
    const server = makeServer({
      getEinkPayload: (limit, cursor, query) => {
        request = { limit, cursor, lane: query.lane };
        return {
          schemaVersion: 2,
          generatedAt: "2026-07-23T00:00:00.000Z",
          summary: { open: 1, candidate: 0, blockedArticles: 0 },
          focus: [],
          playlist: {
            order: "echo_then_questions",
            cursor,
            total: 0,
            queueTotal: 0,
            currentInQueue: false,
            currentIndex: -1,
            currentPosition: 0,
            nextCursor: 0,
            previousCursor: 0,
            revision: "einkrev_test"
          }
        };
      }
    });
    const response = new FakeResponse();

    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/eink?limit=1&cursor=7&lane=write", {}), response);

    expect(response.statusCode).toBe(200);
    expect(request).toEqual({ limit: 1, cursor: 7, lane: ["write"] });
    expect(JSON.parse(response.body).playlist).toMatchObject({
      order: "echo_then_questions",
      cursor: 7
    });
  });

  it("tracks service lifecycle without exposing credentials", async () => {
    const updates: Array<ReturnType<ToWriteExternalApiServer["getRuntimeStatus"]>> = [];
    const server = makeServer({
      getSettings: () => ({
        enabled: true,
        bindHost: "127.0.0.1",
        port: 0,
        token: "lifecycle-secret",
        allowQueryTokenForRead: false,
        publicBaseUrl: ""
      }),
      onRuntimeStatusChanged: (status) => {
        updates.push(status);
      }
    });

    expect(server.isRunning()).toBe(false);
    expect(server.getRuntimeStatus()).toEqual({
      running: false,
      successfulPolls: 0
    });

    await server.start();
    try {
      const running = server.getRuntimeStatus();
      expect(server.isRunning()).toBe(true);
      expect(running).toMatchObject({
        running: true,
        successfulPolls: 0,
        startedAt: expect.any(String)
      });
      expect(JSON.stringify(running)).not.toContain("lifecycle-secret");
    } finally {
      await server.stop();
    }

    expect(server.isRunning()).toBe(false);
    expect(server.getRuntimeStatus()).toMatchObject({
      running: false,
      stoppedAt: expect.any(String)
    });
    expect(updates.map((status) => status.running)).toEqual([true, false]);
  });

  it("starts each listener run with fresh device telemetry", async () => {
    const server = makeServer({
      getSettings: () => ({
        enabled: true,
        bindHost: "127.0.0.1",
        port: 0,
        token: "secret",
        allowQueryTokenForRead: false,
        publicBaseUrl: ""
      })
    });
    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/eink?targetId=desk", {}), response);
    expect(server.getRuntimeStatus()).toMatchObject({
      successfulPolls: 1,
      lastPollAt: expect.any(String),
      lastTargetId: "desk"
    });

    await server.start();
    try {
      expect(server.getRuntimeStatus()).toMatchObject({
        running: true,
        successfulPolls: 0,
        startedAt: expect.any(String)
      });
      expect(server.getRuntimeStatus().lastPollAt).toBeUndefined();
      expect(server.getRuntimeStatus().lastTargetId).toBeUndefined();
      expect(server.getRuntimeStatus().lastEventAt).toBeUndefined();
      expect(server.getRuntimeStatus().lastErrorAt).toBeUndefined();
    } finally {
      await server.stop();
    }
  });

  it("reports a configuration startup failure without retaining an old heartbeat", async () => {
    const server = makeServer({
      getSettings: () => ({
        enabled: true,
        bindHost: "127.0.0.1",
        port: 48_321,
        token: "",
        allowQueryTokenForRead: false,
        publicBaseUrl: ""
      })
    });
    await expect(server.start()).rejects.toThrow("External API token is missing.");
    expect(server.getRuntimeStatus()).toMatchObject({
      running: false,
      successfulPolls: 0,
      stoppedAt: expect.any(String),
      lastErrorAt: expect.any(String),
      lastErrorStatus: 400,
      lastError: "External API failed to start."
    });
    expect(server.getRuntimeStatus().lastPollAt).toBeUndefined();
  });

  it("records safe e-ink poll metadata and not card bodies or paths", async () => {
    const updates: Array<ReturnType<ToWriteExternalApiServer["getRuntimeStatus"]>> = [];
    const server = makeServer({
      getEinkPayload: () => ({
        schemaVersion: 2,
        generatedAt: "2026-07-23T00:00:00.000Z",
        summary: { open: 1, candidate: 0, blockedArticles: 0 },
        focus: [{
          id: "echo-card:memory",
          title: "Memory echo",
          body: "private body D:\\Vault\\secret.md",
          question: "private question",
          article: "private source",
          lane: "write",
          kind: "other",
          sourceType: "echo"
        }],
        playlist: {
          order: "echo_then_questions",
          cursor: 0,
          total: 1,
          queueTotal: 1,
          currentInQueue: true,
          currentIndex: 0,
          currentPosition: 1,
          currentId: "echo-card:memory",
          nextCursor: 0,
          previousCursor: 0,
          selectedId: "echo-card:memory",
          revision: "einkrev_safe"
        }
      }),
      onRuntimeStatusChanged: (status) => {
        updates.push(status);
      }
    });
    const response = new FakeResponse();

    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/eink?targetId=desk&limit=1", {}), response);

    expect(response.statusCode).toBe(200);
    expect(server.getRuntimeStatus()).toMatchObject({
      running: false,
      successfulPolls: 1,
      lastPollAt: expect.any(String),
      lastTargetId: "desk",
      lastServedCardId: "echo-card:memory",
      lastServedTitle: "Memory echo",
      lastPlaylistRevision: "einkrev_safe"
    });
    const serialized = JSON.stringify(server.getRuntimeStatus());
    expect(serialized).not.toContain("private body");
    expect(serialized).not.toContain("private question");
    expect(serialized).not.toContain("secret.md");
    expect(serialized).not.toContain("Bearer secret");
    expect(updates).toHaveLength(1);
  });

  it("records sanitized device-route failures without credentials", async () => {
    const server = makeServer({
      getRestrictedAccessTokens: () => ["desk-token", "wall-token"],
      getPushTargets: () => ["desk", "wall"].map((id) => ({
        id,
        name: id,
        type: "local-web" as const,
        enabled: true,
        profile: "eink-bw" as const,
        width: 264,
        height: 176,
        inches: 2.7,
        defaultPage: "cards" as const,
        defaultLane: "" as const,
        refreshSeconds: 60,
        quietHoursStart: "",
        quietHoursEnd: "",
        token: `${id}-token`,
        capabilities: ["buttons"]
      }))
    });
    const response = new FakeResponse();

    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/eink?targetId=wall", {}, {
        authorization: "Bearer desk-token"
      }), response);

    expect(response.statusCode).toBe(401);
    expect(server.getRuntimeStatus()).toMatchObject({
      running: false,
      successfulPolls: 0,
      lastErrorAt: expect.any(String),
      lastErrorStatus: 401,
      lastError: "Device authorization failed for the requested target."
    });
    const serialized = JSON.stringify(server.getRuntimeStatus());
    expect(serialized).not.toContain("desk-token");
    expect(serialized).not.toContain("wall-token");
  });

  it("ignores unauthenticated and unknown-target device-route noise", async () => {
    const targets = ["desk", "wall"].map((id) => ({
      id,
      name: id,
      type: "local-web" as const,
      enabled: true,
      profile: "eink-bw" as const,
      width: 264,
      height: 176,
      inches: 2.7,
      defaultPage: "cards" as const,
      defaultLane: "" as const,
      refreshSeconds: 60,
      quietHoursStart: "",
      quietHoursEnd: "",
      token: `${id}-token`,
      capabilities: ["buttons"]
    }));
    const server = makeServer({
      getRestrictedAccessTokens: () => targets.map((target) => target.token),
      getPushTargets: () => targets
    });
    const unauthenticated = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/eink?targetId=desk", {}, {
        authorization: undefined
      }), unauthenticated);
    expect(unauthenticated.statusCode).toBe(401);
    expect(server.getRuntimeStatus().lastErrorAt).toBeUndefined();

    const unknownTarget = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/eink?targetId=unknown", {}, {
        authorization: "Bearer desk-token"
      }), unknownTarget);
    expect(unknownTarget.statusCode).toBe(401);
    expect(server.getRuntimeStatus().lastErrorAt).toBeUndefined();
  });

  it("records an authenticated cross-target button failure for a configured screen", async () => {
    const targets = ["desk", "wall"].map((id) => ({
      id,
      name: id,
      type: "local-web" as const,
      enabled: true,
      profile: "eink-bw" as const,
      width: 264,
      height: 176,
      inches: 2.7,
      defaultPage: "cards" as const,
      defaultLane: "" as const,
      refreshSeconds: 60,
      quietHoursStart: "",
      quietHoursEnd: "",
      token: `${id}-token`,
      capabilities: ["buttons"],
      buttonMappings: [{ button: "right", action: "next" as const, label: "Next" }]
    }));
    const server = makeServer({
      getRestrictedAccessTokens: () => targets.map((target) => target.token),
      getPushTargets: () => targets
    });
    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/device/events", {
        eventId: "cross-target-status",
        targetId: "wall",
        button: "right"
      }, {
        authorization: "Bearer desk-token"
      }), response);

    expect(response.statusCode).toBe(401);
    expect(server.getRuntimeStatus()).toMatchObject({
      lastErrorAt: expect.any(String),
      lastErrorStatus: 401,
      lastError: "Device authorization failed for the requested target."
    });
  });

  it("does not embed the External API token in a Bearer-authenticated device feed", async () => {
    const server = makeServer({
      getSettings: () => ({
        enabled: true,
        bindHost: "0.0.0.0",
        port: 48321,
        token: "header-only-secret",
        allowQueryTokenForRead: true,
        publicBaseUrl: "http://device-feed.local:48321"
      })
    });
    const response = new FakeResponse();

    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/device-feed?page=cards", {}, {
        authorization: "Bearer header-only-secret"
      }), response);

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(response.body).not.toContain("header-only-secret");
    expect(payload.screens[0].companionUrl).toBeUndefined();
    expect(payload.screens[0].items[0].answerUrl).toBeUndefined();
    expect(payload.screens[0].actions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ url: expect.stringContaining("token=") })
    ]));
  });

  it("preserves browser action links for an explicitly enabled query-token device feed", async () => {
    const server = makeServer({
      getSettings: () => ({
        enabled: true,
        bindHost: "127.0.0.1",
        port: 48321,
        token: "browser-query-secret",
        allowQueryTokenForRead: true,
        publicBaseUrl: "http://127.0.0.1:48321"
      })
    });
    const response = new FakeResponse();

    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest(
        "GET",
        "/api/v1/device-feed?page=cards&token=browser-query-secret",
        {},
        { authorization: undefined }
      ), response);

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload.screens[0].companionUrl).toContain("token=browser-query-secret");
    expect(payload.screens[0].items[0].answerUrl).toContain("token=browser-query-secret");
    expect(payload.screens[0].actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ url: expect.stringContaining("token=browser-query-secret") })
    ]));
  });

  it("records push feedback and context anchors", async () => {
    const calls: unknown[] = [];
    const server = makeServer({
      recordPushFeedback: async (input) => {
        calls.push(input);
      },
      recordContextAnchor: async (input) => {
        calls.push(input);
      }
    });

    const feedbackResponse = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/push/feedback", {
        targetId: "phone",
        candidateId: "oq_one",
        candidateType: "question",
        action: "opened-no-write",
        clientId: "mobile"
      }), feedbackResponse);

    const anchorResponse = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/context/anchors", {
        targetId: "phone",
        placeLabel: "desk",
        mode: "writing",
        preciseLocation: { latitude: 31.2, longitude: 121.5 }
      }), anchorResponse);

    expect(feedbackResponse.statusCode).toBe(200);
    expect(anchorResponse.statusCode).toBe(200);
    expect(calls).toEqual([
      {
        targetId: "phone",
        candidateId: "oq_one",
        candidateType: "question",
        action: "opened-no-write",
        note: undefined,
        clientId: "mobile"
      },
      {
        source: "device",
        targetId: "phone",
        deviceId: undefined,
        placeLabel: "desk",
        mode: "writing",
        activeFile: undefined,
        networkLabel: undefined,
        preciseLocation: { latitude: 31.2, longitude: 121.5, accuracy: undefined },
        ttlSeconds: undefined
      }
    ]);
  });

  it("rejects restricted tokens for push feed reads", async () => {
    const server = makeServer({
      getRestrictedAccessToken: () => "quote0-token",
      getPushFeed: () => {
        throw new Error("should not be called");
      }
    });
    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/push/feed?token=quote0-token", {}, {
        authorization: undefined
      }), response);

    expect(response.statusCode).toBe(401);
  });

  it("redirects static NFC device go links to the current card input", async () => {
    const server = makeServer({
      getRestrictedAccessToken: () => "quote0-token",
      getPushFeed: () => makePushFeed("desk"),
      getPushTargets: () => [{
        id: "desk",
        name: "Desk screen",
        type: "local-web",
        enabled: true,
        profile: "eink-bw",
        width: 264,
        height: 176,
        inches: 2.7,
        defaultPage: "cards",
        defaultLane: "",
        refreshSeconds: 60,
        quietHoursStart: "",
        quietHoursEnd: "",
        token: "quote0-token",
        capabilities: ["nfc", "input"]
      }]
    });

    const response = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/device/go?token=quote0-token&targetId=desk&intent=respond", {}, {
        authorization: undefined
      }), response);

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toContain("/device/input?");
    expect(response.headers.location).toContain("token=quote0-token");
    expect(response.headers.location).toContain("questionId=oq_one");
    expect(response.headers.location).toContain("targetId=desk");
    expect(response.headers.location).toContain("deliveryId=delivery_abc");
    expect(response.headers.location).toContain("sourceFile=note.md");
  });

  it("handles button events with restricted target tokens and keeps event ids idempotent", async () => {
    const calls: unknown[] = [];
    const server = makeServer({
      getRestrictedAccessTokens: () => ["desk-token"],
      getPushTargets: () => [{
        id: "desk",
        name: "Desk screen",
        type: "local-web",
        enabled: true,
        profile: "eink-bw",
        width: 264,
        height: 176,
        inches: 2.7,
        defaultPage: "cards",
        defaultLane: "",
        refreshSeconds: 60,
        quietHoursStart: "",
        quietHoursEnd: "",
        token: "desk-token",
        capabilities: ["buttons", "input"],
        buttonMappings: [{ button: "center", action: "respond", label: "Answer" }]
      }],
      getPushFeed: () => makePushFeed("desk"),
      recordPushFeedback: async (input) => {
        calls.push(input);
      }
    });

    const event = {
      eventId: "desk-1",
      targetId: "desk",
      deviceId: "small-screen-01",
      button: "center",
      occurredAt: "2026-07-09T12:00:00+08:00"
    };
    const first = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/device/events", event, { authorization: "Bearer desk-token" }), first);

    const duplicate = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/device/events", event, { authorization: "Bearer desk-token" }), duplicate);

    expect(first.statusCode).toBe(200);
    const body = JSON.parse(first.body);
    expect(body).toMatchObject({
      ok: true,
      duplicate: false,
      action: "respond",
      targetId: "desk",
      candidateId: "oq_one"
    });
    expect(body.openUrl).toBeUndefined();
    expect(first.body).not.toContain("desk-token");
    expect(JSON.parse(duplicate.body)).toMatchObject({ duplicate: true });
    expect(calls).toEqual([{
      targetId: "desk",
      candidateId: "oq_one",
      candidateType: "question",
      action: "opened",
      note: undefined,
      clientId: "small-screen-01",
      at: "2026-07-09T04:00:00.000Z"
    }]);
    expect(server.getRuntimeStatus()).toMatchObject({
      lastEventAt: expect.any(String),
      lastEventAction: "respond"
    });
  });

  it("binds scoped device tokens to their target for feeds and button events", async () => {
    const directions: string[] = [];
    const targets = ["desk", "wall"].map((id) => ({
      id,
      name: id,
      type: "local-web" as const,
      enabled: true,
      profile: "eink-bw" as const,
      width: 264,
      height: 176,
      inches: 2.7,
      defaultPage: "cards" as const,
      defaultLane: "" as const,
      refreshSeconds: 60,
      quietHoursStart: "",
      quietHoursEnd: "",
      token: `${id}-token`,
      capabilities: ["buttons"],
      buttonMappings: [{ button: "right", action: "next" as const, label: "Next" }]
    }));
    const server = makeServer({
      getRestrictedAccessTokens: () => targets.map((target) => target.token),
      getPushTargets: () => targets,
      getEinkPayload: (_limit, _cursor) => ({
        schemaVersion: 2,
        generatedAt: "2026-07-23T00:00:00.000Z",
        summary: { open: 0, candidate: 0, blockedArticles: 0 },
        focus: []
      }),
      advanceDevicePage: async (direction) => {
        directions.push(direction);
      }
    });

    const allowedFeed = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/eink?targetId=desk&limit=1", {}, {
        authorization: "Bearer desk-token"
      }), allowedFeed);
    expect(allowedFeed.statusCode).toBe(200);

    const deniedFeed = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", "/api/v1/eink?targetId=wall&limit=1", {}, {
        authorization: "Bearer desk-token"
      }), deniedFeed);
    expect(deniedFeed.statusCode).toBe(401);

    const deniedEvent = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/device/events", {
        eventId: "cross-target",
        targetId: "wall",
        button: "right"
      }, { authorization: "Bearer desk-token" }), deniedEvent);
    expect(deniedEvent.statusCode).toBe(401);
    expect(directions).toEqual([]);
  });

  it("requires an exact display ACK before schema-v2 gestures can open Obsidian", async () => {
    const executed: string[] = [];
    const target = {
      id: "desk",
      name: "Desk",
      type: "local-web" as const,
      enabled: true,
      profile: "eink-bw" as const,
      width: 264,
      height: 176,
      inches: 2.7,
      defaultPage: "cards" as const,
      defaultLane: "" as const,
      refreshSeconds: 60,
      quietHoursStart: "",
      quietHoursEnd: "",
      token: "desk-token",
      capabilities: ["buttons"],
      buttonMappings: [{ button: "center", action: "respond" as const, label: "Legacy" }]
    };
    const server = makeServer({
      getRestrictedAccessTokens: () => ["desk-token"],
      getPushTargets: () => [target],
      getEinkPayload: () => ({
        schemaVersion: 2,
        generatedAt: "2026-07-23T00:00:00.000Z",
        summary: { open: 1, candidate: 0, blockedArticles: 0 },
        focus: [{
          id: "daily-overview:2026-07-23",
          title: "Today",
          body: "Write",
          question: "Write",
          article: "Daily Plan",
          lane: "write",
          kind: "other"
        }],
        playlist: {
          order: "daily_then_echo_then_questions",
          cursor: 0,
          total: 1,
          queueTotal: 0,
          currentInQueue: false,
          currentIndex: -1,
          currentPosition: 0,
          currentId: "daily-overview:2026-07-23",
          nextCursor: 0,
          previousCursor: 0,
          selectedId: "daily-overview:2026-07-23",
          revision: "einkrev_overview",
          stateVersion: 4
        }
      }),
      acknowledgeDeviceDisplay: async () => undefined,
      handleDeviceGesture: async (event) => {
        executed.push(event.eventId);
        return { status: "executed", action: "start_open", displayMessage: "Opened" };
      }
    });
    const handle = server as unknown as {
      handleRequest(request: FakeRequest, response: FakeResponse): Promise<void>;
    };
    const poll = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("GET", "/api/v1/eink?targetId=desk", {}, { authorization: "Bearer desk-token" }),
      poll
    );
    const desired = JSON.parse(poll.body).playlist.desired as Record<string, unknown>;
    expect(desired).toMatchObject({
      deviceId: "desk",
      cardId: "daily-overview:2026-07-23",
      stateVersion: 4,
      playlistRevision: "einkrev_overview"
    });

    const event = {
      schemaVersion: 2,
      eventId: "evt_primary_single",
      targetId: "desk",
      ...desired,
      button: "primary",
      gesture: "single"
    };
    const beforeAck = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/device/events", event, { authorization: "Bearer desk-token" }),
      beforeAck
    );
    expect(beforeAck.statusCode).toBe(409);
    expect(executed).toEqual([]);

    const ack = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/device/display-acks", {
        eventId: "evt_display_ack",
        ...desired
      }, { authorization: "Bearer desk-token" }),
      ack
    );
    expect(ack.statusCode).toBe(200);

    const first = new FakeResponse();
    const duplicate = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/device/events", event, { authorization: "Bearer desk-token" }),
      first
    );
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/device/events", event, { authorization: "Bearer desk-token" }),
      duplicate
    );
    expect(JSON.parse(first.body)).toMatchObject({
      action: "start_open",
      commandStatus: "executed",
      displayMessage: "Opened",
      duplicate: false
    });
    expect(JSON.parse(duplicate.body)).toMatchObject({ duplicate: true });
    expect(executed).toEqual(["evt_primary_single"]);

    const stale = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/device/events", {
        ...event,
        eventId: "evt_stale",
        selectionId: "sel_local_00000000000000000000000000000000"
      }, { authorization: "Bearer desk-token" }),
      stale
    );
    expect(stale.statusCode).toBe(409);
    expect(executed).toEqual(["evt_primary_single"]);

    const legacy = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/device/events", {
        eventId: "evt_legacy",
        targetId: "desk",
        button: "center"
      }, { authorization: "Bearer desk-token" }),
      legacy
    );
    expect(legacy.statusCode).toBe(200);
    expect(executed).toEqual(["evt_primary_single"]);
  });

  it("replays a persisted terminal schema-v2 result after displayed state changes, but blocks a new stale event", async () => {
    const target = {
      id: "desk",
      name: "Desk",
      type: "local-web" as const,
      enabled: true,
      profile: "eink-bw" as const,
      width: 264,
      height: 176,
      inches: 2.7,
      defaultPage: "cards" as const,
      defaultLane: "" as const,
      refreshSeconds: 60,
      quietHoursStart: "",
      quietHoursEnd: "",
      token: "desk-token",
      capabilities: ["buttons"],
      buttonMappings: []
    };
    const executed: string[] = [];
    const current = {
      deviceId: "desk",
      selectionId: "sel_local_newnewnewnewnewnewnewnewnewn",
      stateVersion: 9,
      contentId: "cnt_local_newnewnewnewnewnewnewnewnewn",
      revisionId: "rev_local_newnewnewnewnewnewnewnewnewn",
      cardId: "daily-plan:daily_new",
      playlistRevision: "einkrev_new"
    };
    const oldEvent = {
      schemaVersion: 2,
      eventId: "evt_persisted_replay",
      targetId: "desk",
      deviceId: "desk",
      selectionId: "sel_local_oldoldoldoldoldoldoldoldoldo",
      stateVersion: 4,
      contentId: "cnt_local_oldoldoldoldoldoldoldoldoldo",
      revisionId: "rev_local_oldoldoldoldoldoldoldoldoldo",
      cardId: "daily-plan:daily_old",
      playlistRevision: "einkrev_old",
      button: "primary",
      gesture: "single"
    };
    const server = makeServer({
      getRestrictedAccessTokens: () => ["desk-token"],
      getPushTargets: () => [target],
      getDeviceDisplayedTuple: () => current,
      resolveDeviceGestureReplay: (event) => event.eventId === oldEvent.eventId
        ? { status: "executed", action: "open_current", displayMessage: "Already opened" }
        : undefined,
      handleDeviceGesture: async (event) => {
        executed.push(event.eventId);
        return { status: "executed", displayMessage: "Opened" };
      }
    });
    const handle = server as unknown as {
      handleRequest(request: FakeRequest, response: FakeResponse): Promise<void>;
    };
    const replay = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/device/events", oldEvent, { authorization: "Bearer desk-token" }),
      replay
    );
    expect(replay.statusCode).toBe(200);
    expect(JSON.parse(replay.body)).toMatchObject({
      commandStatus: "executed",
      displayMessage: "Already opened",
      cardId: oldEvent.cardId
    });

    const staleNew = new FakeResponse();
    await handle.handleRequest(
      new FakeRequest("POST", "/api/v1/device/events", {
        ...oldEvent,
        eventId: "evt_new_stale"
      }, { authorization: "Bearer desk-token" }),
      staleNew
    );
    expect(staleNew.statusCode).toBe(409);
    expect(executed).toEqual([]);
  });

  it("coalesces concurrent retries so one event advances only once", async () => {
    let releaseAdvance: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseAdvance = resolve;
    });
    let advances = 0;
    const target = {
      id: "desk",
      name: "Desk",
      type: "local-web" as const,
      enabled: true,
      profile: "eink-bw" as const,
      width: 264,
      height: 176,
      inches: 2.7,
      defaultPage: "cards" as const,
      defaultLane: "" as const,
      refreshSeconds: 60,
      quietHoursStart: "",
      quietHoursEnd: "",
      token: "desk-token",
      capabilities: ["buttons"],
      buttonMappings: [{ button: "right", action: "next" as const, label: "Next" }]
    };
    const server = makeServer({
      getRestrictedAccessTokens: () => ["desk-token"],
      getPushTargets: () => [target],
      advanceDevicePage: async () => {
        advances += 1;
        await gate;
      }
    });
    const body = { eventId: "same-event", targetId: "desk", button: "right" };
    const first = new FakeResponse();
    const second = new FakeResponse();
    const handle = server as unknown as {
      handleRequest(request: FakeRequest, response: FakeResponse): Promise<void>;
    };
    const firstRequest = handle.handleRequest(
      new FakeRequest("POST", "/api/v1/device/events", body, { authorization: "Bearer desk-token" }),
      first
    );
    await Promise.resolve();
    await Promise.resolve();
    const secondRequest = handle.handleRequest(
      new FakeRequest("POST", "/api/v1/device/events", body, { authorization: "Bearer desk-token" }),
      second
    );
    releaseAdvance?.();
    await Promise.all([firstRequest, secondRequest]);

    expect(advances).toBe(1);
    expect([JSON.parse(first.body).duplicate, JSON.parse(second.body).duplicate].sort()).toEqual([false, true]);
  });

  it("advances the shared small-screen playlist for right and left button events", async () => {
    const directions: string[] = [];
    const server = makeServer({
      getRestrictedAccessTokens: () => ["desk-token"],
      getPushTargets: () => [{
        id: "desk",
        name: "Desk screen",
        type: "local-web",
        enabled: true,
        profile: "eink-bw",
        width: 264,
        height: 176,
        inches: 2.7,
        defaultPage: "cards",
        defaultLane: "",
        refreshSeconds: 60,
        quietHoursStart: "",
        quietHoursEnd: "",
        token: "desk-token",
        capabilities: ["buttons"],
        buttonMappings: [
          { button: "right", action: "next", label: "Next" },
          { button: "left", action: "prev", label: "Previous" }
        ]
      }],
      getPushFeed: () => makePushFeed("desk"),
      advanceDevicePage: async (direction) => {
        directions.push(direction);
      }
    });

    for (const [eventId, button] of [["page-1", "right"], ["page-2", "left"]] as const) {
      const response = new FakeResponse();
      await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
        .handleRequest(new FakeRequest("POST", "/api/v1/device/events", {
          eventId,
          targetId: "desk",
          button
        }, { authorization: "Bearer desk-token" }), response);
      expect(response.statusCode).toBe(200);
    }

    expect(directions).toEqual(["next", "prev"]);
  });

  it("creates short handoff links that resolve without exposing the long token", async () => {
    const server = makeServer({
      getRestrictedAccessTokens: () => ["desk-token"],
      getPushTargets: () => [{
        id: "desk",
        name: "Desk screen",
        type: "local-web",
        enabled: true,
        profile: "eink-bw",
        width: 264,
        height: 176,
        inches: 2.7,
        defaultPage: "cards",
        defaultLane: "",
        refreshSeconds: 60,
        quietHoursStart: "",
        quietHoursEnd: "",
        token: "desk-token",
        capabilities: ["handoff", "input"]
      }],
      getPushFeed: () => makePushFeed("desk")
    });

    const create = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("POST", "/api/v1/device/handoffs", {
        targetId: "desk",
        intent: "capture",
        candidateId: "oq_one",
        ttlSeconds: 120
      }, { authorization: "Bearer desk-token" }), create);

    const created = JSON.parse(create.body);
    expect(create.statusCode).toBe(201);
    expect(created.url).toContain("/device/go?handoff=");
    expect(created.url).not.toContain("desk-token");

    const handoffPath = new URL(created.url).pathname + new URL(created.url).search;
    const follow = new FakeResponse();
    await (server as unknown as { handleRequest(request: FakeRequest, response: FakeResponse): Promise<void> })
      .handleRequest(new FakeRequest("GET", handoffPath, {}, { authorization: undefined }), follow);

    expect(follow.statusCode).toBe(302);
    expect(follow.headers.location).toContain("/device/input?");
    expect(follow.headers.location).toContain("token=desk-token");
    expect(follow.headers.location).toContain("intent=capture");
  });
});

function makePushFeed(targetId: string): PushFeedPayload {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-09T04:00:00.000Z",
    target: {
      id: targetId,
      name: "Desk screen",
      type: "local-web",
      profile: "eink-bw",
      width: 264,
      height: 176,
      inches: 2.7,
      capabilities: ["input"]
    },
    privacy: {
      level: "local-coarse",
      preciseLocationIncluded: false
    },
    context: {
      timeBucket: "noon"
    },
    decision: {
      candidateId: "oq_one",
      candidateType: "question",
      deliveryId: "delivery_abc",
      score: 30,
      reason: "test",
      quiet: false
    },
    display: {
      variant: "question",
      icon: "?",
      title: "Old title",
      primary: "Old body",
      secondaryLines: [],
      metrics: [],
      badges: ["ToThink"],
      footer: "Think",
      link: "http://127.0.0.1:48321/device/input?token=desk-token&questionId=oq_one",
      titleText: "? Old title",
      message: "Old body",
      signature: "Think",
      actions: []
    },
    candidate: {
      id: "oq_one",
      type: "question",
      title: "Old title",
      body: "Old body",
      sourceFile: "note.md",
      sourceRef: {
        vaultName: "Vault",
        filePath: "note.md",
        lineStart: 1,
        lineEnd: 1
      },
      lane: "think",
      status: "open",
      tags: [],
      openUri: "obsidian://open?vault=Vault&file=note.md",
      answerUrl: "http://127.0.0.1:48321/device/input?token=desk-token&questionId=oq_one",
      questionId: "oq_one"
    }
  };
}

function makeServer(overrides: Partial<ConstructorParameters<typeof ToWriteExternalApiServer>[0]> = {}): ToWriteExternalApiServer {
  return new ToWriteExternalApiServer({
    pluginVersion: "0.1.0",
    getSettings: () => ({
      enabled: true,
      bindHost: "127.0.0.1",
      port: 48321,
      token: "secret",
      allowQueryTokenForRead: true,
      publicBaseUrl: ""
    }),
    getVaultName: () => "Vault",
    getQuestions: () => [question],
    getArticleSummaries: () => [],
    getWorkflowPayload: () => ({
      schemaVersion: 1,
      generatedAt: "2026-06-29T00:00:00.000Z",
      vaultName: "Vault",
      enabled: false,
      counts: { stages: 0, uniqueFiles: 0 },
      stages: []
    }),
    getWorkflowSummary: () => ({
      enabled: false,
      stageCount: 0,
      uniqueFiles: 0,
      stages: []
    }),
    getDeviceCaptureSettings: () => ({
      enabled: true,
      inboxFile: "00-Raw/Device Inbox.md",
      targetFolders: ["01-Sparks"],
      defaultTags: ["capture", "device"],
      appendHeading: "Captures",
      localRecommendations: true,
      includeFolders: [],
      excludeFolders: [],
      excludeTags: [],
      excludeFrontmatter: []
    }),
    getStatusOptions: () => [{ id: "open", label: "Open" }],
    updateQuestionStatus: async () => question,
    appendQuestionNote: async () => question,
    updateQuestionFields: async (_id, patch) => ({ ...question, ...patch }),
    createDeviceCapture: async (request) => ({
      filePath: "00-Raw/Device Inbox.md",
      title: request.title || "Quick idea",
      tags: request.tags,
      targetKind: request.target?.kind ?? "inboxFile",
      createdAt: "2026-06-30T00:00:00.000Z",
      openUri: "obsidian://open?vault=Vault&file=00-Raw%2FDevice%20Inbox.md"
    }),
    subscribe: () => () => undefined,
    ...overrides
  });
}

function makeNormalizationPreview(date = "2026-07-24"): DailyPlanNormalizationPreview {
  return {
    schemaVersion: 1,
    date,
    source: { kind: "daily-note", dailyRoot: "Daily" },
    sourcePath: `Daily/${date}.md`,
    expectedRevision: "plan_revision_before",
    groups: [],
    tasks: [],
    diagnostics: [],
    edits: [{
      line: 5,
      kind: "plain-leaf",
      before: "   - 记录结构问题",
      after: "   - [ ] 记录结构问题 ^daily_0123456789abcdef0123456789abcdef",
      proposedBlockId: "daily_0123456789abcdef0123456789abcdef",
      taskText: "记录结构问题",
      lineageRevision: "lineage_revision_1",
      targetResolution: {
        source: "ancestor-link",
        target: {
          kind: "wikilink",
          raw: "[[创作辅助工具电子屏幕硬件-软硬件系统设计]]",
          linkText: "创作辅助工具电子屏幕硬件-软硬件系统设计"
        },
        displayLabel: "创作辅助工具电子屏幕硬件-软硬件系统设计",
        lineageRevision: "lineage_revision_1"
      }
    }],
    changed: true,
    diff: "-   - 记录结构问题\n+   - [ ] 记录结构问题 ^daily_0123456789abcdef0123456789abcdef"
  };
}

function makeDailyItem(status: DailyPlanItem["status"]): DailyPlanItem {
  return {
    schemaVersion: 1,
    id: "daily_one",
    blockId: "daily_one",
    date: "2026-07-24",
    text: "记录结构问题",
    kind: "edit_note",
    status,
    done: status === "done",
    sourcePath: "Daily/2026-07-24.md",
    line: 5,
    rawLine: `- [${status === "done" ? "x" : status === "in-progress" ? "/" : " "}] 记录结构问题 ^daily_one`,
    revision: {
      value: status === "in-progress" ? "task_revision_running" : "task_revision_paused",
      sourcePath: "Daily/2026-07-24.md",
      blockId: "daily_one"
    },
    scheduledDate: "2026-07-24",
    dueDate: "2026-07-24",
    devicePolicy: "rotation",
    tags: [],
    linkedNotes: []
  };
}

function makeTimingSnapshot(
  status: DailyTaskTimingSnapshot["status"],
  timingRevision = "timer_revision_1"
): DailyTaskTimingSnapshot {
  return {
    schemaVersion: 1,
    taskId: "daily_one",
    status,
    activeMs: 15 * 60_000,
    wallMs: 30 * 60_000,
    interruptionCount: 1,
    firstStartedAt: "2026-07-24T09:00:00.000+08:00",
    lastTransitionAt: "2026-07-24T09:30:00.000+08:00",
    estimateMinutes: 20,
    estimateDeltaMinutes: -5,
    dailyActiveMs: { "2026-07-24": 15 * 60_000 },
    needsReview: false,
    reviewReasons: [],
    timingRevision
  };
}

class FakeRequest {
  readonly headers: Record<string, string | undefined> = {
    authorization: "Bearer secret",
    host: "127.0.0.1:48321"
  };
  private readonly body: string;

  constructor(
    readonly method: string,
    readonly url: string,
    body: Record<string, unknown>,
    headers: Record<string, string | undefined> = {}
  ) {
    this.body = JSON.stringify(body);
    Object.assign(this.headers, headers);
  }

  on(event: "data" | "end" | "error", listener: (chunk?: Uint8Array | string | Error) => void): void {
    if (event === "data") {
      queueMicrotask(() => listener(this.body));
    }
    if (event === "end") {
      queueMicrotask(() => listener());
    }
  }
}

class FakeResponse {
  statusCode = 0;
  readonly headers: Record<string, string> = {};
  body = "";

  setHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  writeHead(statusCode: number, headers: Record<string, string>): void {
    this.statusCode = statusCode;
    Object.assign(this.headers, headers);
  }

  write(chunk: string): void {
    this.body += chunk;
  }

  end(chunk = ""): void {
    this.body += chunk;
  }

  on(): void {
    // Test response never emits close.
  }
}
