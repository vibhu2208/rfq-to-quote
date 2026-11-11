import { format } from "date-fns";

export function buildReminderCopy(input: {
  customerName: string;
  leadNumber: string;
  dueAt: Date;
  title?: string;
  notes?: string;
  companyName?: string;
}) {
  const greetingName = input.customerName.trim() || "there";
  const when = Number.isNaN(input.dueAt.getTime())
    ? "the scheduled time"
    : format(input.dueAt, "EEEE, d MMM yyyy 'at' h:mm a");
  const subject =
    (input.title || "").trim() ||
    `Reminder regarding your enquiry ${input.leadNumber}`;
  const company = (input.companyName || "").trim() || "our team";

  const lines = [
    `Hi ${greetingName},`,
    "",
    `This is a reminder regarding your enquiry ${input.leadNumber}.`,
    `We will follow up with you on ${when}.`,
  ];
  if ((input.notes || "").trim()) {
    lines.push("", (input.notes || "").trim());
  }
  lines.push("", "Thank you,", company);

  return { subject, text: lines.join("\n") };
}
