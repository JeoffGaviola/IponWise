import type { ReactNode } from 'react';

const SKIN = '#D9A07A';
const SKIN_DARK = '#B97F5C';

function Defs() {
  return <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }}>
    <defs>
      <linearGradient id="iwa-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#123E52" /><stop offset="0.42" stopColor="#3B8D93" /><stop offset="0.7" stopColor="#F9C784" /><stop offset="1" stopColor="#FFE6BF" />
      </linearGradient>
      <radialGradient id="iwa-glow"><stop offset="0" stopColor="#FFE3A3" stopOpacity="0.95" /><stop offset="0.45" stopColor="#FFC970" stopOpacity="0.35" /><stop offset="1" stopColor="#FFC970" stopOpacity="0" /></radialGradient>
      <linearGradient id="iwa-coin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE08A" /><stop offset="1" stopColor="#E9A92C" /></linearGradient>
      <linearGradient id="iwa-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0.5" /><stop offset="0.5" stopColor="#fff" stopOpacity="0.14" /><stop offset="1" stopColor="#fff" stopOpacity="0.38" /></linearGradient>
      <linearGradient id="iwa-deck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9A6844" /><stop offset="1" stopColor="#6E4530" /></linearGradient>
      <clipPath id="iwa-jar-clip"><path d="M-64 -146 Q-66 -146 -66 -138 L-66 -22 Q-66 -2 -46 -2 L46 -2 Q66 -2 66 -22 L66 -138 Q66 -146 64 -146 Z" /></clipPath>
    </defs>
  </svg>;
}

const Coin = ({ cx, cy, rx = 24, ry = 8 }: { cx: number; cy: number; rx?: number; ry?: number }) => <g>
  <ellipse cx={cx} cy={cy + 3.5} rx={rx} ry={ry} fill="#C98A1B" /><ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#iwa-coin)" stroke="#C98A1B" strokeWidth="1.2" />
  <ellipse cx={cx - rx * 0.25} cy={cy - 1} rx={rx * 0.4} ry={ry * 0.25} fill="#fff" opacity="0.45" />
</g>;

function Jar() {
  const rows: ReactNode[] = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 3 - (r % 2 ? 1 : 0) + 1; c++) {
    const cx = -46 + c * 46 + (r % 2 ? 23 : 0);
    if (cx > 50) continue;
    rows.push(<Coin key={`${r}-${c}`} cx={cx} cy={-12 - r * 15} />);
  }
  return <g>
    <g clipPath="url(#iwa-jar-clip)">{rows}</g>
    <path d="M-64 -146 Q-66 -146 -66 -138 L-66 -22 Q-66 -2 -46 -2 L46 -2 Q66 -2 66 -22 L66 -138 Q66 -146 64 -146 Z" fill="url(#iwa-glass)" stroke="#fff" strokeOpacity="0.75" strokeWidth="3" />
    <rect x="-48" y="-170" width="96" height="26" rx="9" fill="url(#iwa-glass)" stroke="#fff" strokeOpacity="0.8" strokeWidth="3" />
    <path d="M-52 -128 L-52 -34" stroke="#fff" strokeOpacity="0.55" strokeWidth="5" strokeLinecap="round" />
    <rect x="-34" y="-96" width="68" height="38" rx="9" fill="#FFF7E6" stroke="#E9C46A" strokeWidth="2" />
    <text x="0" y="-70" textAnchor="middle" fontSize="19" fontWeight="800" fill="#0F4C5C" fontFamily="Plus Jakarta Sans, Inter, system-ui, sans-serif" letterSpacing="1">IPON</text>
    <g className="scene-sway"><path d="M-8 -168 C-8 -205 -20 -232 -30 -262" stroke="#2F8F5B" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M-14 -208 C-44 -214 -58 -236 -56 -252 C-30 -250 -16 -232 -14 -208Z" fill="#43B27A" />
      <path d="M-12 -222 C16 -226 32 -246 32 -262 C8 -258 -10 -244 -12 -222Z" fill="#3FA06C" />
      <path d="M-30 -262 C-44 -284 -34 -300 -22 -306 C-12 -290 -18 -274 -30 -262Z" fill="#6BCB92" /></g>
    <g><Coin cx={104} cy={-5} rx={19} ry={6} /><Coin cx={104} cy={-13} rx={19} ry={6} /><Coin cx={104} cy={-21} rx={19} ry={6} /></g>
  </g>;
}

