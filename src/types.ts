export type Cohort = "primary" | "exploratory";

export type StageStatus =
  | "not-run"
  | "passed"
  | "failed"
  | "timed-out"
  | "error"
  | "rejected";

export interface ModelConfig {
  key: string;
  label: string;
  cohort: Cohort;
  providerID: string;
  modelID: string;
  variant?: string;
}

export interface TaskConfig {
  id: string;
  category: string;
  title: string;
  description: string;
  signature: string;
}

export interface ScheduleModel {
  key: string;
  cohort: Cohort;
}

export interface ScheduleInput {
  campaignId: string;
  seed: string;
  runs: number;
  tasks: readonly string[];
  models: readonly ScheduleModel[];
}

export interface ScheduleItem {
  campaignId: string;
  generationId: string;
  taskId: string;
  modelKey: string;
  cohort: Cohort;
  run: number;
}

export interface NormalizedOutput {
  source: string;
  actions: string[];
}

export interface EvaluationMetricInput {
  cohort?: Cohort;
  modelKey?: string;
  extractionStatus: "succeeded" | "failed";
  compileStatus: StageStatus;
  testStatus: StageStatus;
  testsPassed: number | null;
  testsTotal: number | null;
  eslintErrors: number | null;
}

export interface DerivedMetrics {
  testPassRatio: number | null;
  fullyCorrect: boolean;
  qualityGatePass: boolean;
}

export interface ResultSummary {
  generated: number;
  compiled: number;
  compileRate: number;
  fullyCorrect: number;
  functionalRate: number;
  compiledButIncorrect: number;
  compiledButIncorrectRate: number;
  staticClean: number;
  cleanStaticRate: number;
  fullGate: number;
  fullGateRate: number;
}
