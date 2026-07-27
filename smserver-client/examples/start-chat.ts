/**
 * Example: Start a conversation with a phone number.
 *
 *   npx tsx examples/start-chat.ts +15551234567 "Hey, how are you?"
 */

import { SMServerClient } from "../src/index.js";

async function main() {
  const number = process.argv[2];
  const message = process.argv[3];

  if (!number || !message) {
    console.log("Usage: npx tsx examples/start-chat.ts <number> <message>");
    console.log("  npx tsx examples/start-chat.ts +15551234567 'Hey!'");
    process.exit(1);
  }

  const client = new SMServerClient({ httpPort: 8085, wsPort: 8081, password: "toor" });

  const ok = await client.authenticate("toor");
  if (!ok) { console.log("Auth failed"); process.exit(1); }

  await client.sendMessage({ chat: number, text: message });
  console.log(`Sent to ${number}: "${message}"`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
