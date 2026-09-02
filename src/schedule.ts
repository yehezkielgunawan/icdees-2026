import type {
  ScheduleInput,
  ScheduleItem,
} from "./types.js";

function seedToNumber(seed: string): number {
  let value = 2166136261;
  for (const character of seed) {
    value ^= character.codePointAt(0) ?? 0;
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function nextRandom(state: { value: number }): number {
  state.value += 0x6d2b79f5;
  let result = state.value;
  result = Math.imul(result ^ (result >>> 15), result | 1);
  result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
  return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
}

export function buildSchedule(input: ScheduleInput): ScheduleItem[] {
  if (!Number.isInteger(input.runs) || input.runs < 1) {
    throw new Error("runs must be a positive integer");
  }

  const schedule: ScheduleItem[] = [];
  for (const taskId of input.tasks) {
    for (const model of input.models) {
      for (let run = 1; run <= input.runs; run += 1) {
        schedule.push({
          campaignId: input.campaignId,
          generationId: `${input.campaignId}--${model.key}--${taskId}--run-${run}`,
          taskId,
          modelKey: model.key,
          cohort: model.cohort,
          run,
        });
      }
    }
  }

  const state = { value: seedToNumber(input.seed) };
  for (let index = schedule.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom(state) * (index + 1));
    const current = schedule[index];
    const replacement = schedule[swapIndex];
    if (current && replacement) {
      schedule[index] = replacement;
      schedule[swapIndex] = current;
    }
  }

  return schedule;
}
