import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DISTRICTS, DISTRICT_BY_ID, HOUSES, ROOMS } from "./simulator";
import type { Agent, AgentRole, Connector, District, FloorEvent, House, PatientCase, Room } from "./types";
import type { SimControls } from "./useSimulation";
import { ISO_VIEWBOX, WORLD_H, WORLD_W, rectIso, toIso, zKey } from "./iso";
import { Figure, ROLE_ACCENT } from "./figures";

const ROLE_LABEL: Record<AgentRole, string> = {
  medic: "Medic", courier: "Courier", oracle: "Oracle", attestor: "Attestor", ombuds: "Ombuds",
};

const EVENT_COLOR: Record<FloorEvent["kind"], string> = {
  attestation: "var(--info)",
  flag: "var(--warning)",
  freeze: "var(--warning)",
  slash: "var(--destructive)",
  restitution: "var(--success)",
  block: "var(--muted-foreground)",
  decision: "var(--muted-foreground)",
  handoff: "var(--info)",
  case_open: "var(--warning)",
  case_close: "var(--success)",
};

interface Pulse { id: string; x: number; y: number; color: string; born: number }

/* ---------- Camera ---------- */
const VIEW_PARTS = ISO_VIEWBOX.split(" ").map(Number);
const VIEW_MIN_X = VIEW_PARTS[0];
const VIEW_MIN_Y = VIEW_PARTS[1];
const VIEW_W = VIEW_PARTS[2];
const VIEW_H = VIEW_PARTS[3];

interface Cam { x: number; y: number; z: number }
// Framed on the Medical District (where the live agents work) at a zoom that
// renders full figures + interior detail on load.
const DEFAULT_CAM: Cam = { x: 153, y: 132, z: 2.2 };

function clampZoom(z: number) { return Math.max(0.35, Math.min(4.5, z)); }

