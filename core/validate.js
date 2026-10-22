// Tiny JSON-Schema-subset validator (zero dependencies). Supports:
// type (string | array of types), enum, required, properties, items, minItems, maxItems,
// minimum, maximum, minLength, maxLength, pattern.
// The production engine can swap this for Ajv - schemas written here stay valid JSON Schema.

const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

function matchesType(t, v) {
  if (t === 'integer') return Number.isInteger(v);
  return typeOf(v) === t;
}

export function validate(schema, value, path = 'params') {
  const errors = [];
  walk(schema, value, path, errors);
  return errors;
}

function walk(s, v, p, errs) {
  if (!s || v === undefined) return;
  if (s.type) {
    const types = [].concat(s.type);
    if (!types.some((t) => matchesType(t, v))) {
      errs.push(`${p}: expected ${types.join(' or ')}, got ${typeOf(v)}`);
      return;
    }
  }
  if (s.enum && !s.enum.includes(v)) errs.push(`${p}: must be one of ${s.enum.join(', ')}`);
  if (typeof v === 'string') {
    if (s.minLength != null && v.length < s.minLength) errs.push(`${p}: shorter than ${s.minLength}`);
    if (s.maxLength != null && v.length > s.maxLength) errs.push(`${p}: longer than ${s.maxLength}`);
    if (s.pattern && !new RegExp(s.pattern).test(v)) errs.push(`${p}: does not match ${s.pattern}`);
  }
  if (typeof v === 'number') {
    if (s.minimum != null && v < s.minimum) errs.push(`${p}: below minimum ${s.minimum}`);
    if (s.maximum != null && v > s.maximum) errs.push(`${p}: above maximum ${s.maximum}`);
  }
  if (Array.isArray(v)) {
    if (s.minItems != null && v.length < s.minItems) errs.push(`${p}: needs at least ${s.minItems} items`);
    if (s.maxItems != null && v.length > s.maxItems) errs.push(`${p}: allows at most ${s.maxItems} items`);
    if (s.items) v.forEach((x, i) => walk(s.items, x, `${p}[${i}]`, errs));
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const r of s.required || []) if (v[r] === undefined) errs.push(`${p}.${r}: required`);
    for (const [k, sub] of Object.entries(s.properties || {})) walk(sub, v[k], `${p}.${k}`, errs);
  }
}
