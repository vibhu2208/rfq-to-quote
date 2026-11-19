import type { TelemarketingCallStatus } from "@prisma/client";
import { TELEMARKETING_CALL_STATUS_LABELS } from "@/lib/telemarketing/constants";

const STATUS_CLASS: Record<TelemarketingCallStatus, string> = {
  NO_ACTION: "bg-dark-secondary/10 text-mid-green",
  CONNECTED: "bg-emerald-100 text-emerald-800",
  CALL_BACK_REQUESTED: "bg-amber-100 text-amber-900",
  COULDNT_CONNECT: "bg-slate-200 text-slate-700",
  NOT_INTERESTED: "bg-rose-100 text-rose-800",
  MOVE_TO_LEAD: "bg-mid-green/15 text-dark-primary",
};

export function CallStatusPill({ status }: { status: TelemarketingCallStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_CLASS[status]}`}
    >
      {TELEMARKETING_CALL_STATUS_LABELS[status]}
    </span>
  );
}