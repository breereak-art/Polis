import { useEffect, useMemo, useState } from 'react';
import { AgoraFloor } from './AgoraFloor';
import { useLiveAgora } from './useLiveAgora';
import type { FloorEvent } from './types';
import { eventBus } from '../../events';
import { getColyseusRoom } from '../../game/Game';

interface Comparison {
    count: number;
    trustless: { passRate: number; avgScore: number };
    tyr: { passRate: number; avgScore: number };
    delta: { passRate: number; avgScore: number };
    routedAround: string[];
}

type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

function Pill({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
    const map: Record<string, string> = {
        ok: 'bg-success/10 text-success border-success/30',
        warn: 'bg-warning/15 text-warning-foreground/80 border-warning/40',
        danger: 'bg-destructive/10 text-destructive border-destructive/30',
        info: 'bg-info/10 text-info border-info/30',
        neutral: 'bg-surface-2 text-muted-foreground border-border',
    };
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${map[tone]}`}>
            {children}
        </span>
    );
}

function Dot({ tone = 'neutral' }: { tone?: Tone }) {
    const map: Record<string, string> = {
        ok: 'bg-success', warn: 'bg-warning', danger: 'bg-destructive', info: 'bg-info', neutral: 'bg-muted-foreground',
    };
    return <span className={`inline-block size-1.5 rounded-full ${map[tone]}`} />;
}

function Panel({ title, meta, children, className = '' }: { title: string; meta?: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <section className={`flex flex-col border border-border bg-panel ${className}`}>
            <header className="flex items-center justify-between border-b border-border bg-surface px-3 py-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{title}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{meta}</span>
            </header>
            <div className="flex-1">{children}</div>
        </section>
    );
}

const btn = 'rounded-sm border border-border bg-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-foreground hover:bg-surface-2';
const btnActive = 'rounded-sm border border-foreground bg-foreground px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-background';

const hhmmss = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

const tierTone = (t: number): Tone => (t >= 4 ? 'ok' : t >= 3 ? 'info' : t >= 2 ? 'warn' : 'danger');

export function AgoraApp() {
    const live = useLiveAgora();
    const k = live.kpis;
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

    const workers = useMemo(() => live.profiles.filter((p) => p.agentId !== 'tyr').sort((a, b) => b.trustTier - a.trustTier), [live.profiles]);
    const recentChain = useMemo(() => [...live.chain].slice(-12).reverse(), [live.chain]);
    const recentSlashes = useMemo(() => [...live.slashes].slice(-8).reverse(), [live.slashes]);
    const slashByAgent = useMemo(() => {
        const m: Record<string, number> = {};
        for (const s of live.slashes) m[s.agentId] = (m[s.agentId] || 0) + s.amount;
        return Object.entries(m).sort((a, b) => b[1] - a[1]);
    }, [live.slashes]);
    const lastSlash = live.slashes.length ? live.slashes[live.slashes.length - 1] : null;

    const sparkPath = useMemo(() => {
        const s = live.trustSeries;
        if (s.length < 2) return '';
        const min = Math.min(...s), max = Math.max(...s);
        const range = Math.max(0.001, max - min);
        return s.map((v, i) => {
            const x = (i / (s.length - 1)) * 280;
            const y = 50 - ((v - min) / range) * 44 - 3;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
    }, [live.trustSeries]);

    const kpiTiles: { label: string; value: string; delta: string; tone: Tone }[] = [
        { label: 'Registered agents', value: String(k.agents), delta: 'Tyr-registered', tone: 'neutral' },
        { label: 'Trust index (Tyr)', value: k.trustIndex.toFixed(3), delta: tyrMode ? 'Tyr mode' : 'trustless', tone: 'info' },
        { label: 'Open cases', value: String(k.openCases), delta: 'live backlog', tone: 'warn' },
        { label: 'Slashed bond', value: `₸ ${k.slashedBond.toLocaleString()}`, delta: `${k.slashEvents} events`, tone: 'danger' },
        { label: 'Attestations', value: String(k.attestations), delta: live.integrity?.valid ? '✓ tamper-evident' : '—', tone: 'ok' },
        { label: 'Pass rate', value: `${Math.round(k.passRate * 100)}%`, delta: `avg bond ₸${k.avgBond}`, tone: 'neutral' },
    ];

    const eventTone = (kind: FloorEvent['kind']): Tone =>
        kind === 'slash' ? 'danger' : kind === 'freeze' || kind === 'flag' ? 'warn' : kind === 'attestation' ? 'info' : 'neutral';

    return (
        <div className="min-h-screen bg-background font-sans text-foreground">
            {/* Masthead */}
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border-strong bg-panel px-4 py-2">
                <div className="flex items-center gap-3">
                    <div className="grid size-6 place-items-center border border-foreground/80"><div className="size-2 bg-foreground" /></div>
                    <div className="leading-none">
                        <div className="font-mono text-sm font-bold tracking-[0.18em]">POLIS</div>
                        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">Tyr trust layer · operations console</div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider">
                    <Pill tone={live.integrity?.valid ? 'ok' : 'neutral'}>
                        <Dot tone={live.integrity?.valid ? 'ok' : 'neutral'} />
                        {live.integrity ? `ledger ✓ ${live.integrity.length}` : 'connecting…'}
                    </Pill>
                    <Pill tone={k.slashEvents > 0 ? 'warn' : 'neutral'}>{k.slashEvents} slash events</Pill>
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

            {/* KPI strip — all live from the Tyr ledger */}
            <div className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-3 lg:grid-cols-6">
                {kpiTiles.map((t) => (
                    <div key={t.label} className="bg-panel px-4 py-3">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t.label}</div>
                        <div className="mt-1 font-mono text-xl tabular-nums text-foreground">{t.value}</div>
                        <div className={`mt-1 font-mono text-[10px] ${t.tone === 'danger' ? 'text-destructive' : t.tone === 'warn' ? 'text-warning-foreground/70' : t.tone === 'ok' ? 'text-success' : 'text-muted-foreground'}`}>{t.delta}</div>
                    </div>
                ))}
            </div>

            {/* Agora floor */}
            <section className="border-b border-border">
                <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Agora · polis live world</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">click a room to enter · {k.agents} agents live</span>
                </header>
                <AgoraFloor
                    agents={live.agents}
                    events={live.events}
                    cases={live.cases}
                    connectors={live.connectors}
                    controls={live.controls}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                />
            </section>

            {/* lower grid — every panel real */}
            <main className="grid grid-cols-12 gap-px bg-border">
                {/* Trust index */}
                <Panel title="Tyr · trust index" meta="rolling · live" className="col-span-12 lg:col-span-5">
                    <div className="grid grid-cols-3 gap-px bg-border">
                        <div className="bg-panel p-4">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Composite</div>
                            <div className="mt-1 font-mono text-3xl tabular-nums">{k.trustIndex.toFixed(3)}</div>
                            <div className="mt-1 font-mono text-[10px] text-muted-foreground">mean tier / 5</div>
                        </div>
                        <div className="bg-panel p-4">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Pass rate</div>
                            <div className="mt-1 font-mono text-3xl tabular-nums">{Math.round(k.passRate * 100)}%</div>
                            <div className="mt-1 font-mono text-[10px] text-muted-foreground">{k.attestations} attestations</div>
                        </div>
                        <div className="bg-panel p-4">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Avg bond</div>
                            <div className="mt-1 font-mono text-3xl tabular-nums">₸{k.avgBond}</div>
                            <div className="mt-1 font-mono text-[10px] text-muted-foreground">skin in the game</div>
                        </div>
                    </div>
                    <div className="border-t border-border p-4 text-foreground">
                        <svg viewBox="0 0 280 50" className="h-12 w-full">
                            {sparkPath
                                ? <polyline fill="none" stroke="currentColor" strokeWidth="1.25" points={sparkPath} />
                                : <line x1="0" y1="25" x2="280" y2="25" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 2" opacity="0.4" />}
                        </svg>
                        <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">trust index · last {live.trustSeries.length} samples</div>
                    </div>
                </Panel>

                {/* Agents trust register (replaces fake civic sectors) */}
                <Panel title="Agents · trust register" meta={`${workers.length} agents`} className="col-span-12 lg:col-span-4">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-border bg-surface text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                <th className="px-3 py-2 font-normal">Agent</th>
                                <th className="px-3 py-2 text-right font-normal">Bond</th>
                                <th className="px-3 py-2 text-right font-normal">Tier</th>
                                <th className="px-3 py-2 text-right font-normal">Slash</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono tabular-nums">
                            {workers.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">connecting to ledger…</td></tr>}
                            {workers.map((p) => (
                                <tr key={p.agentId} className="border-b border-border last:border-0">
                                    <td className="px-3 py-2 text-foreground">{p.name} <span className="text-muted-foreground">· {p.role}</span></td>
                                    <td className="px-3 py-2 text-right text-muted-foreground">₸{p.bond}</td>
                                    <td className="px-3 py-2 text-right"><Pill tone={tierTone(p.trustTier)}>T{p.trustTier}</Pill></td>
                                    <td className={`px-3 py-2 text-right ${p.slashCount ? 'text-destructive' : 'text-muted-foreground'}`}>{p.slashCount || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>

                {/* System integrity (real ledger facts) */}
                <Panel title="System integrity" meta="continuous" className="col-span-12 lg:col-span-3">
                    <ul className="divide-y divide-border">
                        {[
                            { l: 'Hash chain', v: live.integrity ? (live.integrity.valid ? '✓ verified' : '✗ broken') : '—', tone: (live.integrity?.valid ? 'ok' : 'warn') as Tone },
                            { l: 'Attestations', v: String(k.attestations), tone: 'neutral' as Tone },
                            { l: 'Slash events', v: String(k.slashEvents), tone: (k.slashEvents ? 'warn' : 'ok') as Tone },
                            { l: 'Enforcement mode', v: tyrMode ? 'Tyr · armed' : 'trustless', tone: (tyrMode ? 'ok' : 'warn') as Tone },
                            { l: 'Agents registered', v: String(live.profiles.length), tone: 'neutral' as Tone },
                        ].map((r) => (
                            <li key={r.l} className="flex items-center justify-between px-3 py-2 text-xs">
                                <span className="flex items-center gap-2 text-muted-foreground"><Dot tone={r.tone} />{r.l}</span>
                                <span className="font-mono text-[11px] text-foreground">{r.v}</span>
                            </li>
                        ))}
                    </ul>
                </Panel>

                {/* Enforcement queue (real slashes) */}
                <Panel title="Enforcement · slash record" meta={`${live.slashes.length} total`} className="col-span-12 lg:col-span-8">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-border bg-surface text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                <th className="px-3 py-2 font-normal">Subject</th>
                                <th className="px-3 py-2 font-normal">Reason</th>
                                <th className="px-3 py-2 text-right font-normal">Bond burned</th>
                                <th className="px-3 py-2 text-right font-normal">When</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentSlashes.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center font-mono text-[11px] text-muted-foreground">no slashes yet — run a case in Tyr mode against the unreliable agent</td></tr>}
                            {recentSlashes.map((s, i) => (
                                <tr key={i} className="border-b border-border last:border-0 hover:bg-surface/60">
                                    <td className="px-3 py-2 font-mono text-[11px] text-foreground">agent://{s.agentId}</td>
                                    <td className="px-3 py-2 text-xs text-foreground">{s.reason}</td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-destructive">−₸ {s.amount.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right font-mono text-[11px] text-muted-foreground">{hhmmss(s.timestamp)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>

                {/* Council · governance (real resource request) */}
                <Panel title="Council · governance" meta={request ? '1 pending' : 'idle'} className="col-span-12 lg:col-span-4">
                    {request ? (
                        <div className="p-3">
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Provision request</span>
                                <Pill tone="warn">awaiting vote</Pill>
                            </div>
                            <div className="mt-2 text-xs text-foreground">{request.reason}</div>
                            <div className="mt-1 font-mono text-[10px] text-muted-foreground">Projected {request.projectedSpeedup} · cost {request.budgetCost} credits</div>
                            <div className="mt-3 flex gap-2">
                                <button className="flex-1 rounded-sm border border-success/40 bg-success/15 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-success" onClick={approve}>Approve</button>
                                <button className="flex-1 rounded-sm border border-border bg-panel px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground" onClick={deny}>Deny</button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 font-mono text-[11px] text-muted-foreground">
                            No motions pending. A provision request is raised automatically when the case backlog exceeds trusted capacity — hit <span className="text-foreground">+6 surge</span> to trigger one.
                        </div>
                    )}
                </Panel>

                {/* Immutable audit stream (real hash chain) */}
                <Panel title="Immutable audit stream" meta="live · ledger tap" className="col-span-12 lg:col-span-8">
                    <ul className="font-mono text-[11px]">
                        {recentChain.length === 0 && <li className="px-3 py-6 text-center text-muted-foreground">ledger empty</li>}
                        {recentChain.map((a) => (
                            <li key={a.index} className="grid grid-cols-[64px_64px_1fr_auto] items-center gap-3 border-b border-border px-3 py-1.5 last:border-0">
                                <span className="text-muted-foreground">#{a.index} · {hhmmss(a.timestamp)}</span>
                                <Pill tone={a.outcome === 'pass' ? 'ok' : 'danger'}>{a.outcome}</Pill>
                                <span className="truncate text-foreground">agent://{a.agentId} · score {a.score} · by {a.attester}</span>
                                <span className="text-info" title={a.hash}>0x{a.hash.slice(0, 8)}…</span>
                            </li>
                        ))}
                    </ul>
                </Panel>

                {/* Treasury · slashing (real) */}
                <Panel title="Treasury · slashing" meta="session" className="col-span-12 lg:col-span-4">
                    <div className="grid grid-cols-2 gap-px bg-border">
                        <div className="bg-panel p-3">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Bond slashed</div>
                            <div className="mt-1 font-mono text-2xl tabular-nums text-destructive">₸ {k.slashedBond.toLocaleString()}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">{k.slashEvents} events</div>
                        </div>
                        <div className="bg-panel p-3">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Avg bond</div>
                            <div className="mt-1 font-mono text-2xl tabular-nums">₸ {k.avgBond}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">across {k.agents} agents</div>
                        </div>
                        <div className="col-span-2 bg-panel p-3">
                            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Last slash</div>
                            <div className="mt-1 truncate font-mono text-sm text-foreground">{lastSlash ? `agent://${lastSlash.agentId} · −₸${lastSlash.amount}` : '—'}</div>
                            <div className="truncate font-mono text-[10px] text-muted-foreground">{lastSlash?.reason ?? 'no slashes this session'}</div>
                        </div>
                    </div>
                    {slashByAgent.length > 0 && (
                        <div className="border-t border-border p-3">
                            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Slashed by agent</div>
                            {slashByAgent.map(([id, amt]) => {
                                const max = slashByAgent[0][1] || 1;
                                return (
                                    <div key={id} className="mb-1.5 grid grid-cols-[90px_1fr_48px] items-center gap-2 text-[11px]">
                                        <span className="truncate text-muted-foreground">{id}</span>
                                        <div className="h-1.5 bg-surface-2"><div className="h-full bg-destructive" style={{ width: `${(amt / max) * 100}%` }} /></div>
                                        <span className="text-right font-mono tabular-nums">₸{amt}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Panel>
            </main>

            {/* Footer */}
            <footer className="border-t border-border bg-panel px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Polis · Tyr trust layer · self-governing agent society</span>
                    <span className="inline-flex items-center gap-1.5">
                        <Dot tone={live.integrity?.valid ? 'ok' : 'neutral'} />
                        {live.integrity?.valid ? 'hash chain verified' : 'connecting'} · {k.attestations} attestations
                    </span>
                </div>
            </footer>
        </div>
    );
}
