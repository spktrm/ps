/** Every object a clone has copied, mapped from the original to its copy. */
export type CloneMemo = Map<object, object>;

// the key instancesOnly marks a memo with
const INSTANCES_ONLY = {};

/**
 * Marks `memo` so that clones leave out of it the state a Pokémon alone holds (its status, boosts,
 * volatiles, move slots and the moves it used), recording the client's objects and the rest.
 */
export function instancesOnly(memo: CloneMemo = new Map()): CloneMemo {
  memo.set(INSTANCES_ONLY, INSTANCES_ONLY);
  return memo;
}

/** Whether clones record in `memo` every object they copy. */
export function recordsAll(memo: CloneMemo) {
  return !memo.has(INSTANCES_ONLY);
}

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
  const proto = Object.getPrototypeOf(value);
  // a plain array or object is copied whole, then each object in it
  if (proto === Array.prototype) {
    const out = (value as unknown as unknown[]).slice();
    memo.set(value, out);
    for (let i = 0; i < out.length; i++) {
      const v = out[i];
      if (v !== null && typeof v === 'object') out[i] = copy(v, memo);
    }
    return out as T;
  }
  if (proto === Object.prototype) {
    const out: any = {...value};
    memo.set(value, out);
    for (const key in out) {
      const v = out[key];
      if (v !== null && typeof v === 'object') out[key] = copy(v, memo);
    }
    return out;
  }
  if (Array.isArray(value)) {
    const out = new Array(value.length);
    memo.set(value, out);
    for (let i = 0; i < value.length; i++) out[i] = copy(value[i], memo);
    return out as T;
  }
  if (proto === null) {
    const out = Object.create(null);
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

/** The fields a class's clone copies by name, in the order it copies them. */
export interface Fields {
  order: string[];
  named: Set<string>;
}

/** The fields a clone has set on its first copy, and any `others` it copies itself. */
export function fieldsOf(target: object, others: string[] = []): Fields {
  const order = Object.keys(target);
  return {order, named: new Set([...order, ...others])};
}

/** Copies the fields of `source` that aren't named onto `target`. */
export function copyRest(source: object, target: object, fields: Fields, memo: CloneMemo) {
  const {order, named} = fields;
  let i = 0;
  for (const key in source) {
    // the named fields mostly come in the order the clone copies them
    if (key === order[i]) {
      i++;
    } else if (!named.has(key)) {
      (target as any)[key] = copy((source as any)[key], memo);
    }
  }
}

/** Records `copied` as the copy of `value` and returns it. */
export function keep<T extends object>(value: T, copied: T, memo: CloneMemo): T {
  memo.set(value, copied);
  return copied;
}
