import { useState, useRef } from "react";
import { useReminderStore } from "../../stores/reminderStore";
import type { ReminderFiredPayload } from "../../lib/types";
import * as ipc from "../../lib/ipc";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeMockPayload(title: string): ReminderFiredPayload {
  const now = new Date().toISOString();
  return {
    reminder: {
      id: `dev-${Date.now()}`,
      workspace_id: "dev-tools",
      entity_type: "task",
      entity_id: `dev-entity-${Date.now()}`,
      remind_at: now,
      offset_type: "at_time",
      offset_mins: null,
      is_fired: true,
      is_dismissed: false,
      created_at: now,
      updated_at: now,
    },
    title,
  };
}

// ── sub-components ────────────────────────────────────────────────────────────

function DevSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-white p-5 shadow-sm dark:border-amber-800/30 dark:bg-gray-900">
      <h2 className="mb-4 text-base font-semibold text-gray-800 dark:text-gray-200">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      {children}
    </label>
  );
}

// ── Reminder Testing ──────────────────────────────────────────────────────────

function ReminderTester() {
  const addFiredReminder = useReminderStore((s) => s.addFiredReminder);

  const [title, setTitle] = useState("Dev test reminder");
  const [delaySecs, setDelaySecs] = useState(3);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [backendStatus, setBackendStatus] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const inputClass =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-400";
  const btnBase =
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1";

  function fireInstantly() {
    addFiredReminder(makeMockPayload(title || "Dev reminder"));
  }

  function startCountdown() {
    if (intervalRef.current !== null) return;
    let remaining = delaySecs;
    setCountdown(remaining);
    intervalRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setCountdown(null);
        addFiredReminder(makeMockPayload(title || "Dev reminder"));
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }

  function cancelCountdown() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCountdown(null);
  }

  async function fireViaBackend() {
    setBackendStatus("Sending…");
    try {
      await ipc.devFireReminder(title || "Dev reminder", delaySecs);
      setBackendStatus(
        delaySecs > 0 ? `Event will fire in ${delaySecs}s via backend` : "Event fired via backend"
      );
      setTimeout(() => setBackendStatus(null), 5000);
    } catch (err) {
      setBackendStatus(`Error: ${String(err)}`);
    }
  }

  return (
    <DevSection title="Reminder Testing">
      <Field label="Reminder title">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Delay (seconds)">
        <input
          type="number"
          min={0}
          value={delaySecs}
          onChange={(e) => setDelaySecs(Math.max(0, Number(e.target.value)))}
          className={`${inputClass} w-28`}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        {/* Fire instantly */}
        <button
          onClick={fireInstantly}
          className={`${btnBase} bg-amber-100 text-amber-800 hover:bg-amber-200 focus:ring-amber-400 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50`}
        >
          Fire Instantly (frontend)
        </button>

        {/* Countdown / Cancel */}
        {countdown === null ? (
          <button
            onClick={startCountdown}
            className={`${btnBase} bg-amber-100 text-amber-800 hover:bg-amber-200 focus:ring-amber-400 dark:bg-amber-900/30 dark:text-amber-300 dark:hover:bg-amber-900/50`}
          >
            Fire in {delaySecs}s (frontend)
          </button>
        ) : (
          <button
            onClick={cancelCountdown}
            className={`${btnBase} bg-yellow-200 text-yellow-900 hover:bg-yellow-300 focus:ring-yellow-400 dark:bg-yellow-900/40 dark:text-yellow-300`}
          >
            Cancel ({countdown}s remaining)
          </button>
        )}

        {/* Fire via backend */}
        <button
          onClick={fireViaBackend}
          className={`${btnBase} bg-gray-100 text-gray-800 hover:bg-gray-200 focus:ring-gray-400 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600`}
        >
          Fire via Backend
        </button>
      </div>

      {backendStatus && (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{backendStatus}</p>
      )}
    </DevSection>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function DevToolsPage() {
  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-4 dark:border-amber-800/30 dark:bg-amber-900/10">
        <svg
          className="h-5 w-5 text-amber-600 dark:text-amber-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Developer Tools</h1>
        <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-800/40 dark:text-amber-300">
          DEV ONLY
        </span>
      </div>

      {/* Sections */}
      <div className="flex-1 space-y-6 p-6">
        <ReminderTester />
      </div>
    </div>
  );
}
