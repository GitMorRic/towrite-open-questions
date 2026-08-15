export function buildDeviceInputPageHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#111111" />
    <title>ToWrite 输入</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
        background: #f4f1e8;
        color: #111;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        min-height: 100dvh;
        background: #f4f1e8;
      }
      .shell {
        width: min(720px, 100%);
        margin: 0 auto;
        padding: max(18px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
        display: grid;
        gap: 14px;
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: baseline;
        border-bottom: 2px solid #111;
        padding-bottom: 10px;
      }
      h1, h2, p { margin: 0; }
      h1 { font-size: 24px; line-height: 1.1; }
      .muted { color: #555; font-size: 13px; line-height: 1.35; }
      .panel {
        border: 2px solid #111;
        border-radius: 8px;
        background: #fffdf6;
        padding: 14px;
        display: grid;
        gap: 12px;
      }
      .question {
        border-left: 6px solid #1f5d8c;
        padding-left: 10px;
      }
      .question.think { border-left-color: #9a6a00; }
      .question h2 { font-size: 18px; line-height: 1.2; }
      .row {
        display: grid;
        gap: 6px;
      }
      label {
        font-size: 13px;
        font-weight: 700;
        color: #333;
      }
      input,
      select,
      textarea {
        width: 100%;
        border: 2px solid #111;
        border-radius: 7px;
        background: #fff;
        color: #111;
        padding: 10px 11px;
        font: inherit;
      }
      textarea {
        min-height: 180px;
        resize: vertical;
        line-height: 1.5;
      }
      .toolbar {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      button,
      a.button {
        min-height: 42px;
        border: 2px solid #111;
        border-radius: 7px;
        background: #111;
        color: #fffdf6;
        font: inherit;
        font-weight: 800;
        text-decoration: none;
        display: inline-grid;
        place-items: center;
      }
      button.secondary,
      a.button.secondary {
        background: #fffdf6;
        color: #111;
      }
      button[disabled] {
        opacity: 0.5;
      }
      .status {
        min-height: 22px;
        font-size: 13px;
        color: #333;
      }
      .success {
        color: #1f6b3a;
        font-weight: 700;
      }
      .error {
        color: #a32929;
        font-weight: 700;
      }
      .route-preview {
        border-left: 4px solid #1f6b3a;
        background: #edf6ee;
        padding: 9px 10px;
        border-radius: 5px;
      }
      .recording {
        background: #9b2424 !important;
      }
      audio { width: 100%; }
      @media (max-width: 480px) {
        .toolbar { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header>
        <div>
          <h1>ToWrite 输入</h1>
          <p class="muted" id="subtitle">连接中...</p>
        </div>
        <a class="button secondary" id="backLink" href="/device">小屏</a>
      </header>

      <section class="panel" id="questionPanel" hidden></section>

      <section class="panel">
        <div class="row" id="modeRow">
          <label for="mode">记录方式</label>
          <select id="mode">
            <option value="answer">回答当前卡片</option>
            <option value="capture">保存为新想法</option>
          </select>
        </div>
        <div class="row" id="titleRow">
          <label for="title">标题</label>
          <input id="title" placeholder="可选；留空时自动取正文开头" />
        </div>
        <div class="row">
          <label for="text">内容</label>
          <textarea id="text" placeholder="写下回答、批注、灵感，或用语音输入。"></textarea>
        </div>
        <div class="row capture-only">
          <label for="target">保存位置</label>
          <select id="target"></select>
        </div>
        <div class="row capture-only">
          <label for="tags">Tags</label>
          <input id="tags" placeholder="capture, device" />
        </div>
        <div class="row capture-only">
          <label for="category">待办分类</label>
          <input id="category" placeholder="例如：项目、创作、稍后阅读和记录" />
        </div>
        <div class="row capture-only">
          <label for="route">确认后的处理方式</label>
          <select id="route">
            <option value="append_note">追加到笔记</option>
            <option value="create_todo">创建工作池待办</option>
            <option value="agent_request">交给 Agent（再次确认后执行）</option>
          </select>
          <p class="muted route-preview" id="routePreview">输入内容后显示最终写入预览。</p>
        </div>
        <audio id="audioPreview" controls hidden></audio>
        <div class="toolbar">
          <button class="secondary" id="voice" type="button">开始录音</button>
          <button class="secondary" id="dictate" type="button">语音转文字</button>
          <button id="submit" type="button">提交</button>
        </div>
        <button id="approveAgent" type="button" hidden>确认并执行 Agent 提案</button>
        <div class="toolbar" id="handoffActions" hidden>
          <button class="secondary" id="later" type="button">稍后 30 分钟</button>
          <button id="complete" type="button">安全完成</button>
        </div>
        <p class="status" id="status"></p>
      </section>
    </main>

    <script>
      const params = new URLSearchParams(location.search);
      const handoff = params.get("handoff") || "";
      const token = params.get("token") || localStorage.getItem("towrite-device-token") || "";
      if (token) {
        localStorage.setItem("towrite-device-token", token);
      }
      if (params.has("token")) {
        params.delete("token");
        const cleanQuery = params.toString();
        history.replaceState(null, "", location.pathname + (cleanQuery ? "?" + cleanQuery : "") + location.hash);
      }
      let questionId = params.get("questionId") || "";
      const interaction = {
        targetId: params.get("targetId") || "",
        candidateId: params.get("candidateId") || "",
        deliveryId: params.get("deliveryId") || "",
        sourceFile: params.get("sourceFile") || "",
        sourceLine: params.get("sourceLine") || "",
        sourceEndLine: params.get("sourceEndLine") || "",
        sourceBlockId: params.get("sourceBlockId") || "",
        sourcePage: params.get("sourcePage") || "",
        intent: params.get("intent") || ""
      };
      const subtitleEl = document.getElementById("subtitle");
      const questionPanelEl = document.getElementById("questionPanel");
      const modeEl = document.getElementById("mode");
      const modeRowEl = document.getElementById("modeRow");
      const titleRowEl = document.getElementById("titleRow");
      const titleEl = document.getElementById("title");
      const textEl = document.getElementById("text");
      const targetEl = document.getElementById("target");
      const tagsEl = document.getElementById("tags");
      const categoryEl = document.getElementById("category");
      const routeEl = document.getElementById("route");
      const routePreviewEl = document.getElementById("routePreview");
      const voiceEl = document.getElementById("voice");
      const dictateEl = document.getElementById("dictate");
      const audioPreviewEl = document.getElementById("audioPreview");
      const submitEl = document.getElementById("submit");
      const approveAgentEl = document.getElementById("approveAgent");
      const handoffActionsEl = document.getElementById("handoffActions");
      const laterEl = document.getElementById("later");
      const completeEl = document.getElementById("complete");
      const statusEl = document.getElementById("status");
      const backLinkEl = document.getElementById("backLink");
      let context = null;
      let recognition = null;
      let mediaRecorder = null;
      let mediaStream = null;
      let mediaChunks = [];
      let recordedAudio = null;
      let recordedMimeType = "";
      let recordedAudioUrl = "";
      let recordingTimer = 0;
      let pendingAgentRunId = "";
      let recommendationTimer = 0;
      let routingTimer = 0;
      let captureDraftId = newCaptureId();

      function h(value) {
        return String(value == null ? "" : value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      async function loadContext() {
        if (!token && !handoff) {
          setStatus("URL 缺少 token。", true);
          submitEl.disabled = true;
          return;
        }
        backLinkEl.href = "/device";
        const query = new URLSearchParams();
        if (questionId) query.set("questionId", questionId);
        for (const key of Object.keys(interaction)) {
          if (interaction[key]) query.set(key, interaction[key]);
        }
        if (handoff) query.set("handoff", handoff);
        const response = await fetch("/api/v1/device-input-context?" + query.toString(), {
          cache: "no-store",
          headers: authorizationHeaders()
        });
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        context = await response.json();
        if (context.question && context.question.id) questionId = context.question.id;
        if (context.interaction) {
          interaction.targetId = context.interaction.targetId || interaction.targetId;
          interaction.candidateId = context.interaction.candidateId || interaction.candidateId;
          interaction.deliveryId = context.interaction.deliveryId || interaction.deliveryId;
          interaction.intent = context.interaction.intent || interaction.intent;
          const source = context.interaction.sourceRef || {};
          interaction.sourceFile = source.filePath || interaction.sourceFile;
          interaction.sourceLine = source.lineStart || interaction.sourceLine;
          interaction.sourceEndLine = source.lineEnd || interaction.sourceEndLine;
          interaction.sourceBlockId = source.blockId || interaction.sourceBlockId;
          interaction.sourcePage = source.page || interaction.sourcePage;
        }
        renderContext();
        await restorePendingSubmission();
      }

      function renderContext() {
        subtitleEl.textContent = questionId ? "回答卡片" : "快速记录新想法";
        if (context.question) {
          const laneClass = context.question.lane === "think" ? "think" : "write";
          questionPanelEl.hidden = false;
          questionPanelEl.className = "panel question " + laneClass;
          questionPanelEl.innerHTML =
            "<h2>" + h(context.question.title) + "</h2>" +
            "<p class='muted'>" + h(context.question.lane === "think" ? "ToThink" : "ToWrite") + " · " + h(context.question.status) + " · " + h(context.question.source) + "</p>";
          modeEl.value = "answer";
        } else {
          questionPanelEl.hidden = true;
          modeEl.value = "capture";
          modeRowEl.hidden = true;
        }
        tagsEl.value = (context.capture.defaultTags || []).join(", ");
        const allowedActions = context.interaction && context.interaction.handoff
          ? context.interaction.handoff.allowedActions || []
          : [];
        handoffActionsEl.hidden = allowedActions.length === 0;
        laterEl.hidden = !allowedActions.includes("later");
        completeEl.hidden = !allowedActions.includes("complete");
        renderTargets();
        syncMode();
        setupVoice();
      }

      function renderTargets() {
        targetEl.innerHTML = "";
        for (const target of context.capture.targets || []) {
          const option = document.createElement("option");
          option.value = JSON.stringify({ target: target.value });
          option.textContent = target.label;
          targetEl.appendChild(option);
        }
      }

      function newCaptureId() {
        const fragment = window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID().replace(/-/g, "")
          : Date.now().toString(36) + Math.random().toString(36).slice(2);
        return "capture_" + fragment;
      }

      function scheduleRecommendations() {
        window.clearTimeout(recommendationTimer);
        if (modeEl.value !== "capture" || !textEl.value.trim()) return;
        recommendationTimer = window.setTimeout(function() {
          refreshRecommendations().catch(function() { /* keep configured fallback targets */ });
        }, 220);
        scheduleRoutingPreview();
      }

      function scheduleRoutingPreview() {
        window.clearTimeout(routingTimer);
        if (modeEl.value !== "capture" || (!textEl.value.trim() && !recordedAudio)) return;
        routingTimer = window.setTimeout(function() {
          refreshRoutingPreview().catch(function(error) {
            routePreviewEl.textContent = "预览失败：" + (error.message || error);
          });
        }, 260);
      }

      async function refreshRoutingPreview() {
        const text = textEl.value.trim() || (recordedAudio ? "语音记录（待转写）" : "");
        if (!text || modeEl.value !== "capture") return;
        const preview = await postJson("/api/v1/capture/route-preview", routePayload(text));
        const routes = Array.isArray(preview.routes) ? preview.routes : [];
        const selected = routes.find(function(route) { return route.kind === routeEl.value; }) || routes[0];
        if (!selected) return;
        routeEl.value = selected.kind;
        routePreviewEl.textContent = selected.label + " → " + selected.targetLabel + "。" + selected.description;
      }

      async function refreshRecommendations() {
        const text = textEl.value.trim();
        if (!text || modeEl.value !== "capture") return;
        const result = await postJson("/api/v1/capture/recommendations", {
          draft: {
            schemaVersion: 1,
            id: captureDraftId,
            intent: "new",
            body: text,
            title: titleEl.value.trim(),
            tags: splitTags(tagsEl.value),
            links: [],
            source: {
              file: interaction.sourceFile || "",
              entryPoint: "device"
            }
          }
        });
        const candidates = Array.isArray(result.candidates) ? result.candidates : [];
        if (!candidates.length) return;
        targetEl.innerHTML = "";
        candidates.slice(0, 3).forEach(function(candidate) {
          const target = candidate.kind === "existingNote"
            ? { kind: "existingNote", filePath: candidate.path, heading: candidate.heading || "" }
            : candidate.kind === "folder"
              ? { kind: "folderPath", folderPath: candidate.path }
              : { kind: "inboxFile", inboxFile: candidate.path };
          const option = document.createElement("option");
          option.value = JSON.stringify({
            target,
            candidateId: candidate.id,
            action: candidate.action,
            targetRevision: candidate.targetRevision
          });
          option.textContent = (candidate.kind === "existingNote" ? "追加：" : candidate.kind === "folder" ? "新建：" : "Inbox：")
            + candidate.path + " · " + candidate.confidence + " · " + candidate.reason;
          targetEl.appendChild(option);
        });
      }

      function syncMode() {
        const capture = modeEl.value === "capture";
        titleRowEl.hidden = !capture;
        document.querySelectorAll(".capture-only").forEach(function(element) {
          element.hidden = !capture;
        });
        submitEl.textContent = capture ? "保存新想法" : "追加到卡片";
      }

      function setupVoice() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
          dictateEl.textContent = "听写不可用";
          dictateEl.disabled = true;
        } else {
          recognition = new SpeechRecognition();
          recognition.lang = "zh-CN";
          recognition.interimResults = false;
          recognition.continuous = false;
          recognition.onresult = function(event) {
            const text = Array.from(event.results)
              .map(function(result) { return result[0] && result[0].transcript ? result[0].transcript : ""; })
              .join("");
            appendText(text);
            scheduleRecommendations();
          };
          recognition.onerror = function(event) {
            setStatus("语音转文字失败：" + (event.error || "unknown") + "；仍可保存原始录音。", true);
          };
        }
        if (!navigator.mediaDevices || !window.MediaRecorder) {
          voiceEl.textContent = "录音不可用";
          voiceEl.disabled = true;
        }
      }

      async function toggleRecording() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
          mediaRecorder.stop();
          return;
        }
        if (!navigator.mediaDevices || !window.MediaRecorder) return;
        clearRecordedAudio();
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
        });
        const preferred = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"]
          .find(function(type) { return MediaRecorder.isTypeSupported(type); });
        const options = { audioBitsPerSecond: 24000 };
        if (preferred) options.mimeType = preferred;
        mediaChunks = [];
        mediaRecorder = new MediaRecorder(mediaStream, options);
        mediaRecorder.ondataavailable = function(event) {
          if (event.data && event.data.size) mediaChunks.push(event.data);
        };
        mediaRecorder.onerror = function(event) {
          setStatus("录音失败：" + (event.error && event.error.message ? event.error.message : "unknown"), true);
          stopMediaTracks();
        };
        mediaRecorder.onstop = function() {
          window.clearTimeout(recordingTimer);
          recordedMimeType = mediaRecorder.mimeType || preferred || "audio/webm";
          recordedAudio = new Blob(mediaChunks, { type: recordedMimeType });
          stopMediaTracks();
          voiceEl.textContent = "重新录音";
          voiceEl.classList.remove("recording");
          if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
          recordedAudioUrl = URL.createObjectURL(recordedAudio);
          audioPreviewEl.src = recordedAudioUrl;
          audioPreviewEl.hidden = false;
          setStatus("原始录音已保存在本机，提交后写入 Markdown 附件。", false);
          scheduleRoutingPreview();
        };
        mediaRecorder.start(1000);
        voiceEl.textContent = "停止录音";
        voiceEl.classList.add("recording");
        setStatus("正在录音，最长 45 秒…", false);
        recordingTimer = window.setTimeout(function() {
          if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
        }, 45000);
      }

      function stopMediaTracks() {
        if (mediaStream) mediaStream.getTracks().forEach(function(track) { track.stop(); });
        mediaStream = null;
      }

      function clearRecordedAudio() {
        recordedAudio = null;
        recordedMimeType = "";
        mediaChunks = [];
        audioPreviewEl.hidden = true;
        audioPreviewEl.removeAttribute("src");
        if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
        recordedAudioUrl = "";
      }

      function appendText(text) {
        if (!text) return;
        const prefix = textEl.value.trim() ? "\\n" : "";
        textEl.value = textEl.value + prefix + text.trim();
      }

      async function submit() {
        const text = textEl.value.trim() || (recordedAudio ? "语音记录（待转写）" : "");
        if (!text) {
          setStatus("请先输入文字或录音。", true);
          return;
        }
        if (modeEl.value === "answer" && recordedAudio) {
          setStatus("原始录音需要保存为新记录；请切换到“保存为新想法”，或先使用语音转文字。", true);
          return;
        }
        submitEl.disabled = true;
        setStatus("正在提交...");
        let pendingRequest = null;
        try {
          if (modeEl.value === "answer" && questionId) {
            pendingRequest = {
              path: "/api/v1/questions/" + encodeURIComponent(questionId) + "/notes",
              payload: {
                text,
                clientId: "device-input",
                metadata: interactionMetadata("answer")
              }
            };
            await postJson(pendingRequest.path, pendingRequest.payload);
            setStatus("已追加到卡片。", false);
          } else {
            const route = routeEl.value;
            pendingRequest = {
              path: route === "append_note" ? "/api/v1/captures" : "/api/v1/capture/route-commit",
              payload: null,
              text,
              route,
              category: categoryEl.value.trim(),
              audioBlob: recordedAudio,
              audioMimeType: recordedMimeType
            };
            let assetRefs = [];
            if (recordedAudio) {
              if (!handoff) throw new Error("原始录音上传需要一次性手机 handoff。");
              assetRefs = [await uploadRecordedAudio(recordedAudio, recordedMimeType, captureDraftId)];
            }
            if (route === "append_note") {
              const payload = await buildCapturePayload(text, assetRefs, false);
              pendingRequest.payload = payload;
              const result = await postJson(pendingRequest.path, payload);
              setStatus("已保存到 " + (result.data && result.data.filePath ? result.data.filePath : "Inbox") + "。", false);
            } else {
              if (assetRefs.length) {
                const audioCapture = await buildCapturePayload(text, assetRefs, true);
                await postJson("/api/v1/captures", audioCapture);
              }
              const payload = {
                ...routePayload(text),
                route,
                idempotencyKey: "route:" + captureDraftId
              };
              pendingRequest.payload = payload;
              const result = await postJson(pendingRequest.path, payload);
              if (result.data && result.data.kind === "agent_request") {
                pendingAgentRunId = result.data.run.runId;
                approveAgentEl.hidden = false;
                setStatus("Agent 提案已生成：" + result.data.run.tool + "。请再次确认后执行。", false);
                return;
              }
              setStatus("已创建工作池待办" + (result.data && result.data.idempotent ? "（幂等重试）" : "") + "。", false);
            }
          }
          textEl.value = "";
          await deletePendingSubmission();
          clearRecordedAudio();
          captureDraftId = newCaptureId();
          renderTargets();
          routePreviewEl.textContent = "输入内容后显示最终写入预览。";
        } catch (error) {
          if (pendingRequest && isNetworkFailure(error)) {
            await savePendingSubmission(pendingRequest);
            setStatus("网络不可用，内容已保存在本机；联网后会自动重试。", false);
            return;
          }
          setStatus("提交失败：" + (error.message || error), true);
        } finally {
          submitEl.disabled = false;
        }
      }

      async function postJson(path, payload) {
        const response = await fetch(withHandoff(path), {
          method: "POST",
          headers: {
            ...authorizationHeaders(),
            "content-type": "application/json"
          },
          body: JSON.stringify(payload)
        });
        const body = await response.json().catch(function() { return {}; });
        if (!response.ok) {
          throw new Error(body.error || "HTTP " + response.status);
        }
        return body;
      }

      async function performHandoffAction(action) {
        if (textEl.value.trim() && !window.confirm("当前输入尚未提交。继续会保留草稿，但本次 handoff 将被使用。")) {
          return;
        }
        if (action === "complete" && !window.confirm("只完成屏幕双击时显示的这项任务，确定继续？")) {
          return;
        }
        if (textEl.value.trim()) {
          localStorage.setItem("towrite-device-emergency-draft", textEl.value);
        }
        laterEl.disabled = true;
        completeEl.disabled = true;
        try {
          await postJson("/api/v1/device/handoff-actions", {
            action,
            eventId: "phone_" + newCaptureId().slice("capture_".length)
          });
          setStatus(action === "complete" ? "已安全完成当前任务。" : "已推迟 30 分钟。", false);
          handoffActionsEl.hidden = true;
        } catch (error) {
          setStatus("操作失败：" + (error.message || error), true);
          laterEl.disabled = false;
          completeEl.disabled = false;
        }
      }

      function routePayload(text) {
        return {
          captureId: captureDraftId,
          text,
          title: titleEl.value.trim(),
          tags: splitTags(tagsEl.value),
          category: categoryEl.value.trim(),
          metadata: interactionMetadata(recordedAudio ? "voice" : "capture")
        };
      }

      async function buildCapturePayload(text, assetRefs, preserveHandoff) {
        let selection = targetEl.value ? JSON.parse(targetEl.value) : { target: { kind: "inboxFile" } };
        if (!selection.candidateId) {
          await refreshRecommendations();
          selection = targetEl.value ? JSON.parse(targetEl.value) : selection;
        }
        const versioned = Boolean(selection.candidateId);
        return {
          title: titleEl.value.trim(),
          text,
          tags: splitTags(tagsEl.value),
          target: selection.target,
          clientId: "device-input",
          captureId: captureDraftId,
          assetRefs,
          preserveHandoff,
          metadata: interactionMetadata(recordedAudio ? "voice" : "capture"),
          ...(versioned ? {
            candidateId: selection.candidateId,
            action: selection.action,
            targetRevision: selection.targetRevision
          } : {})
        };
      }

      async function uploadRecordedAudio(blob, mimeType, captureId) {
        if (blob.size > 675000) throw new Error("录音过大，请控制在 45 秒内或重新录制。");
        const base64 = await blobToBase64(blob);
        const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        const result = await postJson("/api/v1/device/handoff-assets", {
          idempotencyKey: "audio:" + captureId,
          fileName: "voice-" + new Date().toISOString().replace(/[:.]/g, "-") + "." + extension,
          mimeType: mimeType || "audio/webm",
          base64
        });
        return result.assetRef;
      }

      function blobToBase64(blob) {
        return new Promise(function(resolve, reject) {
          const reader = new FileReader();
          reader.onload = function() {
            const value = String(reader.result || "");
            resolve(value.slice(value.indexOf(",") + 1));
          };
          reader.onerror = function() { reject(reader.error || new Error("录音读取失败")); };
          reader.readAsDataURL(blob);
        });
      }

      async function approveAgentRun() {
        if (!pendingAgentRunId) return;
        approveAgentEl.disabled = true;
        setStatus("正在执行本地白名单工具…", false);
        try {
          const result = await postJson("/api/v1/agent-runs/" + encodeURIComponent(pendingAgentRunId) + "/approve", {});
          setStatus("Agent 已创建待办：" + result.data.result.taskId + "。", false);
          approveAgentEl.hidden = true;
          pendingAgentRunId = "";
          textEl.value = "";
          clearRecordedAudio();
          await deletePendingSubmission();
          captureDraftId = newCaptureId();
        } catch (error) {
          setStatus("Agent 执行失败：" + (error.message || error), true);
        } finally {
          approveAgentEl.disabled = false;
        }
      }

      function withHandoff(path) {
        if (!handoff) return path;
        const separator = path.includes("?") ? "&" : "?";
        return path + separator + "handoff=" + encodeURIComponent(handoff);
      }

      function authorizationHeaders() {
        return token ? { "authorization": "Bearer " + token } : {};
      }

      function isNetworkFailure(error) {
        return navigator.onLine === false || error instanceof TypeError;
      }

      function pendingKey() {
        return handoff ? "handoff:" + handoff : "capture:" + captureDraftId;
      }

      function openQueueDatabase() {
        return new Promise(function(resolve, reject) {
          if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
          const request = indexedDB.open("towrite-device-input", 1);
          request.onupgradeneeded = function() {
            if (!request.result.objectStoreNames.contains("submissions")) {
              request.result.createObjectStore("submissions", { keyPath: "key" });
            }
          };
          request.onsuccess = function() { resolve(request.result); };
          request.onerror = function() { reject(request.error); };
        });
      }

      async function queueOperation(mode, value) {
        const database = await openQueueDatabase();
        return new Promise(function(resolve, reject) {
          const transaction = database.transaction("submissions", "readwrite");
          const store = transaction.objectStore("submissions");
          const request = mode === "get"
            ? store.get(pendingKey())
            : mode === "delete"
              ? store.delete(pendingKey())
              : store.put(value);
          request.onsuccess = function() { resolve(request.result); };
          request.onerror = function() { reject(request.error); };
          transaction.oncomplete = function() { database.close(); };
        });
      }

      async function savePendingSubmission(request) {
        try {
          await queueOperation("put", {
            key: pendingKey(),
            path: request.path,
            payload: request.payload,
            text: request.text || (request.payload && request.payload.text) || "",
            route: request.route || "append_note",
            category: request.category || "",
            audioBlob: request.audioBlob || null,
            audioMimeType: request.audioMimeType || "",
            handoff,
            createdAt: new Date().toISOString(),
            expiresAt: context && context.interaction && context.interaction.handoff
              ? context.interaction.handoff.expiresAt
              : ""
          });
        } catch {
          localStorage.setItem("towrite-device-emergency-draft", textEl.value);
        }
      }

      async function deletePendingSubmission() {
        try { await queueOperation("delete"); } catch { /* IndexedDB is an optional enhancement. */ }
        localStorage.removeItem("towrite-device-emergency-draft");
      }

      async function restorePendingSubmission() {
        let queued = null;
        try { queued = await queueOperation("get"); } catch { /* Fall back to emergency draft. */ }
        const emergency = localStorage.getItem("towrite-device-emergency-draft") || "";
        const queuedText = queued && (queued.text || (queued.payload && queued.payload.text))
          ? queued.text || queued.payload.text
          : emergency;
        if (queuedText && !textEl.value) textEl.value = queuedText;
        if (queued && queued.route) routeEl.value = queued.route;
        if (queued && queued.category) categoryEl.value = queued.category;
        if (queued && queued.audioBlob) {
          recordedAudio = queued.audioBlob;
          recordedMimeType = queued.audioMimeType || queued.audioBlob.type || "audio/webm";
          if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
          recordedAudioUrl = URL.createObjectURL(recordedAudio);
          audioPreviewEl.src = recordedAudioUrl;
          audioPreviewEl.hidden = false;
          voiceEl.textContent = "重新录音";
        }
        if (!queued) return;
        if (queued.expiresAt && Date.parse(queued.expiresAt) <= Date.now()) {
          setStatus("手机 handoff 已过期，内容仍保存在本机；请从墨水屏重新双击后提交。", true);
          return;
        }
        if (navigator.onLine && queued.payload) {
          try {
            await postJson(queued.path, queued.payload);
            await deletePendingSubmission();
            textEl.value = "";
            setStatus("离线记录已写回 Markdown。", false);
          } catch (error) {
            if (!isNetworkFailure(error)) {
              setStatus("离线记录仍保留：" + (error.message || error), true);
            }
          }
        }
      }

      window.addEventListener("online", function() {
        restorePendingSubmission().catch(function() { /* Keep the local draft. */ });
      });

      function interactionMetadata(inputMode) {
        return {
          source_device: "device-input",
          target_id: interaction.targetId,
          candidate_id: interaction.candidateId || questionId,
          delivery_id: interaction.deliveryId,
          source_file: interaction.sourceFile || (context && context.question && context.question.sourceFile) || "",
          source_line: interaction.sourceLine,
          source_end_line: interaction.sourceEndLine,
          source_block_id: interaction.sourceBlockId,
          source_page: interaction.sourcePage,
          input_mode: inputMode,
          created_at: new Date().toISOString()
        };
      }

      function splitTags(value) {
        return String(value || "")
          .split(/[，,、;；\\s]+/u)
          .map(function(tag) { return tag.replace(/^#+/u, "").trim(); })
          .filter(Boolean);
      }

      function setStatus(message, isError) {
        statusEl.textContent = message;
        statusEl.className = "status " + (isError ? "error" : message.startsWith("已") ? "success" : "");
      }

      modeEl.addEventListener("change", syncMode);
      textEl.addEventListener("input", scheduleRecommendations);
      titleEl.addEventListener("input", scheduleRecommendations);
      tagsEl.addEventListener("input", scheduleRecommendations);
      categoryEl.addEventListener("input", scheduleRoutingPreview);
      routeEl.addEventListener("change", scheduleRoutingPreview);
      submitEl.addEventListener("click", submit);
      approveAgentEl.addEventListener("click", approveAgentRun);
      laterEl.addEventListener("click", function() { performHandoffAction("later"); });
      completeEl.addEventListener("click", function() { performHandoffAction("complete"); });
      voiceEl.addEventListener("click", function() {
        toggleRecording().catch(function(error) {
          setStatus("无法开始录音：" + (error.message || error), true);
          stopMediaTracks();
        });
      });
      dictateEl.addEventListener("click", function() {
        if (!recognition) return;
        setStatus("正在听写...");
        recognition.start();
      });

      loadContext().catch(function(error) {
        setStatus("连接失败：" + (error.message || error), true);
      });
    </script>
  </body>
</html>`;
}
