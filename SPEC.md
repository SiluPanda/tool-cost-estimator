# tool-cost-estimator -- Specification

## 1. Overview

`tool-cost-estimator` is a static analysis library that estimates the token cost of tool/function definitions in an LLM context window. Given an array of tool definitions (OpenAI function calling format, Anthropic tool use format, or MCP tool schemas), it counts the tokens each definition consumes, produces a per-tool breakdown, computes the total tool overhead as a fraction of the context window, and returns actionable optimization suggestions to reduce that overhead. It answers the question "how many tokens are my tools burning before any conversation even starts?" with a single function call: `estimateTools(tools, options?)`, returning a `ToolCostReport` object with per-tool token counts, total overhead, cost at various model price points, and ranked optimization suggestions.

The gap this package fills is specific and well-defined. Tool definitions are invisible cost multipliers. When a developer registers 20 tools with an LLM API, those tool schemas are serialized into the prompt on every single request. Each tool typically consumes 200-500 tokens depending on schema complexity -- a 20-tool application silently spends 4,000-10,000 tokens before the first user message is even processed. This overhead is billed on every request but never appears in the conversation. Developers rarely measure it because the tool definitions are declared once and passed implicitly. The cost compounds: at GPT-4o pricing ($2.50/MTok input), 8,000 tokens of tool overhead across 10,000 daily requests costs $200/month -- just for tool definitions. No existing package isolates and quantifies this specific cost. `prompt-price` (this monorepo) estimates total request cost including tools, but it does not provide per-tool breakdowns, cross-tool comparison, or optimization suggestions. Developers need a focused tool that answers "which tools are expensive, which are cheap, and how can I reduce the overhead?"

`tool-cost-estimator` provides both a TypeScript/JavaScript API for programmatic use and a CLI for quick terminal-based analysis. The API returns structured `ToolCostReport` objects with per-tool token breakdowns (name, description, parameters, enums, return type), total overhead, percentage of context window consumed, cost projections at different model price points, and prioritized optimization suggestions. The CLI reads tool definitions from JSON files or stdin and prints human-readable or JSON reports. The package is zero-configuration for basic use: import, call `estimateTools(tools)`, get a report.

---

## 2. Goals and Non-Goals

### Goals

- Provide an `estimateTools(tools, options?)` function that accepts tool definitions in OpenAI, Anthropic, or MCP format, counts the tokens each tool consumes, and returns a structured `ToolCostReport` with per-tool breakdowns, total overhead, and cost projections.
- Count tokens for each component of a tool definition separately: the tool name, description text, parameter schema (property names, types, descriptions, enums, defaults, nested objects), required fields array, and return type -- so developers can see exactly where their tokens go.
- Support multiple tool definition formats: OpenAI function calling format (`{ type: 'function', function: { name, description, parameters } }`), Anthropic tool use format (`{ name, description, input_schema }`), and MCP tool definitions (`{ name, description, inputSchema }`). Auto-detect the format or accept an explicit format hint.
- Estimate token cost using the same serialization heuristics that providers use internally: OpenAI serializes tool schemas into a TypeScript-like namespace format; Anthropic and MCP include the JSON Schema directly. The estimator replicates these serializations and counts the resulting tokens.
- Provide `analyzeToolSet(tools)` for aggregate analysis: total token overhead, percentage of context window consumed (at configurable context window sizes), per-tool ranking by token cost, identification of outlier tools that consume disproportionate tokens.
- Provide `suggestOptimizations(tools)` that returns prioritized, actionable optimization suggestions: shorten verbose descriptions, remove unused optional parameters, collapse large enums into string types with validation, remove redundant `additionalProperties: false`, split tool sets by task to avoid loading all tools on every request, merge similar tools into parameterized variants.
- Provide `createEstimator(config)` factory for creating a pre-configured estimator instance with a fixed model/provider, custom token counter, and reusable configuration.
- Provide a CLI (`tool-cost-estimator`) for analyzing tool definition files from the terminal.
- Support cost projection at multiple model price points: given tool token counts, calculate the per-request and per-day/month cost at configurable input token prices.
- Zero mandatory runtime dependencies. Token counting uses a built-in heuristic by default. Optional integration with `js-tiktoken` for exact OpenAI token counts.
- Target Node.js 18+. Use only built-in modules for core functionality.

### Non-Goals

- **Not a prompt cost estimator.** This package estimates the cost of tool definitions only. It does not count message tokens, image tokens, or total request cost. For full request cost estimation, use `prompt-price` from this monorepo.
- **Not a token counter library.** This package uses token counting internally but does not expose a general-purpose tokenizer API. For raw tokenization, use `tiktoken` or `js-tiktoken` directly.
- **Not a tool runtime.** This package analyzes tool definitions statically. It does not invoke tools, validate tool inputs, or route tool calls. For tool routing, use `mcp-tool-router` from this monorepo.
- **Not a schema validator.** This package assumes tool definitions are structurally valid. It does not validate JSON Schema correctness, required field accuracy, or type consistency. For schema transformation, use `schema-bridge` from this monorepo.
- **Not a context window manager.** This package reports how much of the context window tools consume but does not allocate or manage context budgets. For context window budgeting, use `context-budget` from this monorepo.
- **Not a real-time token counter.** This package performs static analysis on tool definitions at rest. It does not hook into API request pipelines or count tokens in flight. The `prompt-price` guard feature handles runtime enforcement.

---

## 3. Target Users and Use Cases

### AI Application Developers

Developers building agents, chatbots, or tool-augmented LLM applications who register many tools and want to understand the hidden token cost. A developer with 30 tools wonders why their context window fills up faster than expected -- `estimateTools()` reveals that tool definitions alone consume 12,000 tokens (9% of a 128K context window), and `suggestOptimizations()` identifies 5 tools with unnecessarily verbose descriptions that could be cut in half. The developer reduces tool overhead by 40% without changing any tool behavior.

### Platform Engineers

Engineers building internal LLM platforms where multiple teams register tools. A platform serving 15 teams with a combined 200+ tools needs to understand the aggregate overhead and set per-team tool token budgets. `analyzeToolSet()` shows that 80% of token overhead comes from 20% of the tools, enabling targeted optimization of the worst offenders. The CLI integrates into CI pipelines to enforce a maximum tool token budget per service.

### FinOps / Cost Optimization Engineers

Engineers tasked with reducing LLM API spend. Tool overhead is a fixed cost per request that scales linearly with request volume. At 100,000 requests/day, even saving 1,000 tokens per request (by optimizing tool descriptions) saves $250/month at GPT-4o input pricing. `estimateTools()` with cost projections quantifies the dollar impact of each optimization, enabling prioritized cost reduction.

### MCP Server Authors

Developers building MCP servers who want to keep their tool definitions lean. An MCP server exposing 50 tools might be rejected by MCP clients that enforce tool token budgets. `suggestOptimizations()` helps authors trim descriptions, simplify parameter schemas, and reduce per-tool token counts before publishing.

### Prompt Engineers

Engineers designing system prompts for tool-augmented applications. When the system prompt, conversation history, and tool definitions must fit within a context window, tools compete directly with prompt content. `analyzeToolSet()` helps prompt engineers understand how much headroom they have after tool definitions consume their share.

---

## 4. Core Concepts

### Tool Definitions as Token Cost

Every tool definition registered with an LLM API is serialized into the prompt context. The model sees the tool schemas as part of its input. Providers bill for these tokens at the standard input token rate. Unlike conversation messages that vary per request, tool definitions are a fixed overhead -- the same tokens are billed on every single request that includes those tools.

The token cost of a tool definition depends on its components:

- **Name**: The tool/function name (e.g., `search_database`). Typically 1-4 tokens.
- **Description**: The natural language description explaining what the tool does and when to use it. This is usually the largest single component, ranging from 10 tokens for a terse description to 200+ tokens for a detailed one with examples and caveats.
- **Parameters**: The JSON Schema defining the tool's input. Each property contributes its name (1-3 tokens), type (1 token), description (5-50 tokens), and constraints (enums, defaults, patterns). Nested objects multiply the cost. A tool with 10 parameters, each with a description, easily reaches 200-400 tokens for parameters alone.
- **Enums**: String enum constraints are particularly expensive. An enum with 20 values might consume 30-60 tokens. Large enums (50+ values) can dominate a tool's token count.
- **Required fields**: The `required` array adds tokens proportional to the number of required parameters.
- **Structural overhead**: The serialization format itself adds tokens for braces, colons, commas, type keywords, and namespace/function declarations.

### Per-Tool Overhead

