/**
 * SMServer Send Test — interactive REPL for sending messages.
 *
 * Usage:
 *   npx tsx src/send-test.ts
 *   npx tsx src/send-test.ts --to +15551234567 --text "Hello"    (one-shot)
 *   npx tsx src/send-test.ts --http 192.168.1.50:8085 --ws 192.168.1.50:8081
 *
 * Interactive commands:
 *   >Hello world                     send text to current target
 *   :+15551234567                   switch target
 *   :email@example.com               switch target
 *   /attach ./image.png              add attachment
 *   /clear                           clear attachments
 *   /listen                          watch WS for incoming
 *   /stop                            stop listening
 *   /history                         recent messages
 *   /stats                           round-trip stats
 *   /quit                            exit
 */

import { basename } from "node:path";
import { createInterface } from "node:readline";
import got from "got";
import WebSocket from "ws";

// ── Config ──

const cfg = {
  httpUrl: process.env.SMSERVER_HTTP_URL ?? "http://localhost:8085",
  wsUrl: process.env.SMSERVER_WS_URL ?? "ws://localhost:8081",
  password: process.env.SMSERVER_PASSWORD ?? "toor",
};

let oneShotTo = "";
let oneShotText = "";
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--http" && process.argv[i + 1]) cfg.httpUrl = process.argv[++i];
  else if (process.argv[i] === "--ws" && process.argv[i + 1]) cfg.wsUrl = process.argv[++i];
  else if (process.argv[i] === "--password" && process.argv[i + 1]) cfg.password = process.argv[++i];
  else if (process.argv[i] === "--to" && process.argv[i + 1]) oneShotTo = process.argv[++i];
  else if (process.argv[i] === "--text" && process.argv[i + 1]) oneShotText = process.argv[++i];
}

// ── State ──

let target = oneShotTo || "+15551234567";
const attachments: string[] = [];
let authed = false;
let ws: WebSocket | null = null;
let listening = false;
let sent = 0;
let totalMs = 0;

interface HistoryEntry {
  ts: string;
  dir: "SENT" | "RCVD";
  target: string;
  text: string;
  ms?: number;
}
const history: HistoryEntry[] = [];

// ── Helpers ──

