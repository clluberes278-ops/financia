import contract from './openapi.json';

// Deliberately limited JSON Schema 2020-12 subset used by this API. Unknown assertion keywords fail closed.
const MAX_DEPTH = 128;
const MAX_VISITS = 5_000_000;
const schemaKeywords = new Set([
  '$ref', 'type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const',
  'oneOf', 'anyOf', 'allOf', 'pattern', 'minLength', 'maxLength', 'format',
  'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minItems', 'maxItems', 'minProperties', 'maxProperties',
]);
const annotations = new Set(['title', 'description', 'default', 'examples', 'example', 'deprecated', 'readOnly', 'writeOnly']);
const typeNames = new Set(['null', 'boolean', 'object', 'array', 'number', 'integer', 'string']);
const formats = new Set(['date-time', 'uuid', 'int32', 'int64', 'float', 'double', 'decimal']);
const lengthKeywords = ['minLength', 'maxLength', 'minItems', 'maxItems', 'minProperties', 'maxProperties'] as const;
const numberKeywords = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'] as const;
interface Budget { remaining: number }
type Schema = boolean | Record<string, unknown>;

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function step(budget: Budget, depth: number): boolean {
  budget.remaining--;
  return depth <= MAX_DEPTH && budget.remaining >= 0;
}

// JSON.parse can only produce these values. In particular, Date, getters, sparse arrays and cycles
// must not bypass constraints when a custom transport passes JavaScript values instead of parsed JSON.
function jsonValue(value: unknown, budget: Budget, depth = 0, ancestors = new Set<object>()): boolean {
  if (!step(budget, depth)) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || (!Array.isArray(value) && !record(value)) || ancestors.has(value)) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertyNames(value).length !== value.length + 1) return false;
      for (let index = 0; index < value.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
          || !jsonValue(descriptor.value, budget, depth + 1, ancestors)) return false;
      }
      return true;
    }
    for (const key of Object.getOwnPropertyNames(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
        || !jsonValue(descriptor.value, budget, depth + 1, ancestors)) return false;
    }
    return true;
  } finally { ancestors.delete(value); }
}

function resolve(reference: unknown): unknown {
  const prefix = '#/components/schemas/';
  if (typeof reference !== 'string' || !reference.startsWith(prefix)) return undefined;
  const segment = reference.slice(prefix.length);
  if (segment.includes('/') || /~(?:[^01]|$)/u.test(segment)) return undefined;
  const name = segment.replace(/~1/gu, '/').replace(/~0/gu, '~');
  const document: unknown = contract;
  if (!record(document) || !Object.hasOwn(document, 'components') || !record(document.components)
    || !Object.hasOwn(document.components, 'schemas') || !record(document.components.schemas)) return undefined;
  return Object.hasOwn(document.components.schemas, name) ? document.components.schemas[name] : undefined;
}

function schemaValid(value: unknown, budget: Budget, depth = 0, visited = new Set<object>()): value is Schema {
  if (!step(budget, depth)) return false;
  if (typeof value === 'boolean') return true;
  if (!record(value)) return false;
  if (visited.has(value)) return true;
  visited.add(value);
  for (const key of Object.keys(value)) {
    if (!schemaKeywords.has(key) && !annotations.has(key) && !key.startsWith('x-')) return false;
  }
  if (Object.hasOwn(value, '$ref') && !schemaValid(resolve(value.$ref), budget, depth + 1, visited)) return false;
  if (Object.hasOwn(value, 'type')) {
    const types: unknown[] = Array.isArray(value.type) ? value.type : [value.type];
    if (types.length === 0 || new Set(types).size !== types.length || !types.every(type => typeof type === 'string' && typeNames.has(type))) return false;
  }
  if (Object.hasOwn(value, 'properties')) {
    if (!record(value.properties)) return false;
    for (const property of Object.values(value.properties)) if (!schemaValid(property, budget, depth + 1, visited)) return false;
  }
  if (Object.hasOwn(value, 'required') && (!Array.isArray(value.required)
    || !value.required.every(name => typeof name === 'string') || new Set(value.required).size !== value.required.length)) return false;
  for (const key of ['additionalProperties', 'items']) {
    if (Object.hasOwn(value, key) && !schemaValid(value[key], budget, depth + 1, visited)) return false;
  }
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    if (!Object.hasOwn(value, key)) continue;
    const branches: unknown = value[key];
    if (!Array.isArray(branches) || branches.length === 0) return false;
    for (const branch of branches) if (!schemaValid(branch, budget, depth + 1, visited)) return false;
  }
  if (Object.hasOwn(value, 'enum') && (!Array.isArray(value.enum) || value.enum.length === 0 || !jsonValue(value.enum, budget))) return false;
  if (Object.hasOwn(value, 'const') && !jsonValue(value.const, budget)) return false;
  if (Object.hasOwn(value, 'pattern')) {
    if (typeof value.pattern !== 'string') return false;
    new RegExp(value.pattern, 'u');
  }
  if (Object.hasOwn(value, 'format') && (typeof value.format !== 'string' || !formats.has(value.format))) return false;
  for (const key of lengthKeywords) {
    if (Object.hasOwn(value, key) && (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key]) || value[key] < 0)) return false;
  }
  for (const key of numberKeywords) {
    if (Object.hasOwn(value, key) && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) return false;
  }
  if (Object.hasOwn(value, 'multipleOf') && (typeof value.multipleOf !== 'number' || !Number.isFinite(value.multipleOf) || value.multipleOf <= 0)) return false;
  return true;
}

