import { parse } from '@babel/parser';

interface EditOverridesOptions {
  source: string;
  slug: string;
  taskId: string;
}

export type EditOverridesResult =
  | { ok: true; source: string; editRange: { start: number; end: number } | null }
  | { ok: false; error: string };

export function editOverrides({ source, slug, taskId }: EditOverridesOptions): EditOverridesResult {
  const parsed = parseOverviewDataAssignment(source);
  if (!parsed.ok) {
    return parsed;
  }

  const overviewObject = parsed.objectExpression;
  const tasksProperty = findObjectProperty(overviewObject, 'tasks');
  const overridesProperty = findObjectProperty(overviewObject, 'ralphOverrides');

  if (overridesProperty) {
    const overridesValue = overridesProperty.value as AnyNode | undefined;
    if (overridesValue?.type !== 'ObjectExpression') {
      return { ok: false, error: 'ralphOverrides must be an object' };
    }

    const existingProperty = findObjectProperty(overridesValue, slug);
    if (existingProperty) {
      const value = existingProperty.value as AnyNode | undefined;
      if (value?.type === 'StringLiteral' && value.value === taskId) {
        return { ok: true, source, editRange: null };
      }
      if (!hasRange(value)) {
        return { ok: false, error: 'unable to locate existing override value range' };
      }
      const replacement = JSON.stringify(taskId);
      return {
        ok: true,
        source: spliceSource(source, value.start, value.end, replacement),
        editRange: { start: value.start, end: value.end },
      };
    }

    if (!hasRange(overridesValue)) {
      return { ok: false, error: 'unable to locate ralphOverrides range' };
    }
    const lastProperty = lastObjectProperty(overridesValue);
    const insertionOffset = lastProperty
      ? findPropertyInsertionOffset(source, lastProperty.end)
      : findEmptyObjectInsertionOffset(overridesValue.end);
    const insertion = lastProperty
      ? formatOverrideEntry(source, overridesValue.start, slug, taskId)
      : formatFirstOverrideEntry(source, overridesValue.start, slug, taskId);
    return {
      ok: true,
      source: spliceSource(source, insertionOffset.offset, insertionOffset.offset, insertionOffset.prefix + insertion),
      editRange: { start: insertionOffset.offset, end: insertionOffset.offset },
    };
  }

  if (!tasksProperty || !hasRange(tasksProperty)) {
    return { ok: false, error: 'tasks property not found' };
  }

  const insertionOffset = findPropertyInsertionOffset(source, tasksProperty.end);
  const insertion = formatOverridesProperty(source, tasksProperty.start, slug, taskId);
  return {
    ok: true,
    source: spliceSource(source, insertionOffset.offset, insertionOffset.offset, insertionOffset.prefix + insertion),
    editRange: { start: insertionOffset.offset, end: insertionOffset.offset },
  };
}

export function parseOverviewDataAssignment(source: string):
  | { ok: true; objectExpression: AnyNode }
  | { ok: false; error: string } {
  let ast: AnyNode;
  try {
    ast = parse(source, { sourceType: 'script' }) as AnyNode;
  } catch (error) {
    return { ok: false, error: `parse failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  for (const statement of ast.program?.body ?? []) {
    const expression = statement.expression;
    if (expression?.type !== 'AssignmentExpression') {
      continue;
    }
    if (!isOverviewDataMember(expression.left)) {
      continue;
    }
    if (expression.right?.type !== 'ObjectExpression') {
      return { ok: false, error: 'window.OVERVIEW_DATA must be an object assignment' };
    }
    return { ok: true, objectExpression: expression.right };
  }

  return { ok: false, error: 'window.OVERVIEW_DATA assignment not found' };
}

type AnyNode = {
  type?: string;
  start?: number | null;
  end?: number | null;
  value?: unknown;
  name?: string;
  computed?: boolean;
  object?: AnyNode;
  property?: AnyNode;
  key?: AnyNode;
  left?: AnyNode;
  right?: AnyNode;
  expression?: AnyNode;
  program?: { body?: AnyNode[] };
  properties?: AnyNode[];
};

function isOverviewDataMember(node: AnyNode | undefined): boolean {
  return (
    node?.type === 'MemberExpression' &&
    node.computed !== true &&
    node.object?.type === 'Identifier' &&
    node.object.name === 'window' &&
    node.property?.type === 'Identifier' &&
    node.property.name === 'OVERVIEW_DATA'
  );
}

function findObjectProperty(objectExpression: AnyNode, key: string): AnyNode | undefined {
  return objectExpression.properties?.find((property) => {
    if (property.type !== 'ObjectProperty' && property.type !== 'Property') {
      return false;
    }
    return propertyKeyName(property.key) === key;
  });
}

function lastObjectProperty(objectExpression: AnyNode): (AnyNode & { end: number }) | undefined {
  return objectExpression.properties
    ?.filter((property) => property.type === 'ObjectProperty' || property.type === 'Property')
    .filter(hasRange)
    .at(-1);
}

function propertyKeyName(key: AnyNode | undefined): string | undefined {
  if (key?.type === 'Identifier') {
    return key.name;
  }
  if (key?.type === 'StringLiteral' && typeof key.value === 'string') {
    return key.value as string;
  }
  return undefined;
}

function hasRange(node: AnyNode | undefined): node is AnyNode & { start: number; end: number } {
  return typeof node?.start === 'number' && typeof node.end === 'number';
}

function spliceSource(source: string, start: number, end: number, replacement: string): string {
  return source.slice(0, start) + replacement + source.slice(end);
}

function findPropertyInsertionOffset(source: string, propertyEnd: number): { offset: number; prefix: string } {
  let offset = propertyEnd;
  while (offset < source.length && /[ \t\r\n]/.test(source[offset])) {
    offset += 1;
  }
  if (source[offset] === ',') {
    return { offset: offset + 1, prefix: '' };
  }
  return { offset, prefix: ',' };
}

function findEmptyObjectInsertionOffset(objectEnd: number): { offset: number; prefix: string } {
  return { offset: objectEnd - 1, prefix: '' };
}

function formatOverridesProperty(source: string, nearbyOffset: number, slug: string, taskId: string): string {
  const indent = lineIndentAt(source, nearbyOffset);
  return `\n${indent}ralphOverrides: {\n${indent}  ${JSON.stringify(slug)}: ${JSON.stringify(taskId)},\n${indent}},`;
}

function formatOverrideEntry(source: string, objectStart: number, slug: string, taskId: string): string {
  const indent = `${lineIndentAt(source, objectStart)}  `;
  return `\n${indent}${JSON.stringify(slug)}: ${JSON.stringify(taskId)},`;
}

function formatFirstOverrideEntry(source: string, objectStart: number, slug: string, taskId: string): string {
  const baseIndent = lineIndentAt(source, objectStart);
  return `\n${baseIndent}  ${JSON.stringify(slug)}: ${JSON.stringify(taskId)},\n${baseIndent}`;
}

function lineIndentAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset) + 1;
  const match = /^[ \t]*/.exec(source.slice(lineStart));
  return match?.[0] ?? '';
}
