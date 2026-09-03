import { describe, expect, it } from "vitest";
import {
  renderQualityGatePng,
  renderQualityGateSvg,
} from "../src/publication-figure.js";
import type { PublicationReport } from "../src/publication-report.js";

function metric(numerator: number, denominator: number) {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
  };
}

const report: PublicationReport = {
  campaignId: "figure-fixture",
  complete: true,
  expectedGenerations: 15,
  evaluatedGenerations: 15,
  categories: [],
  failures: [],
  models: [{
    key: "sol",
    label: "Sol & <primary>",
    generated: 15,
    compile: metric(12, 15),
    functional: metric(11, 15),
    staticClean: metric(10, 12),
    fullGate: metric(9, 15),
  }],
};

describe("quality-gate figure rendering", () => {
  it("renders an accessible SVG with direct stage labels and values", () => {
    const svg = renderQualityGateSvg(report);

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title id=\"figure-title\">Quality-gate survival by model</title>");
    expect(svg).toContain("Sol &amp; &lt;primary&gt;");
    expect(svg).toContain("Sol &amp; &lt;primary&gt;: generated 15/15 (100.0%)");
    expect(svg).toContain("compiled 12/15 (80.0%)");
    expect(svg).toContain("static clean 10/12 (83.3%) among compiled");
    expect(svg).toContain("Static-clean (compiled denominator): 10/12 (83.3%)");
    expect(svg).toContain("full quality gate 9/15 (60.0%)");
    expect(svg).toContain("Generated");
    expect(svg).toContain("Compiled");
    expect(svg).toContain("Fully correct");
    expect(svg).toContain("Full quality gate");
    expect(svg).toContain("12/15 (80.0%)");
    expect(svg).toContain('x="1152"');
    expect(svg).not.toContain('x="1220"');
    expect(svg).toContain('width="1200"');
  });

  it("marks incomplete data in the SVG subtitle", () => {
    const svg = renderQualityGateSvg({
      ...report,
      complete: false,
      expectedGenerations: 18,
      evaluatedGenerations: 15,
    });

    expect(svg).toContain("Partial report: 15 of 18 expected generations were evaluated.");
  });

  it("renders a print-sized PNG from the SVG", () => {
    const png = renderQualityGatePng(report);

    expect([...png.subarray(0, 8)]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    expect(png.readUInt32BE(16)).toBe(2400);
    expect(png.readUInt32BE(20)).toBeGreaterThan(0);
    expect(renderQualityGatePng(report)).toEqual(png);
  });

  it("includes text glyphs in the raster output", () => {
    const withoutModelLabel = renderQualityGatePng({
      ...report,
      models: [{ ...report.models[0]!, label: "" }],
    });

    expect(renderQualityGatePng(report).equals(withoutModelLabel)).toBe(false);
  });
});
