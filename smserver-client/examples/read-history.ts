/**
 * Example: Paginate through a chat's message history with
 * date conversion and unread detection.
 *
 *   npx tsx examples/read-history.ts +15551234567
 */

import { SMServerClient } from "../src/index.js";

const CHAT = process.argv[2] ?? "+15551234567";
const PAGE_SIZE = 10;

// Apple CFAbsoluteTime (since 2001-01-01) → JS Date
function toDate(date: number): Date {
  return new Date(Math.floor(date / 1_000_000_000 + 978_307_200) * 1000);
}

async function main() {
  const client = new SMServerClient({ httpPort: 8085, wsPort: 8081, password: "toor" });

  const ok = await client.authenticate("toor");
  if (!ok) {
    console.log("Auth failed");
    process.exit(1);
  }

  let offset = 0;
  while (true) {
    const messages = await client.getMessages(CHAT, {
      numMessages: PAGE_SIZE,
      offset,
      readMessages: false, // don't mark read while paging
    });

    if (messages.length === 0) break;

    for (const m of messages) {
      const dir = m.is_from_me ? "→" : "←";
      const unread = m.date_read === 0 && !m.is_from_me ? " [unread]" : "";
      const text = m.text || (m.cache_has_attachments ? "[attachment]" : "");
      console.log(`${dir} ${toDate(m.date).toLocaleString()}${unread} ${text}`);
    }

    if (messages.length < PAGE_SIZE) break;
    offset += messages.length;
  }

  // Now that the user has "read" the chat, mark it as seen
  await client.seenMessages(CHAT, 1);
  console.log("\nMarked as seen");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
