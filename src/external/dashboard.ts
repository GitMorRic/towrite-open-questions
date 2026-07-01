export function buildDashboardHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ToWrite Dashboard</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, "Segoe UI", "Microsoft YaHei", sans-serif;
        background: #f5f7f9;
        color: #172027;
      }
      body { margin: 0; }
      button, input, select, textarea { box-sizing: border-box; font: inherit; }
      button { border: 0; border-radius: 7px; background: #256fb8; color: white; cursor: pointer; font-weight: 700; }
      input, select, textarea { border: 1px solid #cfd8df; border-radius: 7px; background: white; color: inherit; }
      .app { display: grid; gap: 14px; padding: 18px; }
      header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: end; }
      h1, h2, h3, p { margin: 0; }
      h1 { font-size: 24px; letter-spacing: 0; }
      h2 { font-size: 15px; }
      h3 { font-size: 14px; }
      .muted, small { color: #6b7a86; }
      .status.error { color: #c0392b; }
      .token-box { display: grid; grid-template-columns: minmax(220px, 1fr) auto; gap: 8px; }
      .token-box input, .token-box button { min-height: 36px; padding: 8px 10px; }
      .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .stat, .panel, .card, .article, .workflow-file { border: 1px solid #d8e0e6; border-radius: 8px; background: white; box-shadow: 0 8px 24px rgba(20, 33, 44, 0.05); }
      .stat { display: grid; gap: 3px; padding: 14px; }
      .stat strong { font-size: 28px; }
      .filters { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
      .filters input, .filters select { min-height: 36px; padding: 8px 10px; }
      .quickbar { display: flex; flex-wrap: wrap; gap: 8px; }
      .quickbar a { display: inline-grid; min-height: 30px; place-items: center; padding: 5px 10px; border-radius: 999px; background: #e8eef4; color: #172027; font-size: 13px; font-weight: 700; text-decoration: none; }
      .grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr); gap: 14px; align-items: start; }
      .panel { display: grid; gap: 10px; padding: 12px; }
      .panel-head { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
      details.panel { display: block; }
      details.panel > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; font-weight: 700; list-style: none; }
      details.panel > summary::-webkit-details-marker { display: none; }
      details.panel > summary::before { content: "▸"; color: #6b7a86; }
      details.panel[open] > summary::before { content: "▾"; }
      details.panel > .list, details.panel > .workflow-body, details.panel > .raw-body { margin-top: 10px; }
      .workbench { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
      .lane-panel.think { border-top: 3px solid #d68a00; }
      .lane-panel.write { border-top: 3px solid #3d78bf; }
      .list, .workflow-stage-list { display: grid; gap: 10px; }
      .card { display: grid; gap: 9px; padding: 12px; border-left: 5px solid #d68a00; }
      .card.write { border-left-color: #3d78bf; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .chips span { border-radius: 999px; padding: 2px 7px; background: #edf2f6; color: #52616d; font-size: 12px; }
      .card p, .workflow-file p { line-height: 1.45; }
      .path { overflow-wrap: anywhere; font-size: 12px; }
      .actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
      .actions a, .actions button { display: grid; place-items: center; min-height: 32px; padding: 7px 8px; border-radius: 7px; text-decoration: none; }
      .actions a { background: #eef3f7; color: #172027; font-weight: 700; }
      .status-row { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(120px, 0.35fr); gap: 8px; align-items: end; }
      .status-row label { display: grid; gap: 4px; color: #6b7a86; font-size: 12px; }
      .status-row select { min-height: 32px; padding: 6px 8px; }
      .status-row a { display: grid; min-height: 32px; place-items: center; padding: 6px 8px; border-radius: 7px; background: #eef3f7; color: #172027; font-weight: 700; text-decoration: none; }
      .note-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
      .note-row input { min-height: 32px; padding: 7px 8px; }
      .article { display: grid; gap: 4px; padding: 10px; }
      .article.needs { border-left: 4px solid #d68a00; }
      .workflow-stage { display: grid; gap: 8px; padding: 10px; border-left: 5px solid #9aa4b2; border-radius: 8px; background: #fbfcfd; border-top: 1px solid #d8e0e6; border-right: 1px solid #d8e0e6; border-bottom: 1px solid #d8e0e6; }
      .workflow-stage.amber { border-left-color: #d68a00; }
      .workflow-stage.mint { border-left-color: #45a57d; }
      .workflow-stage.sky { border-left-color: #3d78bf; }
      .workflow-stage.rose { border-left-color: #c95d7d; }
      .workflow-stage.violet { border-left-color: #7b61d1; }
      .workflow-stage.slate { border-left-color: #7b8794; }
      .workflow-file { display: grid; gap: 5px; padding: 10px; box-shadow: none; }
      .workflow-file.stale { background: #fff8ed; }
      .workflow-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #6b7a86; }
      .workflow-meta span { border-radius: 999px; padding: 2px 7px; background: #edf2f6; }
      .raw { max-height: 420px; overflow: auto; margin: 0; padding: 12px; border-radius: 8px; background: #101820; color: #e8f1f8; font-size: 12px; line-height: 1.45; }
      .empty { padding: 22px; border: 1px dashed #b7c4cf; border-radius: 8px; color: #6b7a86; text-align: center; }
      @media (max-width: 1000px) {
        header, .grid, .stats, .filters, .actions, .workbench, .status-row { grid-template-columns: 1fr; }
        .token-box { grid-template-columns: 1fr; }
      }
      @media (prefers-color-scheme: dark) {
        :root { background: #101418; color: #eef3f7; }
        input, select, textarea, .stat, .panel, .card, .article, .workflow-file { border-color: rgba(255,255,255,0.12); background: #172027; }
        .workflow-stage { background: #141b21; border-top-color: rgba(255,255,255,0.12); border-right-color: rgba(255,255,255,0.12); border-bottom-color: rgba(255,255,255,0.12); }
        .workflow-file.stale { background: #241c12; }
        .chips span, .actions a, .quickbar a, .status-row a, .workflow-meta span { background: rgba(255,255,255,0.08); color: #d8e4ec; }
      }
    </style>
  </head>
  <body>
    <main class="app">
      <header>
        <div>
          <h1>ToWrite Dashboard</h1>
          <p id="statusText" class="status muted">等待连接</p>
        </div>
        <form id="tokenForm" class="token-box">
          <input id="tokenInput" type="password" placeholder="token，或用 ?token= 打开" />
          <button type="submit">连接</button>
        </form>
      </header>

      <section class="stats">
        <article class="stat"><strong id="workCount">0</strong><span class="muted">待解决批注</span></article>
        <article class="stat"><strong id="candidateCount">0</strong><span class="muted">候选</span></article>
        <article class="stat"><strong id="workflowCount">0</strong><span class="muted">Workflow 文件</span></article>
        <article class="stat"><strong id="blockedArticleCount">0</strong><span class="muted">有问题文章</span></article>
      </section>

      <section class="filters">
        <select id="laneFilter">
          <option value="">全部 lane</option>
          <option value="think">ToThink</option>
          <option value="write">ToWrite</option>
        </select>
        <select id="statusFilter">
          <option value="">全部未解决状态</option>
          <option value="open">open</option>
          <option value="blocked">blocked</option>
          <option value="paused">paused</option>
          <option value="candidate">candidate</option>
          <option value="resolved">resolved</option>
        </select>
        <select id="workflowStageFilter">
          <option value="">全部 Workflow</option>
        </select>
        <select id="rawSelect">
          <option value="deck">原始 JSON：deck</option>
          <option value="questions">原始 JSON：questions</option>
          <option value="articles">原始 JSON：articles</option>
          <option value="workflows">原始 JSON：workflows</option>
        </select>
        <input id="searchInput" placeholder="搜索问题、文件、标签、下一步或备注" />
      </section>

      <nav class="quickbar" aria-label="快速跳转">
        <a href="#workflowPanel">Workflow</a>
        <a href="#thinkPanel">ToThink</a>
        <a href="#writePanel">ToWrite</a>
        <a href="#articlePanel">文章统计</a>
        <a href="#rawPanel">原始 JSON</a>
      </nav>

      <details id="workflowPanel" class="panel" open>
        <summary>
          <span>Workflow Stages</span>
          <small id="workflowSummary">未启用</small>
        </summary>
        <div id="workflowBody" class="workflow-body"></div>
      </details>

      <details id="rawPanel" class="panel raw-panel">
        <summary>
          <span>原始 API 数据</span>
          <small>展开查看 deck / questions / articles / workflows</small>
        </summary>
        <div class="raw-body">
          <div class="panel-head">
            <small>由上方“原始 JSON”下拉框控制</small>
            <button id="copyRaw" type="button">复制 JSON</button>
          </div>
          <pre id="rawJson" class="raw">{}</pre>
        </div>
      </details>

      <section class="grid">
        <section class="workbench" aria-label="待解决批注">
          <details id="thinkPanel" class="panel lane-panel think" open>
            <summary>
              <span>ToThink</span>
              <small id="thinkCount">0 项</small>
            </summary>
            <div id="thinkList" class="list"></div>
          </details>

          <details id="writePanel" class="panel lane-panel write" open>
            <summary>
              <span>ToWrite</span>
              <small id="writeCountLabel">0 项</small>
            </summary>
            <div id="writeList" class="list"></div>
          </details>
        </section>

        <aside id="articlePanel" class="panel">
          <div class="panel-head">
            <h2>文章统计</h2>
            <small id="articleCount">0 篇</small>
          </div>
          <div id="articleList" class="list"></div>
        </aside>
      </section>
    </main>

    <script>
      const state = { deck: null, questions: [], articles: [], workflows: null, stream: null, token: "" };
      const els = {
        tokenForm: document.querySelector("#tokenForm"),
        tokenInput: document.querySelector("#tokenInput"),
        statusText: document.querySelector("#statusText"),
        workCount: document.querySelector("#workCount"),
        candidateCount: document.querySelector("#candidateCount"),
        workflowCount: document.querySelector("#workflowCount"),
        blockedArticleCount: document.querySelector("#blockedArticleCount"),
        thinkCount: document.querySelector("#thinkCount"),
        writeCountLabel: document.querySelector("#writeCountLabel"),
        articleCount: document.querySelector("#articleCount"),
        workflowSummary: document.querySelector("#workflowSummary"),
        laneFilter: document.querySelector("#laneFilter"),
        statusFilter: document.querySelector("#statusFilter"),
        workflowStageFilter: document.querySelector("#workflowStageFilter"),
        rawSelect: document.querySelector("#rawSelect"),
        searchInput: document.querySelector("#searchInput"),
        thinkList: document.querySelector("#thinkList"),
        writeList: document.querySelector("#writeList"),
        articleList: document.querySelector("#articleList"),
        workflowBody: document.querySelector("#workflowBody"),
        rawJson: document.querySelector("#rawJson"),
        copyRaw: document.querySelector("#copyRaw")
      };

      init();

      function init() {
        state.token = new URLSearchParams(location.search).get("token") || localStorage.getItem("towrite-dashboard-token") || "";
        els.tokenInput.value = state.token;
        els.tokenForm.addEventListener("submit", (event) => {
          event.preventDefault();
          state.token = els.tokenInput.value.trim();
          localStorage.setItem("towrite-dashboard-token", state.token);
          loadAll();
        });
        for (const el of [els.laneFilter, els.statusFilter, els.workflowStageFilter, els.rawSelect, els.searchInput]) {
          el.addEventListener("input", render);
          el.addEventListener("change", render);
        }
        els.copyRaw.addEventListener("click", async () => {
          await navigator.clipboard.writeText(els.rawJson.textContent || "");
          setStatus("JSON 已复制");
        });
        if (state.token) loadAll();
      }

      async function loadAll() {
        if (!state.token) {
          setStatus("请填写 token，或用 /dashboard?token=... 打开。", true);
          return;
        }
        try {
          const [deck, questions, articles, workflows] = await Promise.all([
            getJson("/api/v1/deck?limit=200"),
            getJson("/api/v1/questions"),
            getJson("/api/v1/articles"),
            getJson("/api/v1/workflows?limit=20")
          ]);
          state.deck = deck;
          state.questions = questions.data || [];
          state.articles = articles.data || [];
          state.workflows = workflows;
          setStatus("已连接：" + (questions.vaultName || deck.vaultName || workflows.vaultName || "Obsidian"));
          connectEvents();
          render();
        } catch (error) {
          setStatus("连接失败：" + error.message, true);
        }
      }

      async function refreshWorkflows() {
        try {
          state.workflows = await getJson("/api/v1/workflows?limit=20");
          render();
        } catch {
          // Keep the previous workflow payload if this refresh fails.
        }
      }

      function connectEvents() {
        if (state.stream) state.stream.close();
        state.stream = new EventSource("/api/v1/events?token=" + encodeURIComponent(state.token));
        state.stream.addEventListener("snapshot", handleEvent);
        state.stream.addEventListener("update", handleEvent);
        state.stream.onerror = () => setStatus("实时连接中断，可刷新页面重连。", true);
      }

      function handleEvent(event) {
        const payload = JSON.parse(event.data);
        state.questions = payload.questions || [];
        state.articles = payload.articles || [];
        state.deck = {
          schemaVersion: 1,
          generatedAt: payload.generatedAt,
          vaultName: payload.vaultName,
          data: { cards: state.questions.filter((q) => isWorkStatus(q.status)).map(toDeckCard) }
        };
        setStatus("实时更新：" + new Date(payload.generatedAt).toLocaleTimeString());
        render();
        refreshWorkflows();
      }

      async function getJson(path) {
        const joiner = path.includes("?") ? "&" : "?";
        const res = await fetch(path + joiner + "token=" + encodeURIComponent(state.token));
        if (!res.ok) throw new Error("HTTP " + res.status);
        return await res.json();
      }

      function render() {
        const allWork = state.questions.filter((q) => isWorkStatus(q.status));
        const filtered = filteredQuestions();
        const thinkQuestions = filtered.filter((q) => q.lane === "think");
        const writeQuestions = filtered.filter((q) => q.lane === "write");
        els.workCount.textContent = String(allWork.length);
        els.candidateCount.textContent = String(state.questions.filter((q) => q.status === "candidate").length);
        els.workflowCount.textContent = String(state.workflows?.counts?.uniqueFiles || 0);
        els.blockedArticleCount.textContent = String(state.articles.filter((a) => a.needsWork).length);
        els.thinkCount.textContent = thinkQuestions.length + " 项";
        els.writeCountLabel.textContent = writeQuestions.length + " 项";
        els.articleCount.textContent = state.articles.length + " 篇";
        renderQuestionList(els.thinkList, thinkQuestions, "没有匹配的 ToThink。");
        renderQuestionList(els.writeList, writeQuestions, "没有匹配的 ToWrite。");
        renderArticles();
        renderWorkflows();
        renderRaw();
      }

      function filteredQuestions() {
        const lane = els.laneFilter.value;
        const status = els.statusFilter.value;
        const needle = els.searchInput.value.trim().toLowerCase();
        return state.questions
          .filter((q) => status ? q.status === status : q.status !== "resolved" && q.status !== "ignored")
          .filter((q) => !lane || q.lane === lane)
          .filter((q) => {
            if (!needle) return true;
            return [q.title, questionBody(q), q.note, q.notes?.map((n) => n.text).join(" "), q.source?.file, q.tags?.join(" "), q.kind, q.status]
              .filter(Boolean).join(" ").toLowerCase().includes(needle);
          })
          .sort((a, b) => statusRank(a.status) - statusRank(b.status) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      }

      function renderQuestionList(container, questions, emptyText) {
        container.innerHTML = "";
        if (!questions.length) {
          container.append(empty(emptyText));
          return;
        }
        for (const q of questions) {
          container.append(renderQuestion(q));
        }
      }

      function renderQuestion(q) {
        const card = document.createElement("article");
        card.className = "card " + q.lane;
        const line = typeof q.source?.lineStart === "number" ? q.source.lineStart + 1 : "";
        const body = questionBody(q);
        card.innerHTML = [
          '<div class="chips"><span>' + (q.lane === "write" ? "ToWrite" : "ToThink") + '</span><span>' + escapeHtml(q.kind) + '</span></div>',
          '<h3>' + escapeHtml(q.title || q.source?.headingPath?.at(-1) || body.slice(0, 40) || "未命名卡片") + '</h3>',
          '<p>' + escapeHtml(body) + '</p>',
          q.note ? '<p class="muted">' + escapeHtml(q.note) + '</p>' : "",
          '<small class="path">' + escapeHtml(q.source?.file || "") + (line ? ":" + line : "") + '</small>',
          '<div class="status-row"><label><span>状态</span><select data-role="status">' + statusOptions(q.status).map((status) => '<option value="' + escapeAttr(status) + '" ' + (status === q.status ? "selected" : "") + '>' + escapeHtml(status) + '</option>').join("") + '</select></label><a href="' + escapeAttr(buildOpenUri(q)) + '">打开</a></div>',
          '<div class="note-row"><input placeholder="追加备注" /><button data-action="note" type="button">追加</button></div>'
        ].join("");
        card.querySelector('[data-role="status"]').addEventListener("change", (event) => {
          postJson("/api/v1/questions/" + encodeURIComponent(q.id) + "/status", {
            status: event.currentTarget.value,
            clientId: "builtin-dashboard"
          });
        });
        card.querySelector('[data-action="note"]').addEventListener("click", async () => {
          const input = card.querySelector("input");
          const text = input.value.trim();
          if (!text) return;
          await postJson("/api/v1/questions/" + encodeURIComponent(q.id) + "/notes", { text, clientId: "builtin-dashboard" });
          input.value = "";
        });
        return card;
      }

      function renderWorkflows() {
        syncWorkflowFilterOptions();
        els.workflowBody.innerHTML = "";
        const workflows = state.workflows;
        if (!workflows?.enabled) {
          els.workflowSummary.textContent = "未启用";
          els.workflowBody.append(empty("Workflow Stages 还没有启用。请在 Obsidian 插件设置里打开并配置文件夹或标签。"));
          return;
        }
        const stageFilter = els.workflowStageFilter.value;
        const needle = els.searchInput.value.trim().toLowerCase();
        const stages = workflows.stages
          .filter((stage) => !stageFilter || stage.id === stageFilter)
          .map((stage) => ({
            ...stage,
            files: (stage.files || []).filter((file) => !needle || workflowFileMatches(file, needle))
          }))
          .filter((stage) => stage.files.length > 0 || !needle);
        els.workflowSummary.textContent = workflows.counts.uniqueFiles + " 个文件 / " + workflows.counts.stages + " 个 stage";
        if (!stages.length) {
          els.workflowBody.append(empty("没有匹配的 Workflow 文件。"));
          return;
        }
        const stageList = document.createElement("div");
        stageList.className = "workflow-stage-list";
        for (const stage of stages) {
          stageList.append(renderWorkflowStage(stage));
        }
        els.workflowBody.append(stageList);
      }

      function renderWorkflowStage(stage) {
        const wrapper = document.createElement("section");
        wrapper.className = "workflow-stage " + (stage.color || "slate");
        const header = document.createElement("div");
        header.className = "panel-head";
        header.innerHTML = '<div><h2>' + escapeHtml(stage.title || stage.id) + '</h2><small>' + escapeHtml(stage.description || "") + '</small></div><small>' + stage.count + ' 个 / stale ' + stage.staleCount + '</small>';
        wrapper.append(header);
        const list = document.createElement("div");
        list.className = "list";
        for (const file of stage.files || []) {
          list.append(renderWorkflowFile(file));
        }
        if (!stage.files?.length) {
          list.append(empty("这个 stage 还没有文件。"));
        }
        wrapper.append(list);
        return wrapper;
      }

      function renderWorkflowFile(file) {
        const item = document.createElement("article");
        item.className = "workflow-file" + (file.stale ? " stale" : "");
        item.innerHTML = [
          '<div class="panel-head"><h3><a href="' + escapeAttr(file.openUri || "") + '">' + escapeHtml(file.title || file.filePath) + '</a></h3><small>' + escapeHtml(file.ageDays ?? 0) + ' 天前更新</small></div>',
          file.description ? '<p>' + escapeHtml(file.description) + '</p>' : "",
          file.nextAction ? '<p><strong>下一步：</strong>' + escapeHtml(file.nextAction) + '</p>' : "",
          '<small class="path">' + escapeHtml(file.filePath) + '</small>',
          '<div class="workflow-meta"><span>open ' + (file.openQuestionCount || 0) + '</span><span>think ' + (file.thinkCount || 0) + '</span><span>write ' + (file.writeCount || 0) + '</span>' + (file.stale ? '<span>stale</span>' : '') + '</div>'
        ].join("");
        return item;
      }

      function syncWorkflowFilterOptions() {
        const current = els.workflowStageFilter.value;
        const stages = state.workflows?.stages || [];
        els.workflowStageFilter.innerHTML = '<option value="">全部 Workflow</option>' + stages
          .map((stage) => '<option value="' + escapeAttr(stage.id) + '">' + escapeHtml(stage.title || stage.id) + '</option>')
          .join("");
        els.workflowStageFilter.value = stages.some((stage) => stage.id === current) ? current : "";
      }

      function renderArticles() {
        els.articleList.innerHTML = "";
        const articles = [...state.articles]
          .filter((a) => a.needsWork || a.candidate > 0)
          .sort((a, b) => b.open - a.open || b.candidate - a.candidate || a.title.localeCompare(b.title))
          .slice(0, 50);
        if (!articles.length) {
          els.articleList.append(empty("没有有待解决问题的文章。"));
          return;
        }
        for (const article of articles) {
          const item = document.createElement("article");
          item.className = "article" + (article.needsWork ? " needs" : "");
          item.innerHTML = [
            '<strong>' + escapeHtml(article.title) + '</strong>',
            '<small class="path">' + escapeHtml(article.filePath) + '</small>',
            '<span class="muted">' + article.open + ' open / ' + article.candidate + ' candidate / ' + article.resolved + ' resolved</span>'
          ].join("");
          els.articleList.append(item);
        }
      }

      function renderRaw() {
        const selected = els.rawSelect.value;
        const payload = selected === "articles"
          ? { data: state.articles }
          : selected === "questions"
            ? { data: state.questions }
            : selected === "workflows"
              ? state.workflows || { stages: [] }
              : state.deck || { data: { cards: [] } };
        els.rawJson.textContent = JSON.stringify(payload, null, 2);
      }

      async function postJson(path, body) {
        const res = await fetch(path, {
          method: "POST",
          headers: { Authorization: "Bearer " + state.token, "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          setStatus("写回失败：HTTP " + res.status, true);
          return;
        }
        await loadAll();
      }

      function toDeckCard(q) {
        return {
          id: q.id,
          title: q.title || q.source?.headingPath?.at(-1) || questionBody(q).slice(0, 40),
          body: questionBody(q),
          question: questionBody(q),
          sourceFile: q.source?.file,
          sourceLine: (q.source?.lineStart || 0) + 1,
          lane: q.lane,
          status: q.status,
          kind: q.kind,
          tags: q.tags || [],
          openUri: buildOpenUri(q),
          updatedAt: q.updatedAt || q.createdAt
        };
      }

      function buildOpenUri(q) { return q.openUri || "obsidian://open?file=" + encodeURIComponent(q.source?.file || ""); }
      function questionBody(q) { return q.body || q.question || ""; }
      function isWorkStatus(status) { return status !== "candidate" && status !== "resolved" && status !== "ignored"; }
      function statusRank(status) { return { blocked: 0, open: 1, paused: 2, candidate: 3, resolved: 4, ignored: 5 }[status] ?? 2; }
      function statusOptions(current) {
        const options = ["open", "blocked", "paused", "candidate", "resolved", "ignored"];
        return options.includes(current) ? options : [current, ...options].filter(Boolean);
      }
      function workflowFileMatches(file, needle) {
        return [file.filePath, file.title, file.description, file.nextAction, (file.tags || []).join(" ")]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      }
      function empty(text) { const el = document.createElement("p"); el.className = "empty"; el.textContent = text; return el; }
      function setStatus(text, isError = false) { els.statusText.textContent = text; els.statusText.classList.toggle("error", isError); }
      function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
      function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }
    </script>
  </body>
</html>`;
}
