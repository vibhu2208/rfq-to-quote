import type { TelemarketingCallStatus } from "@prisma/client";
import { TELEMARKETING_CALL_STATUS_LABELS } from "@/lib/telemarketing/constants";

const STATUS_CLASS: Record<TelemarketingCallStatus, string> = {
  NO_ACTION: "bg-stone-200/90 text-stone-700",
  CONNECTED: "bg-[#d4e7d0] text-[#2f4a2b]",
  CALL_BACK_REQUESTED: "bg-amber-100 text-amber-900",
  COULDNT_CONNECT: "bg-[#ffd9c4] text-[#8a4b2a]",
  NOT_INTERESTED: "bg-rose-100 text-rose-800",
  MOVE_TO_LEAD: "bg-[#ccfcc6] text-[#1a3d18] font-semibold",
};

export const STATUS_DOT_CLASS: Record<TelemarketingCallStatus, string> = {
  NO_ACTION: "bg-stone-400",
  CONNECTED: "bg-emerald-600",
  CALL_BACK_REQUESTED: "bg-amber-500",
  COULDNT_CONNECT: "bg-orange-400",
  NOT_INTERESTED: "bg-rose-500",
  MOVE_TO_LEAD: "bg-[#2f4a2b]",
};

export function CallStatusPill({
  status,
  className = "",
  compact,
}: {
  status: TelemarketingCallStatus;
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex min-w-[7.5rem] items-center justify-center rounded-md px-2 py-1 text-center text-[11px] font-semibold leading-tight ${STATUS_CLASS[status]} ${compact ? "min-w-0 px-2 py-0.5 text-[10px]" : ""} ${className}`}
    >
      {TELEMARKETING_CALL_STATUS_LABELS[status]}
    </span>
  );
}