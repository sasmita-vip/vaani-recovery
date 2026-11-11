/**
 * Decorative thin-line wave motifs from the "White Lines" reference design.
 * Purely presentational: no pointer events, hidden from assistive tech.
 */
const lines = Array.from({ length: 12 }, (_, i) => i);

export function WaveBackdrop({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <svg
        className="absolute -left-24 -top-24 w-56 rotate-[10deg]"
        viewBox="0 0 300 300"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {lines.map((i) => (
          <path key={i} d={`M${20 + i * 5} 0 C${30 + i * 5} 100 ${i * 5} 180 ${150 + i * 5} 250`} />
        ))}
      </svg>

      <svg
        className="absolute -right-16 -top-28 w-[26rem]"
        viewBox="0 0 500 300"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {lines.map((i) => (
          <path key={i} d={`M0 ${i * 5} C0 ${180 + i * 5} 120 ${230 + i * 5} 230 ${120 + i * 5} S400 ${30 + i * 5} 500 ${200 + i * 5}`} />
        ))}
      </svg>

      <svg
        className="absolute -right-24 top-1/3 w-[30rem]"
        viewBox="0 0 500 300"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {lines.map((i) => (
          <path key={i} d={`M0 ${250 + i * 5} C100 ${20 + i * 5} 200 ${30 + i * 5} 300 ${150 + i * 5} S400 ${250 + i * 5} 500 ${100 + i * 5}`} />
        ))}
      </svg>

      <svg
        className="absolute -bottom-24 -right-16 w-[28rem]"
        viewBox="0 0 500 350"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {lines.map((i) => (
          <path key={i} d={`M0 ${200 + i * 5} C100 ${50 + i * 5} 200 ${20 + i * 5} 300 ${100 + i * 5} S400 ${250 + i * 5} 500 ${50 + i * 5}`} />
        ))}
      </svg>

      <svg
        className="absolute -bottom-24 -left-24 w-44"
        viewBox="0 0 300 300"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      >
        {lines.map((i) => (
          <path key={i} d={`M${20 + i * 5} 0 C${30 + i * 5} 100 ${i * 5} 180 ${150 + i * 5} 250`} />
        ))}
      </svg>
    </div>
  );
}
