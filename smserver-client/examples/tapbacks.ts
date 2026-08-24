/**
 * Example: Send tapbacks (reactions) to a message and listen
 * for tapbacks on your own messages in real time.
 *
 *   npx tsx examples/tapbacks.ts <guid> 3000
 *
 * Tapback values (associated_message_type):
 *   2000=Heart, 2001=Thumbs Up, 2002=Thumbs Down,
 *   2003=Haha, 2004=!!, 2005=??  (≥3000 = removed)
 */

import { SMServerClient } from "../src/index.js";

const GUID = process.argv[2];
const TAPBACK = Number(process.argv[3] ?? 2000);

async function main() {
  const client = new SMServerClient({ httpPort: 8085, wsPort: 8081, password: "toor" });

  const ok = await client.authenticate("toor");
  if (!ok) {
    console.log("Auth failed");
    process.exit(1);
  }

  await client.connect();
  console.log("Connected. Listening for tapbacks on your messages...");

  // React when someone tapbacks your message
  client.on("tapbackSent", (ev) => {
    console.log(`→ tapback ${ev.tapback} on ${ev.guid.slice(0, 12)}…`);
  });

  if (GUID) {
    // Send a tapback to a message
    await client.sendTapback(TAPBACK, GUID);
    console.log(`Sent tapback ${TAPBACK} to ${GUID.slice(0, 12)}…`);

    // Remove it again
    setTimeout(async () => {
      await client.sendTapback(TAPBACK, GUID, true);
      console.log("Removed tapback");
      process.exit(0);
    }, 5000);
  } else {
    console.log("Usage: npx tsx examples/tapbacks.ts <message-guid> [tapback-value]");
    console.log("Grab a guid from examples/read-history.ts output");
    process.exit(0);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
