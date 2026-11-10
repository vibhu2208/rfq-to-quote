import { redirect } from "next/navigation";

/** Inbox intake is now part of Leads (same RFQ records + poll / WhatsApp / capture). */
export default function InboxPage() {
  redirect("/leads");
}
