# tool-cost-estimator — Task Breakdown

## Phase 1: Project Setup and Scaffolding

- [ ] **Install dev dependencies** — Add `typescript`, `vitest`, `eslint`, and `js-tiktoken` (as devDependency) to `package.json`. Run `npm install` to generate `node_modules` and `package-lock.json`. | Status: not_done
- [ ] **Configure ESLint** — Create an ESLint configuration file for TypeScript. Match conventions used in the broader monorepo. | Status: not_done
- [ ] **Add CLI binary entry to package.json** — Add a `"bin": { "tool-cost-estimator": "dist/cli.js" }` field to `package.json` so the CLI is available after global install or via `npx`. | Status: not_done
- [ ] **Add optional peer dependency for js-tiktoken** — Add `"peerDependencies": { "js-tiktoken": ">=1.0.0" }` with `"peerDependenciesMeta": { "js-tiktoken": { "optional": true } }` to `package.json`. | Status: not_done
- [ ] **Create the file structure** — Create all source files as defined in the spec: `src/index.ts`, `src/types.ts`, `src/estimate-tools.ts`, `src/analyze-tool-set.ts`, `src/suggest-optimizations.ts`, `src/create-estimator.ts`, `src/serializer.ts`, `src/openai-serializer.ts`, `src/json-serializer.ts`, `src/format-detector.ts`, `src/token-counter.ts`, `src/schema-walker.ts`, `src/cost-projections.ts`, `src/suggestion-rules.ts`, `src/cli.ts`. Create the test directory `src/__tests__/` with placeholder test files. | Status: not_done

## Phase 2: Core Types

- [ ] **Define all TypeScript interfaces and types in `src/types.ts`** — Implement every type from the spec: `OpenAIToolDefinition`, `AnthropicToolDefinition`, `MCPToolDefinition`, `ToolDefinition` (union type), `JsonSchema`, `EstimateToolsOptions`, `AnalyzeOptions`, `OptimizationOptions`, `EstimatorConfig`, `Estimator`, `ToolCostReport`, `ToolAnalysis`, `CostProjection`, `ToolSetAnalysis`, `OptimizationSuggestion`. Ensure all fields, optionality markers, and JSDoc comments match the spec exactly. | Status: not_done
- [ ] **Export all types from `src/index.ts`** — Re-export every public type from `src/types.ts` and every public function from the other modules, matching the `Type Exports` section of the spec. | Status: not_done

## Phase 3: Format Detection

- [ ] **Implement format detector in `src/format-detector.ts`** — Write a function that accepts a `ToolDefinition[]` and returns `'openai' | 'anthropic' | 'mcp'`. Detection rules: if the object has `type: 'function'` and `function.name`, it is OpenAI format; if it has `name` and `input_schema`, it is Anthropic format; if it has `name` and `inputSchema`, it is MCP format; if it has `name` and no schema key, default to Anthropic. | Status: not_done
- [ ] **Handle mixed format arrays** — If the tool array contains a mix of OpenAI and Anthropic/MCP formats, throw a descriptive error. All tools in a single call must be the same format (or auto-detectable as a single format). | Status: not_done
- [ ] **Support explicit format override** — When the caller passes `options.provider`, skip auto-detection and use the specified format. The detector should still validate that the tools are structurally compatible with the specified format. | Status: not_done
- [ ] **Write format detection tests in `src/__tests__/format-detector.test.ts`** — Test cases: OpenAI format detected correctly, Anthropic format detected correctly, MCP format detected correctly, ambiguous (name only, no schema) defaults to Anthropic, mixed array throws error, explicit provider override works. | Status: not_done

## Phase 4: JSON Schema Walker

