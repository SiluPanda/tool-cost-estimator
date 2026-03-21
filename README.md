# tool-cost-estimator

Estimate the token cost of LLM tool definitions in the context window. Supports OpenAI, Anthropic, and MCP tool formats.

## Install

```bash
npm install tool-cost-estimator
```

## Quick Start

### estimateTools()

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
        properties: { city: { type: 'string', description: 'City name' } },
        required: ['city'],
      },
    },
  },
];

const report = estimateTools(tools);
console.log(report.totalTokens);           // total tokens for all tools
console.log(report.contextWindowPercent);  // % of context window used
console.log(report.perTool[0].breakdown);  // per-component breakdown
```

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `provider` | `string` | `'generic'` | Provider label (e.g. `'openai'`, `'anthropic'`) |
| `contextWindow` | `number` | `128000` | Context window size for percentage calculation |
| `tokenizer` | `'heuristic'` | `'heuristic'` | Tokenization method |

### analyzeToolSet()

Returns `ToolSetAnalysis` which extends `ToolCostReport` with:
- `outliers` — tools using > 2x the median tokens
- `ranking` — all tools sorted by token cost descending
- `contextWindowUsage` — percentage usage at multiple common window sizes

```typescript
import { analyzeToolSet } from 'tool-cost-estimator';

const analysis = analyzeToolSet(tools);
console.log(analysis.outliers);            // token-heavy tools
console.log(analysis.ranking);             // ranked by cost
console.log(analysis.contextWindowUsage);  // e.g. { '4096': 2.4, '128000': 0.07 }
```

### suggestOptimizations()

Returns a prioritized list of `OptimizationSuggestion` objects sorted by estimated token savings.

```typescript
import { suggestOptimizations } from 'tool-cost-estimator';

const suggestions = suggestOptimizations(tools);
for (const s of suggestions) {
  console.log(`[${s.severity}] ${s.toolName}: ${s.message} (saves ~${s.estimatedSavings} tokens)`);
}
```

**Optimization rules:**

| Type | Trigger | Severity |
|---|---|---|
| `shorten-description` | Tool description > 200 chars | medium/high |
| `trim-param-descriptions` | Parameter description > 100 chars | low |
| `reduce-enum` | Enum with > 10 values | medium |
| `remove-optional-params` | > 5 optional parameters | medium |
| `flatten-schema` | Nesting depth > 2 | medium/high |
| `filter-per-request` | Total tools > 15 | medium/high |
| `remove-redundant-fields` | `additionalProperties: false` | low |

### createEstimator()

Factory function that returns an `Estimator` bound to a default config. Async for future tiktoken WASM support.

```typescript
import { createEstimator } from 'tool-cost-estimator';

const estimator = await createEstimator({ provider: 'openai', contextWindow: 32768 });

const report = estimator.estimate(tools);
const analysis = estimator.analyze(tools);
const suggestions = estimator.suggest(tools);
```

## Supported Formats

```typescript
// OpenAI
{ type: 'function', function: { name, description?, parameters? } }

// Anthropic
{ name, description?, input_schema? }

// MCP
{ name, description?, inputSchema? }
```

Format is auto-detected from the tool shape.

## License

MIT
