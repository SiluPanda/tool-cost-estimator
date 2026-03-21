import type { JsonSchema } from './types.js';

export function countProperties(schema: JsonSchema | undefined): number {
  if (!schema) return 0;
  let count = 0;
  if (schema.properties) {
    for (const [, value] of Object.entries(schema.properties)) {
      const v = value as JsonSchema;
      if (v.type === 'object' && v.properties) {
        count += countProperties(v);
      } else if (v.type === 'array' && v.items) {
        count += countProperties(v.items as JsonSchema);
      } else {
        count += 1;
      }
    }
  }
  if (schema.items) {
    const items = schema.items as JsonSchema;
    if (items.type === 'object' && items.properties) {
      count += countProperties(items);
    } else {
      count += 1;
    }
  }
  return count;
}

export function countEnumParams(schema: JsonSchema | undefined): number {
  if (!schema) return 0;
  let count = 0;
  if (schema.enum) count += 1;
  if (schema.properties) {
    for (const [, value] of Object.entries(schema.properties)) {
      count += countEnumParams(value as JsonSchema);
    }
  }
  if (schema.items) {
    count += countEnumParams(schema.items as JsonSchema);
  }
  return count;
}

export function getRequiredCount(schema: JsonSchema | undefined): number {
  if (!schema || !schema.required) return 0;
  return schema.required.length;
}

export function getMaxNestingDepth(schema: JsonSchema | undefined, depth = 0): number {
  if (!schema) return depth;
  let max = depth;
  if (schema.properties) {
    for (const [, value] of Object.entries(schema.properties)) {
      const v = value as JsonSchema;
      if (v.type === 'object' || v.type === 'array') {
        const childDepth = getMaxNestingDepth(v, depth + 1);
        if (childDepth > max) max = childDepth;
      }
    }
  }
  if (schema.items) {
    const childDepth = getMaxNestingDepth(schema.items as JsonSchema, depth + 1);
    if (childDepth > max) max = childDepth;
  }
  return max;
}

export function collectEnumValues(schema: JsonSchema | undefined): string[] {
  if (!schema) return [];
  const values: string[] = [];
  if (schema.enum) {
    for (const v of schema.enum) {
      values.push(String(v));
    }
  }
  if (schema.properties) {
    for (const [, value] of Object.entries(schema.properties)) {
      values.push(...collectEnumValues(value as JsonSchema));
    }
  }
  if (schema.items) {
    values.push(...collectEnumValues(schema.items as JsonSchema));
  }
  return values;
}
