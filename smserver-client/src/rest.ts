import got from "got";
import { basename } from "node:path";
import type {
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

export class RESTClient {
  private baseUrl: string;
  private authenticated = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  // ── Auth ──

  async authenticate(password: string): Promise<boolean> {
    const body = await this.getText("/requests", { password });
    const ok = body === "true";
    this.authenticated = ok;
    return ok;
  }

  setAuthenticated(value: boolean): void {
    this.authenticated = value;
  }

  get isAuthenticated(): boolean {
    return this.authenticated;
  }

  // ── Messages ──

  async getMessages(
    chatId: string,
    opts: MessageOptions = {}
  ): Promise<Message[]> {
    const params: Record<string, string> = { messages: chatId };

    if (opts.numMessages !== undefined)
      params.num_messages = String(opts.numMessages);
    if (opts.offset !== undefined)
      params.messages_offset = String(opts.offset);
    if (opts.readMessages !== undefined)
      params.read_messages = String(opts.readMessages);
    if (opts.messagesFrom !== undefined)
      params.messages_from = String(opts.messagesFrom);

    // Response shape: {texts: [...]}
    const data = await this.getJSON<{ texts: Message[] }>("/requests", params);
    return data.texts;
  }

  /**
   * Mark a chat as seen/read and return its latest messages.
   * Mirrors the original HTML server's window-focus handler
   * (`/requests?messages=<chat>&num_messages=1`) but sends
   * read_messages=true so the server persists the read state.
   */
  async seenMessages(chatId: string, numMessages = 1): Promise<Message[]> {
    const params: Record<string, string> = {
      messages: chatId,
      num_messages: String(numMessages),
      read_messages: "true",
    };
    // Response shape: {texts: [...]}
    const data = await this.getJSON<{ texts: Message[] }>("/requests", params);
    return data.texts;
  }

  // ── Chats ──

  async getChats(opts: ChatOptions = {}): Promise<Chat[]> {
    const params: Record<string, string> = { chats: "" };
    if (opts.offset !== undefined) params.chats_offset = String(opts.offset);
    // Response shape: {chats: [...]}
    const data = await this.getJSON<{ chats: Chat[] }>("/requests", params);
    return data.chats;
  }

  // ── Conversation Detail ──

  async getConversation(chatId: string): Promise<Record<string, unknown>> {
    return this.getJSON("/requests", { conversation: chatId });
  }

  // ── Display Name ──

  async getName(chatId: string): Promise<string> {
    // Response: [status_code, name_string] — text wrapped as array-like JSON
    const body = await this.getText("/requests", { name: chatId });
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) return String(parsed[1] ?? body);
    } catch {}
    return body;
  }

  // ── Search ──

  async searchMessages(
    term: string,
    opts: SearchOptions = {}
  ): Promise<SearchResult> {
    const params: Record<string, string> = { search: term };

    if (opts.caseSensitive !== undefined)
      params.search_case = String(opts.caseSensitive);
    if (opts.gaps !== undefined) params.search_gaps = String(opts.gaps);
    if (opts.group !== undefined) params.search_group = opts.group;

    return this.getJSON("/requests", params);
  }

  // ── Match Contacts ──

  async matchContacts(
    value: string,
    type: "chat" | "name" = "chat"
  ): Promise<ContactMatch[]> {
    return this.getJSON("/requests", { match: value, match_type: type });
  }

  // ── Photos ──

  async getPhotos(opts: PhotoOptions = {}): Promise<Photo[]> {
    const params: Record<string, string> = { photos: "" };

    if (opts.offset !== undefined)
      params.photos_offset = String(opts.offset);
    if (opts.recent !== undefined)
      params.photos_recent = String(opts.recent);

    // Response shape: {photos: [...]}
    const data = await this.getJSON<{ photos: Photo[] }>("/requests", params);
    return data.photos;
  }

  // ── Server Config ──

  async getConfig(): Promise<ServerConfig> {
    // Response shape: {config: {socket_port, socket_subdirectory, subjects, debug}}
    const data = await this.getJSON<{ config: ServerConfig }>("/requests", { config: "" });
    return data.config;
  }

  // ── Send Message ──
  //
  // Uses native fetch() instead of got because iOS Criollo sends
  // malformed chunked responses that crash Node's http parser.

  async sendMessage(params: SendMessageParams): Promise<void> {
    if (!params.chat) throw new Error("chat is required");

    const form = new globalThis.FormData();
    form.append("chat", params.chat);
    if (params.text) form.append("text", params.text);
    if (params.subject) form.append("subject", params.subject);
    if (params.photos) form.append("photos", params.photos);

    if (params.attachments) {
      for (const filePath of params.attachments) {
        const { readFile } = await import("node:fs/promises");
        const blob = new Blob([await readFile(filePath)]);
        form.append("attachments", blob, basename(filePath));
      }
    }

    const res = await fetch(`${this.baseUrl}/send`, {
      method: "POST",
      body: form,
    });

    if (res.status !== 200) {
      throw new Error(`Send failed with status ${res.status}`);
    }

    // consume body to free connection
    await res.text();
  }

  // ── Tapback ──

  async sendTapback(tapback: number, guid: string, remove = false): Promise<void> {
    const params: Record<string, string> = {
      tapback: String(tapback),
      tap_guid: guid,
    };
    if (remove) params.remove_tap = "true";
    await this.getText("/send", params);
  }

  // ── Delete Chat ──

  async deleteChat(chatId: string): Promise<void> {
    await this.getText("/send", { delete_chat: chatId });
  }

  // ── Delete Text ──

  async deleteText(guid: string): Promise<void> {
    await this.getText("/send", { delete_text: guid });
  }

  // ── Binary Data ──

  async getAttachment(path: string): Promise<Buffer> {
    return this.getBuffer("/data", { path });
  }

  async getProfilePicture(chatId: string): Promise<Buffer> {
    return this.getBuffer("/data", { chat_id: chatId });
  }

  async getPhotoFile(path: string): Promise<Buffer> {
    return this.getBuffer("/data", { photo: path });
  }

  // ── Internal Helpers ──

  /**
   * SMServer/iOS Criollo server misbehaves with HTTP keep-alive.
   * We force Connection: close on every request to avoid
   * HPE_INVALID_CONSTANT parse errors on reused connections.
   */
  private reqOpts(): { headers: Record<string, string> } {
    return { headers: { connection: "close" } };
  }

  private async getJSON<T>(
    path: string,
    params: Record<string, string>
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    const res = await got.get(url, { ...this.reqOpts(), throwHttpErrors: true });
    return JSON.parse(res.body) as T;
  }

  private async getText(
    path: string,
    params: Record<string, string>
  ): Promise<string> {
    const url = this.buildUrl(path, params);
    const res = await got.get(url, { ...this.reqOpts(), throwHttpErrors: true });
    return res.body;
  }

  private async getBuffer(
    path: string,
    params: Record<string, string>
  ): Promise<Buffer> {
    const url = this.buildUrl(path, params);
    const res = await got.get(url, {
      ...this.reqOpts(),
      throwHttpErrors: true,
      responseType: "buffer",
    });
    return res.body;
  }

  private buildUrl(path: string, params: Record<string, string>): string {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) sp.set(k, v);
    return `${this.baseUrl}${path}?${sp.toString()}`;
  }
}
