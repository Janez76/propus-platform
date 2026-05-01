import Anthropic from "@anthropic-ai/sdk";
import { runEvalSuite, type EvalSuiteSummary } from "../../../scripts/eval-assistant";
import { runTuneReportGeneration, type TuneReportResult } from "../../../scripts/tune-assistant";

export async function runAssistantEvalSuite(): Promise<EvalSuiteSummary> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt.");
  }
  const client = new Anthropic({ apiKey });
  return runEvalSuite(client);
}

export type SerializableEvalSummary = {
  passed: number;
  total: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  failedCaseIds: string[];
  results: Array<{
    id: string;
    pass: boolean;
    reason: string;
    model: string;
    tools: string[];
    inputTokens: number;
    outputTokens: number;
    finalTextPreview: string;
    driftOk?: boolean;
    driftDetail?: string;
  }>;
};

export function serializeEvalSummary(summary: EvalSuiteSummary): SerializableEvalSummary {
  return {
    passed: summary.passed,
    total: summary.total,
    totalInputTokens: summary.totalInputTokens,
    totalOutputTokens: summary.totalOutputTokens,
    failedCaseIds: summary.results.filter((r) => !r.pass).map((r) => r.id),
    results: summary.results.map((r) => ({
      id: r.id,
      pass: r.pass,
      reason: r.reason,
      model: r.model,
      tools: r.tools,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      finalTextPreview: r.finalText.slice(0, 2000),
      driftOk: r.driftOk,
      driftDetail: r.driftDetail,
    })),
  };
}

export async function runAssistantTuneReport(): Promise<TuneReportResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY ist nicht gesetzt.");
  }
  const client = new Anthropic({ apiKey });
  return runTuneReportGeneration(client, {});
}
