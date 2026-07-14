// Single source of truth for the two dev-mode env flags. Both must be
// the exact string "true" to be enabled — anything else (unset, "1",
// "TRUE", "false") counts as disabled.

export function isMockMode(): boolean {
  return process.env.MOCK_TOOLS === "true";
}

export function isDebugTools(): boolean {
  return process.env.DEBUG_TOOLS === "true";
}
