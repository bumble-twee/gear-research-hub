"use client";

import { useState } from "react";
import type { ReviewLink } from "./types";

export function ReviewLinksExpander({ links }: { links: ReviewLink[] }) {
  const [open, setOpen] = useState(false);

  if (links.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        {open ? "Hide" : "Show"} {links.length} review
        {links.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-2">
          {links.map((link, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 shrink-0 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                aria-label={`Open review on ${link.site}`}
              >
                <ExternalLinkIcon />
              </a>
              <span>
                <span className="font-medium text-zinc-800 dark:text-zinc-200">
                  {link.site}
                </span>
                {link.rating && <span> · {link.rating}</span>}
                <span> — {link.key_takeaway}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3.5 w-3.5"
    >
      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
    </svg>
  );
}
