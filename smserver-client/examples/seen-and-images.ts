/**
 * Example: Mark a chat as seen, fetch its latest message, and
 * view/download image attachments (works for messages with
 * empty text and attachments only, e.g. photo messages).
 *
 *   npx tsx examples/seen-and-images.ts +15551234567
 */

import { mkdir } from "node:fs/promises";
import { SMServerClient } from "../src/index.js";

const CHAT = process.argv[2] ?? "+15551234567";

async function main() {
  const client = new SMServerClient({ httpPort: 8085, wsPort: 8081, password: "toor" });

  const ok = await client.authenticate("toor");
  if (!ok) {
    console.log("Auth failed");
    process.exit(1);
  }

  // Mark the chat as seen and grab its latest message
  const seen = await client.seenMessages(CHAT, 1);
  console.log(`Seen ${seen.length} message(s) in ${CHAT}`);

  // Fetch the latest message (may be an image with empty text)
  const [last] = await client.getMessages(CHAT, { numMessages: 1 });
  if (!last) {
    console.log("No messages");
    return;
  }

  console.log(`\nLatest: [${last.is_from_me ? "sent" : "received"}]`);
  console.log(`  text:    ${JSON.stringify(last.text)}`);
  console.log(`  date:    ${new Date(Math.floor(last.date / 1_000_000_000 + 978_307_200) * 1000).toISOString()}`);
  console.log(`  guid:    ${last.guid}`);

  if (last.cache_has_attachments && last.attachments?.length) {
    for (const att of last.attachments) {
      console.log(`  file:    ${att.filename} (${att.mime_type})`);
    }

    // View: print the URL the server would serve the image from
    console.log("\nImage URLs (open in a browser):");
    for (const url of client.getImageUrls(last)) {
      console.log(`  ${url}`);
    }

    // Download: save into ./attachments/
    await mkdir("attachments", { recursive: true });
    const saved = await client.downloadAttachments(last, "attachments");
    console.log(`\nSaved: ${saved.map((f) => `attachments/${f}`).join(", ")}`);
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
