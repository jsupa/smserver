/**
 * Example: Send a text message with image/file attachments and
 * camera-roll photos.
 *
 *   npx tsx examples/send-media.ts +15551234567 "Check this out" ./photo.jpg ./doc.pdf
 */

import { SMServerClient } from "../src/index.js";

const CHAT = process.argv[2] ?? "+15551234567";
const TEXT = process.argv[3] ?? "";
const FILES = process.argv.slice(4);

async function main() {
  const client = new SMServerClient({ httpPort: 8085, wsPort: 8081, password: "toor" });

  const ok = await client.authenticate("toor");
  if (!ok) {
    console.log("Auth failed");
    process.exit(1);
  }

  if (FILES.length === 0) {
    console.log("Usage: npx tsx examples/send-media.ts <chat> [text] <file> [file...]");
    console.log("Tip: use photos: to reference camera-roll files on the phone");
    process.exit(1);
  }

  await client.sendMessage({
    chat: CHAT,
    text: TEXT,
    attachments: FILES,
  });
  console.log(`Sent ${FILES.length} attachment(s) to ${CHAT}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
