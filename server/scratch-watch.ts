import "dotenv/config";
import { query } from "./dist/db/index.js";

const since = new Date().toISOString();
console.log("watching for new inbound messages after", since, "...");

for (let i = 0; i < 40; i++) { // up to ~10 minutes
  const rows = await query<any>(
    `SELECT m.id, m.body, m.created_at, ct.phone, ct.name, c.name AS company
       FROM messages m
       JOIN conversations conv ON conv.id = m.conversation_id
       JOIN contacts ct ON ct.id = conv.contact_id
       JOIN companies c ON c.id = m.company_id
      WHERE m.direction = 'in' AND m.created_at > $1
      ORDER BY m.created_at ASC`,
    [since]);
  if (rows.length > 0) {
    console.log("\n=== NEW INBOUND MESSAGE(S) DETECTED ===");
    console.table(rows);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 15000));
}
console.log("no new inbound message detected after 10 minutes");
process.exit(1);
