export interface SafetyFinding {
  rule:
    | "import"
    | "dynamic-module-loading"
    | "process-access"
    | "global-access"
    | "typescript-suppression";
  line: number;
  excerpt: string;
}

function lineNumber(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function excerptAt(source: string, offset: number): string {
  return source.slice(offset).split("\n", 1)[0]?.trim() ?? "";
}

export function inspectGeneratedSource(source: string): SafetyFinding[] {
  const checks: Array<{
    rule: SafetyFinding["rule"];
    pattern: RegExp;
  }> = [
    { rule: "import", pattern: /^\s*import\s/m },
    { rule: "dynamic-module-loading", pattern: /\b(?:require|import)\s*\(/ },
    { rule: "process-access", pattern: /\bprocess\b/ },
    { rule: "global-access", pattern: /\b(?:globalThis|global)\b/ },
    {
      rule: "typescript-suppression",
      pattern: /@ts-(?:ignore|expect-error|nocheck)\b/,
    },
  ];

  const findings: SafetyFinding[] = [];
  for (const check of checks) {
    const match = check.pattern.exec(source);
    if (match?.index !== undefined) {
      findings.push({
        rule: check.rule,
        line: lineNumber(source, match.index),
        excerpt: excerptAt(source, match.index),
      });
    }
  }
  return findings;
}
