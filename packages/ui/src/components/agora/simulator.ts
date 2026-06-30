import type {
  Agent,
  AgentRole,
  Connector,
  Decision,
  District,
  FloorEvent,
  House,
  IntentKind,
  KPIs,
  PatientCase,
  Room,
} from "./types";


/* ---------------- RNG (mulberry32, seeded) ---------------- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- Floor geometry (logical, top-down) ---------------- */
/* ---------------- Districts (named city blocks) ---------------- */
export const DISTRICTS: District[] = [
  { id: "MED", name: "Medical District",       short: "MED", x: 80,   y: 60,   w: 600, h: 480, gate: { x: 380,  y: 560 },  tint: "var(--success)" },
  { id: "CIV", name: "Civic Quarter",          short: "CIV", x: 760,  y: 60,   w: 600, h: 480, gate: { x: 1060, y: 560 },  tint: "var(--info)" },
  { id: "TRS", name: "Treasury Ward",          short: "TRS", x: 1440, y: 60,   w: 600, h: 480, gate: { x: 1740, y: 560 },  tint: "var(--warning)" },
  { id: "KNO", name: "Knowledge Archive",      short: "KNO", x: 80,   y: 600,  w: 600, h: 380, gate: { x: 380,  y: 990 },  tint: "var(--accent)" },
  { id: "LOG", name: "Logistics Yard",         short: "LOG", x: 760,  y: 600,  w: 600, h: 380, gate: { x: 1060, y: 990 },  tint: "var(--muted-foreground)" },
  { id: "HLD", name: "Enforcement District",   short: "HLD", x: 1440, y: 600,  w: 600, h: 380, gate: { x: 1740, y: 990 },  tint: "var(--destructive)" },
  { id: "RES", name: "Residential Strip",      short: "RES", x: 80,   y: 1040, w: 1960, h: 380, gate: { x: 1060, y: 1040 }, tint: "var(--foreground)" },
];

/* ---------------- Floor geometry (logical, top-down) ---------------- */
export const ROOMS: Room[] = [
  // MED
  { id: "triage",   name: "Triage Bay",       short: "TRI", districtId: "MED", x: 110,  y: 100, w: 220, h: 150, door: { x: 220,  y: 250 } },
  { id: "diag",     name: "Diagnostics Ward", short: "DIA", districtId: "MED", x: 370,  y: 100, w: 290, h: 150, door: { x: 515,  y: 250 } },
  { id: "pharma",   name: "Pharmacy Vault",   short: "PHA", districtId: "MED", x: 110,  y: 300, w: 220, h: 200, door: { x: 220,  y: 500 } },
  { id: "records",  name: "Records Archive",  short: "REC", districtId: "MED", x: 370,  y: 300, w: 290, h: 200, door: { x: 515,  y: 500 } },

  // CIV
  { id: "council",  name: "Council Chamber",  short: "COU", districtId: "CIV", x: 790,  y: 100, w: 280, h: 200, door: { x: 930,  y: 300 } },
  { id: "forum",    name: "Forum Plaza",      short: "FOR", districtId: "CIV", x: 1090, y: 100, w: 250, h: 200, door: { x: 1215, y: 300 } },
  { id: "bulletin", name: "Bulletin Hall",    short: "BUL", districtId: "CIV", x: 790,  y: 330, w: 550, h: 170, door: { x: 1065, y: 500 } },

  // TRS
  { id: "treasury", name: "Treasury Vault",   short: "TRS", districtId: "TRS", x: 1470, y: 100, w: 280, h: 220, door: { x: 1610, y: 320 } },
  { id: "audit",    name: "Audit Hall",       short: "AUD", districtId: "TRS", x: 1770, y: 100, w: 250, h: 200, door: { x: 1895, y: 300 } },
  { id: "mint",     name: "Mint",             short: "MNT", districtId: "TRS", x: 1470, y: 350, w: 550, h: 150, door: { x: 1745, y: 500 } },

  // KNO
  { id: "stacks",      name: "Stacks",        short: "STK", districtId: "KNO", x: 110,  y: 620, w: 290, h: 340, door: { x: 255,  y: 960 } },
  { id: "oracle_hall", name: "Oracle Hall",   short: "ORC", districtId: "KNO", x: 410,  y: 620, w: 250, h: 160, door: { x: 535,  y: 780 } },
  { id: "reading",     name: "Reading Room",  short: "RDG", districtId: "KNO", x: 410,  y: 800, w: 250, h: 160, door: { x: 535,  y: 960 } },

  // LOG
  { id: "gate",      name: "Polis Gate",      short: "GAT", districtId: "LOG", x: 790,  y: 620, w: 200, h: 340, door: { x: 890,  y: 960 } },
  { id: "customs",   name: "Customs",         short: "CST", districtId: "LOG", x: 1010, y: 620, w: 330, h: 160, door: { x: 1175, y: 780 } },
  { id: "loading",   name: "Loading Bay",     short: "LDB", districtId: "LOG", x: 1010, y: 800, w: 330, h: 160, door: { x: 1175, y: 960 } },

  // HLD
  { id: "ombuds",    name: "Ombuds Office",   short: "OMB", districtId: "HLD", x: 1470, y: 620, w: 250, h: 160, door: { x: 1595, y: 780 } },
  { id: "holding",   name: "Holding Cells",   short: "HLD", districtId: "HLD", x: 1740, y: 620, w: 280, h: 160, door: { x: 1880, y: 780 } },
  { id: "tribunal",  name: "Tribunal",        short: "TRB", districtId: "HLD", x: 1470, y: 800, w: 550, h: 160, door: { x: 1745, y: 960 } },
];

