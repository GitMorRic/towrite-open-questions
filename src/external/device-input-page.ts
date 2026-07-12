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
        <div class="toolbar">
          <button class="secondary" id="voice" type="button">语音输入</button>
          <button id="submit" type="button">提交</button>
        </div>
        <p class="status" id="status"></p>
      </section>
    </main>

    <script>
      const params = new URLSearchParams(location.search);
      const token = params.get("token") || localStorage.getItem("towrite-device-token") || "";
      if (token) {
        localStorage.setItem("towrite-device-token", token);
      }
      if (params.has("token")) {
        params.delete("token");
        const cleanQuery = params.toString();
        history.replaceState(null, "", location.pathname + (cleanQuery ? "?" + cleanQuery : "") + location.hash);
      }
      const questionId = params.get("questionId") || "";
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
      const voiceEl = document.getElementById("voice");
      const submitEl = document.getElementById("submit");
      const statusEl = document.getElementById("status");
      const backLinkEl = document.getElementById("backLink");
      let context = null;
      let recognition = null;
      let recommendationTimer = 0;
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
        if (!token) {
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
        const response = await fetch("/api/v1/device-input-context?" + query.toString(), {
          cache: "no-store",
          headers: { "authorization": "Bearer " + token }
        });
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        context = await response.json();
        renderContext();
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
          voiceEl.textContent = "语音不可用";
          voiceEl.disabled = true;
          return;
        }
        recognition = new SpeechRecognition();
        recognition.lang = "zh-CN";
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.onresult = function(event) {
          const text = Array.from(event.results)
            .map(function(result) { return result[0] && result[0].transcript ? result[0].transcript : ""; })
            .join("");
          appendText(text);
        };
        recognition.onerror = function(event) {
          setStatus("语音输入失败：" + (event.error || "unknown"), true);
        };
      }

      function appendText(text) {
        if (!text) return;
        const prefix = textEl.value.trim() ? "\\n" : "";
        textEl.value = textEl.value + prefix + text.trim();
      }

      async function submit() {
        const text = textEl.value.trim();
        if (!text) {
          setStatus("请先输入内容。", true);
          return;
        }
        submitEl.disabled = true;
        setStatus("正在提交...");
        try {
          if (modeEl.value === "answer" && questionId) {
            await postJson("/api/v1/questions/" + encodeURIComponent(questionId) + "/notes", {
              text,
              clientId: "device-input",
              metadata: interactionMetadata("answer")
            });
            setStatus("已追加到卡片。", false);
          } else {
            let selection = targetEl.value ? JSON.parse(targetEl.value) : { target: { kind: "inboxFile" } };
            if (!selection.candidateId) {
              await refreshRecommendations();
              selection = targetEl.value ? JSON.parse(targetEl.value) : selection;
            }
            const versioned = Boolean(selection.candidateId);
            const payload = {
              title: titleEl.value.trim(),
              text,
              tags: splitTags(tagsEl.value),
              target: selection.target,
              clientId: "device-input",
              metadata: interactionMetadata("capture"),
              ...(versioned ? {
                captureId: captureDraftId,
                candidateId: selection.candidateId,
                action: selection.action,
                targetRevision: selection.targetRevision
              } : {})
            };
            const result = await postJson("/api/v1/captures", payload);
            setStatus("已保存到 " + (result.data && result.data.filePath ? result.data.filePath : "Inbox") + "。", false);
          }
          textEl.value = "";
          captureDraftId = newCaptureId();
          renderTargets();
        } catch (error) {
          setStatus("提交失败：" + (error.message || error), true);
        } finally {
          submitEl.disabled = false;
        }
      }

      async function postJson(path, payload) {
        const response = await fetch(path, {
          method: "POST",
          headers: {
            "authorization": "Bearer " + token,
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
      submitEl.addEventListener("click", submit);
      voiceEl.addEventListener("click", function() {
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