- [ ] **Implement schema walker in `src/schema-walker.ts`** — Write a tree-traversal utility that walks a `JsonSchema` object and extracts metadata: property names, types, descriptions, enum values, required fields, nesting depth, `additionalProperties` usage, `default` values, `examples` arrays, and `oneOf`/`anyOf`/`allOf` combinators. | Status: not_done
- [ ] **Calculate maximum nesting depth** — Recursively walk nested `properties` and `items` to determine the deepest level. Flat schema = depth 0, one level of nesting = depth 1, etc. | Status: not_done
- [ ] **Count parameters, required parameters, enum parameters, and total enum values** — Walk the schema and count: total number of top-level properties (`parameterCount`), number of properties in the `required` array (`requiredParameterCount`), number of properties with `enum` constraints (`enumParameterCount`), and total number of enum values across all properties (`totalEnumValues`). | Status: not_done
- [ ] **Handle edge cases in schema walker** — Support: empty `properties` object, `undefined` properties, deeply nested schemas (10+ levels), `$ref` references (treat as opaque, do not resolve), `oneOf`/`anyOf`/`allOf` combinators (walk each branch), array items with complex schemas. | Status: not_done
- [ ] **Write schema walker tests in `src/__tests__/schema-walker.test.ts`** — Test: flat schema, nested schema, deeply nested schema (10+ levels), schema with enums, schema with arrays, schema with combinators, empty schema, schema with `$ref`, parameter and enum counting accuracy, nesting depth calculation. | Status: not_done

## Phase 5: Token Counting

- [ ] **Implement heuristic token counter in `src/token-counter.ts`** — Default counter using `Math.ceil(text.length / 3.9)`. The ratio 3.9 chars/token is calibrated for JSON/TypeScript-like syntax. Export a function `countTokensHeuristic(text: string): number`. | Status: not_done
- [ ] **Implement tiktoken integration in `src/token-counter.ts`** — Optionally load `js-tiktoken` and use the appropriate BPE encoding (`cl100k_base` for GPT-4, `o200k_base` for newer models). Handle the case where `js-tiktoken` is not installed (fall back to heuristic with a warning or throw if explicitly requested). | Status: not_done
- [ ] **Support custom token counter function** — When `options.tokenCounter` is provided, use it directly instead of the heuristic or tiktoken. The custom function signature is `(text: string) => number`. | Status: not_done
- [ ] **Create token counter factory** — Export a `createTokenCounter(options)` function that returns the appropriate counter based on `options.tokenizer` and `options.tokenCounter`. Used internally by `estimateTools` and `createEstimator`. | Status: not_done
- [ ] **Write token counter tests in `src/__tests__/token-counter.test.ts`** — Test: heuristic returns expected count for known strings, heuristic rounds up (never underestimates), empty string returns 0, long text produces proportionally more tokens, count is deterministic, custom counter is called when provided, tiktoken integration produces exact counts (when `js-tiktoken` is available as devDependency). | Status: not_done

## Phase 6: Tool Serialization — OpenAI Format

- [ ] **Implement OpenAI serializer in `src/openai-serializer.ts`** — Serialize tool definitions into the TypeScript-like namespace format that OpenAI uses internally. Generate the preamble (`namespace functions {\n\n`), per-tool function signatures, description comments, parameter types, optional markers, enum unions, and closing braces. Follow the exact serialization rules in the spec (Section 5). | Status: not_done
- [ ] **Serialize string parameters** — Output `paramName: string`. If the parameter has an `enum`, output `paramName: "val1" | "val2" | "val3"`. | Status: not_done
- [ ] **Serialize number/integer parameters** — Output `paramName: number`. | Status: not_done
- [ ] **Serialize boolean parameters** — Output `paramName: boolean`. | Status: not_done
- [ ] **Serialize array parameters** — Output `paramName: <itemType>[]`. For complex item types, expand the inner type inline. | Status: not_done
- [ ] **Serialize nested object parameters** — Output `paramName: { <properties> }` with recursive per-property serialization. | Status: not_done
- [ ] **Handle optional parameters** — Parameters not listed in `required` get a `?` suffix: `paramName?: type`. | Status: not_done
- [ ] **Handle tool descriptions** — Serialize descriptions as `// <description>\n` comments before the function signature. Omit the comment line if the tool has no description. | Status: not_done
- [ ] **Handle parameter descriptions** — Serialize parameter descriptions as `// <description>` inline comments after the parameter type on the same line. | Status: not_done
- [ ] **Handle tools with no parameters** — Serialize as a function with empty parameter object: `type name = (_: {}) => any;`. | Status: not_done
- [ ] **Generate namespace preamble** — Output `namespace functions {\n\n` once for the entire tool set. Count the preamble tokens separately as `preambleTokens`. | Status: not_done
- [ ] **Write OpenAI serializer tests in `src/__tests__/openai-serializer.test.ts`** — Test all cases from spec Section 13: no params, string param, enum param, number param, boolean param, array param, nested object, optional markers, description comments, param descriptions, no description omits comment, multiple tools share preamble, empty parameters. | Status: not_done

