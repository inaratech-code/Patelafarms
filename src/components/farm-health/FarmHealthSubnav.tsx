import Link from "next/link";

const LINKS = [
  { id: "vaccines", label: "Vaccines", href: "/farm-health/vaccines" },
  { id: "dose-schedule", label: "Dose schedule", href: "/farm-health/dose-schedule" },
  { id: "health-logs", label: "Health logs", href: "/farm-health/health-logs" },
] as const;

export type FarmHealthSectionId = (typeof LINKS)[number]["id"];

export function FarmHealthSubnav(props: { current: FarmHealthSectionId }) {
  return (
    <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500" aria-label="Farm health sections">
      {LINKS.map((link, i) => (
        <span key={link.id} className="inline-flex items-center gap-2">
          {i > 0 ? <span className="text-slate-300" aria-hidden="true">
              ·
            </span> : null}
          {props.current === link.id ? (
            <span className="font-semibold text-slate-800">{link.label}</span>
          ) : (
            <Link href={link.href} className="text-primary font-medium hover:underline">
              {link.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
