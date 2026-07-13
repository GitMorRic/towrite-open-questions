export function buildDevicePageHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#111111" />
    <link rel="manifest" href="/device.webmanifest" />
    <link rel="icon" href="/device-icon.svg" type="image/svg+xml" />
    <title>ToWrite Device Preview</title>
    <style>
      :root {
        color-scheme: light;
        font-family: ui-serif, Georgia, "Times New Roman", "Microsoft YaHei", serif;
        background: #ede9dc;
        color: #111;
      }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; }
      body { margin: 0; min-height: 100vh; min-height: 100dvh; background: #ede9dc; }
      button, select, input { font: inherit; }
      .shell {
        width: 100%;
        height: 100vh;
        height: 100dvh;
        min-height: 0;
        display: grid;
        grid-template-rows: auto auto 1fr auto;
        padding: max(14px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
        gap: 10px;
        overflow: hidden;
      }
      header {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
        align-items: start;
        border-bottom: 2px solid #111;
        padding-bottom: 8px;
      }
      h1, h2, h3, p { margin: 0; }
      h1 { font-size: 22px; line-height: 1.05; letter-spacing: 0; }
      .meta { margin-top: 4px; color: #333; font-size: 13px; }
      select,
      input {
        min-height: 34px;
        border: 2px solid #111;
        border-radius: 6px;
        background: #f7f4eb;
        color: #111;
        padding: 4px 8px;
        width: 100%;
      }
      .device-controls {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        min-width: 0;
      }
      .device-controls label {
        display: grid;
        gap: 3px;
        min-width: 0;
        color: #333;
        font-size: 11px;
        font-weight: 700;
      }
      .custom-controls {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
        min-width: 0;
      }
      .custom-controls[hidden] {
        display: none;
      }
      .screen-stage {
        display: grid;
        grid-template-rows: minmax(0, 1fr) auto;
        place-items: center;
        gap: 5px;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        overflow: clip;
        padding: 6px;
        border: 2px dashed #6f6a5e;
        border-radius: 8px;
        background: #dfdbcf;
      }
      .screen-size {
        min-height: 14px;
        color: #333;
        font-size: 11px;
        line-height: 1.2;
        text-align: center;
      }
      .screen {
        position: relative;
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        gap: 10px;
        border: 3px solid #111;
        border-radius: 8px;
        background: #f7f4eb;
        min-height: 0;
        width: 100%;
        height: 100%;
        justify-self: center;
        align-self: center;
        transform-origin: center center;
        padding: 14px;
        overflow: hidden;
        overflow: clip;
        overscroll-behavior: none;
        touch-action: pan-x;
      }
      .screen-head {
        display: grid;
        gap: 4px;
        border-bottom: 1px solid #111;
        padding-bottom: 8px;
      }
      .screen-title { display: flex; gap: 8px; justify-content: space-between; align-items: baseline; }
      .screen-title h2 { font-size: 24px; line-height: 1.1; }
      .screen-title span { font-size: 13px; color: #333; white-space: nowrap; }
      .screen-subtitle { color: #333; font-size: 14px; }
      .screen-keybar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 0.75fr) minmax(0, 1.25fr) minmax(0, 0.75fr) minmax(0, 1fr);
        gap: 4px;
        border-top: 1px solid #111;
        padding-top: 6px;
      }
      .screen-keybar button {
        min-width: 0;
        min-height: 28px;
        padding: 2px 4px;
        border-width: 1px;
        border-radius: 5px;
        background: #f7f4eb;
        color: #111;
        font-size: 12px;
        line-height: 1.05;
      }
      .screen-keybar .screen-home-key {
        background: #111;
        color: #f7f4eb;
      }
      .screen-keybar .key-main {
        display: inline-flex;
        gap: 3px;
        align-items: center;
        justify-content: center;
        min-width: 0;
      }
      .screen-keybar .key-icon {
        width: 12px;
        height: 12px;
        flex: 0 0 auto;
        stroke: currentColor;
      }
      .screen-keybar .screen-home-key.is-recording {
        background: #f7f4eb;
        color: #111;
        outline: 2px solid #111;
        outline-offset: -4px;
      }
      .screen-keybar small {
        display: block;
        margin-top: 1px;
        font-size: 9px;
        line-height: 1;
        font-weight: 700;
      }
      .screen-status {
        display: grid;
        gap: 2px;
        border: 1px solid #111;
        border-radius: 5px;
        background: #fffdf6;
        padding: 4px 6px;
        font-size: 12px;
        line-height: 1.2;
        font-weight: 700;
      }
      .screen-status.is-error {
        border-color: #111;
        background: #f7f4eb;
      }
      .screen-status.is-success {
        background: #111;
        color: #f7f4eb;
      }
      .content {
        display: grid;
        gap: 12px;
        align-content: start;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        overflow: clip;
        overscroll-behavior: contain;
        padding-bottom: 0;
      }
      .screen,
      .screen * {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
      .screen::-webkit-scrollbar,
      .screen *::-webkit-scrollbar {
        width: 0;
        height: 0;
        display: none;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .stat, .block, .card, .file, .article {
        border: 2px solid #111;
        border-radius: 7px;
        background: #fffdf6;
        padding: 10px;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .stat strong { display: block; font-size: 30px; line-height: 1; }
      .stat span { display: block; margin-top: 4px; font-size: 13px; color: #333; }
      .block { display: grid; gap: 8px; }
      .empty-line {
        border: 2px solid #111;
        border-radius: 7px;
        background: #fffdf6;
        padding: 10px;
        font-size: 18px;
        line-height: 1.25;
      }
      .stage-list, .next-list, .item-list { display: grid; gap: 8px; min-width: 0; }
      .stage, .next-action {
        display: grid;
        gap: 3px;
        border-left: 6px solid #111;
        padding: 7px 8px;
        background: #f2eee2;
      }
      .stage.amber { border-left-color: #9a6a00; }
      .stage.sky { border-left-color: #1f5d8c; }
      .stage.mint { border-left-color: #28795f; }
      .stage.rose { border-left-color: #9b3858; }
      .stage.violet { border-left-color: #5c4aa0; }
      .stage.slate { border-left-color: #555; }
      .stage strong, .next-action strong { font-size: 16px; }
      .muted { color: #444; font-size: 13px; }
      .card, .file, .article { display: grid; gap: 9px; border-left-width: 8px; }
      .card.think { border-left-color: #9a6a00; }
      .card.write { border-left-color: #1f5d8c; }
      .card h3, .file h3, .article h3 { font-size: 22px; line-height: 1.16; }
      .body { font-size: 18px; line-height: 1.42; }
      .note { border-top: 1px solid #111; padding-top: 8px; font-size: 16px; line-height: 1.35; }
      .reminder {
        border: 1px solid #111;
        border-radius: 6px;
        padding: 5px 7px;
        background: #f2eee2;
        font-size: 13px;
        font-weight: 700;
      }
      .reminder.due { background: #111; color: #f7f4eb; }
      .chips { display: flex; flex-wrap: wrap; gap: 5px; }
      .chip {
        border: 1px solid #111;
        border-radius: 999px;
        padding: 2px 7px;
        background: #f7f4eb;
        font-size: 12px;
      }
      .source { overflow-wrap: anywhere; color: #333; font-size: 13px; }
      .source-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 8px;
        align-items: center;
        min-width: 0;
      }
      .card-actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
        gap: 6px;
      }
      .card-actions .open-link { min-width: 0; }
      .open-link.is-recording {
        background: #111;
        color: #f7f4eb;
      }
      .peek-list {
        display: grid;
        gap: 5px;
        min-width: 0;
      }
      .peek-title {
        color: #333;
        font-size: 12px;
        font-weight: 700;
      }
      .peek-card {
        display: grid;
        grid-template-columns: auto auto minmax(0, 1fr);
        gap: 5px;
        align-items: center;
        border: 1px solid #111;
        border-left-width: 5px;
        border-radius: 5px;
        background: #fffdf6;
        padding: 4px 6px;
        min-width: 0;
        color: #111;
        text-decoration: none;
      }
      .peek-card.think { border-left-color: #9a6a00; }
      .peek-card.write { border-left-color: #1f5d8c; }
      .peek-card strong,
      .peek-card span {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .body, .note, h1, h2, h3, .muted, .chip { overflow-wrap: anywhere; min-width: 0; }
      .open-link {
        display: inline-grid;
        place-items: center;
        min-height: 36px;
        min-width: 104px;
        border: 2px solid #111;
        border-radius: 7px;
        color: #111;
        background: #f7f4eb;
        text-decoration: none;
        font-weight: 700;
      }
      footer {
        display: grid;
        gap: 8px;
      }
      footer[hidden],
      .tabs[hidden],
      .device-keybar[hidden] {
        display: none;
      }
      .tabs { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
      .device-keybar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1.35fr) minmax(0, 0.8fr) minmax(0, 1fr);
        gap: 6px;
        align-items: stretch;
      }
      .device-keybar button {
        min-width: 0;
        padding-inline: 6px;
      }
      .device-keybar .primary-key {
        min-height: 50px;
        background: #111;
        color: #f7f4eb;
      }
      .device-keybar .primary-key.is-recording {
        background: #f7f4eb;
        color: #111;
        outline: 3px solid #111;
        outline-offset: -5px;
      }
      .device-keybar small {
        display: block;
        margin-top: 2px;
        font-size: 10px;
        line-height: 1;
        font-weight: 700;
      }
      .notify-button[hidden] {
        display: none;
      }
      .wide { grid-column: 1 / -1; }
      button {
        min-height: 42px;
        border: 2px solid #111;
        border-radius: 7px;
        background: #f7f4eb;
        color: #111;
        font-weight: 700;
      }
      button[disabled] { color: #777; border-color: #777; }
      button.active { background: #111; color: #f7f4eb; }
      .error {
        border: 2px solid #111;
        border-radius: 7px;
        padding: 12px;
        background: #fffdf6;
        line-height: 1.5;
      }
      .screen.sim-landscape {
        gap: 6px;
        padding: 8px;
        border-width: 2px;
        border-radius: 6px;
      }
      .screen.sim-landscape .screen-head {
        gap: 2px;
        padding-bottom: 5px;
      }
      .screen.sim-landscape .screen-title h2 { font-size: 18px; }
      .screen.sim-landscape .screen-title span,
      .screen.sim-landscape .screen-subtitle { font-size: 11px; }
      .screen.sim-landscape .screen-keybar { gap: 3px; padding-top: 4px; }
      .screen.sim-landscape .screen-keybar button { min-height: 22px; font-size: 10px; }
      .screen.sim-landscape .screen-keybar small { font-size: 8px; }
      .screen.sim-landscape .content { gap: 6px; }
      .screen.sim-landscape .stats { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }
      .screen.sim-landscape .stat,
      .screen.sim-landscape .block,
      .screen.sim-landscape .card,
      .screen.sim-landscape .file,
      .screen.sim-landscape .article {
        padding: 6px 7px;
        border-width: 1px;
        border-radius: 5px;
      }
      .screen.sim-landscape .stat strong { font-size: 22px; }
      .screen.sim-landscape .stat span { margin-top: 2px; font-size: 10px; }
      .screen.sim-landscape .block { gap: 5px; }
      .screen.sim-landscape .stage-list,
      .screen.sim-landscape .next-list,
      .screen.sim-landscape .item-list { gap: 5px; }
      .screen.sim-landscape .stage,
      .screen.sim-landscape .next-action {
        border-left-width: 4px;
        padding: 4px 6px;
      }
      .screen.sim-landscape .stage strong,
      .screen.sim-landscape .next-action strong { font-size: 13px; }
      .screen.sim-landscape .muted { font-size: 10px; }
      .screen.sim-landscape .card,
      .screen.sim-landscape .file,
      .screen.sim-landscape .article { gap: 5px; border-left-width: 5px; }
      .screen.sim-landscape .card h3,
      .screen.sim-landscape .file h3,
      .screen.sim-landscape .article h3 { font-size: 16px; line-height: 1.14; }
      .screen.sim-landscape .body { font-size: 13px; line-height: 1.28; }
      .screen.sim-landscape .note { padding-top: 5px; font-size: 12px; line-height: 1.25; }
      .screen.sim-landscape .reminder { padding: 3px 5px; font-size: 10px; }
      .screen.sim-landscape .chips { gap: 3px; }
      .screen.sim-landscape .chip { padding: 1px 5px; font-size: 10px; }
      .screen.sim-landscape .source { font-size: 10px; }
      .screen.sim-landscape .source-row { gap: 5px; }
      .screen.sim-landscape .open-link { min-height: 28px; min-width: 78px; border-width: 1px; font-size: 12px; }
      .screen.sim-landscape .card-actions { gap: 4px; }
      .screen.sim-landscape .peek-title { font-size: 10px; }
      .screen.sim-landscape .peek-card { padding: 3px 5px; gap: 4px; }
      @media (min-width: 720px) and (orientation: portrait) {
        .shell { max-width: 520px; margin: 0 auto; }
      }
      @media (orientation: landscape) {
        .shell {
          max-width: none;
          padding: max(8px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
          gap: 6px;
        }
        header {
          gap: 8px;
          padding-bottom: 5px;
          border-bottom-width: 1px;
        }
        h1 { font-size: 18px; }
        .meta { margin-top: 2px; font-size: 11px; }
        select, input { min-height: 30px; padding: 2px 6px; font-size: 12px; }
        .device-controls {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
          gap: 5px;
        }
        .custom-controls {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 5px;
        }
        .screen-stage {
          padding: 4px;
          border-width: 1px;
          border-radius: 6px;
        }
        .screen {
          gap: 6px;
          padding: 8px;
          border-width: 2px;
          border-radius: 6px;
        }
        .screen-head {
          gap: 2px;
          padding-bottom: 5px;
        }
        .screen-title h2 { font-size: 18px; }
        .screen-title span, .screen-subtitle { font-size: 11px; }
        .content { gap: 6px; }
        .stats { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }
        .stat, .block, .card, .file, .article {
          padding: 6px 7px;
          border-width: 1px;
          border-radius: 5px;
        }
        .stat strong { font-size: 22px; }
        .stat span { margin-top: 2px; font-size: 10px; }
        .block { gap: 5px; }
        .stage-list, .next-list, .item-list { gap: 5px; }
        .stage, .next-action {
          border-left-width: 4px;
          padding: 4px 6px;
        }
        .stage strong, .next-action strong { font-size: 13px; }
        .muted { font-size: 10px; }
        .card, .file, .article { gap: 5px; border-left-width: 5px; }
        .card h3, .file h3, .article h3 { font-size: 16px; line-height: 1.14; }
        .body { font-size: 13px; line-height: 1.28; }
        .note { padding-top: 5px; font-size: 12px; line-height: 1.25; }
        .reminder { padding: 3px 5px; font-size: 10px; }
        .chips { gap: 3px; }
        .chip { padding: 1px 5px; font-size: 10px; }
        .source { font-size: 10px; }
        .source-row { gap: 5px; }
        .open-link { min-height: 28px; min-width: 78px; border-width: 1px; font-size: 12px; }
        .card-actions { gap: 4px; }
        .peek-title { font-size: 10px; }
        .peek-card { padding: 3px 5px; gap: 4px; }
        footer {
          gap: 5px;
        }
        .tabs {
          grid-column: 1 / -1;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 4px;
        }
        .wide { grid-column: auto; }
        .device-keybar {
          grid-template-columns: minmax(0, 1fr) minmax(0, 0.75fr) minmax(0, 1.35fr) minmax(0, 0.75fr) minmax(0, 1fr);
          gap: 4px;
        }
        .device-keybar .primary-key { min-height: 34px; }
        .device-keybar small { font-size: 9px; }
        button {
          min-height: 30px;
          border-width: 1px;
          border-radius: 5px;
          font-size: 12px;
        }
      }
      .screen.sim-micro {
        gap: 3px;
        padding: 4px;
        border-width: 2px;
        border-radius: 5px;
      }
      .screen.sim-micro .screen-head {
        gap: 1px;
        padding-bottom: 2px;
      }
      .screen.sim-micro .screen-title { gap: 4px; }
      .screen.sim-micro .screen-title h2 { font-size: 15px; line-height: 1; }
      .screen.sim-micro .screen-title span,
      .screen.sim-micro .screen-subtitle {
        font-size: 9px;
        line-height: 1.05;
      }
      .screen.sim-micro .screen-keybar {
        gap: 2px;
        padding-top: 2px;
      }
      .screen.sim-micro .screen-keybar button {
        min-height: 16px;
        padding: 1px 2px;
        border-width: 1px;
        border-radius: 3px;
        font-size: 8px;
      }
      .screen.sim-micro .screen-keybar small {
        display: none;
      }
      .screen.sim-micro .screen-keybar .key-icon {
        width: 8px;
        height: 8px;
      }
      .screen.sim-micro .screen-status {
        padding: 2px 4px;
        font-size: 9px;
        line-height: 1.05;
      }
      .screen.sim-micro .content { gap: 2px; }
      .screen.sim-micro .stats {
        gap: 0;
        border: 1px solid #111;
        border-radius: 4px;
        background: #fffdf6;
        overflow: hidden;
      }
      .screen.sim-micro .stat,
      .screen.sim-micro .block,
      .screen.sim-micro .card,
      .screen.sim-micro .file,
      .screen.sim-micro .article,
      .screen.sim-micro .error {
        padding: 3px 4px;
        border-width: 1px;
        border-radius: 4px;
      }
      .screen.sim-micro .stat {
        display: grid;
        align-content: center;
        gap: 1px;
        min-height: 0;
        border: 0;
        border-radius: 0;
        border-right: 1px solid #111;
        background: transparent;
        padding: 3px 4px;
        text-align: center;
      }
      .screen.sim-micro .stat:last-child { border-right: 0; }
      .screen.sim-micro .stat strong {
        display: block;
        font-size: 17px;
        line-height: 0.95;
      }
      .screen.sim-micro .stat span {
        margin-top: 0;
        font-size: 8px;
        line-height: 1;
      }
      .screen.sim-micro .block { gap: 2px; }
      .screen.sim-micro .block h3 { font-size: 12px; line-height: 1; }
      .screen.sim-micro .stage-list,
      .screen.sim-micro .next-list,
      .screen.sim-micro .item-list { gap: 2px; }
      .screen.sim-micro .stage,
      .screen.sim-micro .next-action {
        gap: 1px;
        border-left-width: 3px;
        padding: 2px 4px;
      }
      .screen.sim-micro .stage strong,
      .screen.sim-micro .next-action strong { font-size: 12px; line-height: 1.08; }
      .screen.sim-micro .muted { font-size: 9px; line-height: 1.08; }
      .screen.sim-micro .card,
      .screen.sim-micro .file,
      .screen.sim-micro .article { gap: 2px; border-left-width: 4px; }
      .screen.sim-micro .card h3,
      .screen.sim-micro .file h3,
      .screen.sim-micro .article h3 { font-size: 13px; line-height: 1.06; }
      .screen.sim-micro .body { font-size: 10px; line-height: 1.12; }
      .screen.sim-micro .note {
        padding-top: 2px;
        font-size: 9px;
        line-height: 1.1;
      }
      .screen.sim-micro .reminder { padding: 2px 4px; font-size: 9px; line-height: 1.05; }
      .screen.sim-micro .chips { gap: 2px; }
      .screen.sim-micro .chip {
        padding: 0 3px;
        font-size: 9px;
        line-height: 1.18;
      }
      .screen.sim-micro .source {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font-size: 8px;
        line-height: 1.05;
      }
      .screen.sim-micro .source-row { gap: 3px; }
      .screen.sim-micro .card-actions {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 2px;
      }
      .screen.sim-micro .card-actions .open-link {
        min-width: 0;
      }
      .screen.sim-micro .open-link {
        min-height: 18px;
        min-width: 52px;
        border-width: 1px;
        border-radius: 4px;
        font-size: 9px;
        line-height: 1.1;
      }
      .screen.sim-micro .error {
        font-size: 11px;
        line-height: 1.1;
      }
      .screen.sim-micro .empty-line {
        border-width: 1px;
        border-radius: 4px;
        padding: 4px 5px;
        font-size: 12px;
        line-height: 1.1;
      }
      .screen.sim-micro.page-home {
        grid-template-rows: auto minmax(0, 1fr) auto;
      }
      .screen.sim-micro.page-home .content {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        gap: 3px;
      }
      .screen.sim-micro.page-home .block {
        align-content: start;
        overflow: hidden;
        overflow: clip;
      }
      .screen.sim-micro.page-home .stage-list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .screen.sim-micro.page-home .stage {
        min-width: 0;
      }
      .screen.sim-micro.page-home .stage strong {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        font-size: 10px;
      }
      .screen.sim-micro.page-home .stage .muted {
        display: none;
      }
      .screen.sim-micro.page-home .next-action .muted {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .screen.sim-micro.page-home .empty-line {
        min-height: 0;
        display: grid;
        align-items: center;
        flex: 0 0 auto;
      }
      .screen.sim-micro.page-home .stats,
      .screen.sim-micro.page-home .block {
        flex: 0 0 auto;
      }
      .screen.sim-micro.page-home .home-empty {
        min-height: 22px;
      }
      .screen.sim-micro.page-home .home-empty strong {
        font-size: 11px;
        line-height: 1.05;
      }
      .screen.sim-micro.page-home .home-empty span {
        display: block;
        margin-top: 1px;
        color: #444;
        font-size: 8px;
        line-height: 1.05;
      }
      .screen.sim-micro.page-cards .content,
      .screen.sim-micro.page-workflow .content,
      .screen.sim-micro.page-articles .content {
        grid-template-rows: minmax(0, 1fr);
      }
      .screen.sim-micro.page-cards .content {
        display: grid;
        grid-template-rows: minmax(0, 1fr) auto;
      }
      .screen.sim-micro.page-cards .card,
      .screen.sim-micro.page-workflow .file,
      .screen.sim-micro.page-articles .article {
        align-content: start;
        overflow: hidden;
        overflow: clip;
      }
      .screen.sim-micro .peek-list { gap: 2px; }
      .screen.sim-micro .peek-title { font-size: 8px; line-height: 1; }
      .screen.sim-micro .peek-card {
        grid-template-columns: auto auto minmax(0, 1fr);
        gap: 2px;
        padding: 2px 4px;
        border-left-width: 3px;
        font-size: 9px;
        line-height: 1.05;
      }
      .screen.fit-tight .screen-head { padding-bottom: 2px; }
      .screen.fit-tight .content { gap: 2px; }
      .screen.fit-tight .card,
      .screen.fit-tight .file,
      .screen.fit-tight .article,
      .screen.fit-tight .block { gap: 2px; }
      .screen.fit-ultra .screen-title h2 { font-size: 14px; }
      .screen.fit-ultra .screen-title span,
      .screen.fit-ultra .screen-subtitle { font-size: 9px; }
      .screen.fit-ultra .card h3,
      .screen.fit-ultra .file h3,
      .screen.fit-ultra .article h3 { font-size: 13px; }
      .screen.fit-ultra .body { font-size: 10px; line-height: 1.12; }
      .screen.fit-ultra .note,
      .screen.fit-ultra .source { font-size: 9px; line-height: 1.08; }
      .screen.fit-ultra .open-link { min-height: 20px; }
      .screen.fit-scale .content {
        width: calc(100% / var(--screen-fit-scale, 1));
        transform: scale(var(--screen-fit-scale, 1));
        transform-origin: left top;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header>
        <div>
          <h1>ToWrite 小屏预览</h1>
          <p id="meta" class="meta">连接中...</p>
        </div>
      </header>
      <section class="device-controls" aria-label="模拟设备参数">
        <label>
          Profile
          <select id="profile" aria-label="设备配置">
          <option value="mobile-eink">mobile-eink</option>
          <option value="eink-bw">eink-bw</option>
          <option value="desktop-card">desktop-card</option>
          </select>
        </label>
        <label>
          屏幕
          <select id="screenPreset" aria-label="屏幕预设">
            <option value="eink-2.7-landscape">2.7寸 264×176 横屏</option>
            <option value="eink-2.7-portrait">2.7寸 176×264 竖屏</option>
            <option value="eink-2.13-landscape">2.13寸 250×122 横屏</option>
            <option value="eink-4.2-landscape">4.2寸 400×300 横屏</option>
            <option value="phone-auto">手机窗口</option>
            <option value="custom">自定义</option>
          </select>
        </label>
        <div id="customControls" class="custom-controls">
          <label>英寸<input id="screenInches" type="number" min="0.5" max="20" step="0.1" inputmode="decimal" /></label>
          <label>宽度<input id="screenWidth" type="number" min="80" max="3000" step="1" inputmode="numeric" /></label>
          <label>高度<input id="screenHeight" type="number" min="80" max="3000" step="1" inputmode="numeric" /></label>
        </div>
      </section>
      <section id="screenStage" class="screen-stage" aria-label="模拟墨水屏">
        <section id="screen" class="screen" aria-live="polite"></section>
        <p id="screenSize" class="screen-size"></p>
      </section>
      <footer hidden>
        <div class="tabs" hidden>
          <button data-page="home">首页</button>
          <button data-page="cards">卡片</button>
          <button data-page="workflow">Workflow</button>
          <button data-page="articles">来源笔记</button>
        </div>
        <div class="device-keybar" aria-label="模拟设备按键" hidden>
          <button id="quickCapture" type="button">新想法</button>
          <button id="prev" type="button">上一页</button>
          <button id="homeVoice" class="primary-key" type="button">首页<small>长按语音</small></button>
          <button id="next" type="button">下一页</button>
          <button id="phoneJump" type="button">手机输入</button>
        </div>
        <button id="notify" class="notify-button" type="button" hidden>提醒</button>
      </footer>
    </main>
    <script>
      const SCREEN_PRESETS = {
        "eink-2.7-landscape": { label: "2.7寸横屏", width: 264, height: 176, inches: 2.7 },
        "eink-2.7-portrait": { label: "2.7寸竖屏", width: 176, height: 264, inches: 2.7 },
        "eink-2.13-landscape": { label: "2.13寸横屏", width: 250, height: 122, inches: 2.13 },
        "eink-4.2-landscape": { label: "4.2寸横屏", width: 400, height: 300, inches: 4.2 },
        "phone-auto": { label: "手机窗口", width: 390, height: 844, inches: 6.3 },
        custom: { label: "自定义", width: 264, height: 176, inches: 2.7 }
      };
      const params = new URLSearchParams(location.search);
      const state = {
        token: params.get("token") || localStorage.getItem("towrite-device-token") || "",
        profile: params.get("profile") || localStorage.getItem("towrite-device-profile") || "mobile-eink",
        screenPreset: params.get("screen") || localStorage.getItem("towrite-device-screen") || "eink-2.7-landscape",
        screenWidth: params.get("width") || localStorage.getItem("towrite-device-width") || "264",
        screenHeight: params.get("height") || localStorage.getItem("towrite-device-height") || "176",
        screenInches: params.get("inches") || localStorage.getItem("towrite-device-inches") || "2.7",
        page: params.get("page") || "home",
        cursor: params.get("cursor") || "0",
        sourceFile: params.get("sourceFile") || "",
        payload: null,
        eventSource: null,
        lastEventSummary: "",
        isRecording: false,
        isSavingVoice: false,
        voiceStatus: "",
        voiceStatusKind: "",
        resizeTimer: 0
      };
      const screenEl = document.getElementById("screen");
      const screenStageEl = document.getElementById("screenStage");
      const screenSizeEl = document.getElementById("screenSize");
      const metaEl = document.getElementById("meta");
      const profileEl = document.getElementById("profile");
      const screenPresetEl = document.getElementById("screenPreset");
      const screenWidthEl = document.getElementById("screenWidth");
      const screenHeightEl = document.getElementById("screenHeight");
      const screenInchesEl = document.getElementById("screenInches");
      const customControlsEl = document.getElementById("customControls");
      const quickCaptureEl = document.getElementById("quickCapture");
      const prevEl = document.getElementById("prev");
      const homeVoiceEl = document.getElementById("homeVoice");
      const nextEl = document.getElementById("next");
      const phoneJumpEl = document.getElementById("phoneJump");
      const notifyEl = document.getElementById("notify");
      profileEl.value = state.profile;
      screenPresetEl.value = SCREEN_PRESETS[state.screenPreset] ? state.screenPreset : "custom";
      hydrateScreenInputs();

      function h(value) {
        return String(value == null ? "" : value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function hydrateScreenInputs() {
        const preset = SCREEN_PRESETS[screenPresetEl.value] || SCREEN_PRESETS.custom;
        if (screenPresetEl.value !== "custom") {
          state.screenWidth = String(preset.width);
          state.screenHeight = String(preset.height);
          state.screenInches = String(preset.inches);
        }
        screenWidthEl.value = state.screenWidth;
        screenHeightEl.value = state.screenHeight;
        screenInchesEl.value = state.screenInches;
        customControlsEl.hidden = false;
        updateScreenFrame();
      }

      function selectedScreenSpec() {
        if (screenPresetEl.value === "phone-auto") {
          return {
            label: "手机窗口",
            width: Math.max(160, Math.round(window.innerWidth)),
            height: Math.max(120, Math.round(window.innerHeight)),
            inches: numberOr(screenInchesEl.value, SCREEN_PRESETS["phone-auto"].inches)
          };
        }
        const preset = screenPresetEl.value === "custom" ? undefined : SCREEN_PRESETS[screenPresetEl.value];
        return {
          label: preset ? preset.label : "自定义",
          width: Math.max(80, Math.round(numberOr(screenWidthEl.value, preset?.width || 264))),
          height: Math.max(80, Math.round(numberOr(screenHeightEl.value, preset?.height || 176))),
          inches: numberOr(screenInchesEl.value, preset?.inches || 2.7)
        };
      }

      function updateScreenFrame() {
        const spec = selectedScreenSpec();
        const stageRect = screenStageEl.getBoundingClientRect();
        const availableWidth = Math.max(120, stageRect.width - 12);
        const availableHeight = Math.max(90, stageRect.height - 26);
        const ratio = spec.width / spec.height;
        const scale = screenScaleForSpec(spec, availableWidth, availableHeight);
        screenEl.style.width = Math.floor(spec.width) + "px";
        screenEl.style.height = Math.floor(spec.height) + "px";
        screenEl.style.transform = "scale(" + scale.toFixed(3) + ")";
        screenEl.classList.toggle("sim-landscape", spec.width >= spec.height);
        screenEl.classList.toggle("sim-portrait", spec.width < spec.height);
        screenEl.classList.toggle("sim-micro", spec.width <= 320 && spec.height <= 220);
        const ppi = spec.inches > 0 ? Math.sqrt(spec.width * spec.width + spec.height * spec.height) / spec.inches : 0;
        screenSizeEl.textContent = spec.label + " · " + spec.width + "×" + spec.height + " · " + ratioText(spec.width, spec.height) + (spec.inches ? " · " + spec.inches + "寸" : "") + (ppi ? " · " + ppi.toFixed(0) + "ppi" : "");
        window.requestAnimationFrame(fitScreenContent);
      }

      function screenScaleForSpec(spec, availableWidth, availableHeight) {
        const fitScale = Math.min(availableWidth / spec.width, availableHeight / spec.height);
        if (screenPresetEl.value === "phone-auto") {
          return Math.max(0.2, Math.min(1, fitScale));
        }
        const longEdge = Math.max(spec.width, spec.height);
        const previewCap = Math.min(3.4, Math.max(1, 880 / longEdge));
        return Math.max(0.2, Math.min(fitScale, previewCap));
      }

      function numberOr(value, fallback) {
        const number = Number.parseFloat(value);
        return Number.isFinite(number) && number > 0 ? number : fallback;
      }

      function ratioText(width, height) {
        const divisor = gcd(width, height);
        return (width / divisor) + ":" + (height / divisor);
      }

      function gcd(left, right) {
        let a = Math.abs(left);
        let b = Math.abs(right);
        while (b) {
          const next = a % b;
          a = b;
          b = next;
        }
        return a || 1;
      }

      function feedUrl() {
        const next = new URLSearchParams();
        const screen = selectedScreenSpec();
        next.set("token", state.token);
        next.set("profile", state.profile);
        next.set("page", state.page);
        next.set("cursor", state.cursor);
        next.set("width", String(screen.width));
        next.set("height", String(screen.height));
        next.set("inches", String(screen.inches));
        if (state.page === "cards" && state.sourceFile) {
          next.set("sourceFile", state.sourceFile);
        }
        return "/api/v1/device-feed?" + next.toString();
      }

      function eventsUrl() {
        const next = new URLSearchParams();
        next.set("token", state.token);
        return "/api/v1/events?" + next.toString();
      }

      async function load(page, cursor, sourceFile) {
        if (page) state.page = page;
        if (cursor != null) state.cursor = cursor;
        if (arguments.length >= 3) {
          state.sourceFile = sourceFile || "";
        }
        if (state.page !== "cards") {
          state.sourceFile = "";
        }
        updateTabs();
        screenEl.innerHTML = '<div class="error">正在刷新小屏内容...</div>';
        try {
          const response = await fetch(feedUrl(), { cache: "no-store" });
          if (!response.ok) throw new Error("HTTP " + response.status);
          state.payload = await response.json();
          localStorage.setItem("towrite-device-token", state.token);
          localStorage.setItem("towrite-device-profile", state.profile);
          localStorage.setItem("towrite-device-screen", screenPresetEl.value);
          localStorage.setItem("towrite-device-width", screenWidthEl.value);
          localStorage.setItem("towrite-device-height", screenHeightEl.value);
          localStorage.setItem("towrite-device-inches", screenInchesEl.value);
          updateNotifyButton();
          render();
        } catch (error) {
          screenEl.innerHTML = '<div class="error"><strong>连接失败</strong><br />请确认 Obsidian 插件已开启 External API，bind host 已设置为 0.0.0.0，并且 URL 里带有 token。<br /><span class="muted">' + h(error.message || error) + '</span></div>';
          metaEl.textContent = "未连接";
        }
      }

      function render() {
        updateScreenFrame();
        const payload = state.payload;
        const screen = payload.screens[0];
        const updated = new Date(payload.generatedAt).toLocaleTimeString();
        const deviceInfo = payload.device.width && payload.device.height
          ? payload.device.width + "×" + payload.device.height + " · " + payload.device.layout
          : payload.device.layout;
        metaEl.textContent = payload.vaultName + " · " + payload.profile + " · " + deviceInfo + " · " + updated;
        state.page = payload.navigation.page;
        state.cursor = payload.navigation.cursor;
        prevEl.disabled = !payload.navigation.hasPrev;
        nextEl.disabled = !payload.navigation.hasNext;
        prevEl.dataset.cursor = payload.navigation.prevCursor || payload.navigation.cursor;
        nextEl.dataset.cursor = payload.navigation.nextCursor || payload.navigation.cursor;
        updateTabs();
        updateKeybar();
        screenEl.classList.remove("page-home", "page-cards", "page-workflow", "page-articles");
        screenEl.classList.add("page-" + payload.navigation.page);

        screenEl.innerHTML =
          '<div class="screen-head">' +
          '<div class="screen-title"><h2>' + h(screen.title) + '</h2><span>' + h(screen.subtitle || "") + '</span></div>' +
          '<p class="screen-subtitle">' + h(summaryLine(payload.summary)) + '</p>' +
          '</div>' +
          renderScreenStatus() +
          '<div class="content">' + renderItems(screen.items) + renderPeekItems(screen.peekItems || []) + '</div>' +
          renderScreenKeyHints();
        window.requestAnimationFrame(fitScreenContent);
      }

      function fitScreenContent() {
        const content = screenEl.querySelector(".content");
        if (!content) return;
        screenEl.classList.remove("fit-tight", "fit-ultra", "fit-scale");
        screenEl.style.removeProperty("--screen-fit-scale");
        if (!contentOverflows(content)) return;
        screenEl.classList.add("fit-tight");
        if (!contentOverflows(content)) return;
        screenEl.classList.add("fit-ultra");
        if (!contentOverflows(content)) return;
        const available = Math.max(1, content.clientHeight);
        const needed = Math.max(1, content.scrollHeight);
        const scale = Math.max(0.72, Math.min(1, available / needed));
        screenEl.style.setProperty("--screen-fit-scale", scale.toFixed(3));
        screenEl.classList.add("fit-scale");
      }

      function contentOverflows(content) {
        return content.scrollHeight > content.clientHeight + 1;
      }

      function summaryLine(summary) {
        return "ToThink " + summary.think + " · ToWrite " + summary.write + " · Workflow " + summary.workflowFiles + " · 提醒 " + (summary.remindersDue || 0);
      }

      function renderScreenStatus() {
        if (!state.voiceStatus) return "";
        return '<div class="screen-status ' + h(state.voiceStatusKind || "") + '">' + h(state.voiceStatus) + '</div>';
      }

      function renderItems(items) {
        return items.map(function(item) {
          if (item.type === "stats") return renderStats(item);
          if (item.type === "workflow-stage") return renderStages(item.stages);
          if (item.type === "next-actions") return renderNextActions(item.actions);
          if (item.type === "card") return renderCard(item);
          if (item.type === "workflow-file") return renderWorkflowFile(item);
          if (item.type === "article") return renderArticle(item);
          return renderEmpty(item.text);
        }).join("");
      }

      function renderEmpty(text) {
        const label = String(text || "");
        if (label.includes("Workflow Stages")) {
          return '<div class="empty-line home-empty"><strong>Workflow 未开启</strong><span>在插件设置里配置后会显示阶段数量</span></div>';
        }
        if (label.includes("下一步")) {
          return '<div class="empty-line home-empty"><strong>暂无下一步</strong><span>有 nextAction 或未解决卡片后会显示</span></div>';
        }
        return '<div class="empty-line">' + h(label) + '</div>';
      }

      function renderStats(item) {
        return '<div class="stats">' + item.stats.map(function(stat) {
          return '<div class="stat"><strong>' + h(stat.value) + '</strong><span>' + h(stat.label) + '</span></div>';
        }).join("") + '</div>';
      }

      function renderStages(stages) {
        return '<section class="block"><h3>Workflow 状态</h3><div class="stage-list">' + stages.map(function(stage) {
          return '<div class="stage ' + h(stage.color) + '">' +
            '<strong>' + h(stage.title) + ' · ' + h(stage.count) + '</strong>' +
            '<span class="muted">stale ' + h(stage.staleCount) + ' · ' + h(stage.description) + '</span>' +
            '</div>';
        }).join("") + '</div></section>';
      }

      function renderNextActions(actions) {
        return '<section class="block"><h3>下一步</h3><div class="next-list">' + actions.map(function(action) {
          return '<a class="next-action" href="' + h(action.openUri) + '">' +
            '<strong>' + h(action.title) + '</strong>' +
            '<span class="muted">' + h(action.source) + '</span>' +
            '</a>';
        }).join("") + '</div></section>';
      }

      function renderCard(item) {
        const reminder = item.reminderAt
          ? '<p class="reminder ' + (item.reminderDue ? 'due' : '') + '">' + (item.reminderDue ? '提醒到期：' : '提醒：') + h(formatReminder(item.reminderAt)) + (item.reminderNote ? ' · ' + h(item.reminderNote) : '') + '</p>'
          : '';
        const body = compactSameText(item.title, item.body)
          ? ''
          : '<p class="body">' + h(item.body) + '</p>';
        const tags = item.tags && item.tags.length
          ? item.tags.map(function(tag) { return '<span class="chip">#' + h(tag) + '</span>'; }).join("")
          : '';
        const answer = item.answerUrl
          ? '<a class="open-link" href="' + h(item.answerUrl) + '">回答</a>'
          : '';
        return '<article class="card ' + h(item.lane) + '">' +
          '<div class="chips"><span class="chip">' + h(item.lane === "think" ? "ToThink" : "ToWrite") + '</span><span class="chip">' + h(item.status) + '</span><span class="chip">' + h(item.kind) + '</span>' + tags + '</div>' +
          '<h3>' + h(item.title) + '</h3>' +
          body +
          reminder +
          (item.note ? '<p class="note">' + h(item.note) + '</p>' : '') +
          '<p class="source">' + h(item.source) + '</p>' +
          '<div class="card-actions">' + answer + '<a class="open-link" href="' + h(item.openUri) + '">来源</a></div>' +
          '</article>';
      }

      function compactSameText(left, right) {
        return String(left || "").trim() === String(right || "").trim();
      }

      function renderWorkflowFile(item) {
        return '<article class="file">' +
          '<div class="chips"><span class="chip">' + h(item.stageTitle) + '</span><span class="chip">' + (item.stale ? 'stale' : 'fresh') + '</span><span class="chip">Q ' + h(item.openQuestionCount) + '</span></div>' +
          '<h3>' + h(item.title) + '</h3>' +
          '<p class="body">' + h(item.description) + '</p>' +
          (item.nextAction ? '<p class="note">下一步：' + h(item.nextAction) + '</p>' : '') +
          '<div class="source-row"><p class="source">' + h(item.filePath) + '</p><a class="open-link" href="' + h(item.openUri) + '">打开笔记</a></div>' +
          '</article>';
      }

      function renderArticle(item) {
        return '<article class="article">' +
          '<h3>' + h(item.title) + '</h3>' +
          '<p class="body">open ' + h(item.open) + ' · candidate ' + h(item.candidate) + ' · ToThink ' + h(item.think) + ' · ToWrite ' + h(item.write) + '</p>' +
          '<div class="source-row"><p class="source">' + h(item.filePath) + '</p><button class="open-link" type="button" data-source-file="' + h(item.filePath) + '">看卡片</button><a class="open-link" href="' + h(item.openUri) + '">打开笔记</a></div>' +
          '</article>';
      }

      function renderPeekItems(items) {
        if (!items || items.length === 0) return "";
        return '<section class="peek-list"><div class="peek-title">下一张预览</div>' + items.map(function(item) {
          const href = item.answerUrl || item.openUri;
          return '<a class="peek-card ' + h(item.lane) + '" href="' + h(href) + '">' +
            '<span>' + h(item.lane === "think" ? "ToThink" : "ToWrite") + '</span>' +
            '<span>' + h(item.status) + '</span>' +
            '<strong>' + h(item.title) + '</strong>' +
            '</a>';
        }).join("") + '</section>';
      }

      function renderScreenKeyHints() {
        return '<nav class="screen-keybar" aria-label="屏幕按键提示">' +
          '<button type="button" data-device-key="quick" ' + (!quickCaptureUrl() ? 'disabled' : '') + '>新想法</button>' +
          '<button type="button" data-device-key="prev" ' + (!canMovePrevious() ? 'disabled' : '') + '>←</button>' +
          '<button type="button" class="screen-home-key ' + (state.isRecording || state.isSavingVoice ? 'is-recording' : '') + '" data-device-key="home">' + homeKeyContent() + '<small>' + h(state.isRecording ? '录音中' : state.isSavingVoice ? '保存中' : '长按录音') + '</small></button>' +
          '<button type="button" data-device-key="next" ' + (!canMoveNext() ? 'disabled' : '') + '>→</button>' +
          '<button type="button" data-device-key="phone" ' + (!rightKeyEnabled() ? 'disabled' : '') + '>' + h(rightKeyLabel()) + '</button>' +
          '</nav>';
      }

      function homeKeyContent() {
        const label = state.isRecording ? "录音" : state.isSavingVoice ? "保存" : "首页";
        return '<span class="key-main">' + homeIconSvg() + micIconSvg() + '<span>' + h(label) + '</span></span>';
      }

      function homeIconSvg() {
        return '<svg class="key-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M10 20v-5h4v5"/></svg>';
      }

      function micIconSvg() {
        return '<svg class="key-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/><path d="M8 21h8"/></svg>';
      }

      function currentScreen() {
        return state.payload && state.payload.screens ? state.payload.screens[0] : null;
      }

      function screenAction(id) {
        const screen = currentScreen();
        return screen && (screen.actions || []).find(function(action) {
          return action.id === id && action.enabled;
        });
      }

      function quickCaptureUrl() {
        const action = screenAction("quickCapture");
        return action && action.uri ? action.uri : quickCaptureFallbackUrl();
      }

      function quickCaptureFallbackUrl() {
        if (!state.token) return "";
        const next = new URLSearchParams();
        next.set("token", state.token);
        return "/device/input?" + next.toString();
      }

      function phoneJumpUrl() {
        const screen = currentScreen();
        const answer = screenAction("answerCard");
        return answer && answer.uri
          ? answer.uri
          : screen && screen.companionUrl
            ? screen.companionUrl
            : quickCaptureUrl();
      }

      function rightKeyLabel() {
        if (screenAction("viewCards")) return "看卡片";
        if (screenAction("answerCard")) return "回答";
        return "手机输入";
      }

      function rightKeyEnabled() {
        return Boolean(screenAction("viewCards") || phoneJumpUrl());
      }

      function updateKeybar() {
        const quickUrl = quickCaptureUrl();
        const phoneUrl = phoneJumpUrl();
        quickCaptureEl.disabled = !quickUrl;
        phoneJumpEl.disabled = !phoneUrl;
        homeVoiceEl.classList.toggle("is-recording", state.isRecording || state.isSavingVoice);
        homeVoiceEl.innerHTML = (state.isRecording ? '录音中' : state.isSavingVoice ? '保存中' : '首页') + '<small>长按录音</small>';
      }

      function openDeviceUrl(url) {
        if (!url) return;
        window.location.href = url;
      }

      function directVoiceCapture() {
        if (state.isRecording || state.isSavingVoice) return;
        if (!state.token) {
          setVoiceStatus("缺少 token，不能写入。", "is-error");
          return;
        }
        if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
          setVoiceStatus("语音需要 HTTPS 或安全上下文，请用手机输入。", "is-error");
          return;
        }
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) {
          setVoiceStatus("当前浏览器不支持语音转文字，请用“新想法”页面输入。", "is-error");
          return;
        }
        const recognition = new Recognition();
        let transcript = "";
        let failed = false;
        recognition.lang = navigator.language && navigator.language.toLowerCase().startsWith("zh") ? navigator.language : "zh-CN";
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.onstart = function() {
          state.isRecording = true;
          state.isSavingVoice = false;
          state.voiceStatus = "录音中：讲完后会自动保存为新想法。";
          state.voiceStatusKind = "";
          render();
          showStatus("正在听写，讲完后会自动保存为新想法。");
        };
        recognition.onresult = function(event) {
          transcript = Array.from(event.results)
            .map(function(result) { return result[0] && result[0].transcript ? result[0].transcript : ""; })
            .join("")
            .trim();
        };
        recognition.onerror = function(event) {
          failed = true;
          state.isRecording = false;
          state.isSavingVoice = false;
          state.voiceStatus = "语音识别失败：" + (event.error || "unknown");
          state.voiceStatusKind = "is-error";
          render();
          showStatus(state.voiceStatus);
        };
        recognition.onend = function() {
          state.isRecording = false;
          render();
          if (failed) return;
          if (!transcript) {
            setVoiceStatus("没有识别到内容。", "is-error");
            return;
          }
          submitVoiceCapture(transcript);
        };
        try {
          recognition.start();
        } catch (error) {
          state.isRecording = false;
          state.isSavingVoice = false;
          state.voiceStatus = "语音启动失败：" + (error.message || error);
          state.voiceStatusKind = "is-error";
          render();
          showStatus(state.voiceStatus);
        }
      }

      async function submitVoiceCapture(text) {
        state.isSavingVoice = true;
        state.voiceStatus = "正在保存语音想法...";
        state.voiceStatusKind = "";
        render();
        showStatus("正在保存语音想法...");
        try {
          const response = await fetch("/api/v1/captures", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + state.token,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              title: titleFromText(text),
              text: text,
              tags: ["voice", "device"],
              clientId: "device-voice"
            })
          });
          if (!response.ok) throw new Error("HTTP " + response.status);
          await response.json().catch(function() { return null; });
          state.isSavingVoice = false;
          state.voiceStatus = "已保存到笔记：" + titleFromText(text);
          state.voiceStatusKind = "is-success";
          showStatus("语音想法已保存。");
          load(state.page, state.cursor);
        } catch (error) {
          state.isSavingVoice = false;
          state.voiceStatus = "保存失败：" + (error.message || error);
          state.voiceStatusKind = "is-error";
          render();
          showStatus(state.voiceStatus);
        }
      }

      function titleFromText(text) {
        const compact = String(text || "").replace(/\\s+/g, " ").trim();
        return compact.length <= 24 ? compact : compact.slice(0, 24) + "...";
      }

      function showStatus(text) {
        metaEl.textContent = text;
      }

      function setVoiceStatus(text, kind) {
        state.voiceStatus = text;
        state.voiceStatusKind = kind || "";
        showStatus(text);
        if (state.payload) render();
      }

      function formatReminder(value) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return value;
        return date.toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      }

      function updateTabs() {
        document.querySelectorAll("[data-page]").forEach(function(button) {
          button.classList.toggle("active", button.dataset.page === state.page);
        });
      }

      const PAGE_ORDER = ["home", "cards", "articles", "workflow"];

      function pageCount(page) {
        const summary = state.payload && state.payload.summary ? state.payload.summary : {};
        if (page === "home") return 1;
        if (page === "cards") return summary.unresolved || 0;
        if (page === "articles") return summary.blockedArticles || 0;
        if (page === "workflow") return summary.workflowFiles || 0;
        return 0;
      }

      function pageTarget(page) {
        return { page: page, cursor: "0", sourceFile: "" };
      }

      function adjacentPageTarget(direction) {
        if (!state.payload) return null;
        const current = state.payload.navigation ? state.payload.navigation.page : state.page;
        if (current === "cards" && state.sourceFile) {
          const sourceReturn = pageCount("articles") > 0 ? pageTarget("articles") : pageTarget("home");
          return sourceReturn;
        }
        const index = Math.max(0, PAGE_ORDER.indexOf(current));
        for (let step = 1; step < PAGE_ORDER.length; step += 1) {
          const nextIndex = direction === "next"
            ? (index + step) % PAGE_ORDER.length
            : (index - step + PAGE_ORDER.length) % PAGE_ORDER.length;
          const page = PAGE_ORDER[nextIndex];
          if (page === "home") {
            if (current !== "home") return pageTarget("home");
            continue;
          }
          if (pageCount(page) > 0) {
            return pageTarget(page);
          }
        }
        return null;
      }

      function canMovePrevious() {
        const navigation = state.payload && state.payload.navigation ? state.payload.navigation : {};
        return Boolean(navigation.hasPrev || adjacentPageTarget("prev"));
      }

      function canMoveNext() {
        const navigation = state.payload && state.payload.navigation ? state.payload.navigation : {};
        return Boolean(navigation.hasNext || adjacentPageTarget("next"));
      }

      function movePrevious() {
        const navigation = state.payload && state.payload.navigation ? state.payload.navigation : {};
        if (navigation.hasPrev) {
          load(state.page, navigation.prevCursor || "0");
          return;
        }
        const target = adjacentPageTarget("prev");
        if (target) load(target.page, target.cursor, target.sourceFile);
      }

      function moveNext() {
        const navigation = state.payload && state.payload.navigation ? state.payload.navigation : {};
        if (navigation.hasNext) {
          load(state.page, navigation.nextCursor || navigation.cursor || "0");
          return;
        }
        const target = adjacentPageTarget("next");
        if (target) load(target.page, target.cursor, target.sourceFile);
      }

      function handleDeviceKey(key, elapsed) {
        if (key === "quick") {
          openDeviceUrl(quickCaptureUrl());
          return;
        }
        if (key === "prev") {
          movePrevious();
          return;
        }
        if (key === "next") {
          moveNext();
          return;
        }
        if (key === "phone") {
          const viewCards = screenAction("viewCards");
          if (viewCards && viewCards.sourceFile) {
            load("cards", "0", viewCards.sourceFile);
            return;
          }
          openDeviceUrl(phoneJumpUrl());
          return;
        }
        if (key === "home") {
          if (elapsed >= 520) {
            directVoiceCapture();
            return;
          }
          load("home", "0");
        }
      }

      document.querySelectorAll("[data-page]").forEach(function(button) {
        button.addEventListener("click", function() {
          load(button.dataset.page, "0", "");
        });
      });
      quickCaptureEl.addEventListener("click", function() {
        handleDeviceKey("quick", 0);
      });
      prevEl.addEventListener("click", function() { handleDeviceKey("prev", 0); });
      nextEl.addEventListener("click", function() { handleDeviceKey("next", 0); });
      phoneJumpEl.addEventListener("click", function() {
        handleDeviceKey("phone", 0);
      });
      notifyEl.addEventListener("click", function() { enableNotifications(); });

      let homePressTimer = 0;
      let homePressTriggered = false;

      function beginHomePress(target, event) {
        window.clearTimeout(homePressTimer);
        homePressTriggered = false;
        target.setPointerCapture?.(event.pointerId);
        homePressTimer = window.setTimeout(function() {
          homePressTriggered = true;
          directVoiceCapture();
        }, 620);
      }

      function finishHomePress() {
        window.clearTimeout(homePressTimer);
        homePressTimer = 0;
        if (!homePressTriggered) {
          handleDeviceKey("home", 0);
        }
        homePressTriggered = false;
      }

      function cancelHomePress() {
        window.clearTimeout(homePressTimer);
        homePressTimer = 0;
        homePressTriggered = false;
      }

      homeVoiceEl.addEventListener("pointerdown", function(event) {
        beginHomePress(homeVoiceEl, event);
      });
      homeVoiceEl.addEventListener("pointerup", function(event) {
        event.preventDefault();
        finishHomePress();
      });
      homeVoiceEl.addEventListener("pointercancel", function() {
        cancelHomePress();
      });
      homeVoiceEl.addEventListener("contextmenu", function(event) {
        event.preventDefault();
      });
      homeVoiceEl.addEventListener("keydown", function(event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleDeviceKey("home", 0);
        }
      });
      screenEl.addEventListener("click", function(event) {
        const sourceTarget = event.target && event.target.closest ? event.target.closest("[data-source-file]") : null;
        if (sourceTarget) {
          event.preventDefault();
          load("cards", "0", sourceTarget.dataset.sourceFile || "");
          return;
        }
        const target = event.target && event.target.closest ? event.target.closest("[data-device-key]") : null;
        if (!target || target.disabled || target.dataset.deviceKey === "home") return;
        event.preventDefault();
        handleDeviceKey(target.dataset.deviceKey, 0);
      });
      screenEl.addEventListener("pointerdown", function(event) {
        const target = event.target && event.target.closest ? event.target.closest('[data-device-key="home"]') : null;
        if (!target) return;
        beginHomePress(target, event);
      });
      screenEl.addEventListener("pointerup", function(event) {
        const target = event.target && event.target.closest ? event.target.closest('[data-device-key="home"]') : null;
        if (!target) return;
        event.preventDefault();
        finishHomePress();
      });
      screenEl.addEventListener("pointercancel", function() {
        cancelHomePress();
      });
      screenEl.addEventListener("contextmenu", function(event) {
        const target = event.target && event.target.closest ? event.target.closest('[data-device-key="home"]') : null;
        if (target) event.preventDefault();
      });
      profileEl.addEventListener("change", function() {
        state.profile = profileEl.value;
        load(state.page, "0");
      });
      screenPresetEl.addEventListener("change", function() {
        state.screenPreset = screenPresetEl.value;
        hydrateScreenInputs();
        load(state.page, "0");
      });
      [screenWidthEl, screenHeightEl, screenInchesEl].forEach(function(input) {
        input.addEventListener("change", function() {
          if (screenPresetEl.value !== "custom" && document.activeElement === input) {
            screenPresetEl.value = "custom";
            state.screenPreset = "custom";
          }
          state.screenWidth = screenWidthEl.value;
          state.screenHeight = screenHeightEl.value;
          state.screenInches = screenInchesEl.value;
          updateScreenFrame();
          load(state.page, "0");
        });
        input.addEventListener("input", function() {
          if (screenPresetEl.value !== "custom" && document.activeElement === input) {
            screenPresetEl.value = "custom";
            state.screenPreset = "custom";
          }
          state.screenWidth = screenWidthEl.value;
          state.screenHeight = screenHeightEl.value;
          state.screenInches = screenInchesEl.value;
          updateScreenFrame();
        });
      });
      window.addEventListener("resize", function() {
        window.clearTimeout(state.resizeTimer);
        state.resizeTimer = window.setTimeout(function() {
          updateScreenFrame();
          if (screenPresetEl.value === "phone-auto") {
            load(state.page, state.cursor || "0");
          }
        }, 250);
      });

      let touchStartX = 0;
      screenEl.addEventListener("touchstart", function(event) {
        touchStartX = event.changedTouches[0].clientX;
      }, { passive: true });
      screenEl.addEventListener("touchend", function(event) {
        const delta = event.changedTouches[0].clientX - touchStartX;
        if (Math.abs(delta) < 44 || !state.payload) return;
        if (delta < 0) {
          moveNext();
        }
        if (delta > 0) {
          movePrevious();
        }
      }, { passive: true });

      function updateNotifyButton() {
        if (!("Notification" in window)) {
          notifyEl.textContent = "提醒不可用";
          notifyEl.disabled = true;
          return;
        }
        if (!window.isSecureContext) {
          notifyEl.textContent = "提醒需要 HTTPS";
          notifyEl.disabled = true;
          return;
        }
        notifyEl.textContent = Notification.permission === "granted" ? "提醒已开启" : "开启提醒";
        notifyEl.disabled = Notification.permission === "denied";
      }

      async function enableNotifications() {
        if (!("Notification" in window) || !window.isSecureContext) {
          updateNotifyButton();
          return;
        }
        const permission = Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
        updateNotifyButton();
        if (permission === "granted") {
          startEvents();
          notify("ToWrite 提醒已开启", "页面打开时，卡片或 Workflow 状态变化会提醒你。");
        }
      }

      function startEvents() {
        if (!state.token || state.eventSource) return;
        state.eventSource = new EventSource(eventsUrl());
        state.eventSource.addEventListener("snapshot", function(event) {
          state.lastEventSummary = eventSummary(event);
        });
        state.eventSource.addEventListener("update", function(event) {
          const nextSummary = eventSummary(event);
          if (state.lastEventSummary && state.lastEventSummary !== nextSummary) {
            notify("ToWrite 有新变化", nextSummary);
            load(state.page, state.cursor);
          }
          state.lastEventSummary = nextSummary;
        });
        state.eventSource.onerror = function() {
          if (state.eventSource) {
            state.eventSource.close();
            state.eventSource = null;
          }
        };
      }

      function eventSummary(event) {
        try {
          const payload = JSON.parse(event.data);
          const summary = payload.summary || {};
          const workflows = payload.workflows || {};
          return "未解决 " + (summary.open || 0) + " / 候选 " + (summary.candidate || 0) + " / Workflow " + (workflows.uniqueFiles || 0);
        } catch {
          return "";
        }
      }

      function notify(title, body) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        try {
          navigator.serviceWorker?.ready
            .then((registration) => registration.showNotification(title, {
              body,
              icon: "/device-icon.svg",
              badge: "/device-icon.svg",
              tag: "towrite-device-update"
            }))
            .catch(() => new Notification(title, { body }));
        } catch {
          new Notification(title, { body });
        }
      }

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/device-sw.js").catch(function() {
          // Service workers require HTTPS or localhost; HTTP over MagicDNS can still use the page without PWA install.
        });
      }
      updateNotifyButton();
      if ("Notification" in window && Notification.permission === "granted" && window.isSecureContext) {
        startEvents();
      }
      load(state.page, state.cursor);
    </script>
  </body>
</html>`;
}
