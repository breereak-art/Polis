// Self-test for the Tyr trust ledger. Exercises register → attest → query →
// slash → verifyIntegrity → tamper-detect. Run: node tyr-selftest.mjs
import { TyrLedger } from './packages/server/dist/tyr/TyrLedger.js';

let clock = 1_000_000;
const now = () => (clock += 1000);

const tyr = new TyrLedger();
const team = [
    ['triage', 'Tara', 'Triage'],
    ['diagnostic', 'Dax', 'Diagnostic'],
    ['cardiology', 'Cora', 'Cardiology'],
    ['pharmacy', 'Phil', 'Pharmacy'],
    ['records', 'Remi', 'Records'],
];
for (const [id, name, role] of team) {
    tyr.registerAgent({ agentId: id, name, role, capabilities: [role.toLowerCase()], bond: 100, now: now() });
}

// Simulate 12 patient cases. Reliable agents mostly pass; Dax (unreliable) mostly fails.
for (let i = 0; i < 12; i++) {
    for (const [id] of team) {
        const unreliable = id === 'diagnostic';
        const pass = unreliable ? Math.random() < 0.25 : Math.random() < 0.95;
        tyr.recordAttestation({
            agentId: id,
            taskId: `case_${i}`,
            outcome: pass ? 'pass' : 'fail',
            score: pass ? 85 + Math.floor(Math.random() * 15) : 20 + Math.floor(Math.random() * 30),
            attester: 'triage',
            now: now(),
        });
    }
}

console.log('=== Trust profiles (after 12 cases) ===');
for (const p of tyr.getAllProfiles()) {
    console.log(
        `${p.name.padEnd(6)} ${p.role.padEnd(12)} tier=${p.trustTier} bond=${String(p.bond).padStart(3)} ` +
        `att=${p.attestationCount} pass=${p.passCount} fail=${p.failCount} avgScore=${p.avgScore} slashes=${p.slashCount}`
    );
}

console.log('\n=== Slash Dax (defection caught) ===');
const ev = tyr.slash('diagnostic', 50, 'Hallucinated diagnosis contradicting records', now());
console.log('slash event:', ev);
const dax = tyr.getTrust('diagnostic');
console.log(`Dax now -> tier=${dax.trustTier} bond=${dax.bond} slashes=${dax.slashCount}`);

console.log('\n=== Hash-chain integrity ===');
console.log('clean:', tyr.verifyIntegrity());
tyr._tamperForTest(3, (a) => { a.outcome = a.outcome === 'pass' ? 'fail' : 'pass'; });
console.log('after editing entry #3:', tyr.verifyIntegrity());
console.log(`chain length: ${tyr.getChain().length} attestations`);
