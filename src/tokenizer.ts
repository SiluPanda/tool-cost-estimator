import type { ToolDefinition, JsonSchema } from './types.js';
import { detectFormat, normalizeToolName, normalizeDescription, normalizeSchema } from './detect.js';

export function heuristicCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.9);
}

export function countSchemaTokens(
  schema: JsonSchema | undefined,
  counter: (s: string) => number
): number {
  if (!schema) return 0;
  let tokens = 0;

  // Count type token
  if (schema.type) {
    tokens += counter(schema.type);
  }

  // Count description
  if (schema.description) {
    tokens += counter(schema.description);
  }

  // Count enum values
  if (schema.enum) {
    for (const val of schema.enum) {
      tokens += counter(String(val));
    }
  }

  // Count properties recursively
  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      tokens += counter(key);
      tokens += countSchemaTokens(value as JsonSchema, counter);
    }
  }

  // Count items recursively
  if (schema.items) {
    tokens += countSchemaTokens(schema.items as JsonSchema, counter);
  }

  // Count required field names
  if (schema.required) {
    for (const req of schema.required) {
      tokens += counter(req);
    }
  }

  return tokens;
}

export function serializeOpenAI(tool: ToolDefinition): string {
  const name = normalizeToolName(tool);
  const description = normalizeDescription(tool);
  const schema = normalizeSchema(tool);

  const lines: string[] = [];
  lines.push('namespace functions {');
  if (description) {
    lines.push(`// ${description}`);
  }

  const params: string[] = [];
  if (schema && schema.properties) {
    const required = schema.required ?? [];
    for (const [key, value] of Object.entries(schema.properties)) {
      const v = value as JsonSchema;
      const optional = !required.includes(key);
      const typeStr = v.type ?? 'unknown';
      const descStr = v.description ? ` // ${v.description}` : '';
      params.push(`${key}${optional ? '?' : ''}: ${typeStr},${descStr}`);
    }
  }

  if (params.length > 0) {
    lines.push(`type ${name} = (_: {`);
    for (const p of params) {
      lines.push(p);
    }
    lines.push('}) => any;');
  } else {
    lines.push(`type ${name} = () => any;`);
  }

  lines.push('}');
  return lines.join('\n');
}

export function serializeAnthropic(tool: ToolDefinition): string {
  const name = normalizeToolName(tool);
  const description = normalizeDescription(tool);
  const schema = normalizeSchema(tool);

  const format = detectFormat(tool);
  if (format === 'mcp') {
    return JSON.stringify({ name, description, inputSchema: schema });
  }
  return JSON.stringify({ name, description, input_schema: schema });
}
