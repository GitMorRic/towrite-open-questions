const els = {
  apiBase: document.querySelector("#apiBase"),
  token: document.querySelector("#token"),
  saveSettings: document.querySelector("#saveSettings"),
  lane: document.querySelector("#lane"),
  status: document.querySelector("#status"),
  count: document.querySelector("#count"),
  title: document.querySelector("#title"),
  question: document.querySelector("#question"),
  meta: document.querySelector("#meta"),
  latestNote: document.querySelector("#latestNote"),
  noteText: document.querySelector("#noteText"),
  prevCard: document.querySelector("#prevCard"),
  nextCard: document.querySelector("#nextCard"),
  addNote: document.querySelector("#addNote"),
  resolveCard: document.querySelector("#resolveCard"),
  refreshCards: document.querySelector("#refreshCards"),
  message: document.querySelector("#message")
};

let cards = [];
let index = 0;

init();

function init() {
  els.apiBase.value = localStorage.getItem("towrite-api-base") || els.apiBase.value;
  els.token.value = localStorage.getItem("towrite-token") || "";
  els.saveSettings.addEventListener("click", saveAndRefresh);
  els.prevCard.addEventListener("click", () => move(-1));
  els.nextCard.addEventListener("click", () => move(1));
  els.refreshCards.addEventListener("click", loadCards);
  els.addNote.addEventListener("click", addNote);
  els.resolveCard.addEventListener("click", resolveCard);
  if (els.token.value.trim()) {
    loadCards();
  }
}

function config() {
  return {
    base: els.apiBase.value.trim().replace(/\/+$/, ""),
    token: els.token.value.trim()
  };
}

function saveAndRefresh() {
  const { base, token } = config();
  localStorage.setItem("towrite-api-base", base);
  localStorage.setItem("towrite-token", token);
  loadCards();
}

async function loadCards() {
  const { base, token } = config();
  if (!base || !token) {
    showMessage("请先填写 API Base 和 token。", true);
    return;
  }

  try {
    showMessage("正在读取卡片...");
    const res = await fetch(`${base}/api/v1/deck?token=${encodeURIComponent(token)}&limit=50`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    cards = payload.data?.cards || [];
    index = Math.min(index, Math.max(cards.length - 1, 0));
    render();
    showMessage(cards.length ? `已读取 ${cards.length} 张卡片。` : "没有未完成卡片。");
  } catch (error) {
    showMessage(`读取失败：${error.message}`, true);
  }
}

function render() {
  const card = cards[index];
  els.count.textContent = cards.length ? `${index + 1} / ${cards.length}` : "0 / 0";
  if (!card) {
    els.lane.textContent = "-";
    els.status.textContent = "-";
    els.title.textContent = "没有待处理卡片";
    els.question.textContent = "所有 ToThink / ToWrite 都处理完了，或者筛选结果为空。";
    els.meta.textContent = "";
    els.latestNote.textContent = "";
    return;
  }

  els.lane.textContent = card.lane === "write" ? "ToWrite" : "ToThink";
  els.status.textContent = card.status;
  els.title.textContent = card.title || "未命名卡片";
  els.question.textContent = cardBody(card);
  const sourcePosition = card.sourcePage ? `P${card.sourcePage}` : `L${card.sourceLine}`;
  els.meta.textContent = `${card.sourceFile}:${sourcePosition} · ${card.kind} · ${card.tags.map((tag) => `#${tag}`).join(" ")}`;
  els.latestNote.textContent = card.latestNote ? `最近备注：${card.latestNote}` : "";
}

function move(delta) {
  if (!cards.length) return;
  index = (index + delta + cards.length) % cards.length;
  render();
}

async function addNote() {
  const card = cards[index];
  const text = els.noteText.value.trim();
  if (!card) return showMessage("没有当前卡片。", true);
  if (!text) return showMessage("请先输入备注。", true);

  await postJson(`/api/v1/questions/${encodeURIComponent(card.id)}/notes`, {
    text,
    clientId: "desktop-card"
  });
  els.noteText.value = "";
  await loadCards();
}

async function resolveCard() {
  const card = cards[index];
  if (!card) return showMessage("没有当前卡片。", true);

  await postJson(`/api/v1/questions/${encodeURIComponent(card.id)}/status`, {
    status: "resolved",
    note: "从桌面卡片标记为已解决。",
    clientId: "desktop-card"
  });
  cards.splice(index, 1);
  index = Math.min(index, Math.max(cards.length - 1, 0));
  render();
  showMessage("已标记为 resolved。");
}

async function postJson(path, body) {
  const { base, token } = config();
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    showMessage(`写回失败：${error.message}`, true);
    throw error;
  }
}

function showMessage(text, isError = false) {
  els.message.textContent = text;
  els.message.classList.toggle("error", isError);
}

function cardBody(card) {
  return card.body || card.question || "";
}
