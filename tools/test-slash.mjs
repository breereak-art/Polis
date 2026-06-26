// Verify the slash path: force the defector (Dax) to run in Tyr mode and
// confirm a failure triggers a slash event + trust drop.
import { Client } from "colyseus.js";
const room = await new Client("ws://localhost:3000").joinOrCreate("office");
console.log("[client] joined", room.roomId);
room.onMessage("chat", (m) => { if (/Tyr|Failed|Slash|Completed/i.test(m.text)) console.log("[chat]", `${m.sender}: ${m.text}`); });
room.onMessage("slash", (m) => console.log("[SLASH-EVENT]", JSON.stringify(m)));
room.onMessage("trust-update", (m) => {
  const dax = (m.profiles || []).find((p) => p.agentId === "diagnostic");
  if (dax) console.log("[TRUST] Dax:", `tier=${dax.trustTier} bond=${dax.bond} fails=${dax.failCount} slashes=${dax.slashCount}`);
});
// Force Dax onto cases in Tyr mode (default) — bypass gate to show the catch.
let n = 0;
const iv = setInterval(() => { room.send("run-case", { title: `Probation case ${++n}`, agentId: "diagnostic" }); if (n >= 4) clearInterval(iv); }, 1500);
setTimeout(() => { console.log("[client] done"); process.exit(0); }, 22000);
