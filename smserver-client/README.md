# smserver-client

TypeScript client for [SMServer](https://github.com/itsjunetime/smserver) — the iMessage gateway for jailbroken iOS devices.

Uses [`got`](https://github.com/sindresorhus/got) for HTTP and [`ws`](https://github.com/websockets/ws) for WebSocket with full `EventEmitter`-based real-time events.

## Install

```bash
npm install smserver-client
```

## Example

```ts
import { SMServerClient } from "smserver-client";

const client = new SMServerClient({ httpPort: 8085, wsPort: 8081, password: "toor" });

await client.authenticate("toor");
await client.connect();

// Send a message
await client.sendMessage({ chat: "+15551234567", text: "Hey!" });

// Auto-reply "Pong" when someone sends "Ping"
client.on("newMessage", async (msg) => {
  if (!msg.is_from_me && msg.text?.trim().toLowerCase() === "ping") {
    await client.sendMessage({ chat: msg.chat_identifier, text: "Pong" });
  }
});
```

## Quick Start

```ts
import { SMServerClient } from "smserver-client";

// Full URLs
const client = new SMServerClient({
  baseUrl: "http://localhost:8085",
  wsUrl: "ws://localhost:8081",
  password: "toor",
});

// Or just ports (host defaults to localhost)
const client = new SMServerClient({
  httpPort: 8085,
  wsPort: 8081,
  password: "toor",
});

// Remote device
const client = new SMServerClient({
  host: "192.168.1.50",
  httpPort: 8741,
  wsPort: 8740,
  password: "toor",
});

// Authenticate
await client.authenticate("toor");

// Get recent chats
const chats = await client.getChats();
console.log(chats);

// Get messages from a conversation
const messages = await client.getMessages("+15551234567", {
  numMessages: 50,
});
console.log(messages);

// Send a text
await client.sendMessage({
  chat: "+15551234567",
  text: "Hello from Node.js!",
});

// Connect WebSocket for real-time events
await client.connect();

client.on("newMessage", (msg) => {
  console.log("New message:", msg.text, "from", msg.chat_identifier);
});

client.on("messageTyping", ({ chat, active }) => {
  console.log(chat, active ? "is typing..." : "stopped typing");
});

client.on("messageViewed", ({ guid, date_read }) => {
  console.log("Message", guid, "read at", date_read);
});

client.on("batteryStatus", ({ percentage, charging }) => {
  console.log(`Battery: ${percentage}%`, charging ? "(charging)" : "");
});
```

## API

### `new SMServerClient(options?)`

| Option | Default | Description |
|--------|---------|-------------|
| `baseUrl` | `http://localhost:8085` | SMServer HTTP API URL |
| `wsUrl` | `ws://localhost:8081` | SMServer WebSocket URL |
| `host` | `localhost` | Host for port-based shorthand |
| `httpPort` | — | HTTP port — auto-generates baseUrl |
| `wsPort` | — | WebSocket port — auto-generates wsUrl |
| `password` | — | Auto-authenticate on construction |

### REST Methods

All methods return Promises.

| Method | Description |
|--------|-------------|
| `authenticate(password)` | Authenticate with server password |
| `getMessages(chatId, opts?)` | Get messages for a chat |
| `seenMessages(chatId, numMessages?)` | Mark a chat as seen/read, return latest messages |
| `getChats(opts?)` | List recent conversations |
| `getConversation(chatId)` | Get conversation details |
| `getName(chatId)` | Resolve display name for a chat ID |
| `searchMessages(term, opts?)` | Full-text search across messages |
| `matchContacts(value, type?)` | Find contacts by partial match |
| `getPhotos(opts?)` | List camera roll photos |
| `getConfig()` | Get server configuration |
| `sendMessage(params)` | Send a text/attachment message |
| `sendTapback(type, guid, remove?)` | Send/remove message reaction |
| `deleteChat(chatId)` | Delete entire conversation |
| `deleteText(guid)` | Delete a single message |
| `getAttachment(path)` | Download attachment file as Buffer |
| `getProfilePicture(chatId)` | Download profile picture as Buffer |
| `getPhotoFile(path)` | Download camera roll photo as Buffer |
| `getAttachmentUrl(path)` | Full URL for an attachment file |
| `getProfilePictureUrl(chatId)` | Full URL for a profile picture |
| `getPhotoUrl(path)` | Full URL for a camera roll photo |
| `getImageUrls(message)` | URLs of all image attachments on a message |
| `downloadAttachments(message, destDir?)` | Save all message attachments to disk |

### WebSocket Events

```ts
client.on("newMessage",       (msg: Message) => {})
client.on("messageTyping",    (ev: TypingEvent) => {})
client.on("messageViewed",    (ev: MessageReadEvent) => {})
client.on("batteryStatus",    (ev: BatteryEvent) => {})
client.on("tapbackSent",      (ev: TapbackEvent) => {})
client.on("connected",        () => {})
client.on("disconnected",     (code: number, reason: string) => {})
client.on("error",            (err: Error) => {})
```

### WebSocket Methods

| Method | Description |
|--------|-------------|
| `connect()` | Open WebSocket connection |
| `disconnect()` | Close WebSocket connection |
| `sendTyping(chat, active)` | Send typing indicator |

## Examples

Runnable scripts in [`examples/`](examples/) (all require a running SMServer on `localhost:8085`):

| Command | Shows |
|---------|-------|
| `npm run example:basic` | Send a message, read replies |
| `npm run example:seen` | Mark a chat seen, view/download image attachments |
| `npm run example:history` | Paginated history, date conversion, unread detection |
| `npm run example:send-media` | Send messages with file attachments |
| `npm run example:groups` | Group chats, members, profile pictures |
| `npm run example:search` | Full-text search and contact matching |
| `npm run example:tapbacks` | Send/remove reactions, listen for tapbacks |
| `npm run example:realtime` | WebSocket events (typing, battery, read receipts) |
| `npm run example:images` | Receive image messages, download attachments |
| `npm run example:start` | Start a new conversation |

## Build

```bash
npm run build        # tsdown (ESM + CJS + types)
npm run typecheck    # tsc --noEmit
npm run debug        # interactive WebSocket message monitor
npm run debug:headless  # non-interactive (just log to file)
```

## Debug Server

Built-in WebSocket monitor that logs every message type and saves raw JSONL:

```bash
npm run debug

# Custom endpoints
npm run debug -- --ws ws://192.168.1.50:8081 --http http://192.168.1.50:8085

# Custom output directory
npm run debug -- --out ./my-session
```

Interactive commands: `s` = print stats, `r` = reconnect, `q` = quit. Raw messages saved to `./debug-output/raw-<timestamp>.jsonl`.

## License

MIT
