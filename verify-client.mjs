// Headless Colyseus client: joins the office room to trigger room creation
// (agents + think loop), logs chat/highlights, then exits. Used to verify the
// Qwen-powered think → act loop without a browser.
import { Client } from "colyseus.js";

const RUN_MS = Number(process.env.VERIFY_MS || 30000);
const client = new Client("ws://localhost:3000");

const room = await client.joinOrCreate("office");
console.log("[client] joined room:", room.roomId);

room.onMessage("chat", (m) => console.log("[chat]", `${m.sender}: ${m.text}`));
room.onMessage("highlight-event", (m) => console.log("[highlight]", m.type, "-", m.title));

setTimeout(() => {
    console.log("[client] done, leaving");
    room.leave();
    process.exit(0);
}, RUN_MS);
