export function buildPrompt(
  template: string,
  task: { description: string; signature: string },
): string {
  const prompt = template
    .replaceAll("{TASK_DESCRIPTION}", task.description)
    .replaceAll("{FUNCTION_SIGNATURE}", task.signature);

  if (prompt.includes("{TASK_DESCRIPTION}") || prompt.includes("{FUNCTION_SIGNATURE}")) {
    throw new Error("Prompt template contains an unresolved placeholder");
  }

  return prompt;
}
