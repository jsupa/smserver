/**
 * Example: Explore group chats, their members, conversation
 * details, and profile pictures.
 *
 *   npx tsx examples/groups.ts
 */

import { SMServerClient } from "../src/index.js";

async function main() {
  const client = new SMServerClient({ httpPort: 8085, wsPort: 8081, password: "toor" });

  const ok = await client.authenticate("toor");
  if (!ok) {
    console.log("Auth failed");
    process.exit(1);
  }

  const chats = await client.getChats();
  const groups = chats.filter((c) => c.is_group);

  console.log(`${groups.length} group chat(s) out of ${chats.length}:\n`);

  for (const g of groups) {
    console.log(`# ${g.display_name || g.room_name || g.chat_identifier}`);
    console.log(`  id:        ${g.chat_identifier}`);
    console.log(`  members:   ${g.members.map((m) => m.display_name).join(", ")}`);

    // Profile picture URL for the group (if any)
    console.log(`  avatar:    ${client.getProfilePictureUrl(g.chat_identifier)}`);

    // Conversation detail (server-side contact list entry)
    const conv = await client.getConversation(g.chat_identifier);
    console.log(`  detail:    ${JSON.stringify(conv).slice(0, 120)}...`);

    // Latest message preview
    const [last] = await client.getMessages(g.chat_identifier, { numMessages: 1 });
    if (last) {
      const who = last.sender || last.id;
      console.log(`  latest:    ${who}: ${last.text || "[attachment]"}`);
    }
    console.log();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
