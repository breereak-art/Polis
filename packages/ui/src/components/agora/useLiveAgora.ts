import { useEffect, useReducer, useRef } from 'react';
import type {
    Agent, AgentRole, AgentStatus, Connector, Decision, FloorEvent, PatientCase,
} from './types';
import type { SimControls } from './useSimulation';
import { ROOMS } from './simulator';
import { eventBus } from '../../events';

/**
 * Live adapter: turns the real Colyseus/Qwen event stream (re-dispatched onto
 * `eventBus` by game/Game.ts) into the props AgoraFloor expects. No scripted
 * simulator — every agent, slash, attestation and thought here is real.
 */

const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

interface Placement { role: AgentRole; room: string }
/** ledger agentId → role + room in the MED / enforcement districts */
const PLACEMENT: Record<string, Placement> = {
    triage: { role: 'medic', room: 'triage' },
    diagnostic: { role: 'oracle', room: 'diag' },
    cardiology: { role: 'medic', room: 'diag' },
    pharmacy: { role: 'courier', room: 'pharma' },
    records: { role: 'attestor', room: 'records' },
    tyr: { role: 'ombuds', room: 'ombuds' },
};
/** Colyseus display name → ledger agentId (for activity-log correlation) */
const NAME_TO_ID: Record<string, string> = {
    Tara: 'triage', Dax: 'diagnostic', Cora: 'cardiology',
    Phil: 'pharmacy', Remi: 'records', Tyr: 'tyr',
};

interface Profile {
    agentId: string; name: string; role?: string;
    trustTier: number; bond: number; attestationCount: number; slashCount: number;
}

interface Dyn {
    status: AgentStatus;
    statusUntil: number;       // ms; transient statuses (flagged) revert after this
    bobPhase: number;
    facing: 1 | -1;
    lastAtt: number;           // last seen attestationCount, to detect new attestations
    log: { t: string; msg: string }[];
    decisions: Decision[];
}

