import { describe, expect, it } from "vitest";
import { buildFocusCarouselMessages } from "./focus-carousel";

describe("Focus Now message carousel", () => {
  it("combines theme, custom lines and reminder sources without showing pool tasks", () => {
    const messages = buildFocusCarouselMessages({
      theme: "推进 Echo MVP",
      customMessages: ["先做最小的一步", "先做最小的一步"],
      candidates: [
        { id: "pool:1", title: "普通任务池项", source: "pool" },
        { id: "inbox:1", title: "朋友发来的提醒", source: "inbox", description: "别忘了吃饭" },
        { id: "stale:1", title: "重新看看旧笔记", source: "stale" }
      ]
    });

    expect(messages.map((message) => message.text)).toEqual([
      "推进 Echo MVP",
      "先做最小的一步",
      "朋友发来的提醒",
      "重新看看旧笔记"
    ]);
    expect(messages[2]).toMatchObject({ source: "Inbox", detail: "别忘了吃饭" });
    expect(messages.some((message) => message.text === "普通任务池项")).toBe(false);
  });

  it("always provides one calm fallback message", () => {
    expect(buildFocusCarouselMessages({ theme: "", customMessages: [], candidates: [] }))
      .toEqual([{ id: "fallback", source: "现在专注", text: "守住现在最重要的一件事" }]);
  });
});
