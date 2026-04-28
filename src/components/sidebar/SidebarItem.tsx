"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function SidebarItem(props: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  isCollapsed: boolean;
  badgeCount?: number;
  onNavigate?: () => void;
}) {
  const Icon = props.icon;

  return (
    <Link
      href={props.href}
      onClick={props.onNavigate}
      title={props.isCollapsed ? props.label : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-slate-50",
        props.isActive ? "bg-primary/10 text-primary" : "text-slate-700"
      )}
    >
      {props.isActive ? <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-primary" /> : null}

      <Icon className={cn("w-5 h-5 flex-shrink-0", props.isActive ? "text-primary" : "text-slate-400")} />

      {!props.isCollapsed ? (
        <span className="flex-1 min-w-0 truncate">{props.label}</span>
      ) : (
        <span className="sr-only">{props.label}</span>
      )}

      {!props.isCollapsed && typeof props.badgeCount === "number" && props.badgeCount > 0 ? (
        <span className="ml-auto inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-alert-red/10 text-alert-red text-xs font-semibold">
          {props.badgeCount > 99 ? "99+" : props.badgeCount}
        </span>
      ) : null}
    </Link>
  );
}

