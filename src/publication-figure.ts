import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import {
  formatMetric,
  type PublicationMetric,
  type PublicationModelSummary,
  type PublicationReport,
} from "./publication-report.js";

const nodeRequire = createRequire(import.meta.url);
const regularFont = nodeRequire.resolve(
  "dejavu-fonts-ttf/ttf/DejaVuSans.ttf",
);
const mediumFont = nodeRequire.resolve(
  "dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf",
);

const svgWidth = 1200;
const pngWidth = 2400;
const chartLeft = 260;
const chartWidth = 680;
const chartRight = chartLeft + chartWidth;
const valueX = svgWidth - 48;
const groupTop = 108;
const groupHeight = 200;
const barHeight = 22;
const rowHeight = 31;

function generatedMetric(model: PublicationModelSummary): PublicationMetric {
  return {
    numerator: model.generated,
    denominator: model.generated,
    rate: model.generated === 0 ? null : 1,
  };
}

const stages: readonly {
  label: string;
  color: string;
  metric: (model: PublicationModelSummary) => PublicationMetric;
}[] = [
  {
    label: "Generated",
    color: "#5B6472",
    metric: generatedMetric,
  },
  { label: "Compiled", color: "#0072B2", metric: (model) => model.compile },
  { label: "Fully correct", color: "#009E73", metric: (model) => model.functional },
  { label: "Full quality gate", color: "#D55E00", metric: (model) => model.fullGate },
];

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function partialSubtitle(report: PublicationReport): string {
  if (report.complete) {
    return `Evaluated generations: ${report.evaluatedGenerations}.`;
  }
  return `Partial report: ${report.evaluatedGenerations} of ${report.expectedGenerations} expected generations were evaluated.`;
}

function accessibleDescription(report: PublicationReport): string {
  const modelDescriptions = report.models.length === 0
    ? "No evaluated models."
    : report.models.map((model) => [
      `${model.label}:`,
      `generated ${formatMetric(generatedMetric(model))};`,
      `compiled ${formatMetric(model.compile)};`,
      `fully correct ${formatMetric(model.functional)};`,
      `static clean ${formatMetric(model.staticClean)} among compiled;`,
      `full quality gate ${formatMetric(model.fullGate)}.`,
    ].join(" ")).join(" ");
  return `Sequential survival of generated TypeScript programs through compilation, functional correctness, and the full quality gate. ${modelDescriptions} ${partialSubtitle(report)}`;
}

function barWidth(value: PublicationMetric): number {
  if (value.rate === null) {
    return 0;
  }
  const boundedRate = Math.max(0, Math.min(1, value.rate));
  return Math.round(chartWidth * boundedRate);
}

function modelGroup(model: PublicationModelSummary, index: number): string[] {
  const top = groupTop + index * groupHeight;
  const elements = [
    `<g aria-label="${escapeXml(model.label)}">`,
    `<text x="48" y="${top}" fill="#18212F" font-size="22" font-weight="500">${escapeXml(model.label)}</text>`,
  ];
  for (const [stageIndex, stage] of stages.entries()) {
    const metric = stage.metric(model);
    const y = top + 22 + stageIndex * rowHeight;
    const width = barWidth(metric);
    elements.push(
      `<text x="48" y="${y + 16}" fill="#344054" font-size="15">${escapeXml(stage.label)}</text>`,
      `<rect x="${chartLeft}" y="${y}" width="${chartWidth}" height="${barHeight}" rx="6" fill="#E7EBF0"/>`,
    );
    if (width > 0) {
      elements.push(
        `<rect x="${chartLeft}" y="${y}" width="${width}" height="${barHeight}" rx="6" fill="${stage.color}"/>`,
      );
    }
    elements.push(
      `<text x="${valueX}" y="${y + 16}" fill="#18212F" font-size="15" text-anchor="end">${escapeXml(formatMetric(metric))}</text>`,
    );
  }
  const diagnosticY = top + 22 + stages.length * rowHeight + 14;
  elements.push(
    `<text x="${chartLeft}" y="${diagnosticY}" fill="#667085" font-size="13">Static-clean (compiled denominator): ${escapeXml(formatMetric(model.staticClean))}</text>`,
    `<line x1="48" y1="${top + groupHeight - 22}" x2="${svgWidth - 48}" y2="${top + groupHeight - 22}" stroke="#D0D5DD" stroke-width="1"/>`,
    "</g>",
  );
  return elements;
}

export function renderQualityGateSvg(report: PublicationReport): string {
  const svgHeight = groupTop + Math.max(report.models.length, 1) * groupHeight - 22;
  const elements = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-labelledby="figure-title figure-description">`,
    "<title id=\"figure-title\">Quality-gate survival by model</title>",
    `<desc id="figure-description">${escapeXml(accessibleDescription(report))}</desc>`,
    `<rect width="${svgWidth}" height="${svgHeight}" fill="#FFFFFF"/>`,
    `<text x="48" y="42" fill="#101828" font-size="28" font-weight="500">Quality-gate survival by model</text>`,
    `<text x="48" y="70" fill="#667085" font-size="16">${escapeXml(partialSubtitle(report))}</text>`,
    `<text x="${chartRight}" y="70" fill="#667085" font-size="14" text-anchor="end">Count / denominator (percentage)</text>`,
    ...report.models.flatMap(modelGroup),
  ];
  if (report.models.length === 0) {
    elements.push(
      `<text x="48" y="${groupTop}" fill="#667085" font-size="16">No evaluated models.</text>`,
      "</svg>",
    );
  } else {
    elements.push("</svg>");
  }
  return `${elements.join("\n")}\n`;
}

export function renderQualityGatePng(report: PublicationReport): Buffer {
  const renderer = new Resvg(renderQualityGateSvg(report), {
    background: "#FFFFFF",
    fitTo: { mode: "width", value: pngWidth },
    font: {
      fontFiles: [regularFont, mediumFont],
      loadSystemFonts: false,
      defaultFontFamily: "DejaVu Sans",
      sansSerifFamily: "DejaVu Sans",
    },
    shapeRendering: 2,
    textRendering: 1,
    logLevel: "error",
  });
  return renderer.render().asPng();
}
