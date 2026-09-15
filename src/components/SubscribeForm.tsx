"use client";

import { useState } from "react";

type State = { kind: "idle" | "sending" } | { kind: "done" | "error"; message: string };

export default function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "sending") return;
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (res.ok && data.ok) {
        setState({ kind: "done", message: data.message ?? "신청이 접수됐습니다." });
        setEmail("");
      } else {
        setState({ kind: "error", message: data.message ?? "잠시 후 다시 시도해 주세요." });
      }
    } catch {
      setState({ kind: "error", message: "네트워크 상태를 확인해 주세요." });
    }
  }

  return (
    <section className="mt-14 border-t pt-6" style={{ borderColor: "var(--line)" }}>
      <h2 className="mb-1 text-sm font-semibold">메일로 받아보기</h2>
      <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
        발행되면 알려 드립니다. 개별 종목은 보내지 않습니다.
      </p>

      {state.kind === "done" ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {state.message}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-wrap gap-2">
          <label htmlFor="subscribe-email" className="sr-only">
            이메일 주소
          </label>
          <input
            id="subscribe-email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--fg)" }}
          />
          <button
            type="submit"
            disabled={state.kind === "sending"}
            className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "var(--line)", background: "var(--card)" }}
          >
            {state.kind === "sending" ? "신청 중…" : "신청"}
          </button>
        </form>
      )}

      {state.kind === "error" ? (
        <p className="mt-2 text-sm" role="alert" style={{ color: "var(--up)" }}>
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
