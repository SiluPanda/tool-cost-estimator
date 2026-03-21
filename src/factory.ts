import type { Estimator, EstimatorConfig, EstimateToolsOptions, ToolDefinition } from './types.js';
import { estimateTools, analyzeToolSet, suggestOptimizations } from './estimate.js';

export async function createEstimator(config?: EstimatorConfig): Promise<Estimator> {
  // Async for future tiktoken WASM support; currently resolves immediately
  const baseOptions: EstimateToolsOptions = {
    provider: config?.provider,
    contextWindow: config?.contextWindow,
    tokenizer: config?.tokenizer,
  };

  return {
    estimate: (tools: ToolDefinition[], options?: EstimateToolsOptions) =>
      estimateTools(tools, { ...baseOptions, ...options }),
    analyze: (tools: ToolDefinition[], options?: EstimateToolsOptions) =>
      analyzeToolSet(tools, { ...baseOptions, ...options }),
    suggest: (tools: ToolDefinition[], options?: EstimateToolsOptions) =>
      suggestOptimizations(tools, { ...baseOptions, ...options }),
  };
}
