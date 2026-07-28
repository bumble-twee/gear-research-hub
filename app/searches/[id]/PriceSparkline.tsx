// Pure presentational sparkline — no interactivity, no fetching. Takes
// already-computed chronological (oldest first) prices and draws a
// minimal polyline. Stroke uses currentColor so a wrapping element can
// tint it (e.g. to match the price signal).
export function PriceSparkline({ prices }: { prices: number[] }) {
  // A single point (or none) isn't a trend — nothing useful to draw.
  if (prices.length < 2) return null;

  const width = 80;
  const height = 24;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1; // flat history: avoid a div-by-zero

  const points = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = height - ((p - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-6 w-20"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
