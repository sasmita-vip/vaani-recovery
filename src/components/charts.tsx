import { useId } from 'react';
import type { HourPoint, OutcomeSlice } from '@/types';

export function LineChart({ data, height = 200 }: { data: HourPoint[]; height?: number }) {
  const width = 640;
  const pad = { top: 16, right: 16, bottom: 28, left: 32 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const max = Math.max(...data.flatMap((d) => [d.today, d.yesterday])) * 1.15;
  const x = (i: number) => pad.left + (i / (data.length - 1)) * w;
  const y = (v: number) => pad.top + h - (v / max) * h;
  const linePath = (key: 'today' | 'yesterday') =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d[key])}`).join(' ');
  const areaPath = `${linePath('today')} L ${x(data.length - 1)} ${pad.top + h} L ${x(0)} ${pad.top + h} Z`;
  const gid = useId();

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9c6f45" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#9c6f45" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((p) => (
        <line key={p} x1={pad.left} x2={width - pad.right} y1={pad.top + h * p} y2={pad.top + h * p}
          stroke="rgb(var(--line))" strokeWidth="1" strokeDasharray={p === 1 ? '0' : '3 4'} />
      ))}
      {/* y labels */}
      {[0, 0.5, 1].map((p) => (
        <text key={p} x={pad.left - 8} y={pad.top + h * (1 - p) + 4} textAnchor="end"
          className="fill-[rgb(var(--muted))] tabular" fontSize="10">{Math.round(max * p)}</text>
      ))}
      {/* yesterday (dashed) */}
      <path d={linePath('yesterday')} fill="none" stroke="#bda78d" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
      {/* today area + line */}
      <path d={areaPath} fill={`url(#area-${gid})`} />
      <path d={linePath('today')} fill="none" stroke="#9c6f45" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* today dots */}
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.today)} r="3" fill="#9c6f45" stroke="rgb(var(--surface))" strokeWidth="1.5" />
      ))}
      {/* x labels */}
      {data.map((d, i) => (
        <text key={d.hour} x={x(i)} y={height - 8} textAnchor="middle"
          className="fill-[rgb(var(--muted))]" fontSize="10">{d.hour}</text>
      ))}
    </svg>
  );
}

export function DonutChart({ data, size = 180 }: { data: OutcomeSlice[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {data.map((d) => {
          const frac = d.value / total;
          const dash = frac * circ;
          const seg = (
            <circle
              key={d.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return seg;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-[rgb(var(--content-strong))] tabular" fontSize="22" fontWeight="700">
          {total.toLocaleString('en-IN')}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-[rgb(var(--muted))]" fontSize="11">calls today</text>
      </svg>
      <div className="flex w-full flex-col gap-2.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
              <span className="text-content">{d.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular font-medium text-content-strong">{d.value.toLocaleString('en-IN')}</span>
              <span className="tabular w-10 text-right text-xs text-muted">{Math.round((d.value / total) * 100)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarChart({ data, color = '#9c6f45' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.value)) * 1.1;
  return (
    <div className="flex h-40 items-end gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
          <div className="flex w-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-[2.5rem] rounded-t-md transition-all duration-500"
              style={{ height: `${(d.value / max) * 100}%`, background: color, minHeight: '4px' }}
              title={`${d.value}`}
            />
          </div>
          <span className="tabular text-[10px] text-muted">{d.value}</span>
          <span className="text-[10px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
