import { useEffect, useState } from "react";
import { getVersion, getTauriVersion } from "@tauri-apps/api/app";
/** About panel showing application and system information. */
export function AboutPanel() {
  const [appVersion, setAppVersion] = useState("");
  const [tauriVersion, setTauriVersion] = useState("");

  useEffect(() => {
    getVersion().then(setAppVersion);
    getTauriVersion().then(setTauriVersion);
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            About
          </h1>
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
