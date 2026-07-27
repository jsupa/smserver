import { EventEmitter } from "node:events";
import WebSocket from "ws";
import type { SMServerEvents, Message, TypingEvent, MessageReadEvent } from "./types.js";

/**
 * SMServer WebSocket protocol is colon-delimited text:
 *
 *   Server → Client:
 *     battery:<percentage>        e.g. battery:85.0
 *     battery:charging
 *     typing:<chat_id>            e.g. typing:+15551234567
 *     idle:<chat_id>              e.g. idle:+15551234567
 *     text:<JSON>                 e.g. text:{"text":{...message...}}
 *     read:<JSON>                 e.g. read:{"guid":"...","date":"2:30 PM"}
 *
 *   Client → Server:
 *     typing:<chat_id>
 *     idle:<chat_id>
 */

export class SMServerWebSocket extends EventEmitter<SMServerEvents> {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    wsUrl: string,
    opts?: { reconnectDelay?: number; maxReconnectDelay?: number }
  ) {
    super();
    this.wsUrl = wsUrl;
    this.reconnectDelay = opts?.reconnectDelay ?? 1000;
    this.maxReconnectDelay = opts?.maxReconnectDelay ?? 30000;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      this.shouldReconnect = true;
      try {
        this.ws = new WebSocket(this.wsUrl);
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.on("open", () => {
        this.reconnectDelay = 1000;
        this.startPing();
        this.emit("connected");
        resolve();
      });

      this.ws.on("message", (raw) => {
        this.parseFrame(raw.toString());
      });

      this.ws.on("close", (code, reason) => {
        this.stopPing();
        this.emit("disconnected", code, reason.toString());
        this.scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        this.emit("error", err);
      });
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnect();
    this.stopPing();
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Outgoing (client → server) ──

  sendTyping(chat: string): void {
    this.sendRaw(`typing:${chat}`);
  }

  sendIdle(chat: string): void {
    this.sendRaw(`idle:${chat}`);
  }

  // ── Frame parser ──

  private parseFrame(raw: string): void {
    const colonIdx = raw.indexOf(":");
    if (colonIdx === -1) return;

    const command = raw.slice(0, colonIdx);
    const payload = raw.slice(colonIdx + 1);

    switch (command) {
      case "text": {
        try {
          const parsed = JSON.parse(payload) as { text: Message };
          if (parsed.text) this.emit("newMessage", parsed.text);
        } catch { /* malformed JSON */ }
        break;
      }
      case "typing": {
        this.emit("messageTyping", { chat: payload, active: true });
        break;
      }
      case "idle": {
        this.emit("messageTyping", { chat: payload, active: false });
        break;
      }
      case "battery": {
        if (payload === "charging") {
          this.emit("batteryStatus", { percentage: 100, charging: true });
        } else {
          const pct = Number.parseFloat(payload);
          if (!Number.isNaN(pct)) {
            this.emit("batteryStatus", { percentage: pct, charging: false });
          }
        }
        break;
      }
      case "read": {
        try {
          const parsed = JSON.parse(payload) as MessageReadEvent;
          this.emit("messageViewed", parsed);
        } catch { /* ignore */ }
        break;
      }
    }
  }

  // ── Internal ──

  private sendRaw(data: string): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    this.ws.send(data);
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.ping();
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