## Phase 7: Tool Serialization — Anthropic/MCP Format

- [ ] **Implement JSON serializer in `src/json-serializer.ts`** — Serialize tool definitions into compact JSON format matching Anthropic's representation. Output `{ "name": ..., "description": ..., "input_schema": { "type": "object", "properties": {...}, "required": [...] } }`. For MCP format, use `inputSchema` instead of `input_schema`. | Status: not_done
- [ ] **Preserve all JSON Schema fields** — Include all schema fields (type, properties, descriptions, enums, defaults, additionalProperties, etc.) in the serialized output. | Status: not_done
- [ ] **Handle nested schemas in JSON serialization** — Recursively serialize nested `properties` and `items` with proper structure. | Status: not_done
- [ ] **Write JSON serializer tests in `src/__tests__/json-serializer.test.ts`** — Test: compact JSON output matches expected format, all JSON Schema fields preserved, nested schemas serialize correctly, Anthropic `input_schema` vs MCP `inputSchema` key naming. | Status: not_done

## Phase 8: Serializer Dispatcher

- [ ] **Implement serializer dispatcher in `src/serializer.ts`** — Export a `serializeTools(tools, provider)` function that delegates to the appropriate serializer based on the detected or specified provider. Returns an object with `preamble` (string), `perToolSerialized` (array of per-tool serialized strings), and metadata for per-component breakdown. | Status: not_done
- [ ] **Return per-component serialization** — For each tool, return separate serialized strings for: name, description, parameters (including enums), and structural tokens. This enables the per-component token breakdown in `ToolAnalysis.breakdown`. | Status: not_done

## Phase 9: Per-Tool Token Breakdown

- [ ] **Implement per-tool analysis logic** — For each tool, compute the `ToolAnalysis` object: count tokens for each component (name, description, parameters, enums, structural), compute `totalTokens` as the sum, compute `percentOfTotal` relative to the entire tool set, and populate metadata fields (`parameterCount`, `requiredParameterCount`, `enumParameterCount`, `totalEnumValues`, `descriptionLength`, `maxNestingDepth`). | Status: not_done
- [ ] **Compute `breakdown.nameTokens`** — Count tokens of the tool name string alone. | Status: not_done
- [ ] **Compute `breakdown.descriptionTokens`** — Count tokens of the description text alone. | Status: not_done
- [ ] **Compute `breakdown.parameterTokens`** — Count tokens for all parameter names, types, descriptions, and constraints combined. | Status: not_done
- [ ] **Compute `breakdown.enumTokens`** — Count tokens for all enum value lists across all parameters. This is a subset of `parameterTokens`. | Status: not_done
- [ ] **Compute `breakdown.structuralTokens`** — Calculate as the residual: `totalTokens - nameTokens - descriptionTokens - parameterTokens`. This captures braces, colons, commas, function signature wrapper, etc. | Status: not_done
- [ ] **Include serialized output when requested** — When `options.includeSerialized` is `true`, set the `serialized` field on each `ToolAnalysis` with the full serialized string. Omit it otherwise. | Status: not_done

## Phase 10: Cost Projections

- [ ] **Implement cost projection calculator in `src/cost-projections.ts`** — Given total tool tokens and price configuration, compute `CostProjection` objects for each model price point. | Status: not_done
- [ ] **Calculate per-request cost** — Formula: `totalTokens / 1_000_000 * pricePerMTokInput`. | Status: not_done
- [ ] **Calculate per-day and per-month costs** — Compute costs at request volume tiers: 1,000, 10,000, and 100,000 requests/day. Monthly cost = daily cost * 30. | Status: not_done
- [ ] **Support default price points** — When no custom `pricePoints` are specified, include default price points: GPT-4o ($2.50/MTok), GPT-4.1 ($2.00/MTok), Claude Sonnet ($3.00/MTok), GPT-4o-mini ($0.15/MTok), Gemini Flash ($0.075/MTok). | Status: not_done
- [ ] **Support custom price points** — When `options.pricePoints` is provided, use those price points (either replacing or supplementing defaults). | Status: not_done
- [ ] **Round costs to 6 decimal places** — All USD cost values should be rounded to 6 decimal places for precision. | Status: not_done
- [ ] **Write cost projection tests in `src/__tests__/cost-projections.test.ts`** — Test: per-request cost formula, per-day at 1K requests, per-month = per-day * 30, custom price points produce correct projections, default price points are included, rounding to 6 decimal places. | Status: not_done