export function AgoraFloor({
  agents, events, cases, connectors, controls, selectedId, onSelect, onIssueOrder,
}: {
  agents: Agent[];
  events: FloorEvent[];
  cases: PatientCase[];
  connectors: Connector[];
  controls: SimControls;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onIssueOrder?: (agentId: string) => void;
}) {
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [cam, setCam] = useState<Cam>(DEFAULT_CAM);
  const camRef = useRef(cam);
  camRef.current = cam;
  const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [followSelected, setFollowSelected] = useState(true);
  const movedRef = useRef(false);          // true once a pointer-drag actually moved
  const flyRef = useRef<number | null>(null); // active camera fly-in interval id

  useEffect(() => {
    const seen = seenRef.current;
    const fresh: Pulse[] = [];
    for (const e of events) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (e.x == null || e.y == null) continue;
      if (e.kind === "decision") continue;
      const p = toIso(e.x, e.y);
      fresh.push({ id: e.id, x: p.x, y: p.y, color: EVENT_COLOR[e.kind], born: performance.now() });
    }
    if (fresh.length) setPulses((p) => [...p, ...fresh].slice(-32));
  }, [events]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = performance.now();
      setPulses((p) => p.filter((q) => now - q.born < 1600));
    }, 400);
    return () => window.clearInterval(id);
  }, []);

  /* svg ↔ client coord */
  const svgPointFromClient = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const r = pt.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  }, []);

  const cancelFly = useCallback(() => {
    if (flyRef.current) { window.clearInterval(flyRef.current); flyRef.current = null; }
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    cancelFly();
    const p = svgPointFromClient(e.clientX, e.clientY);
    const cur = camRef.current;
    const newZ = clampZoom(cur.z * (1 - e.deltaY * 0.0014));
    // anchor zoom at cursor
    const wx = (p.x - cur.x) / cur.z;
    const wy = (p.y - cur.y) / cur.z;
    const nx = p.x - wx * newZ;
    const ny = p.y - wy * newZ;
    setCam({ x: nx, y: ny, z: newZ });
  }, [svgPointFromClient, cancelFly]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as Element).closest?.("[data-agent-hit]")) return;
    cancelFly();
    movedRef.current = false;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = svgPointFromClient(e.clientX, e.clientY);
    dragRef.current = { x: p.x, y: p.y, cx: camRef.current.x, cy: camRef.current.y };
    setDragging(true);
    setFollowSelected(false);
  }, [svgPointFromClient, cancelFly]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    movedRef.current = true;
    const p = svgPointFromClient(e.clientX, e.clientY);
    setCam((c) => ({ ...c, x: dragRef.current!.cx + (p.x - dragRef.current!.x), y: dragRef.current!.cy + (p.y - dragRef.current!.y) }));
  }, [svgPointFromClient]);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  const fitWorld = useCallback(() => setCam(DEFAULT_CAM), []);
  const zoomBy = useCallback((factor: number) => {
    const cur = camRef.current;
    const cx = VIEW_MIN_X + VIEW_W / 2;
    const cy = VIEW_MIN_Y + VIEW_H / 2;
    const newZ = clampZoom(cur.z * factor);
    const wx = (cx - cur.x) / cur.z;
    const wy = (cy - cur.y) / cur.z;
    setCam({ x: cx - wx * newZ, y: cy - wy * newZ, z: newZ });
  }, []);

  const focusDistrict = useCallback((d: District) => {
    setFollowSelected(false);
    const cx = d.x + d.w / 2;
    const cy = d.y + d.h / 2;
    const iso = toIso(cx, cy);
    const z = 1.6;
    const sx = VIEW_MIN_X + VIEW_W / 2;
    const sy = VIEW_MIN_Y + VIEW_H / 2;
    setCam({ x: sx - iso.x * z, y: sy - iso.y * z - 20, z });
  }, []);

  const focusAgent = useCallback((a: Agent, z?: number) => {
    const iso = toIso(a.x, a.y);
    const nz = clampZoom(z ?? Math.max(camRef.current.z, 1.6));
    const sx = VIEW_MIN_X + VIEW_W / 2;
    const sy = VIEW_MIN_Y + VIEW_H / 2;
    setCam({ x: sx - iso.x * nz, y: sy - iso.y * nz - 8, z: nz });
  }, []);

  // Smooth camera fly-in (used by the immersive room click).
  const flyTo = useCallback((target: Cam) => {
    setFollowSelected(false);
    cancelFly();
    flyRef.current = window.setInterval(() => {
      setCam((c) => {
        const nx = c.x + (target.x - c.x) * 0.2;
        const ny = c.y + (target.y - c.y) * 0.2;
        const nz = c.z + (target.z - c.z) * 0.2;
        if (Math.abs(nx - target.x) < 0.4 && Math.abs(ny - target.y) < 0.4 && Math.abs(nz - target.z) < 0.004) {
          cancelFly();
          return target;
        }
        return { x: nx, y: ny, z: nz };
      });
    }, 16);
  }, [cancelFly]);

  // Click a room/building → fly in for an immersive close-up of that room.
  const focusRoom = useCallback((room: Room) => {
    const iso = toIso(room.x + room.w / 2, room.y + room.h / 2);
    const z = clampZoom(3.4);
    const sx = VIEW_MIN_X + VIEW_W / 2;
    const sy = VIEW_MIN_Y + VIEW_H / 2;
    flyTo({ x: sx - iso.x * z, y: sy - iso.y * z - 10, z });
  }, [flyTo]);

  const pickRoom = useCallback((room: Room) => {
    if (movedRef.current) return; // a drag, not a click — ignore
    focusRoom(room);
  }, [focusRoom]);

  useEffect(() => () => cancelFly(), [cancelFly]);

  // follow selected agent (gentle lerp)
  useEffect(() => {
    if (!followSelected || !selectedId) return;
    const id = window.setInterval(() => {
      const a = agents.find((x) => x.id === selectedId);
      if (!a) return;
      const iso = toIso(a.x, a.y);
      const z = camRef.current.z;
      const sx = VIEW_MIN_X + VIEW_W / 2;
      const sy = VIEW_MIN_Y + VIEW_H / 2;
      const tx = sx - iso.x * z;
      const ty = sy - iso.y * z - 8;
      setCam((c) => ({ x: c.x + (tx - c.x) * 0.18, y: c.y + (ty - c.y) * 0.18, z: c.z }));
    }, 120);
    return () => window.clearInterval(id);
  }, [followSelected, selectedId, agents]);

  const selected = useMemo(() => agents.find((a) => a.id === selectedId) || null, [agents, selectedId]);

  const heat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const e of events.slice(0, 60)) {
      if (e.x == null || e.y == null) continue;
      for (const r of ROOMS) {
        if (e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h) {
          m[r.id] = (m[r.id] ?? 0) + (e.kind === "slash" ? 3 : e.kind === "freeze" ? 2 : 1);
          break;
        }
      }
    }
    return m;
  }, [events]);

  const districtCounts = useMemo(() => {
    const m: Record<string, { agents: number; incidents: number }> = {};
    for (const d of DISTRICTS) m[d.id] = { agents: 0, incidents: 0 };
    for (const a of agents) {
      const r = ROOMS.find((rr) => rr.id === a.room);
      if (r) m[r.districtId].agents += 1;
    }
    for (const e of events.slice(0, 40)) {
      if (!e.agentId) continue;
      if (e.kind !== "flag" && e.kind !== "freeze" && e.kind !== "slash") continue;
      const ag = agents.find((a) => a.id === e.agentId);
      const r = ag ? ROOMS.find((rr) => rr.id === ag.room) : null;
      if (r) m[r.districtId].incidents += 1;
    }
    return m;
  }, [agents, events]);

  const drawList = useMemo(() => {
    type Item =
      | { kind: "agent"; key: string; z: number; agent: Agent }
      | { kind: "case"; key: string; z: number; pcase: PatientCase };
    const items: Item[] = [];
    for (const a of agents) items.push({ kind: "agent", key: a.id, z: zKey(a.x, a.y), agent: a });
    for (const c of cases) {
      if (c.stage === "carried" || c.stage === "closed") continue;
      items.push({ kind: "case", key: c.id, z: zKey(c.x, c.y), pcase: c });
    }
    items.sort((a, b) => a.z - b.z);
    return items;
  }, [agents, cases]);

  const agentById = useMemo(() => {
    const m: Record<string, Agent> = {};
    for (const a of agents) m[a.id] = a;
    return m;
  }, [agents]);

  const queuedCases = useMemo(
    () => cases.filter((c) => c.stage === "queued").sort((a, b) => b.age - a.age),
    [cases]
  );

  const showDetail = cam.z >= 1.1;
  const showLabels = cam.z >= 0.85;
  const tinyAgents = cam.z < 0.6;

  return (
    <div className="grid grid-cols-12 gap-px bg-border">
      {/* floor */}
      <div className="col-span-12 lg:col-span-8 bg-panel">
        {/* district chip strip */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1.5 font-mono text-[10px]">
          {DISTRICTS.filter((d) => d.id !== "RES").map((d) => {
            const c = districtCounts[d.id];
            return (
              <button
                key={d.id}
                onClick={() => focusDistrict(d)}
                className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-border bg-panel px-1.5 py-0.5 text-foreground hover:border-foreground/60"
                title={`Focus ${d.name}`}
              >
                <span className="size-1.5" style={{ background: d.tint }} />
                <span className="text-muted-foreground">§{d.short}</span>
                <span>{d.name}</span>
                <span className="text-muted-foreground/70">· {c.agents}a</span>
                {c.incidents > 0 && <span className="text-destructive">· {c.incidents}!</span>}
              </button>
            );
          })}
          <button
            onClick={() => focusDistrict(DISTRICTS.find((d) => d.id === "RES")!)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-border bg-panel px-1.5 py-0.5 text-muted-foreground hover:border-foreground/60"
          >
            <span className="size-1.5 bg-foreground/40" />
            §RES Housing · {HOUSES.length}
          </button>
        </div>

        {/* status & controls bar */}
        <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <span className="inline-block size-1.5 animate-pulse rounded-full bg-destructive" />
              Live · polis ring
            </span>
            <span>{agents.length} agents</span>
            <span>{queuedCases.length} triage</span>
            <span>{cases.filter((c) => c.stage === "diagnosed").length} to file</span>
            <span className="hidden md:inline">zoom {cam.z.toFixed(2)}×</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => zoomBy(0.83)} className="rounded-sm border border-border bg-panel px-2 py-1 text-foreground hover:bg-surface-2" title="Zoom out">−</button>
            <button onClick={() => zoomBy(1.2)} className="rounded-sm border border-border bg-panel px-2 py-1 text-foreground hover:bg-surface-2" title="Zoom in">+</button>
            <button onClick={fitWorld} className="rounded-sm border border-border bg-panel px-2 py-1 text-foreground hover:bg-surface-2" title="Fit">Fit</button>
            <button
              onClick={() => { setFollowSelected((v) => !v); if (selected) focusAgent(selected); }}
              className={`rounded-sm border px-2 py-1 ${followSelected ? "border-foreground bg-foreground text-background" : "border-border bg-panel text-foreground hover:bg-surface-2"}`}
              title="Follow selected agent"
            >
              Follow
            </button>
            <span className="mx-1 text-muted-foreground/50">|</span>
            <button onClick={() => controls.setPaused(!controls.paused)} className="rounded-sm border border-border bg-panel px-2 py-1 text-foreground hover:bg-surface-2">
              {controls.paused ? "Resume" : "Pause"}
            </button>
            {[1, 2, 4].map((s) => (
              <button key={s} onClick={() => controls.setSpeed(s)}
                className={`rounded-sm border px-2 py-1 ${controls.speed === s ? "border-foreground bg-foreground text-background" : "border-border bg-panel text-foreground hover:bg-surface-2"}`}>
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* SVG iso world */}
        <div className="relative" style={{ background: "var(--surface)" }}>
          <svg
            ref={svgRef}
            viewBox={ISO_VIEWBOX}
            className="block w-full h-auto select-none"
            style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
            role="img"
            aria-label="Polis live isometric world map"
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={() => flyTo(DEFAULT_CAM)}
          >
            <defs>
              <pattern id="isoTile" patternUnits="userSpaceOnUse" width="34.64" height="16">
                <path d="M0 8 L17.32 0 L34.64 8 L17.32 16 Z" fill="none" stroke="var(--border)" strokeWidth="0.4" opacity="0.5"/>
              </pattern>
              <pattern id="isoCobble" patternUnits="userSpaceOnUse" width="17.32" height="8">
                <path d="M0 4 L8.66 0 L17.32 4 L8.66 8 Z" fill="none" stroke="var(--border-strong)" strokeWidth="0.3" opacity="0.4"/>
              </pattern>
            </defs>

            {/* camera group */}
            <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.z})`}>
              {/* world plate */}
              <polygon points={rectIso(0, 0, WORLD_W, WORLD_H)} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="1" />
              <polygon points={rectIso(0, 0, WORLD_W, WORLD_H)} fill="url(#isoCobble)" />

              {/* ring roads */}
              {[
                [40, 545, WORLD_W - 80, 22],
                [40, 990, WORLD_W - 80, 22],
                [710, 40, 22, 960],
                [1390, 40, 22, 960],
              ].map(([x, y, w, h], i) => (
                <polygon key={i} points={rectIso(x, y, w, h)} fill="var(--surface)" stroke="var(--border)" strokeWidth="0.4" opacity="0.9"/>
              ))}

              {/* districts */}
              {DISTRICTS.map((d) => (
                <DistrictPlate key={d.id} d={d} />
              ))}

              {/* rooms (buildings) */}
              {ROOMS.map((r) => (
                <RoomBuilding key={r.id} room={r} heat={heat[r.id] ?? 0} showDetail={showDetail} onPick={pickRoom} />
              ))}

              {/* houses */}
              {HOUSES.map((h) => (
                <HouseBuilding key={h.id} house={h} showDetail={showDetail} />
              ))}

              {/* exterior props */}
              <ExteriorProps showDetail={showDetail} />

              {/* connectors */}
              {connectors.map((c) => {
                const a = agentById[c.fromId];
                const b = agentById[c.toId];
                if (!a || !b) return null;
                const pa = toIso(a.x, a.y);
                const pb = toIso(b.x, b.y);
                const col = c.kind === "slash" ? "var(--destructive)"
                  : c.kind === "escort" ? "var(--warning)"
                  : c.kind === "attest" ? "var(--info)"
                  : "var(--foreground)";
                return (
                  <line key={c.id} x1={pa.x} y1={pa.y - 8} x2={pb.x} y2={pb.y - 8}
                    stroke={col} strokeWidth={0.9} strokeDasharray="2 1.5" opacity="0.8">
                    <animate attributeName="opacity" values="0.9;0" dur="0.9s" fill="freeze" />
                  </line>
                );
              })}

              {/* event pulses */}
              {pulses.map((p) => (
                <circle key={p.id} cx={p.x} cy={p.y} r="3" fill="none" stroke={p.color} strokeWidth="1.2"
                  style={{ transformOrigin: `${p.x}px ${p.y}px`, animation: "agora-pulse 1.5s ease-out forwards" }}/>
              ))}

              {/* z-sorted agents + cases */}
              {drawList.map((it) => {
                if (it.kind === "case") {
                  const c = it.pcase;
                  const p = toIso(c.x, c.y);
                  const color = c.severity === "critical" ? "var(--destructive)"
                    : c.severity === "urgent" ? "var(--warning)" : "var(--info)";
                  return (
                    <g key={c.id} transform={`translate(${p.x}, ${p.y})`}>
                      <ellipse cx={0} cy={0.4} rx={4} ry={1} fill="var(--foreground)" opacity={0.15}/>
                      <rect x={-4} y={-5} width={8} height={5} fill="var(--panel)" stroke="var(--foreground)" strokeWidth="0.4"/>
                      <rect x={-4} y={-5} width={8} height={1.4} fill={color}/>
                      {showDetail && <text x={0} y={-1.4} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="2.4" fill="var(--foreground)">{c.id.slice(3)}</text>}
                    </g>
                  );
                }
                const a = it.agent;
                const p = toIso(a.x, a.y);
                const isSel = selectedId === a.id;
                if (tinyAgents) {
                  return (
                    <circle key={a.id} cx={p.x} cy={p.y - 2} r={1.4}
                      data-agent-hit
                      onPointerDown={(e) => { e.stopPropagation(); onSelect(a.id === selectedId ? null : a.id); }}
                      fill={a.status === "slashed" ? "var(--destructive)" : a.status === "frozen" || a.status === "flagged" ? "var(--warning)" : ROLE_ACCENT[a.role]}
                      stroke={isSel ? "var(--foreground)" : "none"} strokeWidth={0.6}
                      style={{ cursor: "pointer" }}
                    />
                  );
                }
                return (
                  <g key={a.id}
                     data-agent-hit
                     style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: "transform 240ms linear", cursor: "pointer" }}
                     onPointerDown={(e) => { e.stopPropagation(); onSelect(a.id === selectedId ? null : a.id); }}>
                    {isSel && <circle r={9} cy={-1} fill="none" stroke="var(--foreground)" strokeWidth="0.7" strokeDasharray="1.5 1.5" />}
                    <Figure
                      role={a.role}
                      status={a.status}
                      facing={a.facing}
                      bob={a.bobPhase}
                      carrying={a.carrying ? { severity: a.carrying.severity } : null}
                      desaturate={a.status === "frozen" || a.status === "slashed"}
                    />
                    {a.thought && showLabels && (
                      <g transform="translate(0,-22)" style={{ pointerEvents: "none" }}>
                        <rect x={-34} y={-7} width={68} height={9} rx={2} fill="var(--panel)" stroke="var(--border-strong)" strokeWidth="0.3" opacity={0.96} />
                        <text x={-31} y={-0.6} fontFamily="JetBrains Mono, monospace" fontSize={3} fill="var(--foreground)">
                          {a.thought.length > 40 ? a.thought.slice(0, 39) + "…" : a.thought}
                        </text>
                      </g>
                    )}
                    {showLabels && (isSel || a.status === "slashed" || a.status === "frozen" || a.status === "flagged") && (
                      <text x={6} y={-18} fontFamily="JetBrains Mono, monospace" fontSize="3.2" fill="var(--foreground)">
                        {a.id}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* holding bars overlay */}
              <HoldingBars />
            </g>
          </svg>

          {/* legend */}
          <div className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap items-center gap-3 bg-panel/90 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground backdrop-blur">
            {(Object.keys(ROLE_ACCENT) as AgentRole[]).map((r) => (
              <span key={r} className="inline-flex items-center gap-1">
                <span className="inline-block size-1.5 rounded-full" style={{ background: ROLE_ACCENT[r] }} />
                {ROLE_LABEL[r]}
              </span>
            ))}
            <span className="ml-1 text-foreground/60">|</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block size-1.5" style={{ background: "var(--destructive)" }}/>crit</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block size-1.5" style={{ background: "var(--warning)" }}/>urg</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block size-1.5" style={{ background: "var(--info)" }}/>rout</span>
            <span className="ml-1 text-foreground/60">|</span>
            <span>drag to pan · wheel to zoom</span>
          </div>

          {/* minimap */}
          <Minimap agents={agents} cam={cam} onPan={(wx, wy) => {
            // recenter so that world point (wx,wy) lands at svg center
            const iso = toIso(wx, wy);
            const z = camRef.current.z;
            const sx = VIEW_MIN_X + VIEW_W / 2;
            const sy = VIEW_MIN_Y + VIEW_H / 2;
            setFollowSelected(false);
            setCam({ x: sx - iso.x * z, y: sy - iso.y * z, z });
          }} />
        </div>

        {/* Triage queue ticker */}
        <div className="border-t border-border bg-surface px-3 py-2">
          <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Triage queue · live</span>
            <span>{queuedCases.length} queued · {cases.filter((c) => c.stage === "diagnosed").length} to archive · {cases.filter((c) => c.stage === "carried").length} in transit</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 font-mono text-[10px]">
            {queuedCases.length === 0 && <span className="text-muted-foreground">queue empty</span>}
            {queuedCases.map((c) => {
              const sevTone =
                c.severity === "critical" ? "border-destructive/50 bg-destructive/10 text-destructive" :
                c.severity === "urgent" ? "border-warning/50 bg-warning/10 text-warning-foreground/80" :
                "border-border bg-panel text-muted-foreground";
              return (
                <span key={c.id} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 py-0.5 ${sevTone}`}>
                  <span className="text-foreground">{c.id}</span>
                  <span className="uppercase">{c.severity}</span>
                  <span>· {c.age}t</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Inspector */}
      <aside className="col-span-12 lg:col-span-4 bg-panel">
        <div className="border-b border-border bg-surface px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Agent inspector
        </div>
        {selected ? <InspectorBody selected={selected} onClose={() => onSelect(null)} onIssueOrder={onIssueOrder} /> : <EmptyInspector agents={agents} />}
      </aside>

      <style>{`
        @keyframes agora-pulse {
          0%   { transform: scale(1);  opacity: 0.9; }
          100% { transform: scale(7);  opacity: 0;   }
        }
      `}</style>
    </div>
  );
}

