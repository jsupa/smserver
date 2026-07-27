/**
 * SMServer Debug Monitor
 *
 * Connects to SMServer WebSocket and logs every message with structure analysis.
 * Saves raw frames to JSONL. Type '>command:payload' to send raw frames.
 *
 * Protocol (colon-delimited text, discovered via this monitor):
 *   Server → Client:  battery:<pct> | battery:charging | typing:<chat> |
 *                     idle:<chat> | text:<JSON> | read:<JSON>
 *   Client → Server:  typing:<chat> | idle:<chat>
 *
 * Usage:
 *   npx tsx src/debug-server.ts
 *   npx tsx src/debug-server.ts --ws ws://192.168.1.50:8081
 *   npx tsx src/debug-server.ts --out ./my-session
 */

import WebSocket from "ws";
import { writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline";

// ── Config ──

const config = {
  wsUrl: process.env.SMSERVER_WS_URL ?? "ws://localhost:8081",
  httpUrl: process.env.SMSERVER_HTTP_URL ?? "http://localhost:8085",
  outputDir: process.env.SMSERVER_DEBUG_DIR ?? "./debug-output",
  rawFile: "",
  summaryFile: "",
  interactive: !process.argv.includes("--no-interactive"),
};

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--ws" && process.argv[i + 1]) config.wsUrl = process.argv[++i];
  if (process.argv[i] === "--http" && process.argv[i + 1]) config.httpUrl = process.argv[++i];
  if (process.argv[i] === "--out" && process.argv[i + 1]) config.outputDir = process.argv[++i];
}

// ── Setup ──

const ts = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(config.outputDir, { recursive: true });
config.rawFile = `${config.outputDir}/raw-${ts}.jsonl`;
config.summaryFile = `${config.outputDir}/summary-${ts}.json`;

writeFileSync(
  config.rawFile,
  `# SMServer Debug Log — ${new Date().toISOString()}\n` +
    `# WS: ${config.wsUrl}\n` +
    `# Format: {"ts":"ISO","dir":"IN|OUT","command":"...","payload":"..."}\n`
);

// ── Stats ──

interface CmdStats {
  count: number;
  firstSeen: string;
  lastSeen: string;
  samplePayload: string;
}

const stats = new Map<string, CmdStats>();
let totalMessages = 0;
const startTime = Date.now();
let ws: WebSocket | null = null;
let reconnectAttempts = 0;
let lastSaveTime = 0;

function track(command: string, payload: string): void {
  totalMessages++;
  let s = stats.get(command);
  if (!s) {
    s = {
      count: 0,
      firstSeen: new Date().toISOString(),
      lastSeen: "",
      samplePayload: payload.slice(0, 300),
    };
    stats.set(command, s);
  }
  s.count++;
  s.lastSeen = new Date().toISOString();
  if (!s.samplePayload && payload) s.samplePayload = payload.slice(0, 300);
}

function appendRaw(dir: "IN" | "OUT", command: string, payload: string): void {
  appendFileSync(
    config.rawFile,
    JSON.stringify({ ts: new Date().toISOString(), dir, command, payload }) + "\n"
  );
}

// ── Logging ──

