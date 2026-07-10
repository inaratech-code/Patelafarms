import { bsYmdToAdYmd, formatAdDate, formatBsDate } from "@/lib/nepaliDate";

type Props = {
  iso?: string;
  dateBs?: string;
  layout?: "inline" | "stack";
  className?: string;
};

/** Always shows English (AD) and Nepali (BS) together. */
export function DualDateDisplay({ iso, dateBs, layout = "stack", className }: Props) {
  if (!iso && !dateBs) return <span className={className}>—</span>;

  const adFromBs = dateBs ? bsYmdToAdYmd(dateBs) : "";
  const adLabel = formatAdDate(iso ?? adFromBs);
  const bsLabel = formatBsDate(iso, dateBs);

  if (layout === "inline") {
    return (
      <span className={className}>
        <span className="text-slate-800">{adLabel}</span>
        <span className="text-slate-400 mx-1">·</span>
        <span className="text-slate-600">{bsLabel} BS</span>
      </span>
    );
  }

  return (
    <span className={className}>
      <span className="block text-inherit">{adLabel}</span>
      <span className="block text-xs text-slate-500 mt-0.5">{bsLabel} BS</span>
    </span>
  );
}
