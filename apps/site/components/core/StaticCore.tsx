import type { CoreData } from "@/lib/orbit";

/**
 * The same core drawn as SVG, for reduced motion and browsers without WebGL.
 * Bands, bubbles and chain marks come from the same data as the WebGL scene.
 */
export function StaticCore({
  data,
  className = "",
  highlight,
  horizontal = false,
  uid = "core",
}: {
  data: CoreData;
  className?: string;
  highlight?: number;
  horizontal?: boolean;
  uid?: string;
}) {
  const W = 120;
  const H = 640;
  const top = 12;
  const h = H - top * 2;
  const y = (day: number) => top + h - (day / data.days) * h;
  const chainX = [44, 78, 60];
  return (
    <svg
      viewBox={horizontal ? `0 0 ${H} ${W}` : `0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`An ice core of the Orbit team's memory, one band per day from 7 September ${horizontal ? "on the left" : "at the bottom"} to 16 October ${horizontal ? "on the right" : "at the top"}.`}
    >
      <g transform={horizontal ? `rotate(90 0 0) translate(0 ${-H})` : undefined}>
        <defs>
          <linearGradient id={`${uid}-body`} x1="0" x2="1">
            <stop offset="0" stopColor="#c4ecff" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#3d6c9a" stopOpacity="0.35" />
            <stop offset="1" stopColor="#c4ecff" stopOpacity="0.55" />
          </linearGradient>
          <clipPath id={`${uid}-clip`}>
            <rect x="10" y={top} width={W - 20} height={h} rx="12" />
          </clipPath>
        </defs>
        <rect x="10" y={top} width={W - 20} height={h} rx="12" fill={`url(#${uid}-body)`} />
        <g clipPath={`url(#${uid}-clip)`}>
          {data.layers.map((l) =>
            l.meetings.map((m) => (
              <rect key={m.id} x="10" y={y(l.day + 0.42) - (3 + m.episodes / 12) / 2} width={W - 20} height={3 + m.episodes / 12} fill="#eef3f9" opacity={0.55} />
            )),
          )}
          {data.layers.map((l) => l.emails.map((e) => <rect key={e.id} x="10" y={y(l.day + 0.6) - 0.8} width={W - 20} height="1.6" fill="#8fe3ff" opacity="0.85" />))}
          {data.layers
            .filter((l) => l.superseded)
            .map((l) => (
              <rect key={`a${l.day}`} x="10" y={y(l.day + 0.47) - 1} width={W - 20} height="2" fill="#060a10" opacity="0.85" />
            ))}
          {data.bubbles.map((b, i) => (
            <circle
              key={i}
              cx={16 + ((b.seed * 9.17) % 1) * (W - 32)}
              cy={y(b.d)}
              r={b.kind === "email" ? 1.6 : 0.6 + ((b.seed * 53.3) % 1) * 1.1}
              fill="none"
              stroke="#f2fbff"
              strokeOpacity="0.7"
              strokeWidth="0.6"
            />
          ))}
          {highlight != null ? <rect x="10" y={y(highlight) - 9} width={W - 20} height="18" fill="#ffae8a" opacity="0.18" /> : null}
        </g>
        {data.chains.map((c, ci) => (
          <g key={c.key}>
            <polyline points={c.links.map((l) => `${chainX[ci]},${y(l.day)}`).join(" ")} fill="none" stroke="#7e8ba0" strokeWidth="1.2" />
            {c.links.map((l) =>
              l.status === "active" ? (
                <circle key={l.id} cx={chainX[ci]} cy={y(l.day)} r="3.6" fill="#ffae8a" />
              ) : (
                <circle key={l.id} cx={chainX[ci]} cy={y(l.day)} r="3" fill="none" stroke="#7e8ba0" strokeWidth="1.4" />
              ),
            )}
          </g>
        ))}
        <rect x="10" y={top} width={W - 20} height={h} rx="12" fill="none" stroke="#cfeeff" strokeOpacity="0.45" />
      </g>
    </svg>
  );
}
