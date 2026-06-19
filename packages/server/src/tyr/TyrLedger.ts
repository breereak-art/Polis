import { createHash } from 'node:crypto';

/**
 * Tyr — the trust layer for Polis. A hash-chained, tamper-evident ledger of
 * agent behaviour. Every completed task writes an append-only attestation
 * (pass/fail + score) whose hash links to the previous entry, so the whole
 * history is verifiable and cannot be silently rewritten. Each agent also has
 * an identity, a trust tier (1-5) derived from its record, and a slashable
 * bond — skin in the game.
 *
 * Off-chain analogue of the original on-chain design: no blockchain required,
 * but the hash chain preserves the same "immutable, verifiable behaviour"
 * property.
 */

export type Outcome = 'pass' | 'fail';

export interface Attestation {
    index: number;
    agentId: string;
    taskId: string;
    outcome: Outcome;
    score: number; // 0-100
    attester: string; // who recorded it (agent id or 'system')
    timestamp: number;
    prevHash: string;
    hash: string;
}

export interface SlashEvent {
    agentId: string;
    amount: number;
    reason: string;
    timestamp: number;
}

interface AgentIdentity {
    agentId: string;
    name: string;
    role: string;
    capabilities: string[];
    bond: number;
    createdAt: number;
}

export interface TrustProfile {
    agentId: string;
    name: string;
    role: string;
    trustTier: number; // 1-5
    bond: number;
    attestationCount: number;
    passCount: number;
    failCount: number;
    avgScore: number;
    slashCount: number;
    capabilities: string[];
}

export interface IntegrityResult {
    valid: boolean;
    length: number;
    brokenAt?: number;
    reason?: string;
}

const GENESIS_HASH = '0'.repeat(64);
const DEFAULT_BOND = 100;

export class TyrLedger {
    private chain: Attestation[] = [];
    private agents = new Map<string, AgentIdentity>();
    private slashes: SlashEvent[] = [];

    /** Deterministic hash of an entry over its content + the previous hash. */
    private hashEntry(e: Omit<Attestation, 'hash'>): string {
        const payload = [
            e.prevHash, e.index, e.agentId, e.taskId,
            e.outcome, e.score, e.attester, e.timestamp,
        ].join('|');
        return createHash('sha256').update(payload).digest('hex');
    }

    /** Register a soulbound agent identity with an initial bond. */
    registerAgent(p: {
        agentId: string; name: string; role: string;
        capabilities?: string[]; bond?: number; now: number;
    }): void {
        if (this.agents.has(p.agentId)) return;
        this.agents.set(p.agentId, {
            agentId: p.agentId,
            name: p.name,
            role: p.role,
            capabilities: p.capabilities ?? [],
            bond: p.bond ?? DEFAULT_BOND,
            createdAt: p.now,
        });
    }

    isRegistered(agentId: string): boolean {
        return this.agents.has(agentId);
    }

    /** Append a behavioural attestation, linking it into the hash chain. */
    recordAttestation(p: {
        agentId: string; taskId: string; outcome: Outcome;
        score: number; attester: string; now: number;
    }): Attestation {
        const prevHash = this.chain.length
            ? this.chain[this.chain.length - 1].hash
            : GENESIS_HASH;

        const base: Omit<Attestation, 'hash'> = {
            index: this.chain.length,
            agentId: p.agentId,
            taskId: p.taskId,
            outcome: p.outcome,
            score: Math.max(0, Math.min(100, Math.round(p.score))),
            attester: p.attester,
            timestamp: p.now,
            prevHash,
        };
        const entry: Attestation = { ...base, hash: this.hashEntry(base) };
        this.chain.push(entry);

        // Bond moves with behaviour: small reward on pass, decay on fail.
        const agent = this.agents.get(p.agentId);
        if (agent) {
            agent.bond += p.outcome === 'pass' ? 2 : -5;
            if (agent.bond < 0) agent.bond = 0;
        }
        return entry;
    }