/* ---------------- District plate ---------------- */
function DistrictPlate({ d }: { d: District }) {
  // skip residential here — handled separately so houses dominate
  const isRes = d.id === "RES";
  const back = toIso(d.x, d.y);
  const backRight = toIso(d.x + d.w, d.y);
  return (
    <g>
      <polygon points={rectIso(d.x, d.y, d.w, d.h)}
        fill={isRes ? "var(--surface-2)" : "var(--surface)"}
        stroke="var(--border-strong)" strokeWidth="0.8" />
      {/* district label engraved */}
      <text
        x={(back.x + backRight.x) / 2}
        y={back.y - 18}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace"
        fontSize="13"
        letterSpacing="3"
        fill="var(--muted-foreground)"
      >
        §{d.short} · {d.name.toUpperCase()}
      </text>
      {/* district accent strip */}
      <polygon
        points={rectIso(d.x, d.y, d.w, 6)}
        fill={d.tint}
        opacity="0.5"
      />
    </g>
  );
}

/* ---------------- Room building (interior) ---------------- */
function RoomBuilding({ room, heat, showDetail, onPick }: { room: Room; heat: number; showDetail: boolean; onPick: (r: Room) => void }) {
  const back = toIso(room.x, room.y);
  const backRight = toIso(room.x + room.w, room.y);
  const backLeft = toIso(room.x, room.y + room.h);
  const WALL_H = 14;
  const heatOpacity = Math.min(0.22, heat * 0.04);
  return (
    <g onClick={() => onPick(room)} style={{ cursor: "zoom-in" }}>
      <polygon points={rectIso(room.x, room.y, room.w, room.h)} fill="var(--panel)" stroke="var(--border-strong)" strokeWidth="0.8" />
      <polygon points={rectIso(room.x, room.y, room.w, room.h)} fill="url(#isoTile)" />
      {heat > 0 && <polygon points={rectIso(room.x, room.y, room.w, room.h)} fill="var(--destructive)" opacity={heatOpacity} />}
      {/* low walls along back edges */}
      <polygon
        points={`${back.x},${back.y} ${backRight.x},${backRight.y} ${backRight.x},${backRight.y - WALL_H} ${back.x},${back.y - WALL_H}`}
        fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.6"
      />
      <polygon
        points={`${back.x},${back.y} ${backLeft.x},${backLeft.y} ${backLeft.x},${backLeft.y - WALL_H} ${back.x},${back.y - WALL_H}`}
        fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="0.6"
      />
      {/* roof ridge cap */}
      <line x1={back.x} y1={back.y - WALL_H} x2={backRight.x} y2={backRight.y - WALL_H} stroke="var(--border-strong)" strokeWidth="0.6"/>
      {/* room label */}
      <text
        x={(back.x + backRight.x) / 2}
        y={back.y - WALL_H - 3}
        textAnchor="middle"
        fontFamily="JetBrains Mono, monospace" fontSize="6.5"
        fill="var(--muted-foreground)" letterSpacing="1.4"
      >
        §{room.short} · {room.name.toUpperCase()}
      </text>
      {showDetail && <RoomProps room={room} />}
    </g>
  );
}

