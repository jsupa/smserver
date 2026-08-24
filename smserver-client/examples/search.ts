/**
 * Example: Search message history and match contacts.
 *
 *   npx tsx examples/search.ts "dinner"
 */

import { SMServerClient } from "../src/index.js";

const TERM = process.argv[2] ?? "dinner";

async function main() {
  const client = new SMServerClient({ httpPort: 8085, wsPort: 8081, password: "toor" });

  const ok = await client.authenticate("toor");
  if (!ok) {
    console.log("Auth failed");
    process.exit(1);
  }

  // Full-text search across all chats
  const result = await client.searchMessages(TERM);
  console.log(`Search "${TERM}": ${result.texts.length} message(s), ` +
    `${result.conversations.length} conversation(s)`);

  for (const t of result.texts.slice(0, 10)) {
    console.log(`  [${t.display_name || t.chat_identifier}] ${t.text}`);
  }

  // Search grouped by chat
  const byChat = await client.searchMessages(TERM, { group: "chat" });
  console.log(`\nGrouped: ${byChat.texts.length} result(s)`);

  // Match by chat identifier or display name
  const matches = await client.matchContacts(TERM, "name");
  console.log(`\nName matches:`);
  for (const m of matches) {
    if ("chat_id" in m) {
      console.log(`  chat: ${m.chat_id} — ${m.display_name}`);
    } else {
      console.log(`  name: ${m.name} — ${m.addresses.join(", ")}`);
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
