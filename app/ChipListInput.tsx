"use client";

import { useState } from "react";

// Controlled repeatable-chip-list editor. Has no idea whether its
// `items` come from local component state (a not-yet-created search)
// or a server round trip (persisted edits on the detail page) — the
// parent owns that via `items` + `onChange`, this just handles the
// add/remove interaction and chip rendering.
export function ChipListInput({
  label,
  placeholder,
  items,
  onChange,
  numbered = false,
  disabled = false,
  chipClassName = "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
}: {
  label: string;
  placeholder?: string;
  items: string[];
  onChange: (items: string[]) => void;
  numbered?: boolean;
  disabled?: boolean;
  chipClassName?: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value || disabled) return;
    onChange([...items, value]);
    setDraft("");
  }

  function remove(index: number) {
    if (disabled) return;
    onChange(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{label}</span>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${chipClassName}`}
            >
              {numbered ? `${i + 1}. ${item}` : item}
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(i)}
                aria-label={`Remove ${item}`}
                className="text-current opacity-60 hover:text-red-600 hover:opacity-100 disabled:opacity-30 dark:hover:text-red-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={add}
          className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Add
        </button>
      </div>
    </div>
  );
}
