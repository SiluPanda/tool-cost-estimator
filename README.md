# tool-cost-estimator

Estimate the token cost of LLM tool definitions in the context window.

[![npm version](https://img.shields.io/npm/v/tool-cost-estimator.svg)](https://www.npmjs.com/package/tool-cost-estimator)
[![npm downloads](https://img.shields.io/npm/dt/tool-cost-estimator.svg)](https://www.npmjs.com/package/tool-cost-estimator)
[![license](https://img.shields.io/npm/l/tool-cost-estimator.svg)](https://github.com/SiluPanda/tool-cost-estimator/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/tool-cost-estimator.svg)](https://nodejs.org)

---

## Description

Tool definitions are invisible cost multipliers. When you register 20 tools with an LLM API, those schemas are serialized into the prompt on every request. Each tool typically consumes 200--500 tokens depending on schema complexity. A 20-tool application silently spends 4,000--10,000 tokens before the first user message is processed. This overhead is billed on every request but never appears in the conversation.

`tool-cost-estimator` answers the question: **how many tokens are my tools burning before any conversation starts?**

Given an array of tool definitions in OpenAI, Anthropic, or MCP format, it counts the tokens each definition consumes, produces a per-tool breakdown, computes the total overhead as a fraction of the context window, and returns actionable optimization suggestions to reduce that overhead. Zero runtime dependencies. Works synchronously by default with a built-in heuristic tokenizer.

---

## Installation

```bash
npm install tool-cost-estimator
```

Requires Node.js 18 or later.

---

## Quick Start

```typescript
import { estimateTools } from 'tool-cost-estimator';

const tools = [
  {
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
  },
];

const report = estimateTools(tools);

console.log(report.totalTokens);          // total tokens consumed by all tools
console.log(report.contextWindowPercent);  // percentage of context window used
console.log(report.perTool[0].breakdown);  // per-component token breakdown
console.log(report.stats);                 // mean, median, min, max tokens per tool
```

---

## Features

- **Multi-format support** -- Accepts OpenAI function calling, Anthropic tool use, and MCP tool definition formats. Auto-detects the format from the tool shape.
- **Per-tool token breakdown** -- Breaks each tool's cost into name, description, parameter, and structural token counts.
- **Context window analysis** -- Reports what percentage of the context window your tools consume at multiple common window sizes (4K through 200K).
- **Outlier detection** -- Identifies tools that consume disproportionately more tokens than the median.
- **Optimization suggestions** -- Returns prioritized, actionable suggestions: shorten verbose descriptions, trim parameter descriptions, reduce large enums, remove optional parameters, flatten nested schemas, filter tools per request, and remove redundant schema fields.
- **Factory pattern** -- `createEstimator()` returns a pre-configured estimator instance that can be reused across multiple calls.
- **Zero runtime dependencies** -- Token counting uses a built-in heuristic (calibrated at ~3.9 characters per token for JSON/TypeScript syntax). No external tokenizer required.
- **Synchronous by default** -- `estimateTools()`, `analyzeToolSet()`, and `suggestOptimizations()` are all synchronous. No async overhead for the common case.
- **Full TypeScript support** -- Ships with declaration files and complete type exports.

---

## API Reference

### `estimateTools(tools, options?)`

The primary entry point. Estimates the token cost of an array of tool definitions and returns a structured report.

```typescript
import { estimateTools } from 'tool-cost-estimator';

const report = estimateTools(tools);
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `tools` | `ToolDefinition[]` | Array of tool definitions in OpenAI, Anthropic, or MCP format |
| `options` | `EstimateToolsOptions` | Optional configuration (see below) |

**Returns:** `ToolCostReport`

```typescript
interface ToolCostReport {
  totalTokens: number;          // sum of all per-tool tokens plus preamble
  preambleTokens: number;       // fixed overhead tokens (10)
  perTool: ToolAnalysis[];      // per-tool breakdown
  toolCount: number;            // number of tools
  contextWindowPercent: number;  // (totalTokens / contextWindow) * 100
  contextWindow: number;        // context window size used for calculation
  provider: string;             // provider label
  tokenizer: string;            // tokenizer method used
  stats: ToolStats;             // aggregate statistics
}
```

Each `ToolAnalysis` contains:

```typescript
interface ToolAnalysis {
  name: string;                   // tool name
  totalTokens: number;            // total tokens for this tool
  breakdown: ToolBreakdown;       // per-component token counts
  percentOfTotal: number;         // this tool's share of total tokens
  parameterCount: number;         // number of leaf parameters
  requiredParameterCount: number; // number of required parameters
  enumParameterCount: number;     // number of parameters with enum constraints
  descriptionLength: number;      // character length of description
  maxNestingDepth: number;        // deepest nesting level in the schema
}

interface ToolBreakdown {
  nameTokens: number;        // tokens from the tool name
  descriptionTokens: number; // tokens from the description text
  parameterTokens: number;   // tokens from all parameter definitions
  structuralTokens: number;  // fixed structural overhead (15 tokens)
}

interface ToolStats {
  meanTokensPerTool: number;
  medianTokensPerTool: number;
  minTokens: number;
  maxTokens: number;
}
```

---

### `analyzeToolSet(tools, options?)`

Extends `estimateTools()` with outlier detection, ranking, and multi-window context usage analysis.

```typescript
import { analyzeToolSet } from 'tool-cost-estimator';

const analysis = analyzeToolSet(tools);

console.log(analysis.outliers);           // tools consuming > 2x the median
console.log(analysis.ranking);            // all tools ranked by token cost
console.log(analysis.contextWindowUsage); // usage at multiple window sizes
```

**Returns:** `ToolSetAnalysis` (extends `ToolCostReport`)

```typescript
interface ToolSetAnalysis extends ToolCostReport {
  outliers: ToolAnalysis[];                  // tools exceeding 2x the median
  ranking: RankedTool[];                     // sorted by totalTokens descending
  contextWindowUsage: Record<string, number>; // percentage at each window size
}

interface RankedTool {
  rank: number;       // 1-indexed rank
  name: string;       // tool name
  totalTokens: number; // total tokens for this tool
}
```

The `contextWindowUsage` map includes entries for these common window sizes: 4096, 8192, 16384, 32768, 65536, 128000, and 200000.

A tool is classified as an outlier when its `totalTokens` exceeds 2x the median token count across all tools.

---

### `suggestOptimizations(tools, options?)`

Analyzes tool definitions and returns a prioritized list of optimization suggestions sorted by estimated token savings (highest first).

```typescript
import { suggestOptimizations } from 'tool-cost-estimator';

const suggestions = suggestOptimizations(tools);

for (const s of suggestions) {
  console.log(`[${s.severity}] ${s.toolName}: ${s.message} (saves ~${s.estimatedSavings} tokens)`);
}
```

**Returns:** `OptimizationSuggestion[]`

```typescript
interface OptimizationSuggestion {
  toolName: string;                    // tool name, or '*' for cross-tool suggestions
  type: string;                        // rule identifier
  message: string;                     // human-readable suggestion
  estimatedSavings: number;            // estimated token savings
  priority: number;                    // 1 = highest priority (most savings)
  severity: 'high' | 'medium' | 'low'; // impact level
}
```

**Optimization rules:**

| Rule | Trigger | Severity |
|---|---|---|
| `shorten-description` | Tool description exceeds 200 characters | `medium` (or `high` if > 500 chars) |
| `trim-param-descriptions` | Any parameter description exceeds 100 characters | `low` |
| `reduce-enum` | Any parameter has more than 10 enum values | `medium` |
| `remove-optional-params` | Tool has more than 5 optional parameters | `medium` |
| `flatten-schema` | Schema nesting depth exceeds 2 levels | `medium` (or `high` if > 4 levels) |
| `filter-per-request` | Total tool count exceeds 15 | `medium` (or `high` if > 25 tools) |
| `remove-redundant-fields` | Schema has `additionalProperties: false` | `low` |

---

### `createEstimator(config?)`

Async factory function that returns a pre-configured `Estimator` instance. The returned estimator binds configuration to its `estimate()`, `analyze()`, and `suggest()` methods, so you do not need to pass options on every call.

```typescript
import { createEstimator } from 'tool-cost-estimator';

const estimator = await createEstimator({
  provider: 'openai',
  contextWindow: 32768,
});

const report = estimator.estimate(tools);
const analysis = estimator.analyze(tools);
const suggestions = estimator.suggest(tools);
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `config` | `EstimatorConfig` | Optional configuration to bind to the estimator |

```typescript
interface EstimatorConfig {
  provider?: string;       // provider label (e.g., 'openai', 'anthropic')
  contextWindow?: number;  // context window size for percentage calculations
  tokenizer?: 'heuristic'; // tokenization method
}
```

**Returns:** `Promise<Estimator>`

```typescript
interface Estimator {
  estimate: (tools: ToolDefinition[], options?: EstimateToolsOptions) => ToolCostReport;
  analyze: (tools: ToolDefinition[], options?: EstimateToolsOptions) => ToolSetAnalysis;
  suggest: (tools: ToolDefinition[], options?: EstimateToolsOptions) => OptimizationSuggestion[];
}
```

Per-call options passed to `estimate()`, `analyze()`, or `suggest()` override the bound configuration.

---

## Configuration

### `EstimateToolsOptions`

All API functions accept an optional `EstimateToolsOptions` object:

| Option | Type | Default | Description |
|---|---|---|---|
| `provider` | `string` | `'generic'` | Provider label used in the report. Does not affect token counting logic. |
| `contextWindow` | `number` | `128000` | Context window size in tokens. Used to calculate `contextWindowPercent`. |
| `tokenizer` | `'heuristic'` | `'heuristic'` | Tokenization strategy. The heuristic uses `Math.ceil(text.length / 3.9)`. |

```typescript
const report = estimateTools(tools, {
  provider: 'openai',
  contextWindow: 32768,
  tokenizer: 'heuristic',
});
```

---

## Supported Tool Formats

The library auto-detects the tool format from the object shape. All three major formats are supported:

### OpenAI Function Calling

```typescript
const tool = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: 'Get current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
      },
      required: ['city'],
    },
  },
};
```

Detected when the object has `type: 'function'` and a `function.name` property.

### Anthropic Tool Use

```typescript
const tool = {
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
```

Detected when the object has a `name` property and uses `input_schema` (or has no schema key at all).

### MCP Tool Definitions

```typescript
const tool = {
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
```

Detected when the object has a `name` property and uses `inputSchema`.

---

## Error Handling

The library handles edge cases gracefully without throwing:

- **Empty tool arrays** return a report with `totalTokens` equal to the preamble (10 tokens), zero `toolCount`, and empty `perTool`.
- **Tools with no description** produce 0 `descriptionTokens` and 0 `descriptionLength`.
- **Tools with no parameters** (undefined or empty `properties: {}`) produce 0 `parameterTokens`.
- **Deeply nested schemas** are walked recursively. The `maxNestingDepth` field reports the deepest level.
- **`$ref` references** are treated as opaque strings and counted as tokens without resolution.
- **Enum parameters** are counted individually. Large enums (10+ values) trigger the `reduce-enum` optimization suggestion.

---

## Advanced Usage

### Comparing tool sets

Estimate costs before and after optimization to measure savings:

```typescript
import { estimateTools } from 'tool-cost-estimator';

const before = estimateTools(originalTools);
const after = estimateTools(optimizedTools);

const saved = before.totalTokens - after.totalTokens;
console.log(`Saved ${saved} tokens (${((saved / before.totalTokens) * 100).toFixed(1)}% reduction)`);
```

### Context window budgeting

Use `analyzeToolSet()` to understand how tools fit across different model context windows:

```typescript
import { analyzeToolSet } from 'tool-cost-estimator';

const analysis = analyzeToolSet(tools);

for (const [windowSize, percent] of Object.entries(analysis.contextWindowUsage)) {
  console.log(`${windowSize} tokens: ${percent.toFixed(2)}% used by tools`);
}
```

### Identifying expensive tools

Find outliers and target them for optimization:

```typescript
import { analyzeToolSet, suggestOptimizations } from 'tool-cost-estimator';

const analysis = analyzeToolSet(tools);

if (analysis.outliers.length > 0) {
  console.log('Outlier tools (> 2x median token cost):');
  for (const outlier of analysis.outliers) {
    console.log(`  ${outlier.name}: ${outlier.totalTokens} tokens`);
  }
}

const suggestions = suggestOptimizations(tools);
for (const s of suggestions) {
  console.log(`[${s.priority}] ${s.toolName}: ${s.message}`);
}
```

### Reusable estimator with fixed configuration

When analyzing multiple tool sets with the same settings, use `createEstimator()` to avoid repeating configuration:

```typescript
import { createEstimator } from 'tool-cost-estimator';

const estimator = await createEstimator({
  provider: 'anthropic',
  contextWindow: 200000,
});

const chatReport = estimator.estimate(chatTools);
const agentReport = estimator.estimate(agentTools);
const codeReport = estimator.estimate(codeTools);
```

### Mixing formats across calls

Each call auto-detects the tool format independently. A single estimator instance can analyze OpenAI tools in one call and Anthropic tools in the next:

```typescript
const estimator = await createEstimator();

const openaiReport = estimator.estimate(openaiTools, { provider: 'openai' });
const anthropicReport = estimator.estimate(anthropicTools, { provider: 'anthropic' });
```

---

## TypeScript

The package ships with full TypeScript declarations. All types are exported from the main entry point:

```typescript
import type {
  ToolDefinition,
  OpenAIToolDefinition,
  AnthropicToolDefinition,
  MCPToolDefinition,
  JsonSchema,
  EstimateToolsOptions,
  ToolBreakdown,
  ToolAnalysis,
  ToolCostReport,
  ToolStats,
  RankedTool,
  ToolSetAnalysis,
  OptimizationSuggestion,
  Estimator,
  EstimatorConfig,
} from 'tool-cost-estimator';
```

The `ToolDefinition` union type covers all three supported formats:

```typescript
type ToolDefinition = OpenAIToolDefinition | AnthropicToolDefinition | MCPToolDefinition;
```

---

## License

MIT