/* ---------------- House building ---------------- */
function HouseBuilding({ house, showDetail }: { house: House; showDetail: boolean }) {
  const back = toIso(house.x, house.y);
  const backRight = toIso(house.x + house.w, house.y);
  const backLeft = toIso(house.x, house.y + house.h);
  const WALL_H = 18;
  // gable peak
  const apex = { x: (back.x + backRight.x) / 2, y: back.y - WALL_H - 10 };
  return (
    <g>
      {/* footprint */}
      <polygon points={rectIso(house.x, house.y, house.w, house.h)} fill="var(--panel)" stroke="var(--border-strong)" strokeWidth="0.6" />
      {/* back walls */}
      <polygon
        points={`${back.x},${back.y} ${backRight.x},${backRight.y} ${backRight.x},${backRight.y - WALL_H} ${back.x},${back.y - WALL_H}`}
        fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.5"
      />
      <polygon
        points={`${back.x},${back.y} ${backLeft.x},${backLeft.y} ${backLeft.x},${backLeft.y - WALL_H} ${back.x},${back.y - WALL_H}`}
        fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="0.5"
      />
      {/* gable roof: triangle from back-left ridge to apex to back-right ridge */}
      <polygon
        points={`${back.x},${back.y - WALL_H} ${backRight.x},${backRight.y - WALL_H} ${apex.x},${apex.y}`}
        fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.5"
      />
      {/* window dot */}
      <rect
        x={(back.x + backRight.x) / 2 - 1.4}
        y={back.y - WALL_H + 4}
        width={2.8} height={2.4}
        fill="var(--warning)" opacity="0.65"
      />
      {/* door */}
      <rect
        x={back.x - 1.4}
        y={back.y - 6}
        width={2.8} height={6}
        fill="var(--foreground)" opacity="0.7"
      />
      {showDetail && (
        <text
          x={apex.x}
          y={apex.y - 2}
          textAnchor="middle"
          fontFamily="JetBrains Mono, monospace" fontSize="4"
          fill="var(--muted-foreground)"
        >
          {house.id}
        </text>
      )}
    </g>
  );
}

