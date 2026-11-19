import type { TelemarketingCallStatus } from "@prisma/client";
import { TELEMARKETING_CALL_STATUS_LABELS } from "@/lib/telemarketing/constants";

export const STATUS_CLASS: Record<TelemarketingCallStatus, string> = {
  NO_ACTION: "bg-dark-primary/[0.07] text-dark-primary",
  CONNECTED: "bg-light-green/35 text-dark-secondary",
  CALL_BACK_REQUESTED: "bg-amber-100 text-amber-900",
  COULDNT_CONNECT: "bg-orange-100 text-orange-900",
  NOT_INTERESTED: "bg-rose-100 text-rose-800",
  MOVE_TO_LEAD: "bg-mid-green/20 text-dark-secondary font-semibold",
};

export const STATUS_DOT_CLASS: Record<TelemarketingCallStatus, string> = {
  NO_ACTION: "bg-dark-primary/40",
  CONNECTED: "bg-mid-green",
  CALL_BACK_REQUESTED: "bg-amber-500",
  COULDNT_CONNECT: "bg-orange-400",
  NOT_INTERESTED: "bg-rose-500",
  MOVE_TO_LEAD: "bg-dark-secondary",
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
