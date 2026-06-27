import React, { useEffect, useState } from 'react';
import { eventBus } from '../events';
import { getColyseusRoom } from '../game/Game';

interface Profile {
    agentId: string; name: string; trustTier: number; bond: number;
    attestationCount: number; slashCount: number;
}
interface Stats { passRate: number; avgScore: number }
interface Comparison {
    count: number; trustless: Stats; tyr: Stats;
    delta: { passRate: number; avgScore: number }; routedAround: string[];
}

const tierColor = (t: number) =>
    t >= 5 ? '#ffd700' : t >= 4 ? '#4ade80' : t >= 3 ? '#38bdf8' : t >= 2 ? '#fbbf24' : '#f87171';

function modeBtn(active: boolean): React.CSSProperties {
    return {
        flex: 1, padding: '5px', borderRadius: 5, cursor: 'pointer',
        border: '1px solid #2a3550', fontWeight: 700, fontSize: 10,
        background: active ? '#3b82f6' : '#1a2236', color: active ? '#fff' : '#9fb0cc',
    };
}

export function TyrPanel() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [integrity, setIntegrity] = useState<{ valid: boolean; length: number } | null>(null);
    const [tyrMode, setTyrMode] = useState(true);
    const [cmp, setCmp] = useState<Comparison | null>(null);
    const [backlog, setBacklog] = useState(0);
    const [request, setRequest] = useState<any | null>(null);

    useEffect(() => {
        const onTrust = (e: any) => {
            const d = e.detail || {};
            setProfiles((d.profiles || []).filter((p: Profile) => p.agentId !== 'tyr'));
            if (d.integrity) setIntegrity(d.integrity);
        };
        const onMode = (e: any) => setTyrMode(!!e.detail?.tyrMode);
        const onCmp = (e: any) => setCmp(e.detail);
        const onQueue = (e: any) => setBacklog(e.detail?.backlog ?? 0);
        const onReq = (e: any) => setRequest(e.detail);
        eventBus.addEventListener('trust-update', onTrust);
        eventBus.addEventListener('mode-update', onMode);
        eventBus.addEventListener('comparison-result', onCmp);
        eventBus.addEventListener('queue-update', onQueue);
        eventBus.addEventListener('resource-request', onReq);
        return () => {
            eventBus.removeEventListener('trust-update', onTrust);
            eventBus.removeEventListener('mode-update', onMode);
            eventBus.removeEventListener('comparison-result', onCmp);
            eventBus.removeEventListener('queue-update', onQueue);
            eventBus.removeEventListener('resource-request', onReq);
        };
    }, []);

    const setMode = (m: boolean) => { getColyseusRoom()?.send('set-mode', { tyrMode: m }); setTyrMode(m); };
    const runAB = () => getColyseusRoom()?.send('run-comparison', { count: 12 });
    const surge = () => getColyseusRoom()?.send('queue-cases', { n: 6 });
    const approve = () => { getColyseusRoom()?.send('approve-resource', {}); setRequest(null); };
    const deny = () => { getColyseusRoom()?.send('deny-resource', {}); setRequest(null); };

    const sorted = [...profiles].sort((a, b) => b.trustTier - a.trustTier);

    return (
        <div style={{
            position: 'fixed', top: 64, right: 12, width: 252, background: '#0e1426ee',
            border: '1px solid #2a3550', borderRadius: 8, padding: 10, color: '#e8ecf5',
            fontSize: 11, fontFamily: 'system-ui, sans-serif', zIndex: 50,
        }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>🛡️ Tyr — Trust Layer</div>
            <div style={{ fontSize: 10, opacity: 0.85, marginBottom: 8 }}>
                Ledger: {integrity ? `${integrity.length} attestations · ` : '— '}
                <span style={{ color: integrity?.valid ? '#4ade80' : '#f87171' }}>
                    {integrity ? (integrity.valid ? '✓ tamper-evident' : '✗ broken') : ''}
                </span>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <button onClick={() => setMode(true)} style={modeBtn(tyrMode)}>Tyr mode</button>
                <button onClick={() => setMode(false)} style={modeBtn(!tyrMode)}>Trustless</button>
            </div>

            <div style={{ marginBottom: 8 }}>
                {sorted.map((p) => (
                    <div key={p.agentId} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span>{p.name}</span>
                        <span>
                            <span style={{ background: tierColor(p.trustTier), color: '#08111f', borderRadius: 3, padding: '0 4px', fontWeight: 700 }}>T{p.trustTier}</span>
                            <span style={{ opacity: 0.7, marginLeft: 6 }}>b{p.bond}{p.slashCount ? ` ⚔${p.slashCount}` : ''}</span>
                        </span>
                    </div>
                ))}
            </div>

            <button onClick={runAB} style={{ width: '100%', padding: 6, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 700 }}>
                Run A/B (12 cases)
            </button>

            {cmp && (
                <div style={{ marginTop: 8, fontSize: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#f87171' }}>Trustless</span>
                        <span>{cmp.trustless.passRate}% pass · avg {cmp.trustless.avgScore}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#4ade80' }}>Tyr</span>
                        <span>{cmp.tyr.passRate}% pass · avg {cmp.tyr.avgScore}</span>
                    </div>
                    <div style={{ marginTop: 4, fontWeight: 700, color: '#9ae6b4' }}>
                        +{cmp.delta.passRate}% pass · +{cmp.delta.avgScore} score with Tyr
                    </div>
                    {cmp.routedAround.length > 0 && (
                        <div style={{ marginTop: 2, opacity: 0.75 }}>Bypassed: {cmp.routedAround.join(', ')}</div>
                    )}
                </div>
            )}

            <div style={{ marginTop: 10, borderTop: '1px solid #2a3550', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ opacity: 0.85 }}>Case backlog: <b>{backlog}</b></span>
                    <button onClick={surge} style={{ padding: '3px 8px', background: '#1a2236', color: '#9fb0cc', border: '1px solid #2a3550', borderRadius: 5, cursor: 'pointer', fontSize: 10 }}>+6 surge</button>
                </div>
                {request && (
                    <div style={{ background: '#1c1530', border: '1px solid #6d4aff55', borderRadius: 6, padding: 8 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>⚖️ Resource request</div>
                        <div style={{ fontSize: 10, opacity: 0.9, marginBottom: 6 }}>{request.reason} Projected {request.projectedSpeedup}, cost {request.budgetCost} credits.</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={approve} style={{ flex: 1, padding: 5, background: '#22c55e', color: '#06210f', border: 'none', borderRadius: 5, cursor: 'pointer', fontWeight: 700 }}>Approve</button>
                            <button onClick={deny} style={{ flex: 1, padding: 5, background: '#3a2230', color: '#f0a5b5', border: '1px solid #5a2a3a', borderRadius: 5, cursor: 'pointer', fontWeight: 700 }}>Deny</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