function Mother() {
  return <g>
    <rect x="-64" y="-158" width="16" height="190" rx="8" fill="#6E4530" />
    <path d="M-42 0 C-50 -60 -46 -112 -22 -130 L28 -130 C46 -112 50 -60 44 0 Z" fill="#EF6F57" />
    <path d="M-20 -130 L28 -130 L22 -118 C8 -110 -8 -110 -20 -118 Z" fill="#0F6E7A" />
    <rect x="-6" y="-146" width="15" height="20" rx="6" fill={SKIN_DARK} />
    <circle cx="2" cy="-170" r="28" fill={SKIN} />
    <path d="M-27 -172 C-30 -208 -4 -212 13 -207 C30 -203 33 -186 29 -172 C20 -188 -2 -192 -27 -172Z" fill="#2E1B12" />
    <circle cx="-25" cy="-198" r="13" fill="#2E1B12" />
    <circle cx="14" cy="-171" r="2.8" fill="#2E1B12" /><circle cx="21" cy="-161" r="5.5" fill="#F0907A" opacity="0.4" />
    <path d="M10 -160 Q18 -152 27 -160" stroke="#2E1B12" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <path d="M16 -118 L68 -84" stroke="#EF6F57" strokeWidth="21" strokeLinecap="round" />
    <path d="M68 -84 L112 -68" stroke={SKIN} strokeWidth="13" strokeLinecap="round" /><circle cx="117" cy="-66" r="8" fill={SKIN} />
  </g>;
}

function Child() {
  return <g>
    <path d="M-34 0 C-40 -50 -38 -100 -18 -122 L24 -122 C40 -104 42 -50 36 0 Z" fill="#4C8DDE" />
    <rect x="-5" y="-136" width="13" height="18" rx="5" fill={SKIN_DARK} />
    <circle cx="2" cy="-160" r="26" fill={SKIN} />
    <path d="M-24 -162 C-27 -194 0 -202 20 -192 C31 -186 31 -171 27 -162 C14 -176 -8 -178 -24 -162Z" fill="#1F1410" />
    <circle cx="13" cy="-160" r="2.6" fill="#1F1410" /><circle cx="19" cy="-151" r="5" fill="#F0907A" opacity="0.45" />
    <path d="M9 -150 Q17 -142 25 -150" stroke="#1F1410" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <path d="M14 -110 L48 -170" stroke="#4C8DDE" strokeWidth="19" strokeLinecap="round" />
    <path d="M48 -170 L76 -236" stroke={SKIN} strokeWidth="12" strokeLinecap="round" /><circle cx="78" cy="-241" r="8" fill={SKIN} />
  </g>;
}

function Tableau() {
  return <g>
    <ellipse cx="0" cy="158" rx="310" ry="15" fill="#000" opacity="0.18" />
    <g transform="translate(-170 62)"><Mother /></g>
    <g transform="translate(138 62) scale(-0.9 0.9)"><Child /></g>
    <rect x="-290" y="0" width="580" height="22" rx="7" fill="#C28D5F" />
    <rect x="-280" y="22" width="560" height="17" rx="4" fill="#9A6A45" />
    <rect x="-266" y="38" width="18" height="112" rx="4" fill="#7B5236" /><rect x="248" y="38" width="18" height="112" rx="4" fill="#7B5236" />
    <rect x="-150" y="-9" width="62" height="9" rx="2" fill="#F3E7D3" /><rect x="-150" y="-9" width="62" height="3" fill="#3BA776" />
    <g transform="translate(222 0)"><rect x="-12" y="-24" width="24" height="24" rx="5" fill="#fff" /><path d="M12 -18 q10 2 0 12" stroke="#fff" strokeWidth="4" fill="none" /></g>
    <g transform="translate(18 0)"><Jar /></g>
    <g className="scene-coin-drop"><circle cx="64" cy="-196" r="11" fill="url(#iwa-coin)" stroke="#C98A1B" strokeWidth="1.5" /><circle cx="60" cy="-200" r="3.5" fill="#fff" opacity="0.5" /></g>
    <path d="M64 -182 Q54 -170 42 -168" stroke="#fff" strokeOpacity="0.8" strokeWidth="2" strokeDasharray="3 5" fill="none" strokeLinecap="round" />
  </g>;
}

