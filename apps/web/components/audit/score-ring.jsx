import { cn } from "@/lib/utils";

const COLORS = {
  green: "hsl(var(--success))",
  orange: "hsl(var(--warning))",
  red: "hsl(var(--destructive))",
};

// Circular lead-score gauge. `color` is green/orange/red from the lead row.
export function ScoreRing({ score = 0, color = "orange", size = 120, label = "Lead score" }) {
  const stroke = COLORS[color] ?? COLORS.orange;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${stroke} ${pct * 3.6}deg, hsl(var(--muted)) 0deg)`,
        }}
      >
        <div
          className="flex flex-col items-center justify-center rounded-full bg-card"
          style={{ width: size - 16, height: size - 16 }}
        >
          <span className="text-3xl font-bold tabular-nums">{score}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className={cn("text-xs font-medium text-muted-foreground")}>{label}</span>
    </div>
  );
}
