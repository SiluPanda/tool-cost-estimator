// Types for tool-cost-estimator

export interface JsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}

export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: JsonSchema;
  };
}

export interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema?: JsonSchema;
}

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
}

export type ToolDefinition = OpenAIToolDefinition | AnthropicToolDefinition | MCPToolDefinition;

export interface EstimateToolsOptions {
  provider?: string;
  contextWindow?: number;
  tokenizer?: 'heuristic';
}

export interface ToolBreakdown {
  nameTokens: number;
  descriptionTokens: number;
  parameterTokens: number;
  structuralTokens: number;
}

export interface ToolAnalysis {
  name: string;
  totalTokens: number;
  breakdown: ToolBreakdown;
  percentOfTotal: number;
  parameterCount: number;
  requiredParameterCount: number;
  enumParameterCount: number;
  descriptionLength: number;
  maxNestingDepth: number;
}

export interface ToolStats {
  meanTokensPerTool: number;
  medianTokensPerTool: number;
  minTokens: number;
  maxTokens: number;
}

export interface ToolCostReport {
  totalTokens: number;
  preambleTokens: number;
  perTool: ToolAnalysis[];
  toolCount: number;
  contextWindowPercent: number;
  contextWindow: number;
  provider: string;
  tokenizer: string;
  stats: ToolStats;
}

export interface RankedTool {
  rank: number;
  name: string;
  totalTokens: number;
}

export interface ToolSetAnalysis extends ToolCostReport {
  outliers: ToolAnalysis[];
  ranking: RankedTool[];
  contextWindowUsage: Record<string, number>;
}

export interface OptimizationSuggestion {
  toolName: string;
  type: string;
  message: string;
  estimatedSavings: number;
  priority: number;
  severity: 'high' | 'medium' | 'low';
}

export interface Estimator {
  estimate: (tools: ToolDefinition[], options?: EstimateToolsOptions) => ToolCostReport;
  analyze: (tools: ToolDefinition[], options?: EstimateToolsOptions) => ToolSetAnalysis;
  suggest: (tools: ToolDefinition[], options?: EstimateToolsOptions) => OptimizationSuggestion[];
}

export interface EstimatorConfig {
  provider?: string;
  contextWindow?: number;
  tokenizer?: 'heuristic';
}