function House({ lit = true }: { lit?: boolean }) {
  return <g>
    <rect x="-44" y="-52" width="88" height="52" rx="3" fill="#F8E3C5" />
    <path d="M-54 -50 L0 -96 L54 -50 Z" fill="#C65D3B" /><rect x="22" y="-86" width="11" height="26" fill="#9E452B" />
    <rect x="-34" y="-36" width="24" height="22" rx="2" fill={lit ? '#FFD166' : '#A8C0C8'} /><rect x="-34" y="-36" width="24" height="22" rx="2" fill="url(#iwa-glow)" opacity={lit ? 0.9 : 0} />
    <rect x="8" y="-30" width="22" height="30" rx="3" fill="#8A5A3B" />
  </g>;
}
const Tree = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => <g transform={`translate(${x} ${y}) scale(${s})`}><rect x="-5" y="-30" width="10" height="34" rx="3" fill="#6E4530" /><circle cx="0" cy="-52" r="30" fill="#2F8F5B" /><circle cx="-14" cy="-40" r="20" fill="#3FA06C" /><circle cx="16" cy="-42" r="18" fill="#43B27A" /></g>;
const Cloud = ({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) => <g transform={`translate(${x} ${y}) scale(${s})`}><g className="scene-cloud" style={{ animationDelay: `${delay}s` }}><ellipse cx="0" cy="0" rx="46" ry="15" fill="#fff" opacity="0.55" /><ellipse cx="-22" cy="-10" rx="24" ry="15" fill="#fff" opacity="0.55" /><ellipse cx="18" cy="-13" rx="28" ry="17" fill="#fff" opacity="0.55" /></g></g>;
const Bird = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => <path d={`M${x} ${y} q${10 * s} ${-9 * s} ${20 * s} 0 q${10 * s} ${-9 * s} ${20 * s} 0`} stroke="#0F3A4A" strokeOpacity="0.7" strokeWidth="2.4" fill="none" strokeLinecap="round" />;

const GLYPHS: Record<string, ReactNode> = {
  laptop: <><rect x="3" y="4" width="14" height="9" rx="1.6" fill="none" stroke="#fff" strokeWidth="1.8" /><path d="M1 16h18" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" /></>,
  school: <><path d="M10 3 L19 8 L10 13 L1 8Z" fill="#fff" /><path d="M5 11v4c3 2.4 7 2.4 10 0v-4" fill="none" stroke="#fff" strokeWidth="1.6" /></>,
  health: <path d="M8 3h4v5h5v4h-5v5H8v-5H3V8h5z" fill="#fff" />,
};
function Chip({ x, y, label, pct, color, glyph }: { x: number; y: number; label: string; pct: number; color: string; glyph: keyof typeof GLYPHS }) {
  return <g transform={`translate(${x} ${y})`}><g className="scene-chip">
    <rect width="232" height="62" rx="31" fill="#fff" opacity="0.94" />
    <circle cx="31" cy="31" r="20" fill={color} /><g transform="translate(21 21)">{GLYPHS[glyph]}</g>
    <text x="62" y="27" fontSize="16" fontWeight="700" fill="#0F1B33" fontFamily="Plus Jakarta Sans, Inter, system-ui, sans-serif">{label}</text>
    <rect x="62" y="38" width="112" height="8" rx="4" fill="#E5ECF4" /><rect x="62" y="38" width={(112 * pct) / 100} height="8" rx="4" fill={color} />
    <text x="184" y="46" fontSize="14" fontWeight="700" fill="#0F1B33" fontFamily="Plus Jakarta Sans, Inter, system-ui, sans-serif">{pct}%</text>
  </g></g>;
}

function Backdrop({ w, h, horizon, sunX }: { w: number; h: number; horizon: number; sunX: number }) {
  return <>
    <rect width={w} height={h} fill="url(#iwa-sky)" />
    <g className="scene-sun"><circle cx={sunX} cy={horizon} r={h * 0.26} fill="url(#iwa-glow)" /><circle cx={sunX} cy={horizon - 8} r={h * 0.095} fill="#FFD27D" /></g>
    <path d={`M0 ${horizon + 20} C${w * 0.15} ${horizon - 30} ${w * 0.3} ${horizon - 10} ${w * 0.42} ${horizon + 30} C${w * 0.56} ${horizon + 70} ${w * 0.7} ${horizon - 20} ${w * 0.85} ${horizon} C${w * 0.93} ${horizon + 10} ${w * 0.97} ${horizon + 25} ${w} ${horizon + 30} L${w} ${h} L0 ${h}Z`} fill="#6DBF9B" />
    <path d={`M0 ${horizon + 105} C${w * 0.18} ${horizon + 45} ${w * 0.32} ${horizon + 85} ${w * 0.47} ${horizon + 120} C${w * 0.65} ${horizon + 155} ${w * 0.8} ${horizon + 80} ${w} ${horizon + 110} L${w} ${h} L0 ${h}Z`} fill="#3FA877" />
  </>;
}

export default function AuthScene() {
  return <div className="auth-scene" aria-hidden="true">
    <Defs />
    <svg className="scene-art scene-tall" viewBox="0 0 800 1000" preserveAspectRatio="xMidYMax slice" focusable="false">
      <Backdrop w={800} h={1000} horizon={600} sunX={560} />
      <Cloud x={130} y={150} delay={0} /><Cloud x={610} y={120} s={0.8} delay={-6} /><Cloud x={420} y={300} s={0.6} delay={-3} />
      <Bird x={250} y={250} /><Bird x={300} y={225} s={0.7} />
      <Chip x={500} y={235} label="Laptop for school" pct={68} color="#2F6FE0" glyph="laptop" />
      <Chip x={50} y={470} label="Tuition fund" pct={45} color="#E08A1E" glyph="school" />
      <Chip x={530} y={345} label="Hospital bills" pct={80} color="#2F9E68" glyph="health" />
      <g transform="translate(120 735)"><House /></g><Tree x={690} y={740} s={1.1} /><Tree x={745} y={760} s={0.8} />
      <rect x="0" y="880" width="800" height="120" fill="url(#iwa-deck)" />
      {[0, 1, 2, 3].map((i) => <path key={i} d={`M0 ${905 + i * 28} H800`} stroke="#fff" strokeOpacity="0.08" strokeWidth="2" />)}
      <g transform="translate(405 790)"><Tableau /></g>
      <circle className="scene-spark s1" cx="360" cy="560" r="6" fill="#FFE08A" /><circle className="scene-spark s2" cx="470" cy="600" r="4" fill="#FFE08A" /><circle className="scene-spark s3" cx="300" cy="610" r="5" fill="#FFE08A" />
    </svg>
    <svg className="scene-art scene-wide" viewBox="0 0 1000 360" preserveAspectRatio="xMidYMax slice" focusable="false">
      <Backdrop w={1000} h={360} horizon={170} sunX={760} />
      <Cloud x={430} y={55} s={0.7} /><Cloud x={900} y={45} s={0.6} delay={-5} /><Bird x={420} y={70} s={0.8} />
      <g transform="translate(250 228) scale(0.8)"><House /></g><Tree x={900} y={235} s={0.8} />
      <rect x="0" y="292" width="1000" height="68" fill="url(#iwa-deck)" />
      <g transform="translate(520 242) scale(0.5)"><Tableau /></g>
    </svg>
  </div>;
}
