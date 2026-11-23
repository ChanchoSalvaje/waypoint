// A small data-expression parser for the existing tracker queries. No eval,
// generated code, or arbitrary property access is used.
function parseFilter(source) {
  let at = 0;
  const space = () => { while (/\s/.test(source[at] || '') && at < source.length) at++; };
  function value() {
    space(); const start = at, char = source[at++];
    if (char === '{') {
      const end = source.indexOf('}', at);
      if (end < at) throw new Error('Invalid tracker filter.');
      const name = source.slice(at, end); at = end + 1;
      return { type: 'field', name };
    }
    if (char === "'" || char === '"') {
      let text = '';
      while (at < source.length) {
        const c = source[at++];
        if (c === char) return { type: 'literal', value: text };
        text += c === '\\' ? source[at++] : c;
      }
      throw new Error('Unclosed tracker filter string.');
    }
    at = start;
    const word = source.slice(at).match(/^[A-Z_][A-Z0-9_]*/);
    if (word) {
      at += word[0].length; space();
      if (source[at++] !== '(') throw new Error('Invalid tracker filter function.');
      const args = []; space();
      if (source[at] !== ')') {
        while (true) { args.push(expression()); space(); if (source[at] !== ',') break; at++; }
      }
      if (source[at++] !== ')') throw new Error('Invalid tracker filter arguments.');
      const arity = { NOT: [1,1], IF: [3,3], IS_BEFORE: [2,2], DATETIME_PARSE: [1,1],
        CREATED_TIME: [0,0], RECORD_ID: [0,0], AND: [1,1000], OR: [1,1000] }[word[0]];
      if (!arity || args.length < arity[0] || args.length > arity[1]) throw new Error('Unsupported tracker filter.');
      return { type: 'call', name: word[0], args };
    }
    const number = source.slice(at).match(/^-?\d+(?:\.\d+)?/);
    if (number) { at += number[0].length; return { type: 'literal', value: Number(number[0]) }; }
    throw new Error('Invalid tracker filter value.');
  }
  function expression() {
    const left = value(); space();
    const operator = source.slice(at).match(/^(?:!=|>=|<=|=|>|<)/);
    if (!operator) return left;
    at += operator[0].length;
    return { type: 'compare', operator: operator[0], left, right: value() };
  }
  const result = expression(); space();
  if (at !== source.length) throw new Error('Unexpected tracker filter suffix.');
  return result;
}
function fieldId(table, name) {
  const field = table.field_definitions.find(f => f.id === name || f.name === name);
  if (!field) throw new Error('Unknown tracker field.');
  return field.id;
}
function evaluate(node, record, table) {
  if (node.type === 'literal') return node.value;
  if (node.type === 'field') return record.fields[fieldId(table, node.name)] ?? null;
  if (node.type === 'compare') {
    const a = evaluate(node.left,record,table), b = evaluate(node.right,record,table);
    return { '=': () => a === b, '!=': () => a !== b, '<': () => a < b,
      '>': () => a > b, '<=': () => a <= b, '>=': () => a >= b }[node.operator]();
  }
  const get = i => evaluate(node.args[i],record,table);
  switch (node.name) {
    case 'AND': return node.args.every(n => !!evaluate(n,record,table));
    case 'OR': return node.args.some(n => !!evaluate(n,record,table));
    case 'NOT': {const value=get(0);return value===null&&node.args[0]?.name==='IS_BEFORE'?null:!value;}
    case 'IF': return get(0) ? get(1) : get(2);
    case 'DATETIME_PARSE': return get(0);
    case 'CREATED_TIME': return record.createdTime;
    case 'RECORD_ID': return record.id;
    case 'IS_BEFORE': {
      const first = get(0), second = get(1);
      if (!first || !second) return null;
      const a = Date.parse(first), b = Date.parse(second);
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Invalid tracker date.');
      return a < b;
    }
    default: throw new Error('Unsupported tracker filter.');
  }
}
// Push simple, fully supported predicates to PostgREST. Complex date fallbacks
// are evaluated against a complete read, never against only the first page.
function restCondition(node, table) {
  if (node.type === 'compare' && node.right.type === 'literal') {
    const column = node.left.type === 'field' ? 'fields->>' + fieldId(table,node.left.name) :
      node.left.type === 'call' && node.left.name === 'RECORD_ID' ? 'id' : null;
    if (!column) return null;
    const operator = { '=':'eq', '!=':'neq', '<':'lt', '>':'gt', '<=':'lte', '>=':'gte' }[node.operator];
    return column + '.' + operator + '.' + JSON.stringify(node.right.value);
  }
  if (node.type === 'call' && ['AND','OR'].includes(node.name)) {
    const parts = node.args.map(n => restCondition(n,table));
    return parts.every(Boolean) ? node.name.toLowerCase() + '(' + parts.join(',') + ')' : null;
  }
  return null;
}
module.exports = { parseFilter, evaluate, restCondition, fieldId };