## Phase 11: `estimateTools()` Main Function

- [ ] **Implement `estimateTools()` in `src/estimate-tools.ts`** — This is the primary entry point. It orchestrates: (1) format detection, (2) serialization, (3) token counting, (4) per-tool analysis, (5) aggregate stats, and (6) cost projections. Returns a `ToolCostReport`. | Status: not_done
- [ ] **Compute `totalTokens`** — Sum of all per-tool `totalTokens` plus `preambleTokens`. | Status: not_done
- [ ] **Compute `contextWindowPercent`** — `(totalTokens / contextWindow) * 100`. Default context window is 128,000. | Status: not_done
- [ ] **Compute summary statistics** — Calculate `meanTokensPerTool`, `medianTokensPerTool`, `minTokens`, `maxTokens`, `mostExpensiveTool`, `leastExpensiveTool`. | Status: not_done
- [ ] **Sort perTool by totalTokens descending** — The `perTool` array in the report must be sorted by `totalTokens` in descending order. | Status: not_done
- [ ] **Handle empty tools array** — If the input is an empty array, return a report with zero totals, empty `perTool`, empty `costProjections`, and sensible defaults for stats. | Status: not_done
- [ ] **Handle single tool** — A single-tool array should produce that tool as both `mostExpensiveTool` and `leastExpensiveTool`. | Status: not_done
- [ ] **Ensure synchronous operation** — The function must be synchronous (no async/await). It uses the heuristic tokenizer by default. For tiktoken, users must use `createEstimator()`. | Status: not_done
- [ ] **Write `estimateTools()` tests in `src/__tests__/estimate-tools.test.ts`** — Test: basic 2-tool estimation matches expected structure, totalTokens is sum of perTool plus preamble, contextWindowPercent calculated correctly, stats are accurate, perTool is sorted descending, empty array handled, single tool handled, OpenAI format works, Anthropic format works, MCP format works, custom tokenCounter works, includeSerialized works. | Status: not_done

## Phase 12: `analyzeToolSet()` Function

- [ ] **Implement `analyzeToolSet()` in `src/analyze-tool-set.ts`** — Extends `estimateTools()` to produce a `ToolSetAnalysis` with additional fields: `contextWindowUsage` (percentage at multiple window sizes), `outliers` (tools exceeding threshold * median), and `ranking` (tools sorted by cost with rank numbers). | Status: not_done
- [ ] **Compute context window usage at multiple sizes** — Default sizes: `{ '128k': 128000, '32k': 32000, '8k': 8000 }`. Overridable via `options.contextWindows`. | Status: not_done
- [ ] **Implement outlier detection** — A tool is an outlier if `toolTokens > outlierThreshold * medianTokens`. Default threshold is 2.0. For each outlier, include `name`, `totalTokens`, `medianTokens`, `ratio`, and `reason` (descriptive string). | Status: not_done
- [ ] **Generate ranking array** — Sort tools by `totalTokens` descending. Each entry has `rank` (1-indexed), `name`, `totalTokens`, `percentOfTotal`. | Status: not_done
- [ ] **Write `analyzeToolSet()` tests in `src/__tests__/analyze-tool-set.test.ts`** — Test: contextWindowUsage at multiple sizes, outliers detected when threshold exceeded, no outliers when all tools similar, ranking sorted correctly, empty array produces empty results, single tool is rank 1 with no outliers, custom outlierThreshold works, custom contextWindows works. | Status: not_done

## Phase 13: Optimization Suggestion Rules

