import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  renderQualityGatePng,
  renderQualityGateSvg,
} from "./publication-figure.js";
import type { PublicationReport } from "./publication-report.js";
import { renderPublicationTables } from "./publication-tables.js";

export async function writePublicationFiles(
  reportDirectory: string,
  report: PublicationReport,
): Promise<string> {
  const publicationDirectory = join(reportDirectory, "publication");
  const tablesDirectory = join(publicationDirectory, "tables");
  const figuresDirectory = join(publicationDirectory, "figures");
  await mkdir(tablesDirectory, { recursive: true });
  await mkdir(figuresDirectory, { recursive: true });

  const tables = renderPublicationTables(report);
  const svg = renderQualityGateSvg(report);
  const png = renderQualityGatePng(report);
  await Promise.all([
    writeFile(join(tablesDirectory, "table-1-task-set.md"), tables.taskSet.markdown, "utf8"),
    writeFile(join(tablesDirectory, "table-1-task-set.tex"), tables.taskSet.latex, "utf8"),
    writeFile(join(tablesDirectory, "table-2-main-results.md"), tables.mainResults.markdown, "utf8"),
    writeFile(join(tablesDirectory, "table-2-main-results.tex"), tables.mainResults.latex, "utf8"),
    writeFile(join(tablesDirectory, "table-3-failure-characteristics.md"), tables.failureCharacteristics.markdown, "utf8"),
    writeFile(join(tablesDirectory, "table-3-failure-characteristics.tex"), tables.failureCharacteristics.latex, "utf8"),
    writeFile(join(figuresDirectory, "figure-1-quality-gates.svg"), svg, "utf8"),
    writeFile(join(figuresDirectory, "figure-1-quality-gates.png"), png),
  ]);
  return publicationDirectory;
}
