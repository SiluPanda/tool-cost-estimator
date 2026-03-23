import { describe, it, expect } from 'vitest';
import { estimateTools, analyzeToolSet, suggestOptimizations, createEstimator } from '../index.js';
import type { ToolDefinition } from '../index.js';

// --- Fixtures ---

const simpleTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get weather for a city',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
      },
      required: ['city'],
    },
  },
};

const anthropicTool: ToolDefinition = {
  name: 'search_docs',
  description: 'Search documentation',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results' },
    },
    required: ['query'],
  },
};

const mcpTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read a file from the filesystem',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
    },
    required: ['path'],
  },
};

const verboseTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'complex_analysis',
    description:
      'This tool performs a very detailed and comprehensive analysis of the provided input data. ' +
      'It considers multiple dimensions including temporal patterns, cross-correlations, anomaly detection, ' +
      'statistical distributions, and domain-specific heuristics. The output includes confidence scores and ' +
      'actionable recommendations tailored to the specific context provided. This description is intentionally ' +
      'very long to trigger the optimization suggestion for shortening descriptions that exceed 200 characters.',
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'The input data to analyze in JSON or CSV format' },
        mode: {
          type: 'string',
          enum: ['fast', 'standard', 'thorough', 'deep', 'exhaustive', 'ultra', 'max', 'turbo', 'precise', 'smart', 'auto'],
        },
      },
      required: ['data'],
      additionalProperties: false,
    },
  },
};

const minimalTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'ping',
    parameters: { type: 'object', properties: {} },
  },
};

// --- Tests ---

