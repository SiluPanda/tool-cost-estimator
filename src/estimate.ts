import type {
  ToolDefinition,
  EstimateToolsOptions,
  ToolCostReport,
  ToolAnalysis,
  ToolSetAnalysis,
  OptimizationSuggestion,
  RankedTool,
} from './types.js';
import { normalizeToolName, normalizeDescription, normalizeSchema } from './detect.js';
import { countProperties, countEnumParams, getRequiredCount, getMaxNestingDepth } from './schema-walker.js';
import { heuristicCount, countSchemaTokens } from './tokenizer.js';

const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_PROVIDER = 'generic';
const DEFAULT_TOKENIZER = 'heuristic';
const STRUCTURAL_TOKENS = 15;
const PREAMBLE_TOKENS = 10;

function getCounter(_tokenizer: string): (s: string) => number {
  return heuristicCount;
}

function computeMedian(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function estimateTools(
  tools: ToolDefinition[],
  options?: EstimateToolsOptions
): ToolCostReport {
  const provider = options?.provider ?? DEFAULT_PROVIDER;
  const contextWindow = options?.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const tokenizer = options?.tokenizer ?? DEFAULT_TOKENIZER;
  const counter = getCounter(tokenizer);

  const perTool: ToolAnalysis[] = tools.map((tool) => {
    const name = normalizeToolName(tool);
    const description = normalizeDescription(tool);
    const schema = normalizeSchema(tool);

    const nameTokens = counter(name);
    const descriptionTokens = counter(description ?? '');
    const parameterTokens = countSchemaTokens(schema, counter);
    const structuralTokens = STRUCTURAL_TOKENS;
    const totalTokens = nameTokens + descriptionTokens + parameterTokens + structuralTokens;

    return {
      name,
      totalTokens,
      breakdown: { nameTokens, descriptionTokens, parameterTokens, structuralTokens },
      percentOfTotal: 0, // filled below
      parameterCount: countProperties(schema),
      requiredParameterCount: getRequiredCount(schema),
      enumParameterCount: countEnumParams(schema),
      descriptionLength: description?.length ?? 0,
      maxNestingDepth: getMaxNestingDepth(schema),
    };
  });

  const totalTokens = perTool.reduce((sum, t) => sum + t.totalTokens, 0) + PREAMBLE_TOKENS;

  // Fill percentOfTotal
  for (const t of perTool) {
    t.percentOfTotal = totalTokens > 0 ? (t.totalTokens / totalTokens) * 100 : 0;
  }

  const toolTokens = perTool.map((t) => t.totalTokens).sort((a, b) => a - b);
  const mean = toolTokens.length > 0 ? toolTokens.reduce((s, v) => s + v, 0) / toolTokens.length : 0;
  const median = computeMedian(toolTokens);
  const minTokens = toolTokens.length > 0 ? toolTokens[0] : 0;
  const maxTokens = toolTokens.length > 0 ? toolTokens[toolTokens.length - 1] : 0;

  return {
    totalTokens,
    preambleTokens: PREAMBLE_TOKENS,
    perTool,
    toolCount: tools.length,
    contextWindowPercent: (totalTokens / contextWindow) * 100,
    contextWindow,
    provider,
    tokenizer,
    stats: {
      meanTokensPerTool: mean,
      medianTokensPerTool: median,
      minTokens,
      maxTokens,
    },
  };
}

export function analyzeToolSet(
  tools: ToolDefinition[],
  options?: EstimateToolsOptions
): ToolSetAnalysis {
  const report = estimateTools(tools, options);
  const median = report.stats.medianTokensPerTool;

  const outliers = report.perTool.filter((t) => t.totalTokens > 2 * median);

  const ranking: RankedTool[] = report.perTool
    .slice()
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .map((t, i) => ({ rank: i + 1, name: t.name, totalTokens: t.totalTokens }));

  const commonWindowSizes = [4096, 8192, 16384, 32768, 65536, 128000, 200000];
  const contextWindowUsage: Record<string, number> = {};
  for (const size of commonWindowSizes) {
    contextWindowUsage[String(size)] = (report.totalTokens / size) * 100;
  }

  return {
    ...report,
    outliers,
    ranking,
    contextWindowUsage,
  };
}

export function suggestOptimizations(
  tools: ToolDefinition[],
  options?: EstimateToolsOptions
): OptimizationSuggestion[] {
  const report = estimateTools(tools, options);
  const counter = getCounter(options?.tokenizer ?? DEFAULT_TOKENIZER);
  const suggestions: OptimizationSuggestion[] = [];

  for (const analysis of report.perTool) {
    const tool = tools.find((t) => normalizeToolName(t) === analysis.name);
    if (!tool) continue;
    const description = normalizeDescription(tool);
    const schema = normalizeSchema(tool);

    // Rule 1: shorten-description — tool description > 200 chars
    if (description && description.length > 200) {
      const excess = description.length - 200;
      const savings = Math.ceil(excess / 3.9);
      suggestions.push({
        toolName: analysis.name,
        type: 'shorten-description',
        message: `Description is ${description.length} chars; trim to ~200 chars to save ~${savings} tokens.`,
        estimatedSavings: savings,
        priority: 0,
        severity: description.length > 500 ? 'high' : 'medium',
      });
    }

    // Rule 2: trim-param-descriptions — any param description > 100 chars
    if (schema && schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        const v = value as { description?: string };
        if (v.description && v.description.length > 100) {
          const excess = v.description.length - 100;
          const savings = Math.ceil(excess / 3.9);
          suggestions.push({
            toolName: analysis.name,
            type: 'trim-param-descriptions',
            message: `Parameter "${key}" description is ${v.description.length} chars; trim to ~100 chars to save ~${savings} tokens.`,
            estimatedSavings: savings,
            priority: 0,
            severity: 'low',
          });
        }
      }
    }

    // Rule 3: reduce-enum — enum with > 10 values
    if (schema && schema.properties) {
      for (const [key, value] of Object.entries(schema.properties)) {
        const v = value as { enum?: unknown[] };
        if (v.enum && v.enum.length > 10) {
          const savings = counter(v.enum.slice(10).map(String).join(' '));
          suggestions.push({
            toolName: analysis.name,
            type: 'reduce-enum',
            message: `Parameter "${key}" has ${v.enum.length} enum values; reduce to ≤10 to save ~${savings} tokens.`,
            estimatedSavings: savings,
            priority: 0,
            severity: 'medium',
          });
        }
      }
    }

    // Rule 4: remove-optional-params — tool with > 5 optional params
    const optionalCount = analysis.parameterCount - analysis.requiredParameterCount;
    if (optionalCount > 5) {
      const savings = optionalCount * 5; // rough estimate: ~5 tokens per optional param
      suggestions.push({
        toolName: analysis.name,
        type: 'remove-optional-params',
        message: `Tool has ${optionalCount} optional parameters; consider removing rarely-used ones to save ~${savings} tokens.`,
        estimatedSavings: savings,
        priority: 0,
        severity: 'medium',
      });
    }

    // Rule 5: flatten-schema — nesting depth > 2
    if (analysis.maxNestingDepth > 2) {
      const savings = (analysis.maxNestingDepth - 2) * 10;
      suggestions.push({
        toolName: analysis.name,
        type: 'flatten-schema',
        message: `Schema nesting depth is ${analysis.maxNestingDepth}; flatten to ≤2 levels to save ~${savings} tokens.`,
        estimatedSavings: savings,
        priority: 0,
        severity: analysis.maxNestingDepth > 4 ? 'high' : 'medium',
      });
    }

    // Rule 7: remove-redundant-fields — schema has additionalProperties: false
    if (schema && schema.additionalProperties === false) {
      const savings = 3;
      suggestions.push({
        toolName: analysis.name,
        type: 'remove-redundant-fields',
        message: `Schema has "additionalProperties: false" which is redundant for LLMs; removing it saves ~${savings} tokens.`,
        estimatedSavings: savings,
        priority: 0,
        severity: 'low',
      });
    }
  }

  // Rule 6: filter-per-request — total tools > 15
  if (tools.length > 15) {
    const savings = (tools.length - 15) * Math.round(report.stats.meanTokensPerTool);
    suggestions.push({
      toolName: '*',
      type: 'filter-per-request',
      message: `${tools.length} tools in context; filter to ≤15 per request to save ~${savings} tokens.`,
      estimatedSavings: savings,
      priority: 0,
      severity: tools.length > 25 ? 'high' : 'medium',
    });
  }

  // Sort by estimatedSavings desc, assign priority
  suggestions.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
  suggestions.forEach((s, i) => {
    s.priority = i + 1;
  });

  return suggestions;
}
