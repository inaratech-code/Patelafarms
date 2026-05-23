import type { ReactNode } from "react";

/** Root wrapper for app pages — prevents flex children from overflowing the viewport. */
export function PageRoot({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 max-w-full space-y-6 ${className}`.trim()}>{children}</div>;
}

/** Mobile card list + desktop table (table hidden below md). */
export function ResponsiveTableShell({
  mobile,
  children,
  mobileDivideClass = "divide-slate-100",
}: {
  mobile: ReactNode;
  children: ReactNode;
  mobileDivideClass?: string;
}) {
  return (
    <>
      <div className={`md:hidden divide-y ${mobileDivideClass}`}>{mobile}</div>
      <div className="hidden md:block overflow-x-auto min-w-0">{children}</div>
    </>
  );
}

export function MobileDataCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-4 space-y-2 ${className}`.trim()}>{children}</div>;
}

export function MobileCardHeader({
  title,
  subtitle,
  trailing,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900 break-words">{title}</div>
        {subtitle ? <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

export function MobileCardActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 pt-1">{children}</div>;
}

export function MobileCardDl({
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode; fullWidth?: boolean }>;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.label} className={r.fullWidth ? "col-span-2" : undefined}>
          <dt className="text-xs text-slate-500">{r.label}</dt>
          <dd className="font-medium text-slate-700 break-words">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
