import type { AgentRole, AgentStatus, CaseSeverity } from "./types";

/** Tiny role-uniformed figures. Drawn upright (~14×22), anchored at feet (0, 0). */

const ACCENT: Record<AgentRole, string> = {
  medic: "var(--success)",
  courier: "var(--info)",
  oracle: "var(--accent)",
  attestor: "var(--foreground)",
  ombuds: "var(--warning)",
};

function StatusBadge({ status }: { status: AgentStatus }) {
  if (status === "flagged") {
    return (
      <g>
        <rect x={2.4} y={-15} width={3} height={3} fill="var(--warning)" stroke="var(--foreground)" strokeWidth="0.4">
          <animate attributeName="opacity" values="1;0.3;1" dur="1.2s" repeatCount="indefinite" />
        </rect>
      </g>
    );
  }
  if (status === "frozen") {
    return (
      <g>
        <circle cx={0} cy={-21} r={1.6} fill="var(--info)" />
        <ellipse cx={0} cy={0.5} rx={7} ry={2} fill="none" stroke="var(--info)" strokeWidth="0.6" strokeDasharray="1.5 1.2" />
      </g>
    );
  }
  if (status === "slashed") {
    return (
      <g>
        <path d="M -5 -16 L 5 -10 M 5 -16 L -5 -10" stroke="var(--destructive)" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    );
  }
  if (status === "restituted") {
    return (
      <g>
        <rect x={-3} y={-22} width={6} height={3} fill="var(--success)" />
        <text x={0} y={-19.5} textAnchor="middle" fontSize={2.4} fontFamily="JetBrains Mono, monospace" fill="var(--success-foreground)">✓</text>
      </g>
    );
  }
  return null;
}

function FigureShadow() {
  return <ellipse cx={0} cy={0.5} rx={4} ry={1.2} fill="var(--foreground)" opacity={0.18} />;
}

function CarriedCase({ severity }: { severity: CaseSeverity }) {
  const color =
    severity === "critical" ? "var(--destructive)" :
    severity === "urgent" ? "var(--warning)" : "var(--info)";
  return (
    <g transform="translate(4, -10)">
      <rect x={-1} y={-2.5} width={5} height={4} fill="var(--panel)" stroke="var(--foreground)" strokeWidth="0.4" />
      <rect x={-1} y={-2.5} width={5} height={1} fill={color} />
    </g>
  );
}

interface FigureProps {
  role: AgentRole;
  status: AgentStatus;
  facing?: 1 | -1;
  bob?: number;
  carrying?: { severity: CaseSeverity } | null;
  desaturate?: boolean;
}

export function Figure({ role, status, facing = 1, bob = 0, carrying, desaturate }: FigureProps) {
  const bobY = status === "frozen" || status === "slashed" ? 0 : Math.round(Math.sin(bob * Math.PI * 2) * 10) / 20;
  const inner = (
    <g transform={`scale(${facing}, 1) translate(0, ${bobY})`}>
      {/* role-specific body */}
      {role === "medic" && <MedicBody />}
      {role === "courier" && <CourierBody />}
      {role === "oracle" && <OracleBody />}
      {role === "attestor" && <AttestorBody />}
      {role === "ombuds" && <OmbudsBody />}
      {/* head */}
      <circle cx={0} cy={-17.5} r={2.4} fill="var(--surface-2)" stroke="var(--foreground)" strokeWidth="0.5" />
      {/* accent collar dot */}
      <circle cx={0} cy={-14.2} r={0.9} fill={ACCENT[role]} />
    </g>
  );
  return (
    <g style={desaturate ? { filter: "grayscale(0.85)" } : undefined}>
      <FigureShadow />
      {inner}
      {carrying && <CarriedCase severity={carrying.severity} />}
      <StatusBadge status={status} />
    </g>
  );
}

