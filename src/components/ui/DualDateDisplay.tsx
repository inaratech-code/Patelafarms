import { bsYmdToAdYmd, formatAdDate, formatBsDate, formatDualDate } from "@/lib/nepaliDate";

type Props = {
  iso?: string;
  dateBs?: string;
  layout?: "inline" | "stack";
  className?: string;
};

/** Shows English (AD) and Nepali (BS) dates together. */
export function DualDateDisplay({ iso, dateBs, layout = "stack", className }: Props) {
  if (!iso && !dateBs) return <span className={className}>—</span>;

  if (layout === "inline") {
    return <span className={className}>{formatDualDate(iso, dateBs)}</span>;
  }

  return (
    <span className={className}>
      <span className="block text-inherit">{formatAdDate(iso ?? (dateBs ? bsYmdToAdYmd(dateBs) : undefined))}</span>
      <span className="block text-xs text-slate-500 mt-0.5">{formatBsDate(iso, dateBs)} BS</span>
    </span>
  );
}
