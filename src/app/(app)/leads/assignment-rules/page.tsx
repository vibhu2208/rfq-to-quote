"use client";

import { useCallback, useEffect, useState } from "react";

type User = { id: string; name: string; email: string };
type Rule = {
  id: string;
  name: string;
  type: string;
  active: boolean;
  priority: number;
  config: { userIds?: string[]; categoryKeywords?: string[]; states?: string[] };
};

export default function AssignmentRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("ROUND_ROBIN");
  const [userIds, setUserIds] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [states, setStates] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r, u] = await Promise.all([
      fetch("/api/leads/assignment-rules").then((x) => x.json()),
      fetch("/api/leads/users").then((x) => x.json()),
    ]);
    setRules(Array.isArray(r.items) ? r.items : []);
    setUsers(Array.isArray(u.items) ? u.items : []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRule() {
    if (!name.trim() || !userIds.length) return;
    setBusy(true);
    try {
      await fetch("/api/leads/assignment-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          config: {
            userIds,
            categoryKeywords: keywords
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            states: states
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          },
        }),
      });
      setName("");
      setKeywords("");
      setStates("");
      setUserIds([]);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function removeRule(id: string) {
    await fetch(`/api/leads/assignment-rules?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-dark-primary">
          Assignment Rules
        </h1>
        <p className="text-sm text-mid-green">
          Round-robin, category, geography, and workload-based ownership
        </p>
      </div>

      <section className="rounded-2xl border border-dark-primary/8 bg-white p-4">
        <h2 className="text-sm font-semibold">Create rule</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rule name"
            className="h-9 rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-9 rounded-lg bg-dark-secondary/[0.05] px-3 text-sm"
          >
            <option value="ROUND_ROBIN">Round robin</option>
            <option value="CATEGORY">By category</option>
            <option value="GEOGRAPHY">By geography</option>
            <option value="WORKLOAD">By workload</option>
          </select>
          <div className="md:col-span-2">
            <p className="mb-1 text-xs text-mid-green">Assignees</p>
            <div className="flex flex-wrap gap-2">
              {users.map((u) => (
                <label key={u.id} className="inline-flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={userIds.includes(u.id)}
                    onChange={(e) => {
                      setUserIds((prev) =>
                        e.target.checked
                          ? [...prev, u.id]
                          : prev.filter((id) => id !== u.id)
                      );
                    }}
                  />
                  {u.name || u.email}
                </label>
              ))}
            </div>
          </div>
          {type === "CATEGORY" ? (
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="Category keywords (comma-separated)"
              className="h-9 rounded-lg bg-dark-secondary/[0.05] px-3 text-sm md:col-span-2"
            />
          ) : null}
          {type === "GEOGRAPHY" ? (
            <input
              value={states}
              onChange={(e) => setStates(e.target.value)}
              placeholder="States (comma-separated)"
              className="h-9 rounded-lg bg-dark-secondary/[0.05] px-3 text-sm md:col-span-2"
            />
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createRule()}
          className="mt-3 rounded-full bg-mid-green px-4 py-1.5 text-sm font-medium text-white"
        >
          Save rule
        </button>
      </section>

      <div className="overflow-hidden rounded-xl border border-dark-primary/8 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-dark-secondary/[0.04] text-xs uppercase text-mid-green">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Priority</th>
              <th className="px-3 py-2 text-left">Users</th>
              <th className="px-3 py-2 text-left">Active</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-t border-dark-primary/5">
                <td className="px-3 py-2">{rule.name}</td>
                <td className="px-3 py-2">{rule.type}</td>
                <td className="px-3 py-2">{rule.priority}</td>
                <td className="px-3 py-2">
                  {(rule.config?.userIds || []).length}
                </td>
                <td className="px-3 py-2">{rule.active ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void removeRule(rule.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!rules.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-mid-green">
                  No assignment rules yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