const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));
export const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

/* ---------------- Houses (residential strip) ---------------- */
export const HOUSES: House[] = (() => {
  const out: House[] = [];
  const startX = 100, gap = 12, hw = 128, hh = 130;
  const rowYs = [1080, 1240];
  let n = 1;
  for (const ry of rowYs) {
    for (let i = 0; i < 14; i++) {
      const x = startX + i * (hw + gap);
      out.push({
        id: `H-${String(n).padStart(3, "0")}`,
        districtId: "RES",
        x, y: ry, w: hw, h: hh,
      });
      n++;
    }
  }
  return out;
})();

/* ---------------- Pathing across districts ---------------- */
function buildPath(from: Room, to: Room): { x: number; y: number }[] {
  const a = from.door;
  const b = to.door;
  if (from.districtId === to.districtId) {
    const pts: { x: number; y: number }[] = [{ x: a.x, y: a.y }];
    if (a.y !== b.y) pts.push({ x: a.x, y: b.y });
    pts.push({ x: b.x, y: b.y });
    return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
  }
  // cross-district: route via an east-west corridor that doesn't cut through buildings
  const bothTop = a.y < 540 && b.y < 540;
  const bothBot = a.y > 600 && b.y > 600;
  const midY = bothTop ? 552 : bothBot ? 1005 : 575;
  const pts = [
    { x: a.x, y: a.y },
    { x: a.x, y: midY },
    { x: b.x, y: midY },
    { x: b.x, y: b.y },
  ];
  return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
}

const ROLES: AgentRole[] = ["medic", "courier", "oracle", "attestor", "ombuds"];

const ROLE_HOMES: Record<AgentRole, string[]> = {
  medic:    ["triage", "diag", "pharma", "records"],
  courier:  ["gate", "customs", "loading", "records"],
  oracle:   ["oracle_hall", "stacks", "reading"],
  attestor: ["council", "audit", "tribunal", "bulletin"],
  ombuds:   ["ombuds", "tribunal", "holding", "forum"],
};

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)];
}


/* ---------------- Simulator ---------------- */
export interface SimState {
  tick: number;
  agents: Agent[];
  events: FloorEvent[];
  cases: PatientCase[];
  connectors: Connector[];
  kpis: KPIs;
  blockHeight: number;
}

export interface Simulator {
  state: SimState;
  step: () => SimState;
  setSpeed: (s: number) => void;
  speed: number;
}

const HEX = "0123456789abcdef";
function hash(rnd: () => number, len = 8) {
  let s = "";
  for (let i = 0; i < len; i++) s += HEX[Math.floor(rnd() * 16)];
  return "0x" + s + "…" + HEX[Math.floor(rnd() * 16)] + HEX[Math.floor(rnd() * 16)] + HEX[Math.floor(rnd() * 16)] + HEX[Math.floor(rnd() * 16)];
}