- [ ] **Implement Rule 1: `shorten-description`** — Trigger when tool description exceeds 200 characters (configurable via `descriptionLengthThreshold`). Estimate savings as the token difference between current description and a 100-character version. Generate a message showing current length, token count, and suggested shorter version. | Status: not_done
- [ ] **Implement Rule 2: `trim-param-descriptions`** — Trigger when any parameter description exceeds 100 characters, or sum of all parameter descriptions exceeds 300 characters. Identify self-documenting parameter names where descriptions add little value. Estimate savings from removing or shortening. | Status: not_done
- [ ] **Implement Rule 3: `reduce-enum`** — Trigger when any parameter has an enum with more than 10 values (configurable via `enumSizeThreshold`). Estimate savings from replacing the enum with a string type and brief description. | Status: not_done
- [ ] **Implement Rule 4: `remove-optional-params`** — Trigger when a tool has more than 5 optional parameters (configurable via `optionalParamThreshold`). Suggest splitting into basic and advanced tool variants. | Status: not_done
- [ ] **Implement Rule 5: `flatten-schema`** — Trigger when parameter schema nesting depth exceeds 2 levels (configurable via `nestingDepthThreshold`). Estimate savings from flattening nested objects to dot-notation. | Status: not_done
- [ ] **Implement Rule 6: `merge-similar-tools`** — Trigger when two or more tools share a common name prefix and have >50% parameter name overlap. Estimate savings from eliminating redundant per-tool structural overhead. | Status: not_done
- [ ] **Implement Rule 7: `filter-per-request`** — Trigger when total tool set exceeds 15 tools (configurable via `toolCountThreshold`). This is a cross-tool suggestion (toolName = `'*'`). Estimate savings assuming 30-50% of tools are relevant per request. | Status: not_done
- [ ] **Implement Rule 8: `remove-redundant-fields`** — Trigger when schema includes `additionalProperties: false`, `default` values, or `examples` arrays. Count tokens consumed by these fields and suggest removal. | Status: not_done
- [ ] **Write suggestion rule tests in `src/__tests__/suggestion-rules.test.ts`** — Test each rule independently: trigger condition met produces suggestion, trigger condition not met produces nothing. Test with exact threshold boundary values. Test that estimated savings are reasonable. | Status: not_done

## Phase 14: `suggestOptimizations()` Function

- [ ] **Implement `suggestOptimizations()` in `src/suggest-optimizations.ts`** — Run all 8 suggestion rules against the tool set. Collect all suggestions, sort by `estimatedSavings` descending, assign sequential `priority` values (1 = highest savings), and compute `severity` (`high` > 100 tokens, `medium` 20-100, `low` < 20). | Status: not_done
- [ ] **Apply `minSavings` filter** — Exclude suggestions with `estimatedSavings` below `options.minSavings` (default 5 tokens). | Status: not_done
- [ ] **Apply `maxSuggestions` limit** — Return at most `options.maxSuggestions` suggestions (default 20). | Status: not_done
- [ ] **Write `suggestOptimizations()` tests in `src/__tests__/suggest-optimizations.test.ts`** — Test: suggestions sorted by savings descending, priority is sequential from 1, severity thresholds are correct, minSavings filters low-impact suggestions, maxSuggestions limits output, all 8 rule types can appear in results, empty tools array returns empty suggestions. | Status: not_done

## Phase 15: `createEstimator()` Factory

- [ ] **Implement `createEstimator()` in `src/create-estimator.ts`** — Async factory that returns an `Estimator` object with `estimate()`, `analyze()`, and `suggest()` methods. Pre-configures the provider, model, tokenizer, context window, and price points from `EstimatorConfig`. | Status: not_done
- [ ] **Handle tiktoken initialization** — When `tokenizer: 'tiktoken'` is specified, asynchronously load `js-tiktoken` and initialize the appropriate BPE encoder. Cache the encoder for reuse across calls. If `js-tiktoken` is not installed, throw a clear error. | Status: not_done
- [ ] **Handle heuristic tokenizer** — When `tokenizer: 'heuristic'` (default), resolve the promise immediately without loading any external module. | Status: not_done
- [ ] **Bind configuration to methods** — The returned `estimate()`, `analyze()`, and `suggest()` methods should use the pre-configured options from `EstimatorConfig`, merging them with the tool definitions passed to each call. | Status: not_done
- [ ] **Write `createEstimator()` tests in `src/__tests__/create-estimator.test.ts`** — Test: returns object with `estimate`, `analyze`, `suggest` methods, pre-configured provider is used, pre-configured context window is used, heuristic tokenizer works, tiktoken tokenizer initializes (with devDependency), custom tokenCounter works, config is reused across multiple calls. | Status: not_done

## Phase 16: CLI Implementation