/* ---------------- Exterior props (lamps, benches, obelisks, bulletin, fountain) ---------------- */
function ExteriorProps({ showDetail }: { showDetail: boolean }) {
  // place obelisks at each district gate
  return (
    <g>
      {DISTRICTS.filter((d) => d.id !== "RES").map((d) => {
        const p = toIso(d.gate.x, d.gate.y);
        return (
          <g key={d.id} transform={`translate(${p.x}, ${p.y})`}>
            {/* base */}
            <polygon points="-4,0 4,0 3,-2 -3,-2" fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.4" />
            {/* shaft */}
            <polygon points="-1.6,-2 1.6,-2 1.2,-14 -1.2,-14" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="0.4" />
            {/* cap */}
            <polygon points="-1.2,-14 1.2,-14 0,-17" fill={d.tint} opacity="0.85" stroke="var(--border-strong)" strokeWidth="0.4" />
            {showDetail && (
              <text x={0} y={-19} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="3.5" fill="var(--foreground)">
                §{d.short}
              </text>
            )}
          </g>
        );
      })}
      {/* lamp posts along main vertical road */}
      {[120, 320, 520, 720, 850].map((y, i) => {
        const lx = i % 2 === 0 ? 700 : 1410;
        const p = toIso(lx, y);
        return (
          <g key={`lamp-${i}`} transform={`translate(${p.x}, ${p.y})`}>
            <line x1={0} y1={0} x2={0} y2={-14} stroke="var(--border-strong)" strokeWidth="0.7" />
            <circle cx={0} cy={-15} r={1.4} fill="var(--warning)" opacity="0.75" />
          </g>
        );
      })}
      {/* fountain in forum */}
      {(() => {
        const p = toIso(1215, 200);
        return (
          <g transform={`translate(${p.x}, ${p.y})`}>
            <ellipse cx={0} cy={0} rx={20} ry={9} fill="var(--info)" opacity="0.2" stroke="var(--border-strong)" strokeWidth="0.5" />
            <ellipse cx={0} cy={0} rx={6} ry={2.6} fill="var(--info)" opacity="0.55" />
            <rect x={-0.8} y={-6} width={1.6} height={5} fill="var(--border-strong)" />
          </g>
        );
      })()}
      {/* bulletin board in CIV */}
      {(() => {
        const p = toIso(1065, 420);
        return (
          <g transform={`translate(${p.x}, ${p.y})`}>
            <rect x={-14} y={-16} width={28} height={14} fill="var(--panel)" stroke="var(--border-strong)" strokeWidth="0.5"/>
            <line x1={-12} y1={-13} x2={12} y2={-13} stroke="var(--border-strong)" strokeWidth="0.3"/>
            <line x1={-12} y1={-10} x2={12} y2={-10} stroke="var(--border-strong)" strokeWidth="0.3"/>
            <line x1={-12} y1={-7}  x2={12} y2={-7}  stroke="var(--border-strong)" strokeWidth="0.3"/>
            <rect x={-1} y={-2} width={2} height={2} fill="var(--border-strong)"/>
          </g>
        );
      })()}
      {/* gate arches at LOG entry */}
      {(() => {
        const p = toIso(890, 620);
        return (
          <g transform={`translate(${p.x}, ${p.y})`}>
            <polygon points="-12,0 -12,-18 12,-18 12,0 8,0 8,-14 -8,-14 -8,0" fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.6" />
          </g>
        );
      })()}
    </g>
  );
}

