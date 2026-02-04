/**
 * Object Pool - Aggressive memory reuse (Blender-style)
 * Reuses objects instead of creating/destroying them
 * Eliminates garbage collection stutters
 */

class ObjectPool {
  constructor(createFn, resetFn) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.pool = [];
    this.active = new Set();
  }

  acquire() {
    let obj;
    if (this.pool.length > 0) {
      obj = this.pool.pop();
    } else {
      obj = this.createFn();
    }
    this.active.add(obj);
    return obj;
  }

  release(obj) {
    if (!this.active.has(obj)) return;
    this.active.delete(obj);
    if (this.resetFn) this.resetFn(obj);
    this.pool.push(obj);
  }

  releaseAll() {
    this.active.forEach((obj) => {
      if (this.resetFn) this.resetFn(obj);
      this.pool.push(obj);
    });
    this.active.clear();
  }

  clear() {
    this.pool = [];
    this.active.clear();
  }

  getStats() {
    return {
      pooled: this.pool.length,
      active: this.active.size,
      total: this.pool.length + this.active.size,
    };
  }
}

// Pre-configured pools for common objects

export const vector3Pool = new ObjectPool(
  () => ({ x: 0, y: 0, z: 0 }),
  (v) => {
    v.x = 0;
    v.y = 0;
    v.z = 0;
  }
);

export const vector2Pool = new ObjectPool(
  () => ({ x: 0, y: 0 }),
  (v) => {
    v.x = 0;
    v.y = 0;
  }
);

export const matrixPool = new ObjectPool(
  () => new Array(16).fill(0),
  (m) => m.fill(0)
);

export const colorPool = new ObjectPool(
  () => ({ r: 0, g: 0, b: 0 }),
  (c) => {
    c.r = 0;
    c.g = 0;
    c.b = 0;
  }
);

// Generic pool factory
export function createPool(createFn, resetFn) {
  return new ObjectPool(createFn, resetFn);
}

// Helper to use pooled objects with auto-release
export function withPooled(pool, fn) {
  const obj = pool.acquire();
  try {
    return fn(obj);
  } finally {
    pool.release(obj);
  }
}

export default ObjectPool;
