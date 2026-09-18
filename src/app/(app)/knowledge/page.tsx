import { KnowledgeManager } from "@/components/knowledge-manager";

export default function KnowledgePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Knowledge base</h1>
        <p className="mt-1 text-sm text-mid-green">
          Approved answers the quote AI can reuse when a similar buyer question comes back.
        </p>
      </div>
      <KnowledgeManager />
    </div>
  );
}
