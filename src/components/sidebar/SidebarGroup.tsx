"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarItem } from "@/components/sidebar/SidebarItem";
import type { SidebarGroupConfig } from "@/components/sidebar/sidebarConfig";

export function SidebarGroup(props: {
  group: SidebarGroupConfig;
  isOpen: boolean;
  onToggle: () => void;
  activeHref: string;
  isCollapsed: boolean;
  onNavigate?: () => void;
}) {
  const GroupIcon = props.group.icon;
  const groupHasActive = props.group.items.some((i) => i.href === props.activeHref);

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={props.onToggle}
        title={props.isCollapsed ? props.group.label : undefined}
        className={cn(
          "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
          "hover:bg-slate-50",
          groupHasActive ? "text-primary" : "text-slate-700"
        )}
      >
        <GroupIcon className={cn("w-5 h-5", groupHasActive ? "text-primary" : "text-slate-400")} />
        {!props.isCollapsed ? <span className="flex-1 text-left truncate">{props.group.label}</span> : <span className="sr-only">{props.group.label}</span>}
        {!props.isCollapsed ? (
          <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", props.isOpen ? "rotate-180" : "")} />
        ) : null}
      </button>

      <AnimatePresence initial={false}>
        {props.isOpen && !props.isCollapsed ? (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pl-3 pr-1 py-1 space-y-1">
              {props.group.items.map((item) => (
                <SidebarItem
                  key={item.id}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  isActive={item.href === props.activeHref}
                  isCollapsed={false}
                  onNavigate={props.onNavigate}
                />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