/* ---------------- Minimap ---------------- */
function Minimap({ agents, cam, onPan }: { agents: Agent[]; cam: Cam; onPan: (wx: number, wy: number) => void }) {
  // top-down rectangles for clarity (not iso)
  const W = 200, H = 130;
  const sx = W / WORLD_W;
  const sy = H / WORLD_H;
  const ref = useRef<SVGSVGElement | null>(null);

  // viewport rectangle (approx, in world coords): solve for world-space center given cam
  // svg center = (VIEW_MIN_X + VIEW_W/2, VIEW_MIN_Y + VIEW_H/2)
  const centerIso = {
    x: (VIEW_MIN_X + VIEW_W / 2 - cam.x) / cam.z,
    y: (VIEW_MIN_Y + VIEW_H / 2 - cam.y) / cam.z,
  };
  // approximate world center from iso center: invert (x-y)*0.866, (x+y)*0.4
  const sumXY = centerIso.y / 0.4;
  const diffXY = centerIso.x / 0.866;
  const wCenterX = (sumXY + diffXY) / 2;
  const wCenterY = (sumXY - diffXY) / 2;
  // viewport world span: derived from visible iso bbox / cam.z; approximate as rectangle
  const spanW = (VIEW_W / cam.z) / (2 * 0.866);
  const spanH = (VIEW_H / cam.z) / (2 * 0.4);

  return (
    <div className="pointer-events-auto absolute bottom-2 right-2 border border-border-strong bg-panel/95 p-1 backdrop-blur">
      <div className="mb-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">Polis · minimap</div>
      <svg
        ref={ref}
        width={W} height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block cursor-crosshair"
        onClick={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = e.clientX - r.left, py = e.clientY - r.top;
          onPan(px / sx, py / sy);
        }}
      >
        <rect x={0} y={0} width={W} height={H} fill="var(--surface)" />
        {DISTRICTS.map((d) => (
          <g key={d.id}>
            <rect
              x={d.x * sx} y={d.y * sy}
              width={d.w * sx} height={d.h * sy}
              fill={d.id === "RES" ? "var(--surface-2)" : "var(--panel)"}
              stroke="var(--border-strong)" strokeWidth="0.5"
            />
            <rect x={d.x * sx} y={d.y * sy} width={d.w * sx} height={2} fill={d.tint} opacity="0.7" />
            <text x={d.x * sx + 2} y={d.y * sy + 8} fontFamily="JetBrains Mono, monospace" fontSize="5" fill="var(--muted-foreground)">{d.short}</text>
          </g>
        ))}
        {agents.map((a) => (
          <circle key={a.id}
            cx={a.x * sx} cy={a.y * sy} r={0.9}
            fill={a.status === "slashed" ? "var(--destructive)" : a.status === "frozen" || a.status === "flagged" ? "var(--warning)" : ROLE_ACCENT[a.role]}
          />
        ))}
        {/* viewport rect */}
        <rect
          x={Math.max(0, (wCenterX - spanW) * sx)}
          y={Math.max(0, (wCenterY - spanH) * sy)}
          width={Math.min(W, spanW * 2 * sx)}
          height={Math.min(H, spanH * 2 * sy)}
          fill="none" stroke="var(--foreground)" strokeWidth="0.8" strokeDasharray="2 1.5"
        />
      </svg>
    </div>
  );
}

