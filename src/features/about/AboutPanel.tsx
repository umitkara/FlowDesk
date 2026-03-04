import { useEffect, useState } from "react";
import { getVersion, getTauriVersion } from "@tauri-apps/api/app";
import { useUIStore } from "../../stores/uiStore";

/** About panel showing application and system information. */
export function AboutPanel() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const [appVersion, setAppVersion] = useState("");
  const [tauriVersion, setTauriVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion);
    getTauriVersion().then(setTauriVersion);
  }, []);

  return (
    <div className="mx-auto max-w-2xl overflow-y-auto px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          About
        </h1>
        <button
          onClick={() => setActiveView("notes")}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <InfoSection title="Application">
        <InfoRow label="Name" value="FlowDesk" />
        <InfoRow label="Version" value={appVersion} />
        <InfoRow label="Description" value="A unified personal productivity system" />
      </InfoSection>

      <InfoSection title="System">
        <InfoRow label="Tauri Version" value={tauriVersion} />
        <InfoRow label="Platform" value={navigator.platform} />
      </InfoSection>
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
        {title}
      </h2>
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-700 dark:bg-gray-900">
        {children}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {value}
      </div>
    </div>
  );
}