    /** Slash an agent's bond by a percentage for verified misbehaviour. */
    slash(agentId: string, percentage: number, reason: string, now: number): SlashEvent | null {
        const agent = this.agents.get(agentId);
        if (!agent) return null;
        const pct = Math.max(0, Math.min(100, percentage));
        const amount = Math.round((agent.bond * pct) / 100);
        agent.bond = Math.max(0, agent.bond - amount);
        const ev: SlashEvent = { agentId, amount, reason, timestamp: now };
        this.slashes.push(ev);
        return ev;
    }

    private attestationsFor(agentId: string): Attestation[] {
        return this.chain.filter((a) => a.agentId === agentId);
    }

    private computeTier(total: number, pass: number, slashes: number): number {
        if (total === 0) return 1;
        const passRate = pass / total;
        let tier = 1;
        if (passRate >= 0.6) tier = 2;
        if (passRate >= 0.75 && total >= 3) tier = 3;
        if (passRate >= 0.85 && total >= 6) tier = 4;
        if (passRate >= 0.95 && total >= 10) tier = 5;
        tier -= slashes; // each slash drops a tier
        return Math.max(1, Math.min(5, tier));
    }

    /** Public trust query — the "credit report" for an agent. */
    getTrust(agentId: string): TrustProfile | null {
        const agent = this.agents.get(agentId);
        if (!agent) return null;
        const atts = this.attestationsFor(agentId);
        const passCount = atts.filter((a) => a.outcome === 'pass').length;
        const failCount = atts.length - passCount;
        const avgScore = atts.length
            ? Math.round(atts.reduce((s, a) => s + a.score, 0) / atts.length)
            : 0;
        const slashCount = this.slashes.filter((s) => s.agentId === agentId).length;
        return {
            agentId,
            name: agent.name,
            role: agent.role,
            trustTier: this.computeTier(atts.length, passCount, slashCount),
            bond: agent.bond,
            attestationCount: atts.length,
            passCount,
            failCount,
            avgScore,
            slashCount,
            capabilities: agent.capabilities,
        };
    }

    getAllProfiles(): TrustProfile[] {
        return [...this.agents.keys()]
            .map((id) => this.getTrust(id))
            .filter((p): p is TrustProfile => p !== null);
    }

    /**
     * Re-walk the entire chain, recomputing every hash and verifying each link
     * points at the prior entry. Any tampering (edited outcome, reordered or
     * dropped entry) breaks a hash and is reported with its index.
     */
    verifyIntegrity(): IntegrityResult {
        let prevHash = GENESIS_HASH;
        for (let i = 0; i < this.chain.length; i++) {
            const e = this.chain[i];
            if (e.index !== i) {
                return { valid: false, length: this.chain.length, brokenAt: i, reason: 'index mismatch' };
            }
            if (e.prevHash !== prevHash) {
                return { valid: false, length: this.chain.length, brokenAt: i, reason: 'broken link (prevHash)' };
            }
            const recomputed = this.hashEntry({
                index: e.index, agentId: e.agentId, taskId: e.taskId,
                outcome: e.outcome, score: e.score, attester: e.attester,
                timestamp: e.timestamp, prevHash: e.prevHash,
            });
            if (recomputed !== e.hash) {
                return { valid: false, length: this.chain.length, brokenAt: i, reason: 'tampered content (hash)' };
            }
            prevHash = e.hash;
        }
        return { valid: true, length: this.chain.length };
    }

    getChain(): readonly Attestation[] {
        return this.chain;
    }

    getSlashEvents(): readonly SlashEvent[] {
        return this.slashes;
    }

    /** Test-only: mutate an entry in place to prove verifyIntegrity catches it. */
    _tamperForTest(index: number, mutate: (a: Attestation) => void): void {
        if (this.chain[index]) mutate(this.chain[index]);
    }
}
