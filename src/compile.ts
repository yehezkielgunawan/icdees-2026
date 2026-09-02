import { relative } from "node:path";
import ts from "typescript";

export interface CompilerDiagnostic {
  code: number;
  category: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface CompileResult {
  status: "passed" | "failed";
  errorCount: number;
  errorCodes: number[];
  diagnostics: CompilerDiagnostic[];
  durationMs: number;
}

export function strictCompilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noImplicitAny: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    isolatedModules: true,
    verbatimModuleSyntax: true,
    noEmit: true,
    skipLibCheck: true,
    types: ["node", "vitest"],
  };
}

function diagnosticMessage(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function toDiagnostic(
  diagnostic: ts.Diagnostic,
  candidatePath: string,
): CompilerDiagnostic {
  const result: CompilerDiagnostic = {
    code: diagnostic.code,
    category: ts.DiagnosticCategory[diagnostic.category] ?? "Unknown",
    message: diagnosticMessage(diagnostic),
  };
  if (diagnostic.file && diagnostic.start !== undefined) {
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    result.file = relative(process.cwd(), diagnostic.file.fileName);
    result.line = position.line + 1;
    result.column = position.character + 1;
  } else {
    result.file = relative(process.cwd(), candidatePath);
  }
  return result;
}

export function compileCandidate(
  candidatePath: string,
  testPath: string,
): CompileResult {
  const startedAt = Date.now();
  const program = ts.createProgram(
    [candidatePath, testPath],
    strictCompilerOptions(),
  );
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  const normalized = errors.map((diagnostic) =>
    toDiagnostic(diagnostic, candidatePath),
  );

  return {
    status: errors.length === 0 ? "passed" : "failed",
    errorCount: errors.length,
    errorCodes: normalized.map((diagnostic) => diagnostic.code),
    diagnostics: normalized,
    durationMs: Date.now() - startedAt,
  };
}