function log(icon: string, msg: string): void {
  const time = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${time}] ${icon} ${msg}`);
}

// ── Frame parser ──

function parseFrame(raw: string, dir: "IN" | "OUT"): void {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) {
    log("⚠️", `Malformed: ${raw.slice(0, 120)}`);
    return;
  }

  const command = raw.slice(0, colonIdx);
  const payload = raw.slice(colonIdx + 1);

  appendRaw(dir, command, payload);
  track(command, payload);

  switch (command) {
    case "text": {
      try {
        const parsed = JSON.parse(payload);
        const msg = parsed.text ?? parsed;
        const body = msg.text ? ` "${String(msg.text).slice(0, 80)}"` : "";
        const from = msg.chat_identifier ? ` from ${msg.chat_identifier}` : "";
        const dirLabel = msg.is_from_me ? "SENT" : "RCVD";
        log("📩", `${dirLabel}${from}${body}`);
      } catch {
        log("📩", `text (bad JSON): ${payload.slice(0, 150)}`);
      }
      break;
    }
    case "typing":
      log("⌨️", `typing: ${payload}`);
      break;
    case "idle":
      log("⏸️", `idle: ${payload}`);
      break;
    case "battery": {
      if (payload === "charging") log("🔋", "charging");
      else log("🔋", `battery: ${payload}%`);
      break;
    }
    case "read": {
      try {
        const p = JSON.parse(payload);
        log("👁️", `read: guid=${String(p.guid ?? "?").slice(0, 12)}…`);
      } catch {
        log("👁️", `read: ${payload.slice(0, 100)}`);
      }
      break;
    }
    default:
      log("❓", `UNKNOWN "${command}": ${payload.slice(0, 150)}`);
      break;
  }
}

// ── Display ──

function printHeader(): void {
  console.clear();
  console.log("═".repeat(70));
  console.log("  SMServer Debug Monitor");
  console.log("═".repeat(70));
  console.log(`  WebSocket:  ${config.wsUrl}`);
  console.log(`  HTTP API:   ${config.httpUrl}`);
  console.log(`  Raw log:    ${config.rawFile}`);
  console.log(`  Summary:    ${config.summaryFile}`);
  console.log(`  Uptime:     ${Math.floor((Date.now() - startTime) / 1000)}s`);
  console.log(`  Messages:   ${totalMessages}`);
  console.log(`  Reconnects: ${reconnectAttempts}`);
  console.log("═".repeat(70));
  console.log("");
  console.log("Commands: s=stats  r=reconnect  q=quit  >typing:chat  >idle:chat");
  console.log("─".repeat(70));
  console.log("");
}

function printStats(): void {
  console.log("\n" + "═".repeat(70));
  console.log("  COMMAND SUMMARY");
  console.log("═".repeat(70));
  const sorted = [...stats.entries()].sort((a, b) => b[1].count - a[1].count);
  for (const [cmd, s] of sorted) {
    console.log(
      `  ${cmd.padEnd(12)} ${String(s.count).padStart(5)} msgs   sample: ${s.samplePayload.slice(0, 100)}`
    );
  }
  console.log("═".repeat(70) + "\n");
}

function saveSummary(): void {
  if (Date.now() - lastSaveTime < 5000) return;
  lastSaveTime = Date.now();
  const entries = [...stats.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([cmd, s]) => ({
      command: cmd,
      count: s.count,
      firstSeen: s.firstSeen,
      lastSeen: s.lastSeen,
      samplePayload: s.samplePayload,
    }));
  writeFileSync(
    config.summaryFile,
    JSON.stringify(
      {
        wsUrl: config.wsUrl,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date().toISOString(),
        totalMessages,
        commands: entries,
      },
      null,
      2
    )
  );
  log("💾", `Summary saved (${entries.length} command types)`);
}

// ── Interactive ──

function setupInteractive(): void {
  if (!config.interactive) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on("line", (line: string) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(">")) {
      // Raw send: >typing:+15551234567
      const raw = trimmed.slice(1).trim();
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(raw);
        parseFrame(raw, "OUT");
        log("📤", `Sent: ${raw}`);
      }
      return;
    }
    switch (trimmed.toLowerCase()) {
      case "s":
        printStats();
        break;
      case "r":
        reconnectAttempts = 0;
        connect();
        break;
      case "q":
        saveSummary();
        ws?.close();
        rl.close();
        process.exit(0);
    }
  });
}

// ── Connect ──

function connect(): void {
  log("🔌", `Connecting to ${config.wsUrl}...`);
  ws = new WebSocket(config.wsUrl);

  ws.on("open", () => {
    reconnectAttempts = 0;
    log("✅", "Connected");
    printHeader();
  });

  ws.on("message", (raw) => parseFrame(raw.toString(), "IN"));

  ws.on("close", (code, reason) => {
    log("🔴", `Disconnected (code=${code})`);
    const delay = Math.min(2 ** reconnectAttempts * 1000, 30000);
    reconnectAttempts++;
    log("⏳", `Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})`);
    setTimeout(connect, delay);
  });

  ws.on("error", (err) => log("❌", err.message));
}

// ── Shutdown ──

process.on("SIGINT", () => {
  saveSummary();
  ws?.close();
  process.exit(0);
});

// ── Main ──

log("🚀", "SMServer Debug Monitor");
log("ℹ️", `WS: ${config.wsUrl}  Output: ${config.outputDir}`);
setupInteractive();
connect();
setInterval(() => {
  if (stats.size > 0) saveSummary();
}, 60000);