Each individual tool adds a baseline overhead regardless of its complexity. In OpenAI's serialization format, every tool gets a function signature wrapper (`type <name> = (_: { ... }) => any;`) plus description comment formatting. This structural overhead is approximately 10-15 tokens per tool even for a tool with no parameters and no description. For Anthropic and MCP, the JSON Schema wrapper adds a similar baseline.

Understanding per-tool overhead matters because it means that even "free" tools (tools with trivial schemas) are not free. Registering 50 trivial tools still costs 500-750 tokens of structural overhead.

### Total Tool Budget

The total tool budget is the sum of all individual tool token counts. This number has three important relationships:

1. **Context window percentage**: On a 128K-token model, 8,000 tokens of tool definitions consume 6.25% of the context window. On a 4K-token model (legacy), the same tools consume 200% -- they literally do not fit. The percentage helps developers understand the relative impact.

2. **Per-request cost**: Tool tokens are billed as input tokens on every request. The per-request cost is `totalToolTokens / 1_000_000 * inputPricePerMTok`. This seems small for a single request but compounds across volume.

3. **Aggregate cost**: The monthly cost is `perRequestCost * requestsPerDay * 30`. At 10,000 requests/day, 8,000 tool tokens at $2.50/MTok costs $6.00/day or $180/month -- a meaningful line item that is invisible without explicit measurement.

### Tool Schema Serialization

Different providers serialize tool schemas differently, which affects token count:

**OpenAI function calling serialization:**

OpenAI converts tool JSON Schemas into a TypeScript-like namespace format before inserting them into the prompt. A tool defined as:

```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "Get current weather for a location",
    "parameters": {
      "type": "object",
      "properties": {
        "location": { "type": "string", "description": "City name" },
        "units": { "type": "string", "enum": ["celsius", "fahrenheit"] }
      },
      "required": ["location"]
    }
  }
}
```

is serialized approximately as:

```
namespace functions {
  // Get current weather for a location
  type get_weather = (_: {
    location: string, // City name
    units?: "celsius" | "fahrenheit",
  }) => any;
}
```

This TypeScript-like representation is what gets tokenized and billed. The serialization is more compact than raw JSON for simple schemas but introduces its own structural tokens.

**Anthropic tool use serialization:**

Anthropic includes the tool definition as a JSON object in the request, and the JSON Schema is serialized directly. The token cost is closer to the raw `JSON.stringify()` output of the tool definition, with some formatting overhead for the tool structure wrapper.

**MCP tool definitions:**

MCP tools follow a similar JSON Schema format to Anthropic. When an MCP client sends tool definitions to an LLM provider, it typically converts them to the provider's native format (OpenAI or Anthropic), so the token cost depends on the target provider.

### Optimization Strategies

Tool token cost can be reduced through several strategies, ordered by typical impact:

1. **Per-request tool filtering**: Instead of sending all tools on every request, send only the tools relevant to the current conversation context. A 30-tool application might need only 5-8 tools for any given request. This is the highest-impact optimization because it reduces the multiplier, not the per-tool cost.

2. **Description shortening**: Tool descriptions are often written like documentation -- verbose, with examples and edge cases. The model needs only enough description to know when and how to use the tool. Cutting "This function retrieves the current weather conditions for a specified geographical location, including temperature, humidity, wind speed, and precipitation" to "Get current weather for a location" saves 30+ tokens with no loss in model accuracy.

3. **Parameter description trimming**: Similarly, individual parameter descriptions can often be shortened. The parameter name itself is often self-documenting; a description is only needed when the name is ambiguous.

4. **Enum reduction**: Large string enums should be replaced with a `string` type and a shortened description listing key values. An enum with 50 country codes consumes ~100 tokens; a string type with the description "ISO 3166-1 alpha-2 country code" consumes ~10 tokens.

5. **Optional parameter removal**: Optional parameters with niche use cases inflate every request. Moving rarely-used optional parameters to a separate "advanced" tool variant keeps the primary tool lean.

6. **Schema flattening**: Deeply nested object schemas generate more structural tokens than flat schemas. When possible, flatten nested objects into dot-notation parameter names.

7. **Tool consolidation**: Multiple similar tools (e.g., `search_by_name`, `search_by_id`, `search_by_email`) can often be merged into a single tool with a `search_type` parameter, reducing the per-tool structural overhead.

---

## 5. Token Counting for Tool Definitions

### How Tool Schemas Are Serialized and Counted

The token counting pipeline for tool definitions has three stages:

1. **Format detection**: Determine whether the input tools are in OpenAI, Anthropic, or MCP format. This is auto-detected from the shape of the objects or specified explicitly via the `format` option.

2. **Serialization**: Convert each tool definition to the string representation the target provider uses internally. For OpenAI, this is the TypeScript-like namespace format. For Anthropic/MCP, this is a compact JSON serialization.

3. **Tokenization**: Count tokens in the serialized string using the configured tokenizer (heuristic by default, `js-tiktoken` when available and configured for OpenAI).

### OpenAI Serialization Rules

The OpenAI serialization follows these rules, derived from empirical testing against OpenAI's actual token billing:

```
// Preamble (once for entire tool set):
// "namespace functions {\n\n"  (~4 tokens)

// Per tool:
// "// <description>\n"                           (description tokens + 2)
// "type <name> = (_: {\n"                        (name tokens + 5)
// For each parameter:
//   "<name><? if optional>: <type>,\n"            (name + type + 2-3)
//   "// <param_description>\n"  (if present)      (description tokens + 2)
// "}) => any;\n\n"                               (4 tokens)
```

Specific serialization details:

- **String type**: Serialized as `string`. If the parameter has an `enum`, serialized as `"value1" | "value2" | "value3"`.
- **Number/integer type**: Serialized as `number`.
- **Boolean type**: Serialized as `boolean`.
- **Array type**: Serialized as `<itemType>[]`. If items have complex types, the inner type is expanded inline.
- **Object type (nested)**: Serialized as `{ <properties> }` with the same per-property rules applied recursively.
- **Optional parameters**: Parameters not in the `required` array get a `?` suffix on their name.
- **Enum values**: Each enum value is quoted and joined with ` | `. Long enums generate many tokens.

The per-tool structural overhead (function signature wrapper, arrow return type) is approximately 10-12 tokens regardless of schema complexity.

### Anthropic/MCP Serialization Rules

Anthropic includes tool definitions as a compact JSON representation. The token cost approximates:

```
{
  "name": "<name>",
  "description": "<description>",
  "input_schema": {
    "type": "object",
    "properties": {
      "<param_name>": {
        "type": "<type>",
        "description": "<description>"
      }
    },
    "required": ["<required_params>"]
  }
}
```

JSON serialization is generally more verbose than OpenAI's TypeScript format for simple schemas (more punctuation tokens: braces, colons, quotes) but can be more compact for complex nested schemas where TypeScript's inline expansion becomes verbose.

### Token Counting Methods

**Heuristic counting (default):**

The heuristic counter uses the same approach as `prompt-price`: `tokens = ceil(text.length / charsPerToken)`. The default ratio is 3.9 characters per token, calibrated for English text and JSON/TypeScript-like syntax. JSON Schema text tends to have a slightly higher token density than natural language (more punctuation, shorter words), so the ratio is tuned slightly lower than general English text (4.0 chars/token).

**Native counting (optional, OpenAI only):**

When `js-tiktoken` is available and the target provider is OpenAI, the serialized tool text is tokenized using the appropriate BPE encoding (`cl100k_base` or `o200k_base`). This produces exact token counts matching OpenAI's billing.

### Per-Component Token Breakdown

For each tool, the estimator produces a breakdown of token consumption by component:

| Component | What It Measures | Typical Range |
|---|---|---|
| `nameTokens` | The tool/function name | 1-4 tokens |
| `descriptionTokens` | The description text | 5-200 tokens |
| `parameterTokens` | All parameter schemas combined (names, types, constraints) | 10-400 tokens |
| `enumTokens` | All enum value lists across parameters (subset of parameterTokens) | 0-200 tokens |
| `structuralTokens` | Braces, colons, commas, function signature, namespace wrapper | 10-20 tokens |
| `totalTokens` | Sum of all components | 30-600 tokens |

The breakdown enables targeted optimization: if `descriptionTokens` dominates, shorten descriptions. If `enumTokens` dominates, replace enums with string types. If `parameterTokens` dominates, remove optional parameters or simplify nested schemas.

---

## 6. Per-Tool Analysis

### Individual Tool Token Breakdown