function MedicBody() {
  return (
    <g>
      {/* legs */}
      <rect x={-2.2} y={-6} width={1.8} height={6} fill="var(--foreground)" />
      <rect x={0.4} y={-6} width={1.8} height={6} fill="var(--foreground)" />
      {/* coat */}
      <path d="M -3.6 -14 L 3.6 -14 L 4 -6 L -4 -6 Z" fill="var(--panel)" stroke="var(--foreground)" strokeWidth="0.5" />
      {/* cross panel */}
      <rect x={-0.5} y={-12} width={1} height={3.4} fill="var(--success)" />
      <rect x={-1.7} y={-10.8} width={3.4} height={1} fill="var(--success)" />
      {/* stethoscope loop */}
      <path d="M -2.5 -13 Q -3.4 -10 -1.6 -9.5" stroke="var(--foreground)" strokeWidth="0.4" fill="none" />
    </g>
  );
}

function CourierBody() {
  return (
    <g>
      <rect x={-2.2} y={-6} width={1.8} height={6} fill="var(--surface-2)" stroke="var(--foreground)" strokeWidth="0.4" />
      <rect x={0.4} y={-6} width={1.8} height={6} fill="var(--surface-2)" stroke="var(--foreground)" strokeWidth="0.4" />
      {/* vest */}
      <path d="M -3.4 -14 L 3.4 -14 L 3.8 -6.5 L -3.8 -6.5 Z" fill="var(--info)" stroke="var(--foreground)" strokeWidth="0.5" />
      {/* chevron */}
      <path d="M -2.4 -10 L 0 -12 L 2.4 -10" stroke="var(--panel)" strokeWidth="0.6" fill="none" />
      {/* satchel */}
      <rect x={2.4} y={-9} width={2.4} height={2.4} fill="var(--panel)" stroke="var(--foreground)" strokeWidth="0.4" />
    </g>
  );
}

function OracleBody() {
  return (
    <g>
      {/* robe */}
      <path d="M -4 -14 Q -4.5 -9 -4.2 -6 L 4.2 -6 Q 4.5 -9 4 -14 Z" fill="var(--accent)" opacity="0.85" stroke="var(--foreground)" strokeWidth="0.5" />
      <path d="M -4 -14 Q 0 -19 4 -14" fill="var(--accent)" opacity="0.95" stroke="var(--foreground)" strokeWidth="0.5" />
      {/* hex pendant */}
      <polygon points="0,-11 1.4,-10.2 1.4,-8.6 0,-7.8 -1.4,-8.6 -1.4,-10.2" fill="var(--panel)" stroke="var(--foreground)" strokeWidth="0.4" />
    </g>
  );
}

function AttestorBody() {
  return (
    <g>
      <rect x={-2.2} y={-6} width={1.8} height={6} fill="var(--foreground)" />
      <rect x={0.4} y={-6} width={1.8} height={6} fill="var(--foreground)" />
      {/* formal coat */}
      <path d="M -3.6 -14 L 3.6 -14 L 4 -6 L -4 -6 Z" fill="var(--foreground)" />
      {/* tall collar */}
      <path d="M -1.8 -14.5 L 1.8 -14.5 L 1.2 -12 L -1.2 -12 Z" fill="var(--panel)" />
      {/* seal ring */}
      <circle cx={2.6} cy={-8} r={1} fill="var(--warning)" stroke="var(--foreground)" strokeWidth="0.3" />
    </g>
  );
}

function OmbudsBody() {
  return (
    <g>
      <rect x={-2.2} y={-6} width={1.8} height={6} fill="var(--foreground)" />
      <rect x={0.4} y={-6} width={1.8} height={6} fill="var(--foreground)" />
      <path d="M -3.6 -14 L 3.6 -14 L 4 -6 L -4 -6 Z" fill="var(--surface-2)" stroke="var(--foreground)" strokeWidth="0.5" />
      {/* sash */}
      <path d="M -3.6 -13 L 4 -7" stroke="var(--warning)" strokeWidth="1.4" />
      {/* ledger */}
      <rect x={-4.4} y={-9} width={2} height={2.6} fill="var(--panel)" stroke="var(--foreground)" strokeWidth="0.4" />
    </g>
  );
}

export const ROLE_ACCENT = ACCENT;
