import { Client } from "colyseus.js";
const room = await new Client("ws://localhost:3000").joinOrCreate("office");
console.log("joined", room.roomId);
room.onMessage("comparison-result", (m) => console.log("[COMPARISON]", JSON.stringify(m)));
room.onMessage("chat", (m) => { if (/A\/B|Trustless|Tyr/i.test(m.text)) console.log("[chat]", `${m.sender}: ${m.text}`); });
setTimeout(() => room.send("run-comparison", { count: 12 }), 1500);
setTimeout(() => process.exit(0), 6000);
