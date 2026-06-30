import { useEffect, useState } from 'react';
import { AgoraFloor } from './AgoraFloor';
import { useLiveAgora } from './useLiveAgora';
import { eventBus } from '../../events';
import { getColyseusRoom } from '../../game/Game';

interface Comparison {
    count: number;
    trustless: { passRate: number; avgScore: number };
    tyr: { passRate: number; avgScore: number };
    delta: { passRate: number; avgScore: number };
    routedAround: string[];
}

const btn = 'rounded-sm border border-border bg-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground hover:bg-surface-2';
const btnActive = 'rounded-sm border border-foreground bg-foreground px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-background';

export function AgoraApp() {
    const live = useLiveAgora();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tyrMode, setTyrMode] = useState(true);
    const [cmp, setCmp] = useState<Comparison | null>(null);
    const [request, setRequest] = useState<any | null>(null);

    useEffect(() => {
        const onMode = (e: Event) => setTyrMode(!!(e as CustomEvent).detail?.tyrMode);
        const onCmp = (e: Event) => setCmp((e as CustomEvent).detail);
        const onReq = (e: Event) => setRequest((e as CustomEvent).detail);
        eventBus.addEventListener('mode-update', onMode);
        eventBus.addEventListener('comparison-result', onCmp);
        eventBus.addEventListener('resource-request', onReq);
        return () => {
            eventBus.removeEventListener('mode-update', onMode);
            eventBus.removeEventListener('comparison-result', onCmp);
            eventBus.removeEventListener('resource-request', onReq);
        };
    }, []);

    const send = (type: string, payload: any = {}) => getColyseusRoom()?.send(type, payload);
    const setMode = (m: boolean) => { send('set-mode', { tyrMode: m }); setTyrMode(m); };
    const runAB = () => send('run-comparison', { count: 12 });
    const surge = () => send('queue-cases', { n: 6 });
    const approve = () => { send('approve-resource', {}); setRequest(null); };
    const deny = () => { send('deny-resource', {}); setRequest(null); };

    return (
        <div className="min-h-screen bg-background font-sans text-foreground">
            {/* Masthead */}
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-strong bg-surface px-4 py-2">
                <div className="flex items-baseline gap-3">
                    <span className="font-mono text-sm font-bold tracking-[0.2em] text-foreground">POLIS</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Operations Console · Tyr trust layer</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider">
                    <span className="text-muted-foreground">
                        Ledger:{' '}
                        {live.integrity ? (
                            <>
                                <span className="text-foreground">{live.integrity.length} attest.</span>{' '}
                                <span className={live.integrity.valid ? 'text-success' : 'text-destructive'}>
                                    {live.integrity.valid ? '✓ tamper-evident' : '✗ broken'}
                                </span>
                            </>
                        ) : <span className="text-muted-foreground">connecting…</span>}
                    </span>
                    <span className="text-muted-foreground/50">|</span>
                    <button className={tyrMode ? btnActive : btn} onClick={() => setMode(true)}>Tyr mode</button>
                    <button className={!tyrMode ? btnActive : btn} onClick={() => setMode(false)}>Trustless</button>
                    <button className={btn} onClick={runAB}>Run A/B</button>
                    <button className={btn} onClick={surge}>+6 surge</button>
                </div>
            </header>

            {/* A/B result strip */}
            {cmp && (
                <div className="flex flex-wrap items-center gap-4 border-b border-border bg-panel px-4 py-1.5 font-mono text-[10px]">
                    <span className="uppercase tracking-wider text-muted-foreground">A/B · {cmp.count} cases</span>
                    <span className="text-destructive">Trustless {cmp.trustless.passRate}% pass · avg {cmp.trustless.avgScore}</span>
                    <span className="text-success">Tyr {cmp.tyr.passRate}% pass · avg {cmp.tyr.avgScore}</span>
                    <span className="font-bold text-foreground">+{cmp.delta.passRate}% pass · +{cmp.delta.avgScore} score with Tyr</span>
                    {cmp.routedAround?.length > 0 && <span className="text-muted-foreground">bypassed: {cmp.routedAround.join(', ')}</span>}
                </div>
            )}

            {/* Governance request banner */}
            {request && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-warning/10 px-4 py-2">
                    <span className="font-mono text-[11px] text-foreground">
                        ⚖️ Governance: provision 1 agent. {request.reason} Projected {request.projectedSpeedup}, cost {request.budgetCost} credits.
                    </span>
                    <span className="flex gap-2">
                        <button className="rounded-sm border border-success/40 bg-success/15 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-success" onClick={approve}>Approve</button>
                        <button className="rounded-sm border border-border bg-panel px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground" onClick={deny}>Deny</button>
                    </span>
                </div>
            )}

            {/* The live isometric floor */}
            <AgoraFloor
                agents={live.agents}
                events={live.events}
                cases={live.cases}
                connectors={live.connectors}
                controls={live.controls}
                selectedId={selectedId}
                onSelect={setSelectedId}
            />
        </div>
    );
}