interface Model {
    order: string[];
    profiles: Map<string, Profile>;
    dyn: Map<string, Dyn>;
    events: FloorEvent[];
    connectors: Connector[];
    backlog: number;
    integrity: { valid: boolean; length: number } | null;
    evCounter: number;
    conCounter: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function placementFor(agentId: string, idx: number): Placement {
    if (PLACEMENT[agentId]) return PLACEMENT[agentId];
    // dynamically hired agents (e.g. a governance-approved locum) enter via the gate
    return { role: 'courier', room: 'gate' };
}

/** A stable-ish spot inside a room, spreading agents that share one room. */
function posInRoom(roomId: string, slot: number): { x: number; y: number } {
    const r = ROOM_BY_ID[roomId] || ROOM_BY_ID['triage'];
    const col = slot % 2;
    const row = Math.floor(slot / 2);
    return {
        x: r.x + r.w * (0.32 + 0.36 * col),
        y: r.y + r.h * 0.5 + row * 26,
    };
}

function timeStr(): string {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export interface LiveAgora {
    agents: Agent[];
    events: FloorEvent[];
    cases: PatientCase[];
    connectors: Connector[];
    controls: SimControls;
    integrity: { valid: boolean; length: number } | null;
    backlog: number;
}

export function useLiveAgora(): LiveAgora {
    const modelRef = useRef<Model | null>(null);
    if (!modelRef.current) {
        modelRef.current = {
            order: [], profiles: new Map(), dyn: new Map(),
            events: [], connectors: [], backlog: 0, integrity: null,
            evCounter: 0, conCounter: 0,
        };
    }
    const model = modelRef.current;
    const [, force] = useReducer((x: number) => x + 1, 0);
    const pausedRef = useRef(false);
    const speedRef = useRef(1);

    // keep a built agent list cached between renders so identity is stable
    const builtRef = useRef<{ agents: Agent[]; cases: PatientCase[] }>({ agents: [], cases: [] });

    useEffect(() => {
        const ensureDyn = (id: string, idx: number): Dyn => {
            let d = model.dyn.get(id);
            if (!d) {
                d = {
                    status: 'active', statusUntil: 0,
                    bobPhase: (idx * 0.17) % 1, facing: 1,
                    lastAtt: 0, log: [], decisions: [],
                };
                model.dyn.set(id, d);
            }
            return d;
        };

        const agentPos = (id: string): { x: number; y: number } => {
            const idx = model.order.indexOf(id);
            const place = placementFor(id, idx < 0 ? 0 : idx);
            // slot = order of this agent within its room
            const sameRoom = model.order.filter((o) => placementFor(o, model.order.indexOf(o)).room === place.room);
            const slot = Math.max(0, sameRoom.indexOf(id));
            return posInRoom(place.room, slot);
        };

        const emit = (ev: Omit<FloorEvent, 'id' | 'tick' | 'ts' | 'hash'> & { ts?: string }) => {
            const full: FloorEvent = {
                ...ev,
                id: 'e' + ++model.evCounter,
                tick: 0,
                ts: ev.ts || timeStr(),
                hash: '0x' + (model.evCounter * 2654435761 % 0xffffff).toString(16).padStart(6, '0') + '…',
            };
            model.events.unshift(full);
            if (model.events.length > 48) model.events.pop();
        };

        const connect = (fromId: string, toId: string, kind: Connector['kind']) => {
            model.connectors.unshift({ id: 'c' + ++model.conCounter, fromId, toId, kind, born: nowMs() });
            if (model.connectors.length > 24) model.connectors.pop();
        };

        const applyProfiles = (profiles: Profile[], integrity?: any, chainLength?: number) => {
            if (integrity) {
                model.integrity = { valid: !!integrity.valid, length: chainLength ?? integrity.length ?? 0 };
            }
            for (const p of profiles) {
                if (!model.profiles.has(p.agentId)) model.order.push(p.agentId);
                const prev = model.profiles.get(p.agentId);
                const idx = model.order.indexOf(p.agentId);
                const d = ensureDyn(p.agentId, idx);
                // new attestation(s) landed → pulse + attest connector from the records keeper
                if (prev && p.attestationCount > prev.attestationCount) {
                    const pos = agentPos(p.agentId);
                    emit({ kind: 'attestation', agentId: p.agentId, x: pos.x, y: pos.y, text: `attestation sealed · ${p.name}` });
                    if (p.agentId !== 'records') connect('records', p.agentId, 'attest');
                    d.log.unshift({ t: timeStr(), msg: 'attestation recorded' });
                    if (d.log.length > 8) d.log.pop();
                }
                d.lastAtt = p.attestationCount;
                model.profiles.set(p.agentId, p);
            }
        };

        const onTrust = (e: Event) => {
            const detail = (e as CustomEvent).detail || {};
            applyProfiles(detail.profiles || [], detail.integrity, detail.chainLength);
            force();
        };

        // Cold-start seed: the initial trust-update is sent once on join and can be
        // dropped before handlers attach, so pull the roster from REST and retry
        // until the room is ready.
        let cancelled = false;
        const seed = async (tries: number) => {
            try {
                const r = await fetch('/api/tyr');
                const j = await r.json();
                if (!cancelled && j?.profiles?.length) {
                    applyProfiles(j.profiles, j.integrity, j.chainLength);
                    force();
                    return;
                }
            } catch { /* server not up yet */ }
            if (!cancelled && tries < 8) window.setTimeout(() => seed(tries + 1), 700);
        };
        seed(0);

        const onSlash = (e: Event) => {
            const { agentId, amount, reason, time } = (e as CustomEvent).detail || {};
            if (!agentId) return;
            const d = ensureDyn(agentId, model.order.indexOf(agentId));
            d.status = 'slashed';
            d.statusUntil = 0;
            const prof = model.profiles.get(agentId);
            const pos = agentPos(agentId);
            emit({
                kind: 'slash', agentId, x: pos.x, y: pos.y,
                text: `SLASHED · ${prof?.name ?? agentId} · −${amount} bond`,
                stake: amount, policy: reason, ts: time,
            });
            connect('tyr', agentId, 'slash');
            d.log.unshift({ t: time || timeStr(), msg: `slashed −${amount} bond · ${reason ?? 'verification failed'}` });
            if (d.log.length > 8) d.log.pop();
            force();
        };

        const onGate = (e: Event) => {
            const { rejected, rejectedTier, rerouted, title, time } = (e as CustomEvent).detail || {};
            if (!rejected) return;
            const d = ensureDyn(rejected, model.order.indexOf(rejected));
            if (d.status !== 'slashed') { d.status = 'flagged'; d.statusUntil = nowMs() + 7000; }
            const pos = agentPos(rejected);
            emit({
                kind: 'flag', agentId: rejected, x: pos.x, y: pos.y,
                text: `gated · "${title}" rerouted (tier ${rejectedTier} too low)`, ts: time,
            });
            connect('tyr', rejected, 'slash');
            if (rerouted) connect('tyr', rerouted, 'attest');
            d.log.unshift({ t: time || timeStr(), msg: `task rerouted by Tyr → ${rerouted ?? 'queue'}` });
            if (d.log.length > 8) d.log.pop();
            force();
        };

        const onQueue = (e: Event) => {
            const { backlog } = (e as CustomEvent).detail || {};
            model.backlog = Number(backlog) || 0;
            force();
        };

        const onActivity = (e: Event) => {
            const { agent: name, action, thought, time } = (e as CustomEvent).detail || {};
            const id = NAME_TO_ID[name] || model.order.find((o) => model.profiles.get(o)?.name === name);
            if (!id) return;
            const d = ensureDyn(id, model.order.indexOf(id));
            if (d.status === 'active' || d.status === 'working') {
                d.status = action === 'idle' ? 'active' : 'working';
            }
            if (thought) {
                d.decisions.unshift({ tick: 0, intent: (action || 'think') as any, target: '', score: 0.5 + Math.random() * 0.4, reason: thought, chosen: true });
                if (d.decisions.length > 6) d.decisions.pop();
            }
            d.log.unshift({ t: time || timeStr(), msg: thought ? thought : (action || 'active') });
            if (d.log.length > 8) d.log.pop();
            force();
        };

        eventBus.addEventListener('trust-update', onTrust);
        eventBus.addEventListener('slash', onSlash);
        eventBus.addEventListener('trust-gate', onGate);
        eventBus.addEventListener('queue-update', onQueue);
        eventBus.addEventListener('activity-log', onActivity);

        // liveliness + GC ticker
        const timer = window.setInterval(() => {
            if (pausedRef.current) return;
            const t = nowMs();
            for (const d of model.dyn.values()) {
                if (d.status !== 'frozen' && d.status !== 'slashed') d.bobPhase = (d.bobPhase + 0.16) % 1;
                if (d.status === 'flagged' && d.statusUntil && t > d.statusUntil) d.status = 'active';
            }
            model.connectors = model.connectors.filter((c) => t - c.born < 900);
            force();
        }, 240 / speedRef.current);

        return () => {
            cancelled = true;
            eventBus.removeEventListener('trust-update', onTrust);
            eventBus.removeEventListener('slash', onSlash);
            eventBus.removeEventListener('trust-gate', onGate);
            eventBus.removeEventListener('queue-update', onQueue);
            eventBus.removeEventListener('activity-log', onActivity);
            window.clearInterval(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- build Agora props from the live model ----
    const agents: Agent[] = [];
    const roomSlot: Record<string, number> = {};
    model.order.forEach((id, idx) => {
        const prof = model.profiles.get(id);
        if (!prof) return;
        const place = placementFor(id, idx);
        const slot = (roomSlot[place.room] = (roomSlot[place.room] ?? -1) + 1);
        const pos = posInRoom(place.room, slot);
        const d = model.dyn.get(id)!;
        const tierNorm = clamp01(prof.trustTier / 5);
        agents.push({
            id,
            label: `agent://${id}`,
            role: place.role,
            trust: tierNorm,
            stake: prof.bond,
            status: d.status,
            room: place.room,
            target: place.room,
            path: [],
            x: pos.x,
            y: pos.y,
            facing: d.facing,
            bobPhase: d.bobPhase,
            cooldown: 0,
            sub: {
                attestation: clamp01(tierNorm * 0.9 + 0.1 - prof.slashCount * 0.15),
                behaviour: tierNorm,
                identity: clamp01(0.9 - prof.slashCount * 0.1),
            },
            decisions: d.decisions,
            log: d.log,
        });
    });

    // cases: render the live backlog as queued patient cases in triage
    const triage = ROOM_BY_ID['triage'];
    const cases: PatientCase[] = [];
    const n = Math.min(model.backlog, 12);
    for (let i = 0; i < n; i++) {
        cases.push({
            id: `TR-${String(440 + i)}`,
            severity: i % 4 === 0 ? 'critical' : i % 3 === 0 ? 'urgent' : 'routine',
            stage: 'queued',
            age: (i + 1) * 3,
            x: triage.x + 18 + i * 16,
            y: triage.y + triage.h - 18,
        });
    }

    builtRef.current = { agents, cases };

    const controls: SimControls = {
        speed: speedRef.current,
        setSpeed: (nn: number) => { speedRef.current = nn; force(); },
        paused: pausedRef.current,
        setPaused: (b: boolean) => { pausedRef.current = b; force(); },
    };

    return {
        agents,
        events: model.events,
        cases,
        connectors: model.connectors,
        controls,
        integrity: model.integrity,
        backlog: model.backlog,
    };
}
