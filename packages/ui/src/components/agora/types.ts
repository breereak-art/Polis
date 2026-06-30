export type AgentRole = "medic" | "courier" | "oracle" | "attestor" | "ombuds";

export type AgentStatus =
  | "active"
  | "working"
  | "flagged"
  | "frozen"
  | "slashed"
  | "restituted";

export interface District {
  id: string;
  name: string;
  short: string;        // 3-letter code (MED, CIV, …)
  x: number; y: number; w: number; h: number;
  /** road-side gate point (where district meets the ring road) */
  gate: { x: number; y: number };
  /** roof / accent tint, expressed as a css var name */
  tint: string;
}

export interface House {
  id: string;
  districtId: string;
  x: number; y: number; w: number; h: number;
  ownerId?: string;
}

export interface Room {
  id: string;
  name: string;
  short: string;
  /** parent district id */
  districtId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** entry waypoint on hallway grid */
  door: { x: number; y: number };
}


export type CaseSeverity = "routine" | "urgent" | "critical";
export type CaseStage = "queued" | "carried" | "diagnosed" | "archived" | "closed";

export interface PatientCase {
  id: string;            // e.g. TR-441
  severity: CaseSeverity;
  stage: CaseStage;
  age: number;           // ticks since filed
  assignee?: string;     // agent id carrying / handling
  /** logical position when not carried — for queue rendering */
  x: number;
  y: number;
}

export type IntentKind =
  | "claim_case"
  | "deliver_case"
  | "file_case"
  | "patrol"
  | "attest"
  | "escort"
  | "audit"
  | "consult"
  | "restock"
  | "rest";

export interface Decision {
  tick: number;
  intent: IntentKind;
  target: string;        // room id or case id
  score: number;
  reason: string;
  chosen: boolean;
}

export interface Agent {
  id: string;
  label: string;
  role: AgentRole;
  trust: number;        // 0..1
  stake: number;        // tau
  status: AgentStatus;
  /** room id currently in (or transiting from) */
  room: string;
  /** target room id */
  target: string;
  /** path waypoints remaining */
  path: { x: number; y: number }[];
  x: number;
  y: number;
  /** facing for figure mirroring: -1 left, 1 right */
  facing: 1 | -1;
  /** sub-tick phase for the walking bob (0..1) */
  bobPhase: number;
  /** ticks remaining before next decision */
  cooldown: number;
  /** trust sub-scores */
  sub: { attestation: number; behaviour: number; identity: number };
  /** carrying object */
  carrying?: { kind: "case"; caseId: string; severity: CaseSeverity };
  /** current intent label */
  intent?: IntentKind;
  /** last 4 scored decisions (most recent first) */
  decisions: Decision[];
  /** recent actions */
  log: { t: string; msg: string }[];
}

export type EventKind =
  | "attestation"
  | "flag"
  | "freeze"
  | "slash"
  | "restitution"
  | "block"
  | "decision"
  | "handoff"
  | "case_open"
  | "case_close";

export interface FloorEvent {
  id: string;
  tick: number;
  kind: EventKind;
  agentId?: string;
  x?: number;
  y?: number;
  text: string;
  hash: string;
  ts: string;
  policy?: string;
  stake?: number;
}

export interface Connector {
  id: string;
  fromId: string;       // agent id
  toId: string;         // agent id
  kind: "handoff" | "escort" | "slash" | "attest";
  born: number;         // performance.now()
}

export interface KPIs {
  agents: number;
  trustIndex: number;
  openCases: number;
  slashed24h: number;
  slashedEvents: number;
  quorum: number;
  blockMs: number;
  blockHeight: number;
  restituted24h: number;
}
