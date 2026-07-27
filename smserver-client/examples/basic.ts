/**
 * Example: Send a message to a number and read replies.
 *
 *   npx tsx examples/basic.ts
 */

import { SMServerClient } from "../src/index.js";

async function main() {
  const client = new SMServerClient({ httpPort: 8085, wsPort: 8081, password: "toor" });

  // Authenticate
  const ok = await client.authenticate("toor");
  if (!ok) {
    console.log("Auth failed");
    process.exit(1);
  }

  // Send a message
  await client.sendMessage({ chat: "+15551234567", text: "Hello from smserver-client" });
  console.log("Message sent");

  // Get recent messages
  const messages = await client.getMessages("+15551234567", { numMessages: 5 });
  for (const m of messages.reverse()) {
    const dir = m.is_from_me ? "sent" : "received";
    console.log(`  [${dir}] ${m.text}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
