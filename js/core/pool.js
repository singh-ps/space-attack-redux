// Structure-of-arrays entity storage: one typed array per field, and an
// entity is just an index into those arrays. Removal swaps the last entity
// into the freed slot, so iterate backwards when removing during a loop.

export function createPool(capacity, fields) {
  const pool = { n: 0, capacity, fields: Object.keys(fields) };
  for (const [name, ArrayType] of Object.entries(fields)) pool[name] = new ArrayType(capacity);
  return pool;
}

// Claims a slot and returns its index, or -1 when the pool is full.
export function spawn(pool) {
  return pool.n < pool.capacity ? pool.n++ : -1;
}

export function remove(pool, i) {
  const last = --pool.n;
  if (i !== last) for (const f of pool.fields) pool[f][i] = pool[f][last];
}

export function clear(pool) {
  pool.n = 0;
}
