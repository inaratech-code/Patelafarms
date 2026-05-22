import Link from "next/link";

const LINKS = [
  { id: "vaccines", label: "Vaccines", href: "/farm-health/vaccines" },
  { id: "dose-schedule", label: "Dose schedule", href: "/farm-health/dose-schedule" },
  { id: "health-logs", label: "Health logs", href: "/farm-health/health-logs" },
] as const;

export type FarmHealthSectionId = (typeof LINKS)[number]["id"];

export function FarmHealthSubnav(props: { current: FarmHealthSectionId }) {
  return (
    <nav
      className="-mx-1 flex gap-2 overflow-x-auto pb-1 scrollbar-thin"
      aria-label="Farm health sections"
    >
      {LINKS.map((link) => {
        const active = props.current === link.id;
        return active ? (
          <span
            key={link.id}
            aria-current="page"
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary text-white"
          >
            {link.label}
          </span>
        ) : (
          <Link
            key={link.id}
            href={link.href}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 whitespace-nowrap"
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
