import { EventEmitter } from "node:events";
import { RESTClient } from "./rest.js";
import { SMServerWebSocket } from "./websocket.js";
import type {
  SMServerOptions,
  SMServerEvents,
  Message,
  Chat,
  Photo,
  SearchResult,
  ContactMatch,
  ServerConfig,
  MessageOptions,
  ChatOptions,
  SearchOptions,
  PhotoOptions,
  SendMessageParams,
} from "./types.js";

export class SMServerClient extends EventEmitter<SMServerEvents> {
  readonly rest: RESTClient;
  readonly ws: SMServerWebSocket;

  private baseUrl: string;
  private wsUrl: string;

  constructor(options: SMServerOptions = {}) {
    super();

    const host = options.host ?? "localhost";

    this.baseUrl =
      options.baseUrl ??
      (options.httpPort != null
        ? `http://${host}:${options.httpPort}`
        : "http://localhost:8085");

    this.wsUrl =
      options.wsUrl ??
      (options.wsPort != null
        ? `ws://${host}:${options.wsPort}`
        : "ws://localhost:8081");

    this.rest = new RESTClient(this.baseUrl);
    this.ws = new SMServerWebSocket(this.wsUrl);

    // Forward WS events to client
    this.ws.on("newMessage", (msg) => this.emit("newMessage", msg));
    this.ws.on("messageTyping", (ev) => this.emit("messageTyping", ev));
    this.ws.on("messageViewed", (ev) => this.emit("messageViewed", ev));
    this.ws.on("batteryStatus", (ev) => this.emit("batteryStatus", ev));
    this.ws.on("tapbackSent", (ev) => this.emit("tapbackSent", ev));
    this.ws.on("connected", () => this.emit("connected"));
    this.ws.on("disconnected", (code, reason) =>
      this.emit("disconnected", code, reason)
    );
    this.ws.on("error", (err) => this.emit("error", err));

    // Auto-authenticate if password provided
    if (options.password) {
      this.authenticate(options.password).catch(() => {});
    }
  }

  // ── Auth ──

  async authenticate(password: string): Promise<boolean> {
    const ok = await this.rest.authenticate(password);
    return ok;
  }

  get isAuthenticated(): boolean {
    return this.rest.isAuthenticated;
  }

  // ── REST Methods ──

  async getMessages(chatId: string, opts?: MessageOptions): Promise<Message[]> {
    return this.rest.getMessages(chatId, opts);
  }

  async getChats(opts?: ChatOptions): Promise<Chat[]> {
    return this.rest.getChats(opts);
  }

  async getConversation(chatId: string): Promise<Record<string, unknown>> {
    return this.rest.getConversation(chatId);
  }

  async getName(chatId: string): Promise<string> {
    return this.rest.getName(chatId);
  }

  async searchMessages(term: string, opts?: SearchOptions): Promise<SearchResult> {
    return this.rest.searchMessages(term, opts);
  }

  async matchContacts(value: string, type?: "chat" | "name"): Promise<ContactMatch[]> {
    return this.rest.matchContacts(value, type);
  }

  async getPhotos(opts?: PhotoOptions): Promise<Photo[]> {
    return this.rest.getPhotos(opts);
  }

  async getConfig(): Promise<ServerConfig> {
    return this.rest.getConfig();
  }

  async sendMessage(params: SendMessageParams): Promise<void> {
    return this.rest.sendMessage(params);
  }

  async sendTapback(tapback: number, guid: string, remove?: boolean): Promise<void> {
    return this.rest.sendTapback(tapback, guid, remove);
  }

  async deleteChat(chatId: string): Promise<void> {
    return this.rest.deleteChat(chatId);
  }

  async deleteText(guid: string): Promise<void> {
    return this.rest.deleteText(guid);
  }

  async getAttachment(path: string): Promise<Buffer> {
    return this.rest.getAttachment(path);
  }

  async getProfilePicture(chatId: string): Promise<Buffer> {
    return this.rest.getProfilePicture(chatId);
  }

  async getPhotoFile(path: string): Promise<Buffer> {
    return this.rest.getPhotoFile(path);
  }

  /** Get full URL for an attachment file (images, videos, etc.) */
  getAttachmentUrl(path: string): string {
    return `${this["baseUrl"]}/data?${new URLSearchParams({ path }).toString()}`;
  }

  /** Get full URL for a profile picture */
  getProfilePictureUrl(chatId: string): string {
    return `${this["baseUrl"]}/data?${new URLSearchParams({ chat_id: chatId }).toString()}`;
  }

  /** Get full URL for a camera roll photo */
  getPhotoUrl(path: string): string {
    return `${this["baseUrl"]}/data?${new URLSearchParams({ photo: path }).toString()}`;
  }

  // ── WebSocket ──

  async connect(): Promise<void> {
    return this.ws.connect();
  }

  disconnect(): void {
    this.ws.disconnect();
  }

  get isConnected(): boolean {
    return this.ws.isConnected;
  }

  sendTyping(chat: string): void {
    this.ws.sendTyping(chat);
  }

  sendIdle(chat: string): void {
    this.ws.sendIdle(chat);
  }
}