- [ ] **Implement CLI entry point in `src/cli.ts`** — Use Node.js built-in `util.parseArgs` (Node 18+) for argument parsing. Add a shebang line (`#!/usr/bin/env node`) at the top. Parse commands (`analyze`, `suggest`, `compare`) and flags. | Status: not_done
- [ ] **Implement `analyze` command** — Read tool definitions from a JSON file path argument or stdin. Run `estimateTools()` and `analyzeToolSet()`. Print human-readable report by default or JSON report with `--format json`. Include optimization suggestions by default (disable with `--no-suggestions`). | Status: not_done
- [ ] **Implement `suggest` command** — Read tool definitions from file or stdin. Run `suggestOptimizations()`. Print only the optimization suggestions with priority, severity, and total potential savings. | Status: not_done
- [ ] **Implement `compare` command** — Accept two file paths. Run `estimateTools()` on both. Print a side-by-side comparison showing before/after totals, delta, percentage change, context usage change, per-request cost change, and top per-tool changes. | Status: not_done
- [ ] **Implement stdin reading** — When no file argument is provided, read JSON from stdin. Support piped input (`cat tools.json | tool-cost-estimator analyze`). | Status: not_done
- [ ] **Implement human-readable output formatting** — Format the report with aligned columns, box-drawing characters, and clear sections matching the examples in the spec (Section 11). Include version header, provider info, per-tool breakdown table, summary, cost projections, and optimization suggestions. | Status: not_done
- [ ] **Implement JSON output formatting** — With `--format json`, output the `ToolCostReport` (or `ToolSetAnalysis`) as pretty-printed JSON to stdout. | Status: not_done
- [ ] **Implement all CLI flags** — Support: `--provider <provider>`, `--context-window <tokens>`, `--price <usd>`, `--format <format>`, `--include-serialized`, `--suggestions` / `--no-suggestions`, `--version`, `--help`. | Status: not_done
- [ ] **Implement environment variable support** — Read `TOOL_COST_PROVIDER`, `TOOL_COST_FORMAT`, and `TOOL_COST_CONTEXT_WINDOW` from environment variables. CLI flags take precedence over environment variables. | Status: not_done
- [ ] **Implement exit codes** — Exit 0 on success, 1 for analysis errors (invalid JSON, unreadable file, invalid tool definitions), 2 for configuration errors (invalid flags, missing input). | Status: not_done
- [ ] **Implement `--help` output** — Print usage information showing all commands, flags, and examples. | Status: not_done
- [ ] **Implement `--version` output** — Read version from `package.json` and print it. | Status: not_done
- [ ] **Write CLI tests in `src/__tests__/cli.test.ts`** — Test: `analyze` with file exits 0 and produces output, `analyze --format json` outputs valid JSON, `suggest` prints suggestions, `compare` prints comparison, stdin input works, `--provider openai` forces format, `--context-window` changes percentage, `--help` and `--version` work, invalid JSON file exits 1, missing file exits 1, invalid flags exit 2. | Status: not_done

## Phase 17: Edge Cases and Error Handling

- [ ] **Handle tool with empty string name** — Produce 0 name tokens, still count other components. | Status: not_done
- [ ] **Handle tool with no description (`undefined`)** — Produce 0 description tokens, omit description comment in OpenAI serialization. | Status: not_done
- [ ] **Handle tool with no parameters** — `parameters` is `undefined` or empty `{ type: 'object', properties: {} }`. Produce 0 parameter tokens, serialize as empty parameter object. | Status: not_done
- [ ] **Handle deeply nested schemas (10+ levels)** — Schema walker and serializer must handle deep recursion without stack overflow. Consider iterative approach if needed. | Status: not_done
- [ ] **Handle recursive schemas (`$ref`)** — Treat `$ref` as opaque (do not attempt to resolve). Count the `$ref` string as tokens but do not follow it. | Status: not_done
- [ ] **Handle `oneOf`/`anyOf`/`allOf` combinators** — Walk each branch of the combinator and count tokens for all alternatives. | Status: not_done
- [ ] **Handle very large enums (100+ values)** — Correctly count all enum values. May trigger the `reduce-enum` optimization suggestion. | Status: not_done
- [ ] **Handle array parameters with complex item schemas** — Serialize and count the inner type, including nested objects, enums, and combinators within array items. | Status: not_done
- [ ] **Handle non-ASCII characters** — Descriptions with Unicode, CJK characters, or emoji should be counted correctly by the heuristic (chars/token ratio may differ for non-English text). | Status: not_done
- [ ] **Handle very long tool names (50+ characters)** — Name token count should scale proportionally. | Status: not_done
- [ ] **Handle parameter names with special characters** — Special characters in property names should be serialized and counted correctly. | Status: not_done
- [ ] **Handle 100+ tools in a single call** — Performance should remain under 50ms with heuristic counting. No memory issues. | Status: not_done

