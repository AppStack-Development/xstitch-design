/**
 * Small stitched pictures for empty and not-found screens, in the logo's threads:
 *   start  — a square of plain Aida with one cross in the middle (your first stitch)
 *   lost   — a square of plain Aida with an empty, dashed square in the middle (nothing here)
 *   skeins — three skeins of thread (My threads)
 * The fabric's holes sit at the squares' corners, where a real cross starts and ends (as on the home
 * page's heart). Purely decorative: the text beside them says everything.
 */
const RED = '#c72b3b', RED_D = '#a3202f', GOLD = '#e0a526', GREEN = '#2f7d4f';

/** 5 × 5 squares of fabric inside a rounded patch; the middle square is (2, 2) */
const N = 5, S = 12, G0 = 18; // squares, square size, first hole
const MID = G0 + 2 * S;       // top-left corner of the middle square

function Fabric() {
  const holes: [number, number][] = [];
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) holes.push([G0 + x * S, G0 + y * S]);
  return (
    <>
      <rect x="10" y="10" width="76" height="76" rx="10" fill="#fbf8f2" stroke="#e7e0d3" strokeWidth="2" />
      <g fill="#d8cfbe">{holes.map(([x, y]) => <circle key={`${x},${y}`} cx={x} cy={y} r="1.3" />)}</g>
    </>
  );
}

export function StitchArt({ kind, size = 96 }: { kind: 'start' | 'lost' | 'skeins'; size?: number }) {
  if (kind === 'skeins') {
    return (
      <svg className="stitch-art" width={size} height={size * 0.62} viewBox="0 0 120 74" aria-hidden="true">
        {[[RED, 6], [GREEN, 44], [GOLD, 82]].map(([c, x]) => (
          <g key={x as number} transform={`translate(${x} 10)`}>
            <rect width="32" height="54" rx="12" fill={c as string} />
            <rect y="20" width="32" height="14" fill="#fbf8f2" opacity=".9" />
            <path d="M6 8v38M14 6v42M22 6v42" stroke="#fff" strokeOpacity=".28" strokeWidth="2" />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === 'lost') {
    return (
      <svg className="stitch-art" width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
        <Fabric />
        <rect x={MID + 1.5} y={MID + 1.5} width={S - 3} height={S - 3} rx="2" fill="none" stroke={RED} strokeWidth="1.6" strokeDasharray="2.5 2.2" />
      </svg>
    );
  }
  const p = 2; // the legs run hole to hole, stopping just short of each hole
  return (
    <svg className="stitch-art" width={size} height={size} viewBox="0 0 96 96" aria-hidden="true">
      <Fabric />
      <g strokeLinecap="round" strokeWidth="3">
        <line x1={MID + p} y1={MID + p} x2={MID + S - p} y2={MID + S - p} stroke={RED_D} />
        <line x1={MID + S - p} y1={MID + p} x2={MID + p} y2={MID + S - p} stroke={RED} />
      </g>
    </svg>
  );
}