function equal(first: unknown, second: unknown, budget: Budget, depth: number): boolean {
  if (!step(budget, depth)) return false;
  if (first === second) return true;
  if (Array.isArray(first) && Array.isArray(second)) return first.length === second.length
    && first.every((value, index) => equal(value, second[index], budget, depth + 1));
  if (!record(first) || !record(second)) return false;
  const keys = Object.keys(first);
  return keys.length === Object.keys(second).length
    && keys.every(key => Object.hasOwn(second, key) && equal(first[key], second[key], budget, depth + 1));
}

function matchesType(type: unknown, value: unknown): boolean {
  switch (type) {
    case 'null': return value === null;
    case 'boolean': return typeof value === 'boolean';
    case 'object': return record(value);
    case 'array': return Array.isArray(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'string': return typeof value === 'string';
    default: return false;
  }
}

function dateTime(value: string): boolean {
  // API timestamps use RFC 3339 with an explicit offset. Check the calendar, not Date.parse's rollover.
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0)
    && Number(match[4]) <= 23 && Number(match[5]) <= 59 && Number(match[6]) <= 59
    && (match[7] === undefined || (Number(match[7]) <= 23 && Number(match[8]) <= 59));
}

function matches(schema: unknown, value: unknown, budget: Budget, depth = 0): boolean {
  if (!step(budget, depth)) return false;
  if (typeof schema === 'boolean') return schema;
  if (!record(schema)) return false;
  if (Object.hasOwn(schema, '$ref') && !matches(resolve(schema.$ref), value, budget, depth + 1)) return false;
  if (Object.hasOwn(schema, 'type')) {
    const types: unknown[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(type => matchesType(type, value))) return false;
  }
  if (Array.isArray(schema.allOf) && !schema.allOf.every(branch => matches(branch, value, budget, depth + 1))) return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some(branch => matches(branch, value, budget, depth + 1))) return false;
  if (Array.isArray(schema.oneOf)) {
    let count = 0;
    for (const branch of schema.oneOf) if (matches(branch, value, budget, depth + 1)) count++;
    if (count !== 1) return false;
  }
  if (Object.hasOwn(schema, 'const') && !equal(value, schema.const, budget, depth + 1)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some(choice => equal(value, choice, budget, depth + 1))) return false;
  if (typeof value === 'string') {
    const length = Array.from(value).length;
    if ((typeof schema.minLength === 'number' && length < schema.minLength)
      || (typeof schema.maxLength === 'number' && length > schema.maxLength)
      || (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value))) return false;
    if (schema.format === 'date-time' && !dateTime(value)) return false;
    if (schema.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) return false;
  }
  if (typeof value === 'number') {
    if ((typeof schema.minimum === 'number' && value < schema.minimum)
      || (typeof schema.maximum === 'number' && value > schema.maximum)
      || (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum)
      || (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum)) return false;
    if (typeof schema.multipleOf === 'number') {
      const quotient = value / schema.multipleOf;
      if (!Number.isFinite(quotient) || Math.abs(quotient - Math.round(quotient)) > Number.EPSILON * Math.max(1, Math.abs(quotient)) * 4) return false;
    }
  }
  if (Array.isArray(value)) {
    if ((typeof schema.minItems === 'number' && value.length < schema.minItems)
      || (typeof schema.maxItems === 'number' && value.length > schema.maxItems)) return false;
    if (Object.hasOwn(schema, 'items') && !value.every(item => matches(schema.items, item, budget, depth + 1))) return false;
  } else if (record(value)) {
    const keys = Object.keys(value);
    if ((typeof schema.minProperties === 'number' && keys.length < schema.minProperties)
      || (typeof schema.maxProperties === 'number' && keys.length > schema.maxProperties)) return false;
    if (Array.isArray(schema.required) && !schema.required.every(key => typeof key === 'string' && Object.hasOwn(value, key))) return false;
    const properties = record(schema.properties) ? schema.properties : {};
    for (const key of keys) {
      if (Object.hasOwn(properties, key)) {
        if (!matches(properties[key], value[key], budget, depth + 1)) return false;
      } else if (Object.hasOwn(schema, 'additionalProperties') && !matches(schema.additionalProperties, value[key], budget, depth + 1)) return false;
    }
  }
  return budget.remaining >= 0;
}

/** Validate JSON against the supported OpenAPI schema subset without coercion or mutation. */
export function validateSchema(schema: unknown, value: unknown): boolean {
  try {
    const budget: Budget = { remaining: MAX_VISITS };
    return jsonValue(schema, budget) && schemaValid(schema, budget) && jsonValue(value, budget) && matches(schema, value, budget);
  } catch { return false; }
}

/** Resolve only an own component schema; inherited/prototype names never resolve as contracts. */
export function validateResponse(schemaName: string, value: unknown): boolean {
  const reference = '#/components/schemas/' + schemaName.replace(/~/gu, '~0').replace(/\//gu, '~1');
  return validateSchema({ $ref: reference }, value);
}
