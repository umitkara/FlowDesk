interface FieldMapping {
  title: number;
  description?: number;
  status?: number;
  priority?: number;
  due_date?: number;
  category?: number;
  tags?: number;
}

interface Props {
  headers: string[];
  rows: string[][];
  mapping: FieldMapping;
  onMappingChange: (m: FieldMapping) => void;
}

const TASK_FIELDS: { key: keyof FieldMapping; label: string; required: boolean }[] = [
  { key: "title", label: "Title", required: true },
  { key: "description", label: "Description", required: false },
  { key: "status", label: "Status", required: false },
  { key: "priority", label: "Priority", required: false },
  { key: "due_date", label: "Due Date", required: false },
  { key: "category", label: "Category", required: false },
  { key: "tags", label: "Tags", required: false },
];

/** CSV column to task field mapping component. */
export function FieldMapper({ headers, rows, mapping, onMappingChange }: Props) {
  const handleChange = (field: keyof FieldMapping, value: string) => {
    const val = value === "" ? undefined : Number(value);
    onMappingChange({ ...mapping, [field]: val });
  };

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Map CSV columns to task fields
      </div>

      {/* Field mapping selectors */}
      <div className="space-y-2">
        {TASK_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-3">
            <label className="w-24 text-right text-xs text-gray-500 dark:text-gray-400">
              {f.label}
              {f.required && <span className="text-red-500">*</span>}
            </label>
            <select
              value={mapping[f.key] ?? ""}
              onChange={(e) => handleChange(f.key, e.target.value)}
              className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
            >
              <option value="">{f.required ? "Select column..." : "(not mapped)"}</option>
              {headers.map((h, i) => (
                <option key={i} value={i}>{h}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
          <table className="w-full text-left text-[10px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800">
                {headers.map((h, i) => (
                  <th key={i} className="px-2 py-1.5 font-medium text-gray-600 dark:text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 3).map((row, ri) => (
                <tr key={ri} className="border-t border-gray-100 dark:border-gray-800">
                  {row.map((cell, ci) => (
                    <td key={ci} className="max-w-32 truncate px-2 py-1 text-gray-700 dark:text-gray-300">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