The `estimateTools()` function returns a `perTool` array with detailed analysis for each tool:

```typescript
interface ToolAnalysis {
  /** Tool name. */
  name: string;

  /** Total tokens consumed by this tool definition. */
  totalTokens: number;

  /** Token breakdown by component. */
  breakdown: {
    nameTokens: number;
    descriptionTokens: number;
    parameterTokens: number;
    enumTokens: number;
    structuralTokens: number;
  };

  /** Percentage of total tool overhead consumed by this tool. */
  percentOfTotal: number;

  /** Number of parameters defined. */
  parameterCount: number;

  /** Number of required parameters. */
  requiredParameterCount: number;

  /** Number of enum parameters (parameters with enum constraints). */
  enumParameterCount: number;

  /** Total number of enum values across all parameters. */
  totalEnumValues: number;

  /** Description length in characters. */
  descriptionLength: number;

  /** Maximum nesting depth of the parameter schema. */
  maxNestingDepth: number;

  /** The serialized representation that was tokenized (for debugging). */
  serialized: string;
}
```

### Tool Ranking

Tools are ranked by `totalTokens` descending in the report. The top 3 tools by token cost are flagged as "high-impact optimization targets" because optimizing the most expensive tools yields the largest token savings.

### Outlier Detection

A tool is flagged as an outlier if its token count exceeds 2x the median token count of all tools in the set. Outliers typically indicate an excessively verbose description, a large enum, or an overly complex nested parameter schema. The report includes an `outliers` array listing these tools with the reason for the flag.

---

## 7. Optimization Suggestions

### Suggestion Engine

The `suggestOptimizations()` function analyzes the tool set and returns prioritized suggestions. Each suggestion includes the target tool, the optimization type, the estimated token savings, and a concrete recommendation.

```typescript
interface OptimizationSuggestion {
  /** The tool this suggestion applies to. '*' for cross-tool suggestions. */
  toolName: string;

  /** Category of optimization. */
  type:
    | 'shorten-description'
    | 'trim-param-descriptions'
    | 'reduce-enum'
    | 'remove-optional-params'
    | 'flatten-schema'
    | 'merge-similar-tools'
    | 'filter-per-request'
    | 'remove-redundant-fields';

  /** Human-readable suggestion text. */
  message: string;

  /** Estimated token savings if this suggestion is applied. */
  estimatedSavings: number;

  /** Priority rank (1 = highest impact). */
  priority: number;

  /** Severity: 'high' (>100 token savings), 'medium' (20-100), 'low' (<20). */
  severity: 'high' | 'medium' | 'low';
}
```

### Suggestion Rules

The following rules are evaluated in order. Each rule inspects the tool definition and generates a suggestion if the condition is met:

**Rule 1: Shorten verbose descriptions (`shorten-description`)**

Trigger: Tool description exceeds 200 characters.

Analysis: Counts tokens in the description. Estimates how many tokens a shortened version (first sentence only, capped at 100 characters) would consume. The difference is the estimated savings.

Example suggestion: `"Tool 'search_knowledge_base' description is 387 characters (82 tokens). Shortening to under 100 characters could save ~50 tokens. Current: 'This function searches the internal knowledge base for relevant documents, articles, and FAQ entries that match the user query. It supports full-text search, semantic search, and filtered search by category, date range, and author. Results are ranked by relevance score.' Consider: 'Search the knowledge base by query, with optional filters.'"`

**Rule 2: Trim parameter descriptions (`trim-param-descriptions`)**

Trigger: Any parameter description exceeds 100 characters, or the sum of all parameter descriptions exceeds 300 characters.

Analysis: Identifies parameters whose names are self-documenting (e.g., `user_id`, `email`, `start_date`) and whose descriptions add little information beyond the name. Estimates savings from removing or shortening these descriptions.

Example suggestion: `"Tool 'create_user': parameter 'email' has description 'The email address of the user to be created' (10 tokens). The parameter name is self-documenting. Removing the description saves ~10 tokens."`

**Rule 3: Reduce large enums (`reduce-enum`)**

Trigger: Any parameter has an enum with more than 10 values.

Analysis: Counts tokens consumed by the enum values. Estimates savings from replacing the enum with a `string` type and a brief description.

Example suggestion: `"Tool 'set_language': parameter 'language' has 47 enum values consuming ~95 tokens. Replace with type 'string' and description 'ISO 639-1 language code' to save ~85 tokens."`

**Rule 4: Remove rarely-used optional parameters (`remove-optional-params`)**

Trigger: Tool has more than 5 optional parameters.

Analysis: Flags tools with many optional parameters as candidates for splitting into a "basic" tool (required + common optional params) and an "advanced" tool (all params).

Example suggestion: `"Tool 'search_database' has 8 optional parameters consuming ~120 tokens. Consider splitting into 'search_database' (3 core params) and 'search_database_advanced' (all params) to reduce per-request overhead when advanced options are not needed."`

**Rule 5: Flatten deeply nested schemas (`flatten-schema`)**

Trigger: Parameter schema nesting depth exceeds 2 levels.

Analysis: Nested objects add structural overhead (braces, type wrappers) at each level. Estimates savings from flattening.

Example suggestion: `"Tool 'create_order': parameter 'shipping.address.street' is nested 3 levels deep. Flattening to 'shipping_street' would save ~8 tokens of structural overhead per nested parameter."`

**Rule 6: Merge similar tools (`merge-similar-tools`)**

Trigger: Two or more tools share a common name prefix and have overlapping parameter schemas (>50% parameter name overlap).

Analysis: Identifies tool groups like `search_by_name`, `search_by_id`, `search_by_email` that could be a single `search` tool with a `search_type` parameter. Estimates savings from eliminating redundant per-tool structural overhead and shared parameter definitions.

Example suggestion: `"Tools 'search_by_name', 'search_by_id', 'search_by_email' share 4 common parameters. Merging into a single 'search' tool with a 'search_field' parameter could save ~180 tokens (3 tools' structural overhead minus 1 parameter)."`

**Rule 7: Filter tools per request (`filter-per-request`)**

Trigger: Total tool set exceeds 15 tools.

Analysis: This is a cross-tool suggestion (applies to the entire set). Estimates the per-request savings from sending a subset of tools. Assumes an average of 30-50% of tools are relevant per request.

Example suggestion: `"Tool set has 28 tools consuming 9,240 tokens. Filtering to 8-10 relevant tools per request could save ~5,500-6,200 tokens per request ($0.014-$0.016 at GPT-4o pricing)."`

**Rule 8: Remove redundant JSON Schema fields (`remove-redundant-fields`)**

Trigger: Schema includes `additionalProperties: false`, `default` values that the model ignores, or `examples` arrays.

Analysis: These fields consume tokens but do not meaningfully influence model behavior for tool calling. The model does not enforce `additionalProperties` -- it generates whatever parameters it decides are appropriate. Default values are not used by the model (the calling code applies defaults).

Example suggestion: `"Tool 'update_user': 'additionalProperties: false' on 3 schema levels consumes ~12 tokens. The model does not enforce this constraint. Removing it saves ~12 tokens with no behavior change."`

### Suggestion Prioritization

Suggestions are sorted by `estimatedSavings` descending. The `priority` field is assigned sequentially (1 = highest savings). The `severity` field is derived from savings: `high` for >100 tokens, `medium` for 20-100, `low` for <20.

---

## 8. API Surface

### Installation

```bash
npm install tool-cost-estimator
```

### `estimateTools`

The primary function. Accepts tool definitions and returns a complete cost report.

```typescript
import { estimateTools } from 'tool-cost-estimator';

const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name' },
          units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        },
        required: ['location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for information matching a query',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          max_results: { type: 'number', description: 'Maximum number of results' },
          language: { type: 'string', description: 'Result language', enum: ['en', 'es', 'fr', 'de', 'ja', 'zh'] },
        },
        required: ['query'],
      },
    },
  },
];

const report = estimateTools(tools);

console.log(report.totalTokens);       // 187
console.log(report.perTool[0].name);   // 'get_weather'
console.log(report.perTool[0].totalTokens); // 78
console.log(report.costProjections);   // { 'gpt-4o': { perRequest: 0.000468, ... } }
```

**Signature:**

```typescript
function estimateTools(
  tools: ToolDefinition[],
  options?: EstimateToolsOptions,
): ToolCostReport;
```

The function is synchronous. Token counting uses the heuristic by default, which requires no async initialization. When `js-tiktoken` is needed, use `createEstimator()` which provides an async `estimate()` method.

### `analyzeToolSet`