/* ---------------- Inspector ---------------- */
function InspectorBody({ selected, onClose, onIssueOrder }: { selected: Agent; onClose: () => void; onIssueOrder?: (agentId: string) => void }) {
  const room = ROOMS.find((r) => r.id === selected.room);
  const district = room ? DISTRICT_BY_ID[room.districtId] : null;
  return (
    <div className="p-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {ROLE_LABEL[selected.role]} {district ? `· §${district.short} · ${room!.name}` : `· §${selected.room}`}
          </div>
          <div className="font-mono text-sm text-foreground">{selected.label}</div>
          {selected.intent && <div className="font-mono text-[10px] text-foreground/80">intent: {selected.intent}{selected.carrying ? ` · carrying ${selected.carrying.caseId}` : ""}</div>}
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
          selected.status === "slashed" ? "border-destructive/40 bg-destructive/10 text-destructive" :
          selected.status === "frozen" ? "border-warning/40 bg-warning/15 text-warning-foreground/80" :
          selected.status === "flagged" ? "border-warning/40 bg-warning/15 text-warning-foreground/80" :
          selected.status === "restituted" ? "border-success/30 bg-success/10 text-success" :
          "border-border bg-surface-2 text-muted-foreground"
        }`}>{selected.status}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-px bg-border">
        <Cell label="Trust" value={selected.trust.toFixed(3)} />
        <Cell label="Stake" value={`₸ ${selected.stake.toLocaleString()}`} />
        <Cell label="Carrying" value={selected.carrying ? selected.carrying.caseId : "—"} />
      </div>

      <div className="mt-3 space-y-1.5">
        {(["attestation", "behaviour", "identity"] as const).map((k) => (
          <div key={k} className="grid grid-cols-[78px_1fr_44px] items-center gap-2 text-[11px]">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{k}</span>
            <div className="h-1 bg-surface-2">
              <div className="h-full" style={{
                width: `${selected.sub[k] * 100}%`,
                background: selected.sub[k] > 0.9 ? "var(--success)" : selected.sub[k] > 0.75 ? "var(--info)" : "var(--warning)",
              }}/>
            </div>
            <span className="text-right font-mono tabular-nums">{selected.sub[k].toFixed(3)}</span>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <div className="border-b border-border pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Decision trace · last evaluation</div>
        <ul className="mt-1 font-mono text-[10.5px]">
          {selected.decisions.length === 0 && (
            <li className="py-1 text-muted-foreground">— no decisions evaluated yet —</li>
          )}
          {selected.decisions.slice(0, 5).map((d, i) => (
            <li key={i} className={`grid grid-cols-[14px_1fr_44px] items-center gap-2 border-b border-border/60 py-0.5 last:border-0 ${d.chosen ? "bg-foreground/5" : ""}`}>
              <span className={d.chosen ? "text-foreground" : "text-muted-foreground"}>{d.chosen ? "▶" : "·"}</span>
              <span className="truncate">
                <span className={d.chosen ? "text-foreground" : "text-muted-foreground"}>{d.intent}</span>
                <span className="text-muted-foreground"> · {d.target}</span>
                <span className="text-muted-foreground/70"> · {d.reason}</span>
              </span>
              <span className="text-right tabular-nums text-muted-foreground">{d.score.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3">
        <div className="border-b border-border pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Recent actions</div>
        <ul className="mt-1 font-mono text-[11px]">
          {selected.log.length === 0 && <li className="py-1 text-muted-foreground">— no recent activity —</li>}
          {selected.log.map((l, i) => (
            <li key={i} className="grid grid-cols-[86px_1fr] gap-2 py-0.5">
              <span className="text-muted-foreground">{l.t}</span>
              <span className="text-foreground">{l.msg}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onIssueOrder?.(selected.id)}
          className="flex-1 rounded-sm border border-border-strong bg-foreground px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-background hover:bg-foreground/90"
        >Issue order</button>
        <button onClick={onClose} className="rounded-sm border border-border bg-panel px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-surface-2">✕</button>
      </div>
    </div>
  );
}

function EmptyInspector({ agents }: { agents: Agent[] }) {
  return (
    <div className="p-3 text-xs text-muted-foreground">
      <p>Drag to pan, wheel to zoom, click district chips to jump. Click any agent on the floor to inspect identity, trust sub-scores, and the scored decisions that produced its current intent.</p>
      <div className="mt-3 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-wider">District occupancy</div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-foreground">
        {DISTRICTS.filter((d) => d.id !== "RES").map((d) => {
          const inside = agents.filter((a) => {
            const r = ROOMS.find((rr) => rr.id === a.room);
            return r?.districtId === d.id;
          }).length;
          return (
            <li key={d.id} className="flex items-center justify-between">
              <span className="text-muted-foreground">§{d.short} {d.name}</span>
              <span className="tabular-nums">{inside}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 border-t border-border pt-3 font-mono text-[10px] uppercase tracking-wider">Residential strip</div>
      <p className="mt-1 font-mono text-[11px] text-foreground">{HOUSES.length} agent dwellings · §RES</p>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel p-2">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm tabular-nums truncate">{value}</div>
    </div>
  );
}

/* ---------------- Room props (interior furniture) ---------------- */
function RoomProps({ room }: { room: Room }) {
  switch (room.id) {
    case "triage": return (
      <g>{[0, 1, 2].map((i) => {
        const x = room.x + 20 + i * 60, y = room.y + 30;
        return <polygon key={i} points={rectIso(x, y, 44, 10)} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.4"/>;
      })}</g>
    );
    case "diag": return (
      <g>{[0, 1, 2].map((i) => {
        const x = room.x + 26 + i * 80, y = room.y + 50;
        return (
          <g key={i}>
            <polygon points={rectIso(x, y, 56, 24)} fill="var(--panel)" stroke="var(--border-strong)" strokeWidth="0.5"/>
            <polygon points={rectIso(x + 4, y + 4, 48, 14)} fill="var(--surface-2)" opacity="0.6"/>
          </g>
        );
      })}</g>
    );
    case "pharma": return (
      <g>{[0, 1, 2].map((i) => {
        const x = room.x + 20, y = room.y + 24 + i * 50;
        return <polygon key={i} points={rectIso(x, y, room.w - 40, 12)} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.4"/>;
      })}</g>
    );
    case "records": return (
      <g>{[0, 1, 2, 3].map((i) => {
        const x = room.x + 18, y = room.y + 22 + i * 42;
        return <polygon key={i} points={rectIso(x, y, room.w - 36, 10)} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.4"/>;
      })}</g>
    );
    case "council": return (
      <g>
        <polygon points={rectIso(room.x + 22, room.y + 22, room.w - 44, 16)} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.4"/>
        <polygon points={rectIso(room.x + room.w/2 - 18, room.y + room.h - 50, 36, 22)} fill="var(--panel)" stroke="var(--border-strong)" strokeWidth="0.5"/>
      </g>
    );
    case "treasury": return (
      <g>
        <polygon points={rectIso(room.x + 26, room.y + 30, room.w - 52, 30)} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.5"/>
        <polygon points={rectIso(room.x + 26, room.y + 80, room.w - 52, 30)} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.5"/>
      </g>
    );
    case "holding": {
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const x = room.x + 16 + i * 44;
        pts.push(rectIso(x, room.y + 10, 36, room.h - 20));
      }
      return <g>{pts.map((p, i) => <polygon key={i} points={p} fill="none" stroke="var(--border-strong)" strokeWidth="0.5" strokeDasharray="2 1.5"/>)}</g>;
    }
    case "gate": return (
      <g>
        <polygon points={rectIso(room.x + 20, room.y + 30, room.w - 40, 12)} fill="var(--border-strong)" opacity="0.5"/>
        <polygon points={rectIso(room.x + 20, room.y + room.h - 50, room.w - 40, 12)} fill="var(--border-strong)" opacity="0.4"/>
      </g>
    );
    case "stacks": return (
      <g>{[0, 1, 2, 3, 4, 5].map((i) => {
        const y = room.y + 24 + i * 50;
        return <polygon key={i} points={rectIso(room.x + 16, y, room.w - 32, 12)} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.4"/>;
      })}</g>
    );
    case "tribunal": return (
      <polygon points={rectIso(room.x + 28, room.y + 30, room.w - 56, 24)} fill="var(--surface-2)" stroke="var(--border-strong)" strokeWidth="0.5"/>
    );
    default: return null;
  }
}

function HoldingBars() {
  const r = ROOMS.find((r) => r.id === "holding")!;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const x = r.x + 12 + i * 26;
    const a = toIso(x, r.y + 6);
    const b = toIso(x, r.y + r.h - 6);
    pts.push(`M ${a.x} ${a.y - 11} L ${b.x} ${b.y - 11}`);
  }
  return <path d={pts.join(" ")} stroke="var(--border-strong)" strokeWidth="0.5" opacity="0.5" />;
}