function nowTs(tick: number) {
  const totalMs = 14 * 3600 * 1000 + tick * 250;
  const d = new Date(0);
  d.setUTCHours(0, 0, 0, totalMs);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  const ms = String(d.getUTCMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

const POLICIES = [
  "TYR-09 · Falsified attestation",
  "TYR-04 · Collusive bidding",
  "POL-17 · Jurisdiction breach",
  "TYR-12 · Identity drift",
  "POL-03 · Retention violation",
  "TYR-08 · Quorum manipulation",
];

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function createSimulator(seed = 7): Simulator {
  const rnd = mulberry32(seed);

  /* ----- seed agents ----- */
  const agents: Agent[] = [];
  const COUNT = 48;
  for (let i = 0; i < COUNT; i++) {
    const role = ROLES[i % ROLES.length];
    const homeId = pick(ROLE_HOMES[role], rnd);
    const home = ROOM_BY_ID[homeId];
    const x = home.x + 16 + rnd() * (home.w - 32);
    const y = home.y + 16 + rnd() * (home.h - 32);
    const id = `${role}-${(0x100 + i).toString(16).slice(1)}`;
    agents.push({
      id,
      label: `agent://${id}`,
      role,
      trust: 0.78 + rnd() * 0.2,
      stake: Math.round(500 + rnd() * 9500),
      status: "active",
      room: homeId,
      target: homeId,
      path: [],
      x,
      y,
      facing: 1,
      bobPhase: rnd(),
      cooldown: Math.floor(rnd() * 12),
      sub: {
        attestation: 0.85 + rnd() * 0.14,
        behaviour: 0.75 + rnd() * 0.2,
        identity: 0.9 + rnd() * 0.09,
      },
      decisions: [],
      log: [],
    });
  }

  /* ----- seed cases in triage queue ----- */
  const cases: PatientCase[] = [];
  const triage = ROOM_BY_ID["triage"];
  const SEVERITIES: PatientCase["severity"][] = ["routine", "routine", "urgent", "critical"];
  let caseCounter = 440;
  for (let i = 0; i < 5; i++) {
    cases.push({
      id: `TR-${caseCounter++}`,
      severity: SEVERITIES[Math.floor(rnd() * SEVERITIES.length)],
      stage: "queued",
      age: Math.floor(rnd() * 30),
      x: triage.x + 14 + i * 22,
      y: triage.y + triage.h - 18,
    });
  }

  const state: SimState = {
    tick: 0,
    agents,
    events: [],
    cases,
    connectors: [],
    kpis: {
      agents: 84217,
      trustIndex: 0.9142,
      openCases: 1308,
      slashed24h: 41902,
      slashedEvents: 9,
      quorum: 78.4,
      blockMs: 412,
      blockHeight: 8412991,
      restituted24h: 12440,
    },
    blockHeight: 8412991,
  };

  let speed = 1;
  let eventCounter = 0;
  let connectorCounter = 0;

  function emit(ev: Omit<FloorEvent, "id" | "tick" | "ts" | "hash">) {
    const full: FloorEvent = {
      ...ev,
      id: "e" + ++eventCounter,
      tick: state.tick,
      ts: nowTs(state.tick),
      hash: hash(rnd),
    };
    state.events.unshift(full);
    if (state.events.length > 80) state.events.pop();
  }

  function connect(fromId: string, toId: string, kind: Connector["kind"]) {
    state.connectors.unshift({
      id: "c" + ++connectorCounter,
      fromId,
      toId,
      kind,
      born: typeof performance !== "undefined" ? performance.now() : Date.now(),
    });
    if (state.connectors.length > 24) state.connectors.pop();
  }

  function pathTo(a: Agent, targetRoomId: string, interior?: { x: number; y: number }) {
    const curr = ROOM_BY_ID[a.room];
    const next = ROOM_BY_ID[targetRoomId];
    if (!curr || !next) return;
    a.target = targetRoomId;
    const viaDoors = buildPath(curr, next);
    const pt = interior ?? {
      x: next.x + 16 + rnd() * (next.w - 32),
      y: next.y + 16 + rnd() * (next.h - 32),
    };
    a.path = [...viaDoors.slice(1), pt];
  }

  /* ----- decider ----- */
  function decide(a: Agent): Decision[] {
    const candidates: Decision[] = [];
    const t = state.tick;

    function score(intent: IntentKind, target: string, reason: string, base: number) {
      candidates.push({ tick: t, intent, target, score: base + rnd() * 0.1, reason, chosen: false });
    }

    // role-specific intents
    if (a.role === "medic") {
      const queued = state.cases.filter((c) => c.stage === "queued").length;
      if (queued > 0 && !a.carrying) {
        const urgency = state.cases.some((c) => c.stage === "queued" && c.severity === "critical") ? 0.95 : queued > 2 ? 0.78 : 0.6;
        score("claim_case", "triage", `${queued} cases waiting`, urgency);
      }
      if (a.carrying) {
        score("deliver_case", "diag", `carrying ${a.carrying.caseId}`, 0.92);
      }
      score("patrol", pick(ROLE_HOMES.medic, rnd), "routine rounds", 0.3);
    } else if (a.role === "courier") {
      const archived = state.cases.filter((c) => c.stage === "diagnosed").length;
      if (archived > 0 && !a.carrying) {
        score("file_case", "diag", `${archived} files to archive`, 0.8);
      }
      if (a.carrying) score("file_case", "records", `filing ${a.carrying.caseId}`, 0.9);
      score("restock", "pharma", "vault rotation", 0.4);
      score("patrol", pick(ROLE_HOMES.courier, rnd), "perimeter sweep", 0.25);
    } else if (a.role === "attestor") {
      score("attest", "council", "quorum window open", 0.65);
      score("audit", "treasury", "ledger reconcile", 0.5);
      score("patrol", "records", "records spot check", 0.3);
    } else if (a.role === "ombuds") {
      const flagged = state.agents.find((x) => x.status === "flagged" && x.id !== a.id);
      if (flagged) score("escort", flagged.room, `subject ${flagged.id} flagged`, 0.85);
      score("audit", "holding", "cell roster", 0.45);
      score("patrol", pick(ROLE_HOMES.ombuds, rnd), "district sweep", 0.3);
    } else if (a.role === "oracle") {
      score("consult", "oracle_hall", "diagnostic query", 0.6);
      score("consult", "stacks", "corpus walk", 0.4);
      score("patrol", "stacks", "corpus walk", 0.3);
    }

    // common: rest occasionally
    score("rest", a.room, "stand down", 0.15);

    // softmax-ish pick: weight by score, sample
    const sum = candidates.reduce((s, c) => s + Math.exp(c.score * 3), 0);
    let r = rnd() * sum;
    let chosen = candidates[0];
    for (const c of candidates) {
      r -= Math.exp(c.score * 3);
      if (r <= 0) { chosen = c; break; }
    }
    chosen.chosen = true;
    return candidates;
  }

  function executeIntent(a: Agent, d: Decision) {
    a.intent = d.intent;
    if (d.intent === "claim_case") {
      pathTo(a, "triage");
    } else if (d.intent === "deliver_case") {
      pathTo(a, "diag");
    } else if (d.intent === "file_case" && !a.carrying) {
      pathTo(a, "diag"); // pick up first
    } else if (d.intent === "file_case" && a.carrying) {
      pathTo(a, "records");
    } else if (d.intent === "escort") {
      pathTo(a, d.target);
    } else if (d.intent === "rest") {
      a.cooldown = 6 + Math.floor(rnd() * 10);
      a.path = [];
    } else {
      pathTo(a, d.target);
    }
  }

  function tryPickupCase(a: Agent) {
    if (a.role !== "medic" || a.carrying || a.room !== "triage") return;
    const c = state.cases.find((c) => c.stage === "queued");
    if (!c) return;
    c.stage = "carried";
    c.assignee = a.id;
    a.carrying = { kind: "case", caseId: c.id, severity: c.severity };
    a.log.unshift({ t: nowTs(state.tick), msg: `picked up ${c.id} (${c.severity})` });
    if (a.log.length > 8) a.log.pop();
    emit({ kind: "handoff", agentId: a.id, x: a.x, y: a.y, text: `${a.label} claimed case ${c.id}` });
  }

  function tryDeliverCase(a: Agent) {
    if (!a.carrying) return;
    const c = state.cases.find((c) => c.id === a.carrying!.caseId);
    if (!c) { a.carrying = undefined; return; }
    if (a.role === "medic" && a.room === "diag" && c.stage === "carried") {
      c.stage = "diagnosed";
      c.assignee = undefined;
      // drop on a diagnostics table
      const diag = ROOM_BY_ID["diag"];
      c.x = diag.x + 30 + rnd() * (diag.w - 60);
      c.y = diag.y + diag.h - 20;
      a.carrying = undefined;
      a.log.unshift({ t: nowTs(state.tick), msg: `delivered ${c.id} → diagnostics` });
      emit({ kind: "handoff", agentId: a.id, x: a.x, y: a.y, text: `${a.label} delivered ${c.id} to diagnostics` });
    } else if (a.role === "courier" && a.room === "records" && c.stage === "carried") {
      c.stage = "closed";
      a.carrying = undefined;
      state.kpis.openCases = Math.max(0, state.kpis.openCases - 1);
      a.log.unshift({ t: nowTs(state.tick), msg: `archived ${c.id}` });
      emit({ kind: "case_close", agentId: a.id, x: a.x, y: a.y, text: `${a.label} archived ${c.id} · case closed` });
      // remove fully closed cases after a bit
      const idx = state.cases.indexOf(c);
      if (idx >= 0) state.cases.splice(idx, 1);
    }
  }

  function tryCourierPickup(a: Agent) {
    if (a.role !== "courier" || a.carrying || a.room !== "diag") return;
    const c = state.cases.find((c) => c.stage === "diagnosed");
    if (!c) return;
    c.stage = "carried";
    c.assignee = a.id;
    a.carrying = { kind: "case", caseId: c.id, severity: c.severity };
    a.log.unshift({ t: nowTs(state.tick), msg: `picked up ${c.id} for archive` });
    emit({ kind: "handoff", agentId: a.id, x: a.x, y: a.y, text: `${a.label} picked up ${c.id} for archive` });
  }

  function step(): SimState {
    state.tick += 1;
    const t = state.tick;

    // spawn new cases occasionally
    if (state.cases.filter((c) => c.stage === "queued").length < 6 && rnd() < 0.18) {
      const queued = state.cases.filter((c) => c.stage === "queued");
      cases.push({
        id: `TR-${caseCounter++}`,
        severity: SEVERITIES[Math.floor(rnd() * SEVERITIES.length)],
        stage: "queued",
        age: 0,
        x: triage.x + 14 + queued.length * 22,
        y: triage.y + triage.h - 18,
      });
      state.kpis.openCases += 1;
    }
    // age queued cases
    for (const c of state.cases) if (c.stage === "queued") c.age += 1;

    /* movement */
    const STEP_PX = 6 * speed;
    for (const a of state.agents) {
      a.bobPhase = (a.bobPhase + 0.18) % 1;
      if (a.status === "frozen" || a.status === "slashed") continue;

      if (a.path.length === 0) {
        if (a.cooldown > 0) {
          a.cooldown -= 1;
          // on arrival interactions
          tryPickupCase(a);
          tryDeliverCase(a);
          tryCourierPickup(a);
          if (a.cooldown === 0 && rnd() < 0.05 && a.role === "attestor" && a.room === "council") {
            emit({ kind: "attestation", agentId: a.id, x: a.x, y: a.y, text: `attestation sealed · ${a.label}` });
            a.log.unshift({ t: nowTs(t), msg: "attestation sealed" });
            if (a.log.length > 8) a.log.pop();
          }
          continue;
        }
        // time to decide
        const decisions = decide(a);
        a.decisions = [...decisions, ...a.decisions].slice(0, 8);
        const chosen = decisions.find((d) => d.chosen)!;
        emit({
          kind: "decision",
          agentId: a.id,
          x: a.x,
          y: a.y,
          text: `${a.label} → ${chosen.intent} (${chosen.target}) · ${chosen.reason}`,
        });
        executeIntent(a, chosen);
        a.status = "active";
        continue;
      }

      const next = a.path[0];
      const dx = next.x - a.x;
      const dy = next.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) a.facing = dx >= 0 ? 1 : -1;
      if (d <= STEP_PX) {
        a.x = next.x;
        a.y = next.y;
        a.path.shift();
        if (a.path.length === 0) {
          a.room = a.target;
          a.cooldown = 4 + Math.floor(rnd() * 10);
          a.status = "working";
          tryPickupCase(a);
          tryDeliverCase(a);
          tryCourierPickup(a);
        }
      } else {
        a.x += (dx / d) * STEP_PX;
        a.y += (dy / d) * STEP_PX;
        a.status = "active";
      }
    }

    /* enforcement events */
    if (rnd() < 0.38) {
      const a = state.agents[Math.floor(rnd() * state.agents.length)];
      if (a.status !== "slashed" && a.status !== "frozen") {
        const r = rnd();
        if (r < 0.5) {
          a.status = "flagged";
          a.trust = Math.max(0.3, a.trust - 0.01);
          a.sub.behaviour = Math.max(0.3, a.sub.behaviour - 0.02);
          const policy = pick(POLICIES, rnd);
          emit({ kind: "flag", agentId: a.id, x: a.x, y: a.y, text: `flagged · ${a.label} · ${policy}`, policy });
          a.log.unshift({ t: nowTs(t), msg: `flagged · ${policy}` });
        } else if (r < 0.78) {
          a.status = "frozen";
          a.path = [];
          if (a.carrying) {
            const c = state.cases.find((c) => c.id === a.carrying!.caseId);
            if (c) { c.stage = "queued"; c.assignee = undefined; }
            a.carrying = undefined;
          }
          const policy = pick(POLICIES, rnd);
          emit({ kind: "freeze", agentId: a.id, x: a.x, y: a.y, text: `freeze order · ${a.label}`, policy, stake: a.stake });
          a.log.unshift({ t: nowTs(t), msg: `freeze order · ${policy}` });
          // find nearest ombuds, connect
          const ombuds = state.agents.find((x) => x.role === "ombuds" && x.status === "active" || x.status === "working");
          if (ombuds) connect(ombuds.id, a.id, "escort");
        } else if (r < 0.92) {
          const burn = Math.round(a.stake * (0.2 + rnd() * 0.6));
          a.stake = Math.max(0, a.stake - burn);
          a.status = "slashed";
          a.path = [];
          a.trust = Math.max(0.2, a.trust - 0.08);
          if (a.carrying) {
            const c = state.cases.find((c) => c.id === a.carrying!.caseId);
            if (c) { c.stage = "queued"; c.assignee = undefined; }
            a.carrying = undefined;
          }
          const policy = pick(POLICIES, rnd);
          emit({ kind: "slash", agentId: a.id, x: a.x, y: a.y, text: `SLASHED · ${a.label} · ₸ ${burn.toLocaleString()}`, policy, stake: burn });
          a.log.unshift({ t: nowTs(t), msg: `slashed ₸ ${burn.toLocaleString()} · ${policy}` });
          state.kpis.slashed24h += burn;
          state.kpis.slashedEvents += 1;
          // teleport into holding cell over next ticks: set room
          const holding = ROOM_BY_ID["holding"];
          a.x = holding.x + 20 + rnd() * (holding.w - 40);
          a.y = holding.y + 20 + rnd() * (holding.h - 40);
          a.room = "holding";
        } else {
          const amt = Math.round(200 + rnd() * 1800);
          emit({ kind: "restitution", agentId: a.id, x: a.x, y: a.y, text: `restitution issued · ₸ ${amt.toLocaleString()}`, stake: amt });
          a.log.unshift({ t: nowTs(t), msg: `restitution received ₸ ${amt}` });
          state.kpis.restituted24h += amt;
        }
        if (a.log.length > 8) a.log.pop();
      }
    }

    // periodically thaw / restitute
    for (const a of state.agents) {
      if ((a.status === "frozen" || a.status === "slashed") && rnd() < 0.025) {
        a.status = "restituted";
        a.cooldown = 6;
      } else if (a.status === "restituted" && rnd() < 0.08) {
        a.status = "active";
        a.cooldown = 2;
      } else if (a.status === "flagged" && rnd() < 0.04) {
        a.status = "active";
      }
    }

    /* GC connectors older than ~800ms */
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    state.connectors = state.connectors.filter((c) => nowMs - c.born < 900);

    /* block tick */
    if (t % 4 === 0) {
      state.blockHeight += 1;
      state.kpis.blockHeight = state.blockHeight;
      state.kpis.blockMs = 380 + Math.floor(rnd() * 120);
      emit({ kind: "block", text: `block #${state.blockHeight.toLocaleString()} finalized · ${state.kpis.blockMs} ms` });
    }

    state.kpis.trustIndex = Math.max(0.82, Math.min(0.97, state.kpis.trustIndex + (rnd() - 0.5) * 0.0014));
    state.kpis.quorum = Math.max(70, Math.min(86, state.kpis.quorum + (rnd() - 0.5) * 0.15));

    return state;
  }

  return {
    state,
    step,
    get speed() { return speed; },
    setSpeed(s: number) { speed = s; },
  };
}
