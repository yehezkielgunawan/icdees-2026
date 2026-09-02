import type { NormalizedOutput } from "./types.js";

export function normalizeModelOutput(raw: string): NormalizedOutput {
  const actions: string[] = [];
  let source = raw;
  const lineNormalized = source.replace(/\r\n?/g, "\n");
  if (lineNormalized !== source) {
    actions.push("normalized-line-endings");
    source = lineNormalized;
  }

  const trimmed = source.trim();
  const fenced = trimmed.match(/^```(?:typescript|ts)?\n([\s\S]*?)\n```$/);
  if (fenced?.[1] !== undefined) {
    source = `${fenced[1]}\n`;
    actions.push("removed-enclosing-code-fence");
  }

  return { source, actions };
}