function log(icon: string, msg: string): void {
  const ts = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${ts}] ${icon} ${msg}`);
}

function showPrompt(): void {
  const extra = attachments.length ? ` [${attachments.length} 📎]` : "";
  process.stdout.write(`\n→ ${target}${extra} `);
}

// ── Auth ──

const reqHeaders = { connection: "close" };

async function auth(): Promise<void> {
  try {
    const res = await got.get(`${cfg.httpUrl}/requests`, {
      searchParams: { password: cfg.password },
      headers: reqHeaders,
      throwHttpErrors: false,
    });
    authed = res.body === "true";
    log(authed ? "🔑" : "❌", authed ? "Authenticated" : `Auth failed: ${res.body}`);
  } catch (err) {
    log("❌", `Auth error: ${(err as Error).message}`);
  }
}

// ── Send ──

async function send(to: string, text: string): Promise<{ ok: boolean; status: number; ms: number }> {
  const form = new globalThis.FormData();
  form.append("chat", to);
  form.append("text", text);
  for (const fp of attachments) {
    const { readFile } = await import("node:fs/promises");
    const blob = new Blob([await readFile(fp)]);
    form.append("attachments", blob, basename(fp));
  }

  const start = Date.now();
  try {
    const res = await fetch(`${cfg.httpUrl}/send`, { method: "POST", body: form });
    await res.text();
    return { ok: res.status === 200, status: res.status, ms: Date.now() - start };
  } catch {
    return { ok: false, status: 0, ms: Date.now() - start };
  }
}

// ── WebSocket ──

function connectWS(): void {
  ws = new WebSocket(cfg.wsUrl);
  ws.on("open", () => log("🔌", "WS connected"));
  ws.on("message", (raw) => {
    const frame = raw.toString();
    const ci = frame.indexOf(":");
    if (ci === -1) return;
    const cmd = frame.slice(0, ci);
    const payload = frame.slice(ci + 1);

    if (!listening) return;

    switch (cmd) {
      case "text": {
        try {
          const p = JSON.parse(payload);
          const m = p.text ?? p;
          const d = m.is_from_me ? "📤" : "📩";
          const t = String(m.text ?? "").slice(0, 100);
          log(d, `${m.chat_identifier}: ${t}`);
          history.push({ ts: new Date().toISOString(), dir: m.is_from_me ? "SENT" : "RCVD", target: m.chat_identifier ?? "?", text: t });
        } catch { log("⚠️", `text parse: ${payload.slice(0, 80)}`); }
        break;
      }
      case "typing": log("⌨️", `typing: ${payload}`); break;
      case "idle": log("⏸️", `idle: ${payload}`); break;
      case "battery":
        payload === "charging" ? log("🔋", "charging") : log("🔋", `${payload}%`);
        break;
      case "read": {
        try { log("👁️", `read: ${String(JSON.parse(payload).guid).slice(0, 12)}…`); } catch { /* */ }
        break;
      }
      default: log("❓", `"${cmd}" → ${payload.slice(0, 80)}`); break;
    }
  });
  ws.on("close", () => { log("🔴", "WS closed, reconnecting…"); setTimeout(connectWS, 2000); });
  ws.on("error", (e) => log("❌", `WS: ${e.message}`));
}

// ── Command handler ──

async function handle(line: string): Promise<void> {
  const t = line.trim();
  if (!t) { showPrompt(); return; }

  // Switch target
  if (t.startsWith(":")) {
    target = t.slice(1).trim();
    log("🎯", `Target → ${target}`);
    showPrompt();
    return;
  }

  // /commands
  if (t === "/attach" || t.startsWith("/attach ")) {
    const fp = t.slice(8).trim();
    if (!fp) { log("⚠️", "Usage: /attach <filepath>"); showPrompt(); return; }
    attachments.push(fp);
    log("📎", `${basename(fp)} (${attachments.length} total)`);
    showPrompt();
    return;
  }
  if (t === "/clear") { attachments.length = 0; log("🧹", "Cleared"); showPrompt(); return; }
  if (t === "/listen") { listening = true; log("👂", "Listening…"); showPrompt(); return; }
  if (t === "/stop") { listening = false; log("🔇", "Stopped"); showPrompt(); return; }
  if (t === "/history") {
    console.log("\n" + "─".repeat(60));
    for (const h of history.slice(-20)) console.log(`  ${h.dir === "SENT" ? "📤" : "📩"} [${h.ts.slice(11, 19)}] ${h.target}: ${h.text}`);
    console.log("─".repeat(60));
    showPrompt();
    return;
  }
  if (t === "/stats") { console.log(`\n  Sent: ${sent}  Avg: ${sent ? Math.round(totalMs / sent) : 0}ms`); showPrompt(); return; }
  if (t === "/quit" || t === "/q") { log("👋", "Bye!"); ws?.close(); process.exit(0); }
  if (t.startsWith("/")) { log("ℹ️", ":target /attach /clear /listen /stop /history /stats /quit"); showPrompt(); return; }

  // Send
  if (!authed) { await auth(); if (!authed) { showPrompt(); return; } }

  log("📤", `Sending → ${target}...`);
  const r = await send(target, t);
  sent++;
  totalMs += r.ms;

  if (r.ok) {
    log("✅", `${r.ms}ms`);
    history.push({ ts: new Date().toISOString(), dir: "SENT", target, text: t.slice(0, 100), ms: r.ms });
  } else {
    log("❌", `HTTP ${r.status} (${r.ms}ms)`);
  }
  showPrompt();
}

// ── Main ──

async function main(): Promise<void> {
  console.log("═".repeat(55));
  console.log("  SMServer Send Test");
  console.log("═".repeat(55));
  console.log(`  HTTP: ${cfg.httpUrl}   WS: ${cfg.wsUrl}`);
  console.log("═".repeat(55));
  console.log("  >message        send text");
  console.log("  :number/email   switch target");
  console.log("  /attach <file>  add file");
  console.log("  /listen         watch WS messages");
  console.log("  /history        recent messages");
  console.log("  /quit           exit");
  console.log("─".repeat(55));

  await auth();
  connectWS();

  // One-shot
  if (oneShotTo && oneShotText) {
    log("📤", `${oneShotTo} → "${oneShotText}"`);
    const r = await send(oneShotTo, oneShotText);
    log(r.ok ? "✅" : "❌", `HTTP ${r.status} (${r.ms}ms)`);
    await new Promise((x) => setTimeout(x, 2000));
    ws?.close();
    process.exit(r.ok ? 0 : 1);
  }

  // REPL
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  showPrompt();
  rl.on("line", (line) => handle(line).catch((e) => { log("❌", e.message); showPrompt(); }));
  rl.on("close", () => { ws?.close(); process.exit(0); });
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
