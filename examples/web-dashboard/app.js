const state = {
  deck: null,
  questions: [],
  articles: [],
  stream: null
};

const els = {
  configForm: document.querySelector("#configForm"),
  apiBase: document.querySelector("#apiBase"),
  token: document.querySelector("#token"),
  statusText: document.querySelector("#statusText"),
  openCount: document.querySelector("#openCount"),
  candidateCount: document.querySelector("#candidateCount"),
  articleCount: document.querySelector("#articleCount"),
  blockedCount: document.querySelector("#blockedCount"),
  thinkCount: document.querySelector("#thinkCount"),
  writeCountLabel: document.querySelector("#writeCountLabel"),
  laneFilter: document.querySelector("#laneFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  rawSelect: document.querySelector("#rawSelect"),
  searchInput: document.querySelector("#searchInput"),
  thinkList: document.querySelector("#thinkList"),
  writeList: document.querySelector("#writeList"),
  articleList: document.querySelector("#articleList"),
  rawJson: document.querySelector("#rawJson"),
  copyRaw: document.querySelector("#copyRaw")
};

init();

function init() {
  els.apiBase.value = localStorage.getItem("towrite-dashboard-base") || els.apiBase.value;
  els.token.value = localStorage.getItem("towrite-dashboard-token") || "";
  els.configForm.addEventListener("submit", (event) => {
    event.preventDefault();
    connect();
  });
  for (const element of [els.laneFilter, els.statusFilter, els.rawSelect, els.searchInput]) {
    element.addEventListener("input", render);
    element.addEventListener("change", render);
  }
  els.copyRaw.addEventListener("click", async () => {
    await navigator.clipboard.writeText(els.rawJson.textContent || "");
    setStatus("JSON 已复制。");
  });
  if (els.token.value.trim()) {
    connect();
  }
}

function config() {
  return {
    base: els.apiBase.value.trim().replace(/\/+$/, ""),
    token: els.token.value.trim()
  };
}

async function connect() {
  const { base, token } = config();
  if (!base || !token) {
    setStatus("请填写 API Base 和 token。", true);
    return;
  }
  localStorage.setItem("towrite-dashboard-base", base);
  localStorage.setItem("towrite-dashboard-token", token);
  try {
    await loadOnce();
    connectEvents();
  } catch (error) {
    setStatus(`连接失败：${error.message}`, true);
  }
}

async function loadOnce() {
  const [deckPayload, questionsPayload, articlesPayload] = await Promise.all([
    getJson("/api/v1/deck?limit=200"),
    getJson("/api/v1/questions"),
    getJson("/api/v1/articles")
  ]);
  state.deck = deckPayload;
  state.questions = questionsPayload.data || [];
  state.articles = articlesPayload.data || [];
  setStatus(`已连接：${questionsPayload.vaultName || deckPayload.vaultName}`);
  render();
}

function connectEvents() {
  const { base, token } = config();
  if (state.stream) {
    state.stream.close();
  }
  state.stream = new EventSource(`${base}/api/v1/events?token=${encodeURIComponent(token)}`);
  state.stream.addEventListener("snapshot", handleEventPayload);
  state.stream.addEventListener("update", handleEventPayload);
  state.stream.onerror = () => setStatus("SSE 连接中断，仍可手动刷新页面。", true);
}

function handleEventPayload(event) {
  const payload = JSON.parse(event.data);
  state.questions = payload.questions || [];
  state.articles = payload.articles || [];
  state.deck = {
    schemaVersion: 1,
    generatedAt: payload.generatedAt,
    vaultName: payload.vaultName,
    data: {
      cards: state.questions.filter((question) => isWorkStatus(question.status)).map(toDeckCard)
    }
  };
  setStatus(`实时更新：${new Date(payload.generatedAt).toLocaleTimeString()}`);
  render();
}

async function getJson(path) {
  const { base, token } = config();
  const joiner = path.includes("?") ? "&" : "?";
  const res = await fetch(`${base}${path}${joiner}token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function render() {
  const filtered = filteredQuestions();
  const thinkQuestions = filtered.filter((question) => question.lane === "think");
  const writeQuestions = filtered.filter((question) => question.lane === "write");
  const workQuestions = state.questions.filter((question) => isWorkStatus(question.status));
  els.openCount.textContent = workQuestions.length;
  els.candidateCount.textContent = state.questions.filter((q) => q.status === "candidate").length;
  els.articleCount.textContent = state.articles.length;
  els.blockedCount.textContent = state.articles.filter((a) => a.needsWork).length;
  els.thinkCount.textContent = `${thinkQuestions.length} 项`;
  els.writeCountLabel.textContent = `${writeQuestions.length} 项`;

  renderQuestionList(els.thinkList, thinkQuestions, "没有匹配的 ToThink。");
  renderQuestionList(els.writeList, writeQuestions, "没有匹配的 ToWrite。");

  els.articleList.innerHTML = "";
  const articles = [...state.articles]
    .filter((article) => article.needsWork || article.candidate > 0)
    .sort((left, right) => right.open - left.open || right.candidate - left.candidate || left.title.localeCompare(right.title))
    .slice(0, 50);
  for (const article of articles) {
    els.articleList.appendChild(renderArticle(article));
  }
  if (!articles.length) {
    els.articleList.appendChild(empty("没有有待解决问题的文章。"));
  }

  renderRawJson();
}

function filteredQuestions() {
  const lane = els.laneFilter.value;
  const status = els.statusFilter.value;
  const needle = els.searchInput.value.trim().toLowerCase();
  return state.questions
    .filter((question) => status ? question.status === status : question.status !== "resolved" && question.status !== "ignored")
    .filter((question) => !lane || question.lane === lane)
    .filter((question) => {
      if (!needle) return true;
      const haystack = [
        question.title,
        questionBody(question),
        question.note,
        question.notes?.map((note) => note.text).join(" "),
        question.source?.file,
        question.tags?.join(" "),
        question.kind,
        question.status
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    })
    .sort((left, right) => statusRank(left.status) - statusRank(right.status) || left.source.file.localeCompare(right.source.file) || left.source.lineStart - right.source.lineStart);
}

function renderQuestionList(container, questions, emptyText) {
  container.innerHTML = "";
  if (!questions.length) {
    container.appendChild(empty(emptyText));
    return;
  }
  for (const question of questions) {
    container.appendChild(renderQuestion(question));
  }
}

function renderQuestion(question) {
  const item = document.createElement("article");
  item.className = `question ${question.lane}`;
  const body = questionBody(question);
  item.innerHTML = `
    <div class="chips">
      <span>${question.lane === "write" ? "ToWrite" : "ToThink"}</span>
      <span>${escapeHtml(question.kind)}</span>
    </div>
    <h3>${escapeHtml(question.title || question.source?.headingPath?.at(-1) || body.slice(0, 40) || "未命名卡片")}</h3>
    <p>${escapeHtml(body)}</p>
    ${question.note ? `<p class="muted">${escapeHtml(question.note)}</p>` : ""}
    <small>${escapeHtml(question.source?.file || "")}:${(question.source?.lineStart || 0) + 1}</small>
    <div class="status-row">
      <label>
        <span>状态</span>
        <select data-role="status">${statusOptions(question.status).map((status) => `<option value="${escapeAttr(status)}" ${status === question.status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select>
      </label>
      <a href="${escapeAttr(buildOpenUri(question))}">打开</a>
    </div>
    <textarea placeholder="追加备注"></textarea>
    <div class="row">
      <button data-action="note">追加备注</button>
    </div>
  `;
  item.querySelector('[data-role="status"]').addEventListener("change", (event) => {
    setQuestionStatus(question.id, event.currentTarget.value);
  });
  item.querySelector('[data-action="note"]').addEventListener("click", async () => {
    const text = item.querySelector("textarea").value.trim();
    if (!text) return;
    await postJson(`/api/v1/questions/${encodeURIComponent(question.id)}/notes`, {
      text,
      clientId: "web-dashboard"
    });
  });
  return item;
}

function renderArticle(article) {
  const item = document.createElement("article");
  item.className = `article ${article.needsWork ? "needs-work" : ""}`;
  item.innerHTML = `
    <strong>${escapeHtml(article.title)}</strong>
    <small>${escapeHtml(article.filePath)}</small>
    <span>${article.open} open / ${article.candidate} candidate / ${article.resolved} resolved</span>
  `;
  return item;
}

function renderRawJson() {
  const selected = els.rawSelect.value;
  const payload = selected === "articles"
    ? { data: state.articles }
    : selected === "questions"
      ? { data: state.questions }
      : state.deck || { data: { cards: [] } };
  els.rawJson.textContent = JSON.stringify(payload, null, 2);
}

function toDeckCard(question) {
  return {
    id: question.id,
    title: question.title || question.source?.headingPath?.at(-1) || questionBody(question).slice(0, 40),
    body: questionBody(question),
    question: questionBody(question),
    sourceFile: question.source?.file,
    sourceLine: (question.source?.lineStart || 0) + 1,
    lane: question.lane,
    status: question.status,
    kind: question.kind,
    tags: question.tags || [],
    openUri: buildOpenUri(question),
    updatedAt: question.updatedAt || question.createdAt
  };
}

function empty(text) {
  const node = document.createElement("p");
  node.className = "empty";
  node.textContent = text;
  return node;
}

async function setQuestionStatus(id, status) {
  await postJson(`/api/v1/questions/${encodeURIComponent(id)}/status`, {
    status,
    clientId: "web-dashboard"
  });
}

async function postJson(path, body) {
  const { base, token } = config();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    setStatus(`写回失败：HTTP ${res.status}`, true);
    return;
  }
  await loadOnce();
}

function buildOpenUri(question) {
  if (question.openUri) {
    return question.openUri;
  }
  const file = question.source?.file || "";
  return `obsidian://open?file=${encodeURIComponent(file)}`;
}

function questionBody(question) {
  return question.body || question.question || "";
}

function isWorkStatus(status) {
  return status !== "candidate" && status !== "resolved" && status !== "ignored";
}

function statusRank(status) {
  return { blocked: 0, open: 1, paused: 2, candidate: 3, resolved: 4, ignored: 5 }[status] ?? 2;
}

function statusOptions(current) {
  const options = ["open", "blocked", "paused", "candidate", "resolved", "ignored"];
  return options.includes(current) ? options : [current, ...options].filter(Boolean);
}

function setStatus(text, isError = false) {
  els.statusText.textContent = text;
  els.statusText.classList.toggle("error", isError);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
