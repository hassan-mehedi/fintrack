export function GoalProgressBar({
  percent,
  color,
  className = "h-2",
}: {
  percent: number;
  color: string;
  className?: string;
}) {
  return (
    <div className={`${className} bg-muted rounded-full overflow-hidden`}>
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${Math.min(Math.max(percent, 0), 100)}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}