Aggregate analysis of a tool set: total overhead, context window impact, outlier detection, and tool ranking.

```typescript
import { analyzeToolSet } from 'tool-cost-estimator';

const analysis = analyzeToolSet(tools);

console.log(analysis.totalTokens);            // 9240
console.log(analysis.contextWindowUsage);      // { '128k': 7.22, '32k': 28.88, '8k': 115.50 }
console.log(analysis.outliers);               // [{ name: 'complex_query', ... }]
console.log(analysis.ranking[0].name);         // 'complex_query' (most expensive)
```

**Signature:**

```typescript
function analyzeToolSet(
  tools: ToolDefinition[],
  options?: AnalyzeOptions,
): ToolSetAnalysis;
```

### `suggestOptimizations`

Returns prioritized optimization suggestions for reducing tool token overhead.

```typescript
import { suggestOptimizations } from 'tool-cost-estimator';

const suggestions = suggestOptimizations(tools);

for (const s of suggestions) {
  console.log(`[${s.severity}] ${s.toolName}: ${s.message} (save ~${s.estimatedSavings} tokens)`);
}
// [high] search_knowledge_base: Description is 387 chars (82 tokens). Shorten to save ~50 tokens.
// [high] set_language: parameter 'language' has 47 enum values. Replace with string to save ~85 tokens.
// [medium] create_user: parameter 'email' description is redundant. Remove to save ~10 tokens.
```

**Signature:**

```typescript
function suggestOptimizations(
  tools: ToolDefinition[],
  options?: OptimizationOptions,
): OptimizationSuggestion[];
```

### `createEstimator`

Factory function for creating a pre-configured estimator instance. Useful when analyzing multiple tool sets with the same configuration, or when using `js-tiktoken` for exact OpenAI token counts (which requires async initialization).

```typescript
import { createEstimator } from 'tool-cost-estimator';

const estimator = await createEstimator({
  provider: 'openai',
  model: 'gpt-4o',
  tokenizer: 'tiktoken',           // Use js-tiktoken for exact counts
  contextWindow: 128_000,
  pricePerMTokInput: 2.50,
});

const report = estimator.estimate(tools);
const analysis = estimator.analyze(tools);
const suggestions = estimator.suggest(tools);
```

**Signature:**

```typescript
function createEstimator(
  config: EstimatorConfig,
): Promise<Estimator>;

interface Estimator {
  estimate(tools: ToolDefinition[]): ToolCostReport;
  analyze(tools: ToolDefinition[]): ToolSetAnalysis;
  suggest(tools: ToolDefinition[]): OptimizationSuggestion[];
}
```

`createEstimator` is async because initializing `js-tiktoken` requires loading WASM. If `tokenizer` is `'heuristic'` (the default), the promise resolves synchronously (wrapped in a resolved promise).

### Type Definitions

```typescript
// ── Tool Definition Formats ─────────────────────────────────────────

/** OpenAI function calling format. */
interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: JsonSchema;
  };
}

/** Anthropic tool use format. */
interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema?: JsonSchema;
}

/** MCP tool definition format. */
interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
}

/** Union of all supported tool formats. Auto-detected by shape. */
type ToolDefinition = OpenAIToolDefinition | AnthropicToolDefinition | MCPToolDefinition;

/** JSON Schema object (subset relevant to tool definitions). */
interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: (string | number | boolean)[];
  description?: string;
  default?: unknown;
  additionalProperties?: boolean | JsonSchema;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $ref?: string;
  [key: string]: unknown;
}

// ── Estimate Options ────────────────────────────────────────────────

interface EstimateToolsOptions {
  /** Target provider for serialization format. Auto-detected from tools if omitted.
   *  'openai' uses TypeScript-like serialization. 'anthropic' and 'mcp' use JSON. */
  provider?: 'openai' | 'anthropic' | 'mcp';

  /** Model name for encoding selection (OpenAI only). Default: 'gpt-4o'. */
  model?: string;

  /** Token counting method. Default: 'heuristic'. */
  tokenizer?: 'heuristic' | 'tiktoken';

  /** Custom token counter function. Overrides built-in tokenizers. */
  tokenCounter?: (text: string) => number;

  /** Context window size in tokens for percentage calculations. Default: 128000. */
  contextWindow?: number;

  /** Input price per million tokens for cost projections. Default: 2.50 (GPT-4o). */
  pricePerMTokInput?: number;

  /** Include the serialized representation in per-tool results. Default: false.
   *  Useful for debugging but increases report size. */
  includeSerialized?: boolean;

  /** Additional model price points for cost projections.
   *  Keys are display names, values are price per million input tokens. */
  pricePoints?: Record<string, number>;
}

interface AnalyzeOptions extends EstimateToolsOptions {
  /** Context window sizes for usage percentage calculations.
   *  Default: { '128k': 128000, '32k': 32000, '8k': 8000 }. */
  contextWindows?: Record<string, number>;

  /** Outlier threshold multiplier over median. Default: 2.0. */
  outlierThreshold?: number;
}

interface OptimizationOptions extends EstimateToolsOptions {
  /** Minimum estimated savings to include a suggestion. Default: 5 tokens. */
  minSavings?: number;

  /** Maximum number of suggestions to return. Default: 20. */
  maxSuggestions?: number;

  /** Description length threshold for shorten-description rule. Default: 200 characters. */
  descriptionLengthThreshold?: number;

  /** Enum size threshold for reduce-enum rule. Default: 10 values. */
  enumSizeThreshold?: number;

  /** Optional parameter count threshold for remove-optional-params rule. Default: 5. */
  optionalParamThreshold?: number;

  /** Nesting depth threshold for flatten-schema rule. Default: 2 levels. */
  nestingDepthThreshold?: number;

  /** Tool count threshold for filter-per-request rule. Default: 15 tools. */
  toolCountThreshold?: number;
}

// ── Estimator Config ────────────────────────────────────────────────

interface EstimatorConfig {
  /** Target provider. Default: 'openai'. */
  provider?: 'openai' | 'anthropic' | 'mcp';

  /** Model name for encoding selection. Default: 'gpt-4o'. */
  model?: string;

  /** Token counting method. Default: 'heuristic'. */
  tokenizer?: 'heuristic' | 'tiktoken';

  /** Custom token counter. */
  tokenCounter?: (text: string) => number;

  /** Context window size. Default: 128000. */
  contextWindow?: number;

  /** Input price per million tokens. Default: 2.50. */
  pricePerMTokInput?: number;

  /** Additional price points for projections. */
  pricePoints?: Record<string, number>;
}

// ── Report Types ────────────────────────────────────────────────────

interface ToolCostReport {
  /** Total tokens consumed by all tool definitions combined. */
  totalTokens: number;

  /** Preamble overhead tokens (namespace declaration, etc.). */
  preambleTokens: number;

  /** Per-tool analysis, sorted by totalTokens descending. */
  perTool: ToolAnalysis[];

  /** Percentage of context window consumed by tools. */
  contextWindowPercent: number;

  /** Context window size used for percentage calculation. */
  contextWindow: number;

  /** Cost projections at various model price points. */
  costProjections: Record<string, CostProjection>;

  /** Token counting method used. */
  tokenizer: 'heuristic' | 'tiktoken';

  /** Provider serialization format used. */
  provider: 'openai' | 'anthropic' | 'mcp';

  /** Number of tools analyzed. */
  toolCount: number;

  /** Summary statistics. */
  stats: {
    /** Mean tokens per tool. */
    meanTokensPerTool: number;
    /** Median tokens per tool. */
    medianTokensPerTool: number;
    /** Min tokens for any single tool. */
    minTokens: number;
    /** Max tokens for any single tool. */
    maxTokens: number;
    /** Tool with the highest token count. */
    mostExpensiveTool: string;
    /** Tool with the lowest token count. */
    leastExpensiveTool: string;
  };
}

interface ToolAnalysis {
  /** Tool name. */
  name: string;

  /** Total tokens consumed by this tool definition. */
  totalTokens: number;

  /** Token breakdown by component. */
  breakdown: {
    nameTokens: number;
    descriptionTokens: number;
    parameterTokens: number;
    enumTokens: number;
    structuralTokens: number;
  };

  /** Percentage of total tool overhead consumed by this tool. */
  percentOfTotal: number;

  /** Number of parameters defined. */
  parameterCount: number;

  /** Number of required parameters. */
  requiredParameterCount: number;

  /** Number of enum parameters. */
  enumParameterCount: number;

  /** Total enum values across all parameters. */
  totalEnumValues: number;

  /** Description length in characters. */
  descriptionLength: number;

  /** Maximum schema nesting depth. */
  maxNestingDepth: number;

  /** Serialized representation (present only if includeSerialized is true). */
  serialized?: string;
}

interface CostProjection {
  /** Input price per million tokens. */
  pricePerMTokInput: number;

  /** Cost of tool tokens per request in USD. */
  perRequest: number;

  /** Projected daily cost at a given request volume. */
  perDay: Record<string, number>;

  /** Projected monthly cost (30 days) at a given request volume. */
  perMonth: Record<string, number>;
}

interface ToolSetAnalysis extends ToolCostReport {
  /** Context window usage at multiple window sizes. Percentage values. */
  contextWindowUsage: Record<string, number>;

  /** Tools flagged as outliers (>threshold * median tokens). */
  outliers: Array<{
    name: string;
    totalTokens: number;
    medianTokens: number;
    ratio: number;
    reason: string;
  }>;

  /** Tools sorted by totalTokens descending. */
  ranking: Array<{
    rank: number;
    name: string;
    totalTokens: number;
    percentOfTotal: number;
  }>;
}

interface OptimizationSuggestion {
  /** Tool name this suggestion applies to. '*' for cross-tool suggestions. */
  toolName: string;

  /** Optimization category. */
  type:
    | 'shorten-description'
    | 'trim-param-descriptions'
    | 'reduce-enum'
    | 'remove-optional-params'
    | 'flatten-schema'
    | 'merge-similar-tools'
    | 'filter-per-request'
    | 'remove-redundant-fields';

  /** Human-readable suggestion. */
  message: string;

  /** Estimated token savings. */
  estimatedSavings: number;

  /** Priority rank (1 = highest impact). */
  priority: number;

  /** Severity based on savings magnitude. */
  severity: 'high' | 'medium' | 'low';
}
```

