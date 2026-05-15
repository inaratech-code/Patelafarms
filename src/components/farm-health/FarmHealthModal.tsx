import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Bottom-sheet on mobile, centered dialog on larger screens. */
export function FarmHealthModal(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: "md" | "lg";
}) {
  const maxW = props.maxWidth === "lg" ? "sm:max-w-lg" : "sm:max-w-md";
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4"
      role="presentation"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="farm-health-modal-title"
        className={`bg-white w-full ${maxW} rounded-t-2xl sm:rounded-xl border border-slate-200 shadow-xl max-h-[min(92dvh,100%)] overflow-hidden flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100 shrink-0">
          <div id="farm-health-modal-title" className="font-semibold text-slate-900 min-w-0 break-words pr-2">
            {props.title}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="p-2 -m-1 rounded-md hover:bg-slate-50 shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom,0px)]">{props.children}</div>
      </div>
    </div>
  );
}
