import { Badge } from "@/components/ui/badge";

// Traffic-light lead score. `color` comes from the lead row (green/orange/red).
export function ScoreBadge({ score, color }) {
  if (score == null) {
    return <Badge variant="secondary">—</Badge>;
  }
  const variant = color === "green" ? "green" : color === "orange" ? "orange" : "red";
  return <Badge variant={variant}>{score}</Badge>;
}
