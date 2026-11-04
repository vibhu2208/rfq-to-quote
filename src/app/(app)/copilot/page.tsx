import { redirect } from "next/navigation";

/** Copilot lives in the floating Quote Agent — keep this route as a friendly redirect. */
export default function CopilotPage() {
  redirect("/dashboard");
}