### Type Exports

```typescript
export type {
  ToolDefinition,
  OpenAIToolDefinition,
  AnthropicToolDefinition,
  MCPToolDefinition,
  JsonSchema,
  EstimateToolsOptions,
  AnalyzeOptions,
  OptimizationOptions,
  EstimatorConfig,
  Estimator,
  ToolCostReport,
  ToolAnalysis,
  CostProjection,
  ToolSetAnalysis,
  OptimizationSuggestion,
};
```

---

## 9. Report Output

### Per-Tool Breakdown

The report's `perTool` array provides a complete breakdown for each tool. Example for a 3-tool set:

```
Tool: get_weather
  Name:         2 tokens
  Description: 12 tokens
  Parameters:  34 tokens
    - location (string, required):  8 tokens
    - units (enum, optional):      18 tokens  [celsius, fahrenheit]
    - detailed (boolean, optional): 8 tokens
  Enums:       18 tokens
  Structural:  11 tokens
  Total:       59 tokens (31.4% of tool overhead)

Tool: search_web
  Name:         3 tokens
  Description: 15 tokens
  Parameters:  52 tokens
  Enums:        0 tokens
  Structural:  11 tokens
  Total:       81 tokens (43.1% of tool overhead)

Tool: get_time
  Name:         2 tokens
  Description:  8 tokens
  Parameters:  24 tokens
  Enums:        0 tokens
  Structural:  14 tokens
  Total:       48 tokens (25.5% of tool overhead)
```

### Total Overhead Summary

```
Total Tool Overhead
  Tools:           3
  Total tokens:    188 (+ 4 preamble = 192)
  Context usage:   0.15% of 128K window
  Mean per tool:   63 tokens
  Median:          59 tokens
  Range:           48-81 tokens
  Most expensive:  search_web (81 tokens)
```

### Cost Projections

Cost projections are computed at configurable model price points. Default price points include common models:

```
Cost at Current Tool Overhead (192 tokens)
  Model Price Point       Per Request    1K req/day    10K req/day    100K req/day
  ──────────────────────  ───────────    ──────────    ───────────    ────────────
  GPT-4o ($2.50/MTok)     $0.000480     $0.48/day     $4.80/day      $48.00/day
  GPT-4.1 ($2.00/MTok)    $0.000384     $0.38/day     $3.84/day      $38.40/day
  Claude Sonnet ($3/MTok) $0.000576     $0.58/day     $5.76/day      $57.60/day
  GPT-4o-mini ($0.15)     $0.000029     $0.03/day     $0.29/day      $2.88/day
  Gemini Flash ($0.075)   $0.000014     $0.01/day     $0.14/day      $1.44/day
```

Default request volume tiers for projection: `1000`, `10000`, `100000` requests per day. These are configurable.

### Optimization Suggestions in Report

```
Optimization Suggestions (3 found)
  Priority  Tool              Type                  Savings    Suggestion
  ────────  ────              ────                  ───────    ──────────
  1         search_web        shorten-description   ~22 tok    Description is 312 chars. Shorten to <100 chars.
  2         *                 filter-per-request    ~96 tok    28 tools registered. Filter to 8-10 per request.
  3         set_language      reduce-enum           ~85 tok    Param 'lang' has 47 enum values. Use string type.
```

---

## 10. Configuration

### No Configuration Required

`tool-cost-estimator` has no configuration files, environment variables, or initialization steps for basic programmatic use. Import and call:

```typescript
import { estimateTools } from 'tool-cost-estimator';
const report = estimateTools(tools);
// Works immediately. No setup.
```

All behavior is controlled via function parameters. Defaults are tuned for the most common use case (OpenAI provider, heuristic token counting, 128K context window, GPT-4o pricing).

### Overriding Defaults

Every default can be overridden per-call via the `options` parameter:

| Default | Override | Purpose |
|---|---|---|
| Auto-detect provider | `options.provider` | Force a specific serialization format |
| Heuristic tokenizer | `options.tokenizer` or `options.tokenCounter` | Use exact token counting or a custom counter |
| 128K context window | `options.contextWindow` | Calculate percentage for a different context size |
| $2.50/MTok (GPT-4o) | `options.pricePerMTokInput` | Use a different base price for cost projections |
| Default price points | `options.pricePoints` | Add or replace model price points for projections |
| No serialized output | `options.includeSerialized` | Include the serialized tool text in the report |

### Environment Variables (CLI Only)

| Environment Variable | CLI Flag | Description |
|---|---|---|
| `TOOL_COST_PROVIDER` | `--provider` | Default provider for serialization |
| `TOOL_COST_FORMAT` | `--format` | Output format: `human` or `json` |
| `TOOL_COST_CONTEXT_WINDOW` | `--context-window` | Default context window size |

---

## 11. CLI Design

### Installation and Invocation

```bash
# Global install
npm install -g tool-cost-estimator
tool-cost-estimator analyze tools.json

# npx (no install)
npx tool-cost-estimator analyze tools.json

# Pipe from stdin
cat tools.json | npx tool-cost-estimator analyze
```

### CLI Binary Name

`tool-cost-estimator`

### Commands

#### `tool-cost-estimator analyze <file> [options]`

Analyzes tool definitions from a JSON file and prints a cost report.

**Input:**
- `<file>`: Path to a JSON file containing an array of tool definitions. Supports OpenAI, Anthropic, and MCP formats.
- `stdin`: If no file is provided, reads from stdin.

**Flags:**

```
Input:
  <file>                         JSON file containing tool definitions
  --provider <provider>          Target provider: openai | anthropic | mcp (auto-detected)

Analysis:
  --context-window <tokens>      Context window size for % calculations (default: 128000)
  --price <usd>                  Input price per million tokens (default: 2.50)

Output:
  --format <format>              Output format: human (default) | json
  --include-serialized           Include serialized tool text in output
  --suggestions                  Include optimization suggestions (default: true)
  --no-suggestions               Omit optimization suggestions

Meta:
  --version                      Print version and exit
  --help                         Print help and exit
```

**Human-Readable Output Example:**

