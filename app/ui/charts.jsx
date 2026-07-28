'use client';

import { useId } from 'react';
import s from '../platform.module.css';

/* All charts are dependency-free inline SVG. */

function scale(values, w, h, pad = 2) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  return values.map((v, i) => [
    pad + (i / Math.max(1, values.length - 1)) * innerW,
    pad + innerH - ((v - min) / span) * innerH,
  ]);
}

function pathFrom(points) {
  return points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
}

export function Sparkline({ values, width = 84, height = 30, stroke = '#4dead8' }) {
  if (!values || values.length < 2) return null;
  const pts = scale(values, width, height, 3);
  const d = pathFrom(pts);
  const area = `${d} L${width - 3},${height - 2} L3,${height - 2} Z`;
  const gid = useId().replace(/:/g, '');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={`sg-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${gid})`} />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={s.chartDraw}
      />
    </svg>
  );
}

/**
 * Multi-series area/line chart with grid, axis labels and hover crosshair.
 * series: [{ label, color, values: number[], fill?: bool }]
 * labels: string[] for x axis (subset rendered).
 */
export function LineChart({ series, labels, height = 220, yFmt = (v) => v, hoverFmt }) {
  const W = 720;
  const H = height;
  const PAD = { l: 46, r: 12, t: 14, b: 26 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const all = series.flatMap((sr) => sr.values);
  const max = Math.max(...all, 1);
  const min = 0;
  const span = max - min || 1;

  const xAt = (i, len) => PAD.l + (i / Math.max(1, len - 1)) * innerW;
  const yAt = (v) => PAD.t + innerH - ((v - min) / span) * innerH;

  const gridLines = 4;
  const gid = useId().replace(/:/g, '');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="time series chart"
      style={{ display: 'block' }}
    >
      <defs>
        {series.map((sr, si) => (
          <linearGradient key={si} id={`lg-${gid}-${si}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sr.color} stopOpacity={sr.fill === false ? 0 : 0.22} />
            <stop offset="100%" stopColor={sr.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {Array.from({ length: gridLines + 1 }).map((_, gi) => {
        const v = min + (span * gi) / gridLines;
        const y = yAt(v);
        return (
          <g key={gi}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={y}
              y2={y}
              stroke="rgba(147,164,195,0.1)"
              strokeDasharray={gi === 0 ? '0' : '3 4'}
            />
            <text
              x={PAD.l - 8}
              y={y + 3}
              textAnchor="end"
              fontSize="9.5"
              fill="#5b6b8c"
              fontFamily="var(--mono)"
            >
              {yFmt(v)}
            </text>
          </g>
        );
      })}

      {labels &&
        labels.map((lb, i) => {
          const len = labels.length;
          const step = Math.ceil(len / 6);
          if (i % step !== 0 && i !== len - 1) return null;
          return (
            <text
              key={i}
              x={xAt(i, len)}
              y={H - 8}
              textAnchor="middle"
              fontSize="9.5"
              fill="#5b6b8c"
              fontFamily="var(--mono)"
            >
              {lb}
            </text>
          );
        })}

      {series.map((sr, si) => {
        const pts = sr.values.map((v, i) => [xAt(i, sr.values.length), yAt(v)]);
        const d = pathFrom(pts);
        const area = `${d} L${xAt(sr.values.length - 1, sr.values.length)},${PAD.t + innerH} L${PAD.l},${
          PAD.t + innerH
        } Z`;
        return (
          <g key={si}>
            {sr.fill !== false ? <path d={area} fill={`url(#lg-${gid}-${si})`} /> : null}
            <path
              d={d}
              fill="none"
              stroke={sr.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal bar list (e.g. allocation or top endpoints). */
export function BarList({ items, color = '#3a7fff', fmt = (v) => v }) {
  const max = Math.max(...items.map((it) => it.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((it) => (
        <div key={it.label}>
          <div className={s.row} style={{ justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{it.label}</span>
            <span className={s.mono} style={{ fontSize: 12, color: 'var(--ink)' }}>
              {fmt(it.value)}
            </span>
          </div>
          <div
            style={{
              height: 6,
              borderRadius: 99,
              background: 'rgba(147,164,195,0.1)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(it.value / max) * 100}%`,
                height: '100%',
                borderRadius: 99,
                background: it.color || color,
                transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Row of uptime slats (90 days). statuses: array of 'ok'|'warn'|'down'. */
export function UptimeBars({ statuses, tone = 'ok' }) {
  const color =
    tone === 'down' ? 'var(--red)' : tone === 'warn' ? 'var(--orange)' : 'var(--teal)';
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {statuses.map((st, i) => (
        <span
          key={i}
          title={st}
          style={{
            width: 4,
            height: 18,
            borderRadius: 2,
            background:
              st === 'down'
                ? 'var(--red)'
                : st === 'warn'
                  ? 'var(--orange)'
                  : `color-mix(in srgb, ${color} ${55 + (i % 5) * 9}%, transparent)`,
            opacity: st === 'ok' ? 0.9 : 1,
          }}
        />
      ))}
    </div>
  );
}
