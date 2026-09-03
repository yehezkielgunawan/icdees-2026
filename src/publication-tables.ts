import {
  formatMetric,
  type PublicationFailureSummary,
  type PublicationReport,
} from "./publication-report.js";

export interface PublicationTable {
  markdown: string;
  latex: string;
}

export interface PublicationTables {
  taskSet: PublicationTable;
  mainResults: PublicationTable;
  failureCharacteristics: PublicationTable;
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function latexCell(value: string): string {
  const escaped = new Map([
    ["\\", "\\textbackslash{}"],
    ["&", "\\&"],
    ["%", "\\%"],
    ["$", "\\$"],
    ["#", "\\#"],
    ["_", "\\_"],
    ["{", "\\{"],
    ["}", "\\}"],
    ["~", "\\textasciitilde{}"],
    ["^", "\\textasciicircum{}"],
    ["|", "\\textbar{}"],
  ]);
  return [...value].map((character) => escaped.get(character) ?? character).join("")
    .replaceAll("\n", " ");
}

function markdownTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const header = `| ${headers.map(markdownCell).join(" | ")} |`;
  const separator = `| ${headers.map((_, index) => index === 0 ? "---" : "---:").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`);
  return [header, separator, ...body].join("\n");
}

function latexTable(
  caption: string,
  label: string,
  alignment: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  note?: string,
): string {
  const rowEnding = ` ${String.fromCharCode(92).repeat(2)}`;
  const lines = [
    "\\begin{table}[t]",
    "\\centering",
    `\\caption{${latexCell(caption)}}`,
    `\\label{${label}}`,
    `\\begin{tabular}{${alignment}}`,
    "\\hline",
    `${headers.map(latexCell).join(" & ")}${rowEnding}`,
    "\\hline",
    ...rows.map((row) => `${row.map(latexCell).join(" & ")}${rowEnding}`),
    "\\hline",
    "\\end{tabular}",
  ];
  if (note) {
    lines.push(`\\par\\small ${latexCell(note)}`);
  }
  lines.push("\\end{table}");
  return `${lines.join("\n")}\n`;
}

function partialNote(report: PublicationReport): string | undefined {
  if (report.complete) {
    return undefined;
  }
  return `Partial report: ${report.evaluatedGenerations} of ${report.expectedGenerations} expected generations were evaluated.`;
}

function tableMarkdown(
  title: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  note?: string,
): string {
  const lines = [`${title}.`, "", markdownTable(headers, rows)];
  if (note) {
    lines.push("", `> ${note}`);
  }
  return `${lines.join("\n")}\n`;
}

function tableNote(report: PublicationReport, includeMetricNote: boolean): string | undefined {
  const notes = [
    partialNote(report),
    includeMetricNote
      ? "Counts and percentages use the denominator shown in each cell; N/A indicates a zero denominator."
      : undefined,
  ].filter((note): note is string => note !== undefined);
  return notes.length === 0 ? undefined : notes.join(" ");
}

function taskSetTable(report: PublicationReport): PublicationTable {
  const headers = ["Category", "Tasks", "Example"];
  const rows = report.categories.map((category) => [
    category.label,
    String(category.taskCount),
    category.example,
  ]);
  const note = tableNote(report, false);
  return {
    markdown: tableMarkdown("Table 1. Task set", headers, rows, note),
    latex: latexTable(
      "Task set",
      "tab:task-set",
      "lrl",
      headers,
      rows,
      note,
    ),
  };
}

function mainResultsTable(report: PublicationReport): PublicationTable {
  const headers = ["Model", "Compile", "Functional", "Static-clean", "Full gate"];
  const rows = report.models.map((model) => [
    model.label,
    formatMetric(model.compile),
    formatMetric(model.functional),
    formatMetric(model.staticClean),
    formatMetric(model.fullGate),
  ]);
  const note = tableNote(report, true);
  return {
    markdown: tableMarkdown("Table 2. Main results", headers, rows, note),
    latex: latexTable(
      "Main results by model",
      "tab:main-results",
      "lrrrr",
      headers,
      rows,
      note,
    ),
  };
}

function failureRows(
  report: PublicationReport,
): (readonly string[])[] {
  return report.failures.map((failure: PublicationFailureSummary) => [
    failure.label,
    ...failure.models.map(formatMetric),
  ]);
}

function failureTable(report: PublicationReport): PublicationTable {
  const headers = ["Failure stage", ...report.models.map((model) => model.label)];
  const rows = failureRows(report);
  const note = tableNote(report, true);
  return {
    markdown: tableMarkdown("Table 3. Failure characteristics", headers, rows, note),
    latex: latexTable(
      "Failure characteristics by model",
      "tab:failure-characteristics",
      `l${"r".repeat(report.models.length)}`,
      headers,
      rows,
      note,
    ),
  };
}

export function renderPublicationTables(report: PublicationReport): PublicationTables {
  return {
    taskSet: taskSetTable(report),
    mainResults: mainResultsTable(report),
    failureCharacteristics: failureTable(report),
  };
}