```
$ tool-cost-estimator analyze tools.json

  tool-cost-estimator v0.1.0

  Provider: OpenAI (TypeScript serialization)
  Tokenizer: heuristic
  Tools: 5

  Per-Tool Breakdown
  ──────────────────────────────────────────────────────────────
  #  Tool                    Tokens   Name  Desc  Params  Enum
  1  search_knowledge_base      284      3    82     188    45
  2  create_document            156      3    24     118     0
  3  get_weather                 78      2    12      53    18
  4  get_time                    48      2     8      27     0
  5  list_users                  42      2     6      23     0
  ──────────────────────────────────────────────────────────────

  Summary
    Total tokens:   612 (+ 4 preamble = 616)
    Context usage:  0.48% of 128K
    Mean per tool:  122 tokens
    Most expensive: search_knowledge_base (284 tokens, 46.1%)

  Cost Projections (616 tokens per request)
    GPT-4o ($2.50/MTok):     $0.0015/req    $15.40/day @10K req
    GPT-4o-mini ($0.15/MTok): $0.0001/req    $0.92/day @10K req

  Optimization Suggestions
    [high] search_knowledge_base: Description is 387 chars. Shorten to save ~50 tokens.
    [medium] search_knowledge_base: Param 'category' has 22 enum values. Use string to save ~35 tokens.
    [low] create_document: 'additionalProperties: false' on 2 levels. Remove to save ~8 tokens.
```

**JSON Output Example:**

```bash
$ tool-cost-estimator analyze tools.json --format json
```

Outputs the `ToolCostReport` object as JSON to stdout.

#### `tool-cost-estimator suggest <file> [options]`

Prints only optimization suggestions, without the full report.

```
$ tool-cost-estimator suggest tools.json

  tool-cost-estimator v0.1.0

  Optimization Suggestions (5 found, sorted by impact)

  1. [high] search_knowledge_base: Description is 387 chars (82 tokens).
     Shorten to under 100 chars to save ~50 tokens.

  2. [high] set_language: Param 'language' has 47 enum values (95 tokens).
     Replace with string type to save ~85 tokens.

  3. [medium] *: 28 tools registered. Filter to 8-10 per request
     to save ~5,500 tokens per request.

  Total potential savings: ~5,635 tokens (~89% reduction possible with filtering)
```

#### `tool-cost-estimator compare <file1> <file2> [options]`

Compares two tool definition files side-by-side (e.g., before and after optimization).

```
$ tool-cost-estimator compare tools-before.json tools-after.json

  tool-cost-estimator v0.1.0

  Comparison
                    Before    After     Delta
  Total tokens:      9,240    5,120    -4,120 (-44.6%)
  Tool count:           28       28         0
  Context usage:     7.22%    4.00%    -3.22%
  Per-req cost:    $0.0231  $0.0128   -$0.0103

  Per-Tool Changes (top 5 by savings)
    search_knowledge_base:  284 -> 142  (-142 tokens)
    set_language:           195 -> 68   (-127 tokens)
    create_order:           312 -> 198  (-114 tokens)
    ...
```

### Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success. Report generated. |
| `1` | Analysis error (invalid tool definitions, unreadable file). |
| `2` | Configuration error (invalid flags, missing input). |

---

## 12. Integration with Monorepo Packages

### Integration with `prompt-price`

`prompt-price` estimates total request cost including tool definitions. `tool-cost-estimator` provides deeper tool-specific analysis. They are complementary: `prompt-price` answers "how much does this entire request cost?" while `tool-cost-estimator` answers "how much of that cost comes from tools, and how can I reduce it?"

```typescript
import { estimateTools } from 'tool-cost-estimator';
import { estimate } from 'prompt-price';

// Deep-dive into tool cost
const toolReport = estimateTools(tools);
console.log(`Tools alone: ${toolReport.totalTokens} tokens`);

// Full request cost including tools
const requestEstimate = await estimate(messages, 'openai/gpt-4o', { tools });
console.log(`Full request: ${requestEstimate.inputTokens} tokens`);
console.log(`Tool share: ${(toolReport.totalTokens / requestEstimate.inputTokens * 100).toFixed(1)}%`);
```

`prompt-price` can use `tool-cost-estimator` internally for its tool token counting. The `tool-tokenizer.ts` module in `prompt-price` performs a simplified version of what `tool-cost-estimator` does; a future version could delegate to `tool-cost-estimator` for consistency.

### Integration with `schema-bridge`

`schema-bridge` transforms schemas between formats (JSON Schema, Zod, TypeBox, etc.). Tool definitions contain JSON Schemas for their parameters. `schema-bridge` can produce schemas that feed into `tool-cost-estimator`, and `tool-cost-estimator`'s optimization suggestions can inform how schemas are authored.

```typescript
import { fromZod } from 'schema-bridge';
import { estimateTools } from 'tool-cost-estimator';

// Convert Zod schemas to JSON Schema for tool definitions
const paramSchema = fromZod(myZodSchema);

const tools = [{
  type: 'function' as const,
  function: {
    name: 'my_tool',
    description: 'Does something useful',
    parameters: paramSchema,
  },
}];

// Estimate the token cost of the resulting tool definition
const report = estimateTools(tools);
console.log(`Tool cost: ${report.totalTokens} tokens`);
```

### Integration with `context-budget`

`context-budget` manages context window allocation. Tool definitions consume a fixed portion of the context budget on every request. `tool-cost-estimator` quantifies that portion, enabling `context-budget` to account for it accurately.

```typescript
import { estimateTools } from 'tool-cost-estimator';
import { allocateBudget } from 'context-budget';

const toolReport = estimateTools(tools);

const budget = allocateBudget({
  total: 128_000,
  reserved: {
    tools: toolReport.totalTokens,
    systemPrompt: 500,
  },
});

console.log(`Available for conversation: ${budget.available} tokens`);
```

### Integration with `mcp-tool-router`

`mcp-tool-router` routes tool calls across multiple MCP servers. Each MCP server exposes its own set of tools. `tool-cost-estimator` helps `mcp-tool-router` understand the token cost of including each server's tools, enabling cost-aware tool set selection -- only include tools from servers relevant to the current request.

```typescript
import { estimateTools } from 'tool-cost-estimator';
import { createRouter } from 'mcp-tool-router';

// Analyze tools from each MCP server
const searchTools = await getToolsFromServer('search');
const dbTools = await getToolsFromServer('database');

const searchCost = estimateTools(searchTools);
const dbCost = estimateTools(dbTools);

console.log(`Search server tools: ${searchCost.totalTokens} tokens`);
console.log(`Database server tools: ${dbCost.totalTokens} tokens`);

// Route only needed tools based on query analysis
const router = createRouter({
  servers: [
    { name: 'search', tools: searchTools, tokenCost: searchCost.totalTokens },
    { name: 'database', tools: dbTools, tokenCost: dbCost.totalTokens },
  ],
  maxToolTokens: 4000,  // Token budget for tools
});
```

---

## 13. Testing Strategy

### Unit Tests

**Token counting tests:**
- Heuristic counter returns expected token count for known tool serialization strings.
- Heuristic counter rounds up (never underestimates).
- Empty tool name produces 0 name tokens.
- Long description produces proportionally more tokens.
- Token count is deterministic (same input always produces same count).

**Tool serialization tests (OpenAI format):**
- Tool with no parameters serializes to function signature with empty parameter object.
- Tool with string parameter serializes `paramName: string`.
- Tool with enum parameter serializes `paramName: "val1" | "val2"`.
- Tool with number parameter serializes `paramName: number`.
- Tool with boolean parameter serializes `paramName: boolean`.
- Tool with array parameter serializes `paramName: string[]` (or appropriate item type).
- Tool with nested object parameter serializes inline object type.
- Optional parameters (not in `required`) get `?` suffix.
- Description appears as `// description` comment.
- Multiple tools share a single namespace preamble.
- Tool with no description omits the comment line.

**Tool serialization tests (Anthropic/MCP format):**
- Tool serializes to compact JSON matching Anthropic's format.
- All JSON Schema fields are preserved in serialization.
- Nested schemas serialize correctly with proper indentation/structure.

**Format detection tests:**
- Object with `type: 'function'` and `function.name` detected as OpenAI format.
- Object with `name` and `input_schema` detected as Anthropic format.
- Object with `name` and `inputSchema` detected as MCP format.
- Object with `name` and no schema detected as Anthropic/MCP (ambiguous, defaults to Anthropic).
- Mixed array (some OpenAI, some Anthropic) throws an error.

**Per-tool analysis tests:**
- `breakdown.nameTokens` matches token count of the name string alone.
- `breakdown.descriptionTokens` matches token count of the description alone.
- `breakdown.parameterTokens` includes all parameter names, types, and descriptions.
- `breakdown.enumTokens` counts only enum values and delimiters.
- `breakdown.structuralTokens` is the residual (total minus all specific components).
- `percentOfTotal` sums to 100% across all tools (within rounding error).
- `parameterCount`, `requiredParameterCount`, `enumParameterCount`, `totalEnumValues` are accurate.
- `descriptionLength` matches the character count of the description.
- `maxNestingDepth` is 0 for flat schemas, 1 for one level of nesting, etc.

