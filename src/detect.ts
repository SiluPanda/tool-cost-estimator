import type { ToolDefinition, JsonSchema, OpenAIToolDefinition, AnthropicToolDefinition, MCPToolDefinition } from './types.js';

export function detectFormat(tool: unknown): 'openai' | 'anthropic' | 'mcp' {
  if (tool === null || typeof tool !== 'object') return 'anthropic';
  const t = tool as Record<string, unknown>;

  // OpenAI: has type === 'function' and function.name
  if (
    t['type'] === 'function' &&
    typeof t['function'] === 'object' &&
    t['function'] !== null &&
    typeof (t['function'] as Record<string, unknown>)['name'] === 'string'
  ) {
    return 'openai';
  }

  // MCP: has name and inputSchema
  if (typeof t['name'] === 'string' && 'inputSchema' in t) {
    return 'mcp';
  }

  // Default to anthropic (has name and optionally description / input_schema)
  return 'anthropic';
}

export function normalizeToolName(tool: ToolDefinition): string {
  const format = detectFormat(tool);
  if (format === 'openai') {
    return (tool as OpenAIToolDefinition).function.name;
  }
  return (tool as AnthropicToolDefinition | MCPToolDefinition).name;
}

export function normalizeDescription(tool: ToolDefinition): string | undefined {
  const format = detectFormat(tool);
  if (format === 'openai') {
    return (tool as OpenAIToolDefinition).function.description;
  }
  return (tool as AnthropicToolDefinition | MCPToolDefinition).description;
}

export function normalizeSchema(tool: ToolDefinition): JsonSchema | undefined {
  const format = detectFormat(tool);
  if (format === 'openai') {
    return (tool as OpenAIToolDefinition).function.parameters;
  }
  if (format === 'mcp') {
    return (tool as MCPToolDefinition).inputSchema;
  }
  return (tool as AnthropicToolDefinition).input_schema;
}
