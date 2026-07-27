// ── Message ──

export interface MessageAttachment {
  filename: string;
  mime_type: string;
  is_favorite?: boolean;
}

export interface Message {
  ROWID: number;
  guid: string;
  date: number;
  date_read: number;
  is_from_me: boolean;
  text: string;
  subject: string;
  chat_identifier: string;
  id: string;
  handle_id: string;
  service: "iMessage" | "SMS";
  associated_message_guid: string;
  associated_message_type: number;
  balloon_bundle_id: string;
  cache_has_attachments: boolean;
  room_name: string;
  sender: string;
  imessage: boolean;
  item_type: number;
  group_action_type: number;
  link_title: string;
  link_subtitle: string;
  link_type: string;
  attachments: MessageAttachment[];
}

// ── Chat ──

export interface ChatMember {
  display_name: string;
  chat_identifier: string;
}

export interface Chat {
  has_unread: boolean;
  chat_identifier: string;
  pinned: boolean;
  latest_text: string;
  display_name: string;
  time_marker: string;
  relative_time: string;
  addresses: string[];
  is_group: boolean;
  members: ChatMember[];
  room_name?: string;
}

// ── Photo ──

export interface Photo {
  URL: string;
  is_favorite: boolean;
}

// ── Search ──

export interface SearchTextResult {
  chat_identifier: string;
  text: string;
  cache_has_attachments: boolean;
  display_name: string;
  service: string;
  date: number;
  ROWID: number;
}

export interface SearchResult {
  texts: SearchTextResult[];
  conversations: Array<{
    chat_identifier: string;
    display_name: string;
    count: number;
  }>;
}

// ── Contacts ──

export interface ChatMatch {
  chat_id: string;
  display_name: string;
}

export interface ContactNameMatch {
  name: string;
  addresses: string[];
}

export type ContactMatch = ChatMatch | ContactNameMatch;

// ── Server Config ──

export interface ServerConfig {
  socket_port: number;
  socket_subdirectory: string | null;
  debug: boolean;
  subjects: boolean;
}

// ── Send Message ──

export interface SendMessageParams {
  /** Recipient phone number or chat identifier (required) */
  chat: string;
  /** Message body text */
  text?: string;
  /** iMessage subject line */
  subject?: string;
  /** Colon-separated photo paths relative to /var/mobile/Media/ */
  photos?: string;
  /** File paths to attach */
  attachments?: string[];
}

// ── Client Options ──

export interface SMServerOptions {
  /** Base URL of the SMServer HTTP API (default: http://localhost:8085) */
  baseUrl?: string;
  /** WebSocket URL (default: ws://localhost:8081) */
  wsUrl?: string;
  /** Host for port-based shorthand (default: localhost) */
  host?: string;
  /** HTTP port — shorthand, sets baseUrl to http://{host}:{httpPort} */
  httpPort?: number;
  /** WebSocket port — shorthand, sets wsUrl to ws://{host}:{wsPort} */
  wsPort?: number;
  /** Server password */
  password?: string;
}

// ── Query Options ──

export interface MessageOptions {
  /** Number of messages to retrieve (0 = all) */
  numMessages?: number;
  /** Pagination offset */
  offset?: number;
  /** Mark as read */
  readMessages?: boolean;
  /** 0=all, 1=sent, 2=received */
  messagesFrom?: 0 | 1 | 2;
}

export interface ChatOptions {
  /** Pagination offset */
  offset?: number;
}

export interface SearchOptions {
  /** Case-sensitive search */
  caseSensitive?: boolean;
  /** If true, spaces become wildcards */
  gaps?: boolean;
  /** "time" = sorted by recency, anything else = grouped by chat */
  group?: "time" | "chat";
}

export interface PhotoOptions {
  /** Pagination offset */
  offset?: number;
  /** true = newest first (default), false = oldest first */
  recent?: boolean;
}

// ── WebSocket Events ──

export interface TypingEvent {
  chat: string;
  active: boolean;
}

export interface BatteryEvent {
  percentage: number;
  charging: boolean;
}

export interface MessageReadEvent {
  guid: string;
  date_read: string;
}

export interface TapbackEvent {
  tapback: number;
  guid: string;
}

// ── WebSocket Event Map ──

export interface SMServerEvents {
  newMessage: [message: Message];
  messageTyping: [event: TypingEvent];
  messageViewed: [event: MessageReadEvent];
  batteryStatus: [event: BatteryEvent];
  tapbackSent: [event: TapbackEvent];
  connected: [];
  disconnected: [code: number, reason: string];
  error: [error: Error];
}