**Tool set analysis tests:**
- `totalTokens` equals sum of all per-tool `totalTokens` plus `preambleTokens`.
- `contextWindowPercent` is `(totalTokens / contextWindow) * 100`.
- `contextWindowUsage` calculates correctly for multiple window sizes.
- `outliers` array contains tools exceeding `threshold * median`.
- `ranking` is sorted by `totalTokens` descending.
- `stats.meanTokensPerTool` is the arithmetic mean.
- `stats.medianTokensPerTool` is the median (middle value for odd count, average of two middle for even).
- Empty tools array produces zero totals and empty arrays.
- Single tool produces that tool as both most and least expensive.

**Optimization suggestion tests:**
- Description > 200 chars triggers `shorten-description`.
- Description <= 200 chars does not trigger `shorten-description`.
- Enum with > 10 values triggers `reduce-enum`.
- Enum with <= 10 values does not trigger `reduce-enum`.
- Tool with > 5 optional params triggers `remove-optional-params`.
- Nesting depth > 2 triggers `flatten-schema`.
- Two tools with > 50% parameter overlap triggers `merge-similar-tools`.
- Tool set with > 15 tools triggers `filter-per-request`.
- Schema with `additionalProperties: false` triggers `remove-redundant-fields`.
- Suggestions are sorted by `estimatedSavings` descending.
- `priority` values are sequential starting from 1.
- `severity` is `high` for > 100 tokens, `medium` for 20-100, `low` for < 20.
- `minSavings` option filters out suggestions below the threshold.
- `maxSuggestions` option limits the number of returned suggestions.

**Cost projection tests:**
- Per-request cost is `totalTokens / 1_000_000 * pricePerMTokInput`.
- Per-day cost at 1K requests is `perRequest * 1000`.
- Per-month cost is `perDay * 30`.
- Custom price points produce correct projections.
- Multiple default price points are included when no custom points specified.
- Cost rounds to 6 decimal places.

**Estimator factory tests:**
- `createEstimator()` returns an `Estimator` instance with `estimate`, `analyze`, `suggest` methods.
- Pre-configured estimator uses the config for all subsequent calls.
- `tokenizer: 'tiktoken'` initializes `js-tiktoken` and produces exact counts (when available).
- `tokenizer: 'heuristic'` does not attempt to load `js-tiktoken`.

**CLI tests:**
- `tool-cost-estimator analyze tools.json` exits with code 0 and prints a report.
- `tool-cost-estimator analyze tools.json --format json` outputs valid JSON.
- `tool-cost-estimator suggest tools.json` prints only suggestions.
- `tool-cost-estimator compare before.json after.json` prints comparison.
- `cat tools.json | tool-cost-estimator analyze` reads from stdin.
- `--provider openai` forces OpenAI serialization.
- `--context-window 32000` changes the percentage calculation.
- `--help` and `--version` flags work.
- Invalid JSON file exits with code 1.
- Missing file exits with code 1.
- Invalid flags exit with code 2.

### Edge Cases to Test

- Tool with empty string name (`''`).
- Tool with no description (`undefined`).
- Tool with no parameters (`parameters` is `undefined` or empty object).
- Tool with deeply nested schema (10+ levels).
- Tool with recursive schema (`$ref` references).
- Tool with `oneOf`/`anyOf`/`allOf` combinators.
- Tool with very large enum (100+ values).
- Tool with array parameter where items have complex schemas.
- Empty tools array (`[]`).
- Single tool in array.
- 100+ tools in array.
- Tool with non-ASCII characters in description (Unicode, CJK, emoji).
- Tool with very long name (50+ characters).
- Tool with parameter names containing special characters.
- Anthropic format tools with `input_schema` vs MCP format with `inputSchema`.

### Test Framework

Tests use Vitest, matching the project's existing configuration.

---

## 14. Performance

### Estimation Latency

**Heuristic counting**: The estimation pipeline for a typical tool set (10-20 tools) performs: format detection (one property check per tool), serialization (string concatenation proportional to schema size), and token counting (one `text.length` lookup and division per serialized string). Total time: under 1ms for 20 tools. Under 5ms for 100 tools. The serialization step dominates; it involves walking the JSON Schema tree and building a string. For deeply nested schemas, this may take proportionally longer, but typical tool schemas are 2-3 levels deep.

**Native counting (js-tiktoken)**: First-call latency includes WASM initialization (~50-100ms). Subsequent calls reuse the cached encoder. Per-tool tokenization adds 0.01-0.1ms per tool. For 20 tools, add ~1-2ms to the heuristic time. The difference is negligible for typical use cases.

**Optimization suggestion generation**: The suggestion engine iterates over all tools once per rule (8 rules). Each rule performs simple property checks and arithmetic. Total time: under 1ms for 20 tools.

### Memory Footprint

The package stores no persistent state beyond the optional cached `js-tiktoken` encoder (~2-4 MB). The report objects are proportional to the number of tools: approximately 200 bytes per tool in the `perTool` array. For 100 tools, the report is ~20 KB. The serialized tool strings (when `includeSerialized` is true) add the serialization text size per tool.

### Scalability

The package handles up to 1,000 tools in a single call without performance concerns (< 50ms with heuristic counting). Beyond 1,000 tools, performance is still linear but latency may reach 100-200ms. There is no practical upper limit on tool count.

---

## 15. Dependencies

### Runtime Dependencies

None. `tool-cost-estimator` has zero mandatory runtime dependencies. Token counting uses a built-in heuristic. JSON Schema traversal uses plain JavaScript object iteration. CLI argument parsing uses Node.js built-in `util.parseArgs` (Node.js 18+). File I/O uses `node:fs`.

### Optional Dependencies

| Dependency | Type | Purpose | Why Not Avoid It |
|---|---|---|---|
| `js-tiktoken` | optional peer | Provides exact BPE token counting for OpenAI serialization format. | This is the standard JavaScript port of OpenAI's tokenizer. Reimplementing BPE would be error-prone. When not installed, the heuristic is used with ~5% accuracy trade-off. |

### Dev Dependencies

| Dependency | Purpose |
|---|---|
| `typescript` | TypeScript compiler. |
| `vitest` | Test runner. |
| `eslint` | Linter. |
| `js-tiktoken` | Dev dependency for testing native token counting. |

---

## 16. File Structure

```
tool-cost-estimator/
├── src/
│   ├── index.ts                  # Public API exports
│   ├── estimate-tools.ts         # estimateTools() main function
│   ├── analyze-tool-set.ts       # analyzeToolSet() aggregate analysis
│   ├── suggest-optimizations.ts  # suggestOptimizations() suggestion engine
│   ├── create-estimator.ts       # createEstimator() factory
│   ├── serializer.ts             # Tool definition serialization (OpenAI, Anthropic, MCP)
│   ├── openai-serializer.ts      # OpenAI TypeScript-like namespace serialization
│   ├── json-serializer.ts        # Anthropic/MCP JSON Schema serialization
│   ├── format-detector.ts        # Auto-detect tool definition format
│   ├── token-counter.ts          # Heuristic and tiktoken-based counting
│   ├── schema-walker.ts          # JSON Schema tree traversal for analysis
│   ├── cost-projections.ts       # Cost calculation at various price points
│   ├── suggestion-rules.ts       # Individual optimization rule implementations
│   ├── types.ts                  # All TypeScript interfaces and types
│   ├── cli.ts                    # CLI entry point
│   └── __tests__/
│       ├── estimate-tools.test.ts        # estimateTools() tests
│       ├── analyze-tool-set.test.ts      # analyzeToolSet() tests
│       ├── suggest-optimizations.test.ts # suggestOptimizations() tests
│       ├── create-estimator.test.ts      # createEstimator() factory tests
│       ├── openai-serializer.test.ts     # OpenAI serialization tests
│       ├── json-serializer.test.ts       # JSON serialization tests
│       ├── format-detector.test.ts       # Format detection tests
│       ├── token-counter.test.ts         # Token counting tests
│       ├── schema-walker.test.ts         # Schema traversal tests
│       ├── cost-projections.test.ts      # Cost projection tests
│       ├── suggestion-rules.test.ts      # Suggestion rule tests
│       └── cli.test.ts                   # CLI integration tests
├── package.json
├── tsconfig.json
└── SPEC.md
```

---

## 17. Roadmap

The following features are explicitly out of scope for v1 but may be added in later versions.

### Provider-Specific Exact Serialization

Reverse-engineer the exact serialization format each provider uses internally. Currently, the OpenAI TypeScript-like format is based on empirical testing and community documentation. If OpenAI publishes an official tool token counting API or documents the exact serialization, the package will adopt it. Similarly for Anthropic and Google.