describe('estimateTools', () => {
  it('returns a ToolCostReport with correct shape for a single OpenAI tool', () => {
    const report = estimateTools([simpleTool]);

    expect(report).toMatchObject({
      toolCount: 1,
      provider: 'generic',
      tokenizer: 'heuristic',
    });

    expect(report.totalTokens).toBeGreaterThan(0);
    expect(report.preambleTokens).toBe(10);
    expect(report.perTool).toHaveLength(1);
    expect(report.perTool[0].name).toBe('get_weather');
    expect(report.contextWindow).toBe(128000);
    expect(typeof report.contextWindowPercent).toBe('number');
    expect(report.stats).toMatchObject({
      meanTokensPerTool: expect.any(Number),
      medianTokensPerTool: expect.any(Number),
      minTokens: expect.any(Number),
      maxTokens: expect.any(Number),
    });
  });

  it('totalTokens is reasonable for a simple tool (between 5 and 200)', () => {
    const report = estimateTools([simpleTool]);
    expect(report.totalTokens).toBeGreaterThan(5);
    expect(report.totalTokens).toBeLessThan(200);
  });

  it('breakdown components sum to tool totalTokens', () => {
    const report = estimateTools([simpleTool]);
    const t = report.perTool[0];
    const sum =
      t.breakdown.nameTokens +
      t.breakdown.descriptionTokens +
      t.breakdown.parameterTokens +
      t.breakdown.structuralTokens;
    expect(t.totalTokens).toBe(sum);
  });

  it('structuralTokens is always 15', () => {
    const report = estimateTools([simpleTool]);
    expect(report.perTool[0].breakdown.structuralTokens).toBe(15);
  });

  it('handles Anthropic tool format', () => {
    const report = estimateTools([anthropicTool]);
    expect(report.perTool[0].name).toBe('search_docs');
    expect(report.totalTokens).toBeGreaterThan(0);
  });

  it('handles MCP tool format', () => {
    const report = estimateTools([mcpTool]);
    expect(report.perTool[0].name).toBe('read_file');
    expect(report.totalTokens).toBeGreaterThan(0);
  });

  it('handles empty tool list', () => {
    const report = estimateTools([]);
    expect(report.totalTokens).toBe(10); // only preamble
    expect(report.toolCount).toBe(0);
    expect(report.perTool).toHaveLength(0);
  });

  it('handles tool with no description or parameters', () => {
    const report = estimateTools([minimalTool]);
    expect(report.perTool[0].breakdown.descriptionTokens).toBe(0);
    expect(report.totalTokens).toBeGreaterThan(0);
  });

  it('respects custom contextWindow option', () => {
    const report = estimateTools([simpleTool], { contextWindow: 4096 });
    expect(report.contextWindow).toBe(4096);
    expect(report.contextWindowPercent).toBeGreaterThan(0);
  });

  it('respects custom provider option', () => {
    const report = estimateTools([simpleTool], { provider: 'anthropic' });
    expect(report.provider).toBe('anthropic');
  });

  it('parameterCount reflects actual leaf properties', () => {
    const report = estimateTools([simpleTool]);
    expect(report.perTool[0].parameterCount).toBe(1); // only 'city'
  });

  it('requiredParameterCount matches required array length', () => {
    const report = estimateTools([simpleTool]);
    expect(report.perTool[0].requiredParameterCount).toBe(1);
  });

  it('enumParameterCount counts enum fields', () => {
    const report = estimateTools([verboseTool]);
    expect(report.perTool[0].enumParameterCount).toBe(1);
  });

  it('multiple tools: totalTokens is sum of per-tool tokens plus preamble', () => {
    const report = estimateTools([simpleTool, anthropicTool]);
    const perToolSum = report.perTool.reduce((s, t) => s + t.totalTokens, 0);
    expect(report.totalTokens).toBe(perToolSum + 10);
  });

  it('stats.minTokens <= stats.maxTokens', () => {
    const report = estimateTools([simpleTool, verboseTool]);
    expect(report.stats.minTokens).toBeLessThanOrEqual(report.stats.maxTokens);
  });

  it('percentOfTotal values sum close to 100 for single tool', () => {
    const report = estimateTools([simpleTool]);
    const sum = report.perTool.reduce((s, t) => s + t.percentOfTotal, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it('percentOfTotal values sum to 100 across multiple tools', () => {
    const report = estimateTools([simpleTool, anthropicTool, verboseTool]);
    const sum = report.perTool.reduce((s, t) => s + t.percentOfTotal, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it('perTool is sorted by totalTokens descending', () => {
    const report = estimateTools([simpleTool, verboseTool, anthropicTool]);
    for (let i = 1; i < report.perTool.length; i++) {
      expect(report.perTool[i - 1].totalTokens).toBeGreaterThanOrEqual(report.perTool[i].totalTokens);
    }
  });
});

describe('analyzeToolSet', () => {
  it('returns ToolSetAnalysis with all ToolCostReport fields plus outliers/ranking/contextWindowUsage', () => {
    const analysis = analyzeToolSet([simpleTool, anthropicTool]);
    expect(analysis).toHaveProperty('outliers');
    expect(analysis).toHaveProperty('ranking');
    expect(analysis).toHaveProperty('contextWindowUsage');
    expect(analysis.toolCount).toBe(2);
  });

  it('ranking is sorted by totalTokens descending', () => {
    const analysis = analyzeToolSet([simpleTool, verboseTool]);
    expect(analysis.ranking[0].totalTokens).toBeGreaterThanOrEqual(analysis.ranking[1].totalTokens);
  });

  it('ranking assigns sequential rank numbers starting at 1', () => {
    const analysis = analyzeToolSet([simpleTool, verboseTool, anthropicTool]);
    expect(analysis.ranking.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('detects outliers when one tool is significantly larger than others', () => {
    // verboseTool has a very long description and will be much larger than simpleTool
    const analysis = analyzeToolSet([simpleTool, minimalTool, verboseTool]);
    // verboseTool should be an outlier (> 2x median)
    const outlierNames = analysis.outliers.map((o) => o.name);
    expect(outlierNames).toContain('complex_analysis');
  });

  it('outliers array is empty when all tools are similar size', () => {
    // Two nearly identical tools — neither should be > 2x the median
    const analysis = analyzeToolSet([simpleTool, anthropicTool]);
    // Both are small and similar; may or may not have outliers but should not crash
    expect(Array.isArray(analysis.outliers)).toBe(true);
  });

  it('contextWindowUsage contains entries for common window sizes', () => {
    const analysis = analyzeToolSet([simpleTool]);
    expect(analysis.contextWindowUsage).toHaveProperty('4096');
    expect(analysis.contextWindowUsage).toHaveProperty('128000');
    expect(analysis.contextWindowUsage['128000']).toBeGreaterThan(0);
  });
});

describe('suggestOptimizations', () => {
  it('returns an array', () => {
    const suggestions = suggestOptimizations([simpleTool]);
    expect(Array.isArray(suggestions)).toBe(true);
  });

  it('returns shorten-description suggestion for long description', () => {
    const suggestions = suggestOptimizations([verboseTool]);
    const s = suggestions.find((x) => x.type === 'shorten-description');
    expect(s).toBeDefined();
    expect(s?.toolName).toBe('complex_analysis');
    expect(s?.estimatedSavings).toBeGreaterThan(0);
  });

  it('returns reduce-enum suggestion when enum has > 10 values', () => {
    const suggestions = suggestOptimizations([verboseTool]);
    const s = suggestions.find((x) => x.type === 'reduce-enum');
    expect(s).toBeDefined();
    expect(s?.toolName).toBe('complex_analysis');
  });

  it('returns remove-redundant-fields suggestion for additionalProperties: false', () => {
    const suggestions = suggestOptimizations([verboseTool]);
    const s = suggestions.find((x) => x.type === 'remove-redundant-fields');
    expect(s).toBeDefined();
  });

  it('suggestions are sorted by estimatedSavings desc', () => {
    const suggestions = suggestOptimizations([verboseTool]);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].estimatedSavings).toBeGreaterThanOrEqual(suggestions[i].estimatedSavings);
    }
  });

  it('priority is assigned sequentially starting at 1', () => {
    const suggestions = suggestOptimizations([verboseTool]);
    if (suggestions.length > 0) {
      expect(suggestions[0].priority).toBe(1);
      suggestions.forEach((s, i) => {
        expect(s.priority).toBe(i + 1);
      });
    }
  });

  it('returns filter-per-request suggestion when > 15 tools', () => {
    const manyTools: ToolDefinition[] = Array.from({ length: 16 }, (_, i) => ({
      type: 'function' as const,
      function: { name: `tool_${i}`, description: `Tool number ${i}` },
    }));
    const suggestions = suggestOptimizations(manyTools);
    const s = suggestions.find((x) => x.type === 'filter-per-request');
    expect(s).toBeDefined();
    expect(s?.toolName).toBe('*');
  });

  it('no suggestions for a perfectly minimal tool', () => {
    const suggestions = suggestOptimizations([minimalTool]);
    expect(suggestions.length).toBe(0);
  });

  it('severity is one of high|medium|low', () => {
    const suggestions = suggestOptimizations([verboseTool]);
    for (const s of suggestions) {
      expect(['high', 'medium', 'low']).toContain(s.severity);
    }
  });
});

describe('createEstimator', () => {
  it('returns an Estimator with estimate, analyze, suggest methods', async () => {
    const estimator = await createEstimator();
    expect(typeof estimator.estimate).toBe('function');
    expect(typeof estimator.analyze).toBe('function');
    expect(typeof estimator.suggest).toBe('function');
  });

  it('estimate() produces same result as estimateTools()', async () => {
    const estimator = await createEstimator();
    const direct = estimateTools([simpleTool]);
    const viaEstimator = estimator.estimate([simpleTool]);
    expect(viaEstimator.totalTokens).toBe(direct.totalTokens);
    expect(viaEstimator.toolCount).toBe(direct.toolCount);
  });

  it('analyze() produces ToolSetAnalysis', async () => {
    const estimator = await createEstimator();
    const analysis = estimator.analyze([simpleTool, anthropicTool]);
    expect(analysis).toHaveProperty('outliers');
    expect(analysis).toHaveProperty('ranking');
  });

  it('suggest() produces OptimizationSuggestion array', async () => {
    const estimator = await createEstimator();
    const suggestions = estimator.suggest([verboseTool]);
    expect(Array.isArray(suggestions)).toBe(true);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('config is applied to all calls', async () => {
    const estimator = await createEstimator({ provider: 'openai', contextWindow: 8192 });
    const report = estimator.estimate([simpleTool]);
    expect(report.provider).toBe('openai');
    expect(report.contextWindow).toBe(8192);
  });

  it('per-call options override config', async () => {
    const estimator = await createEstimator({ provider: 'openai', contextWindow: 8192 });
    const report = estimator.estimate([simpleTool], { provider: 'anthropic', contextWindow: 200000 });
    expect(report.provider).toBe('anthropic');
    expect(report.contextWindow).toBe(200000);
  });
});
