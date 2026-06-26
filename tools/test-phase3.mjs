// Phase 3 verification: drive cases through the Tyr trust gate and observe
// rerouting, live attestations, and slash events.
import { Client } from "colyseus.js";

const client = new Client("ws://localhost:3000");
const room = await client.joinOrCreate("office");
console.log("[client] joined", room.roomId);

room.onMessage("chat", (m) => console.log("[chat]", `${m.sender}: ${m.text}`));
room.onMessage("trust-gate", (m) => console.log("[TRUST-GATE]", JSON.stringify(m)));
room.onMessage("slash", (m) => console.log("[SLASH]", JSON.stringify(m)));
room.onMessage("trust-update", (m) => {
  const d = (m.profiles || []).filter((p) => p.agentId !== "tyr")
    .map((p) => `${p.name}=T${p.trustTier}/b${p.bond}`).join("  ");
  console.log("[TRUST]", `integrity=${m.integrity?.valid} chain=${m.chainLength} | ${d}`);
});

// 1) Assign directly to the unreliable Dax (Diagnostic) — Tyr should reroute.
setTimeout(() => { console.log("\n>> assign to Dax (low trust)"); room.send("assign-task", { title: "Chest-pain workup", agentId: "diagnostic" }); }, 1500);
// 2) Auto-assign a few cases — should go to trusted agents and complete.
setTimeout(() => { console.log("\n>> auto-assign case A"); room.send("assign-task", { title: "ECG review" }); }, 3000);
setTimeout(() => { console.log("\n>> auto-assign case B"); room.send("assign-task", { title: "Med reconciliation" }); }, 4500);
// 3) Force a defector case in TRUSTLESS mode to show the bad outcome path.
setTimeout(() => { console.log("\n>> trustless mode ON"); room.send("set-mode", { tyrMode: false }); }, 9000);
setTimeout(() => { console.log("\n>> assign to Dax (trustless — no reroute)"); room.send("assign-task", { title: "Cardiac differential", agentId: "diagnostic" }); }, 10000);

setTimeout(() => { console.log("\n[client] done"); process.exit(0); }, 20000);