### Tool Usage Analytics Integration

Integration with runtime tool call tracking: given historical tool usage data, identify tools that are defined but never called, enabling removal of dead tools. This requires integration with a tool call logging system, which is out of scope for a static analysis library.

### Schema Complexity Scoring

A complexity score for each tool schema that predicts how well the model will understand and use the tool. Simpler schemas (fewer parameters, no nesting, clear descriptions) correlate with higher tool call accuracy. This feature would cross into prompt engineering territory but could provide value alongside token cost analysis.

### Automated Schema Optimization

Instead of suggesting optimizations, automatically produce an optimized version of the tool definitions. Apply description shortening (via LLM summarization or rule-based truncation), enum reduction, and schema flattening automatically. Return the optimized tools alongside the original for comparison.

### Visual Report (HTML)

Generate an interactive HTML report with charts showing per-tool token distribution, cost projections over time, and before/after comparison. Useful for presenting cost optimization findings to stakeholders.

### Watch Mode

CLI watch mode (`--watch`) that re-analyzes tool definitions when the source file changes. Useful during development when iterating on tool schemas.

### Budget Enforcement

A `validateBudget(tools, maxTokens)` function that throws an error if total tool tokens exceed a threshold. Integrates into CI pipelines to prevent tool token budget regressions.

---

## 18. Examples

### Example: Basic Tool Cost Estimation

```typescript
import { estimateTools } from 'tool-cost-estimator';

const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City name' },
          units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        },
        required: ['location'],
      },
    },
  },
];

const report = estimateTools(tools);
console.log(`Total tool tokens: ${report.totalTokens}`);
console.log(`Context usage: ${report.contextWindowPercent.toFixed(2)}%`);
console.log(`Per-request cost (GPT-4o): $${report.costProjections['gpt-4o'].perRequest.toFixed(6)}`);
```

### Example: Analyzing a Large Tool Set

```typescript
import { analyzeToolSet } from 'tool-cost-estimator';

// Load tools from your application
const tools = loadToolDefinitions(); // 30 tools

const analysis = analyzeToolSet(tools, {
  contextWindows: {
    '128k': 128_000,
    '32k': 32_000,
    '8k': 8_000,
  },
});

console.log(`Total tool tokens: ${analysis.totalTokens}`);
console.log(`Context usage:`);
for (const [size, percent] of Object.entries(analysis.contextWindowUsage)) {
  console.log(`  ${size}: ${percent.toFixed(1)}%`);
}

console.log(`\nTop 5 most expensive tools:`);
for (const tool of analysis.ranking.slice(0, 5)) {
  console.log(`  ${tool.rank}. ${tool.name}: ${tool.totalTokens} tokens (${tool.percentOfTotal.toFixed(1)}%)`);
}

if (analysis.outliers.length > 0) {
  console.log(`\nOutliers (>${analysis.outliers[0].ratio.toFixed(1)}x median):`);
  for (const outlier of analysis.outliers) {
    console.log(`  ${outlier.name}: ${outlier.totalTokens} tokens (${outlier.reason})`);
  }
}
```

### Example: Getting Optimization Suggestions

```typescript
import { suggestOptimizations } from 'tool-cost-estimator';

const suggestions = suggestOptimizations(tools, {
  minSavings: 10,
  maxSuggestions: 10,
  descriptionLengthThreshold: 150,
  enumSizeThreshold: 8,
});

console.log(`Found ${suggestions.length} optimization suggestions:\n`);

for (const s of suggestions) {
  const icon = s.severity === 'high' ? '!!!' : s.severity === 'medium' ? '!!' : '!';
  console.log(`${s.priority}. [${icon}] ${s.toolName}`);
  console.log(`   ${s.message}`);
  console.log(`   Estimated savings: ~${s.estimatedSavings} tokens\n`);
}

const totalSavings = suggestions.reduce((sum, s) => sum + s.estimatedSavings, 0);
console.log(`Total potential savings: ~${totalSavings} tokens`);
```

### Example: Before/After Optimization Comparison

```typescript
import { estimateTools } from 'tool-cost-estimator';

// Before: verbose tool definitions
const before = estimateTools(originalTools);

// After: apply optimizations (shorten descriptions, reduce enums, etc.)
const after = estimateTools(optimizedTools);

const saved = before.totalTokens - after.totalTokens;
const percentSaved = (saved / before.totalTokens * 100).toFixed(1);

console.log(`Before: ${before.totalTokens} tokens`);
console.log(`After:  ${after.totalTokens} tokens`);
console.log(`Saved:  ${saved} tokens (${percentSaved}%)`);
console.log(`Monthly savings at 10K req/day (GPT-4o): $${(saved / 1_000_000 * 2.50 * 10_000 * 30).toFixed(2)}`);
```

### Example: Pre-Configured Estimator for OpenAI

```typescript
import { createEstimator } from 'tool-cost-estimator';

const estimator = await createEstimator({
  provider: 'openai',
  model: 'gpt-4o',
  tokenizer: 'tiktoken',
  contextWindow: 128_000,
  pricePerMTokInput: 2.50,
  pricePoints: {
    'gpt-4o': 2.50,
    'gpt-4o-mini': 0.15,
    'gpt-4.1': 2.00,
  },
});

// Use the estimator for multiple tool sets
const apiToolsReport = estimator.estimate(apiTools);
const mcpToolsReport = estimator.estimate(mcpTools);

console.log(`API tools: ${apiToolsReport.totalTokens} tokens`);
console.log(`MCP tools: ${mcpToolsReport.totalTokens} tokens`);
console.log(`Combined: ${apiToolsReport.totalTokens + mcpToolsReport.totalTokens} tokens`);
```

### Example: Analyzing MCP Server Tools

```typescript
import { estimateTools, suggestOptimizations } from 'tool-cost-estimator';

// MCP tool format
const mcpTools = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the given path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        encoding: { type: 'string', enum: ['utf-8', 'ascii', 'binary'], description: 'File encoding' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file at the given path',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
];

const report = estimateTools(mcpTools, { provider: 'anthropic' });
console.log(`MCP server tools: ${report.totalTokens} tokens`);

const suggestions = suggestOptimizations(mcpTools);
if (suggestions.length === 0) {
  console.log('Tool definitions are well-optimized. No suggestions.');
}
```

### Example: CLI Usage

```bash
# Analyze tool definitions from a file
$ tool-cost-estimator analyze my-tools.json

# Get JSON report for programmatic consumption
$ tool-cost-estimator analyze my-tools.json --format json | jq '.totalTokens'

# Analyze with Anthropic serialization format
$ tool-cost-estimator analyze my-tools.json --provider anthropic

# Get only optimization suggestions
$ tool-cost-estimator suggest my-tools.json

# Compare before and after optimization
$ tool-cost-estimator compare tools-v1.json tools-v2.json

# Pipe from another command
$ mcp-client list-tools --json | tool-cost-estimator analyze

# Use in CI to enforce a tool token budget
$ tool-cost-estimator analyze my-tools.json --format json | \
    jq -e '.totalTokens < 5000' || echo "Tool token budget exceeded!"
```

### Example: Integration with prompt-price

```typescript
import { estimateTools } from 'tool-cost-estimator';
import { estimate } from 'prompt-price';

const tools = loadTools(); // 25 tools

// Understand tool overhead in isolation
const toolReport = estimateTools(tools);
console.log(`Tool overhead: ${toolReport.totalTokens} tokens`);
console.log(`That's ${toolReport.contextWindowPercent.toFixed(1)}% of the context window`);

// See how tools affect total request cost
const messages = [
  { role: 'system', content: systemPrompt },
  { role: 'user', content: userMessage },
];

const withTools = await estimate(messages, 'openai/gpt-4o', {
  tools,
  estimatedOutputTokens: 1000,
});

const withoutTools = await estimate(messages, 'openai/gpt-4o', {
  estimatedOutputTokens: 1000,
});

const toolCostDelta = withTools.totalEstimatedCost - withoutTools.totalEstimatedCost;
console.log(`Cost with tools:    $${withTools.totalEstimatedCost.toFixed(4)}`);
console.log(`Cost without tools: $${withoutTools.totalEstimatedCost.toFixed(4)}`);
console.log(`Tool cost impact:   $${toolCostDelta.toFixed(4)} per request`);
console.log(`Monthly tool cost:  $${(toolCostDelta * 10_000 * 30).toFixed(2)} at 10K req/day`);
```
