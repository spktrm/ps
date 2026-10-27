/** Every object a clone has copied, mapped from the original to its copy. */
export type CloneMemo = Map<object, object>;

// the client's classes, whose objects are cloned instead of shared
const CLONEABLE: Array<abstract new (...args: any[]) => {clone(memo: CloneMemo): object}> = [];

export function cloneable(constructor: (typeof CLONEABLE)[number]) {
  CLONEABLE.push(constructor);
}

/** Copies plain data, clones the client's objects and shares anything else. */
export function copy<T>(value: T, memo: CloneMemo): T {
  if (value === null || typeof value !== 'object') return value;
  const copied = memo.get(value);
  if (copied !== undefined) return copied as T;
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    memo.set(value, out);
    for (let i = 0; i < value.length; i++) out[i] = copy(value[i], memo);
    return out as T;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) {
    const out: any = proto === null ? Object.create(null) : {};
    memo.set(value, out);
    for (const key in value) out[key] = copy(value[key], memo);
    return out;
  }
  if (value instanceof Map) {
    const out = new Map();
    memo.set(value, out);
    for (const [k, v] of value) out.set(copy(k, memo), copy(v, memo));
    return out as T;
  }
  if (value instanceof Set) {
    const out = new Set();
    memo.set(value, out);
    for (const v of value) out.add(copy(v, memo));
    return out as T;
  }
  if (ArrayBuffer.isView(value)) {
    const out = (value as any).slice();
    memo.set(value, out);
    return out;
  }
  for (const constructor of CLONEABLE) {
    if (value instanceof constructor) return value.clone(memo) as T;
  }
  return value;
}

/** Copies an array of the client's objects (or nulls) as `copy` would, cloning each directly. */
export function cloneAll<T extends {clone(memo: CloneMemo): T} | null | undefined>(
  items: T[], memo: CloneMemo
): T[] {
  const copied = memo.get(items);
  if (copied !== undefined) return copied as T[];
  const out = new Array<T>(items.length);
  memo.set(items, out);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    out[i] = item === null || item === undefined ? item : item.clone(memo);
  }
  return out;
}

/** Copies the fields of `source` that aren't in `named` onto `target`. */
export function copyRest(source: object, target: object, named: Set<string>, memo: CloneMemo) {
  for (const key in source) {
    if (!named.has(key)) (target as any)[key] = copy((source as any)[key], memo);
  }
}
