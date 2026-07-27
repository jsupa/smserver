/**
 * Example: Receive image messages and download attachments.
 *
 *   npx tsx examples/images.ts
 */

import { writeFileSync } from "node:fs";
import { SMServerClient } from "../src/index.js";

async function main() {
  const client = new SMServerClient({ httpPort: 8085, wsPort: 8081, password: "toor" });

  await client.authenticate("toor");
  await client.connect();

  console.log("Connected. Waiting for messages...");

  client.on("newMessage", async (msg) => {
    if (msg.is_from_me) return;

    // Check for attachments
    if (msg.cache_has_attachments && msg.attachments?.length) {
      for (const att of msg.attachments) {
        const [type] = att.mime_type.split("/");

        if (type === "image") {
          // Construct the image URL
          const url = client.getAttachmentUrl(att.filename);
          console.log(`Image received: ${url}`);

          // Download the image
          const buffer = await client.getAttachment(att.filename);
          const name = att.filename.split("/").pop() ?? "image";
          writeFileSync(`./${name}`, buffer);
          console.log(`Saved: ./${name}`);
        } else if (type === "video") {
          console.log(`Video: ${client.getAttachmentUrl(att.filename)}`);
        } else if (type === "audio") {
          console.log(`Audio: ${client.getAttachmentUrl(att.filename)}`);
        } else {
          console.log(`File: ${att.filename} (${att.mime_type})`);
        }
      }
    }

    // Text message
    if (msg.text) {
      console.log(`[${msg.chat_identifier}] ${msg.text}`);
    }
  });
}

main().catch((e) => { console.error(e.message); process.exit(1); });
