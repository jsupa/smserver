/**
 * Example: Listen for incoming messages and auto-reply.
 *
 * If someone sends "Ping", we reply with "Pong".
 *
 *   npx tsx examples/realtime.ts
 */

import { SMServerClient } from "../src/index.js";

async function main() {
  const client = new SMServerClient({ httpPort: 8085, wsPort: 8081, password: "toor" });

  await client.authenticate("toor");
  await client.connect();

  console.log("Connected. Waiting for messages...");

  client.on("newMessage", async (msg) => {
    // Don't reply to our own messages
    if (msg.is_from_me) return;

    console.log(`Received from ${msg.chat_identifier}: "${msg.text}"`);

    // Auto-reply
    if (msg.text?.trim().toLowerCase() === "ping") {
      await client.sendMessage({ chat: msg.chat_identifier, text: "Pong" });
      console.log(`Replied "Pong" to ${msg.chat_identifier}`);
    }
  });

  client.on("messageTyping", ({ chat, active }) => {
    console.log(`${chat} is ${active ? "typing" : "idle"}`);
  });

  client.on("disconnected", (code) => {
    console.log(`Disconnected (code=${code}), reconnecting...`);
  });

  // Keep running
  process.on("SIGINT", () => {
    client.disconnect();
    process.exit(0);
  });
}

main().catch((e) => { console.error(e.message); process.exit(1); });