## Phase 18: Integration Testing

- [ ] **End-to-end test: OpenAI tools through full pipeline** — Create a realistic set of 5-10 OpenAI-format tools, run `estimateTools()`, verify the report structure, token counts are reasonable, stats are accurate, cost projections are computed. | Status: not_done
- [ ] **End-to-end test: Anthropic tools through full pipeline** — Same as above but with Anthropic-format tools. Verify JSON serialization is used. | Status: not_done
- [ ] **End-to-end test: MCP tools through full pipeline** — Same as above but with MCP-format tools (`inputSchema`). | Status: not_done
- [ ] **End-to-end test: `analyzeToolSet()` with outliers** — Create a tool set where one tool is deliberately 3x larger than the median. Verify it appears in the `outliers` array. | Status: not_done
- [ ] **End-to-end test: `suggestOptimizations()` with all rule types** — Create a tool set that triggers all 8 optimization rules. Verify all 8 suggestion types appear in the output. | Status: not_done
- [ ] **End-to-end test: `createEstimator()` with heuristic** — Create an estimator with heuristic tokenizer, call `estimate()`, `analyze()`, and `suggest()`, verify all return correct types. | Status: not_done
- [ ] **End-to-end test: `compare` CLI command** — Create two tool definition files (before/after), run the CLI `compare` command, verify output shows correct deltas. | Status: not_done
- [ ] **End-to-end test: large tool set performance** — Create 100+ tools, run `estimateTools()`, verify it completes in under 50ms. | Status: not_done

## Phase 19: Public API Exports

- [ ] **Wire up all exports in `src/index.ts`** — Export `estimateTools`, `analyzeToolSet`, `suggestOptimizations`, `createEstimator` as named function exports. Export all types with `export type { ... }`. Ensure no internal implementation details leak through the public API. | Status: not_done
- [ ] **Verify TypeScript declarations** — Run `tsc` and verify that `dist/index.d.ts` contains all expected type exports and function signatures. Ensure consumers get full autocomplete and type checking. | Status: not_done

## Phase 20: Build, Lint, and Test Verification

- [ ] **Verify `npm run build` succeeds** — Run `tsc` and confirm it compiles without errors. Check that `dist/` contains all expected `.js`, `.d.ts`, and `.js.map` files. | Status: not_done
- [ ] **Verify `npm run lint` passes** — Run ESLint on `src/` and fix any linting errors. | Status: not_done
- [ ] **Verify `npm run test` passes** — Run `vitest run` and confirm all tests pass. Target 100% of specified test cases. | Status: not_done
- [ ] **Verify CLI binary works** — Run `node dist/cli.js analyze <test-file>` and verify it produces expected output. Test both human-readable and JSON formats. | Status: not_done

## Phase 21: Documentation

- [ ] **Write README.md** — Create a comprehensive README with: package description, installation instructions, quick start example, API documentation for all 4 public functions, CLI usage with all commands and flags, configuration options table, cost projection explanation, optimization suggestions explanation, integration examples with monorepo packages. | Status: not_done
- [ ] **Add JSDoc comments to all public functions** — Ensure `estimateTools`, `analyzeToolSet`, `suggestOptimizations`, and `createEstimator` have JSDoc comments with `@param`, `@returns`, and `@example` tags. | Status: not_done
- [ ] **Verify inline code comments** — Ensure complex logic (serialization rules, suggestion rules, outlier detection) has clear inline comments explaining the "why". | Status: not_done

## Phase 22: Version Bump and Publish Preparation

- [ ] **Bump version in package.json** — If any code changes were made beyond the initial scaffold, bump the version appropriately (patch for fixes, minor for features). The spec indicates initial version 0.1.0. | Status: not_done
- [ ] **Verify `package.json` fields** — Ensure `name`, `version`, `description`, `main`, `types`, `bin`, `files`, `engines`, `publishConfig`, `keywords`, `license`, and `author` are all set correctly. | Status: not_done
- [ ] **Verify `files` field includes `dist` only** — Ensure only the `dist` directory is published to npm (no `src`, no tests, no spec). | Status: not_done
- [ ] **Test `npm pack` output** — Run `npm pack --dry-run` and verify the tarball contains only expected files. | Status: not_done
