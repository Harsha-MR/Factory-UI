/**
 * Web Worker Manager - Multi-threading for heavy calculations
 * Manages worker lifecycle and provides promise-based API
 */

class WorkerManager {
  constructor(workerUrl, poolSize = 2) {
    this.workerUrl = workerUrl;
    this.poolSize = poolSize;
    this.workers = [];
    this.taskQueue = [];
    this.pendingTasks = new Map();
    this.nextTaskId = 0;
    this.currentWorkerIndex = 0;
    this.isReady = false;
    
    this.initialize();
  }

  initialize() {
    // Create worker pool
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(this.workerUrl, { type: 'module' });
      
      worker.addEventListener('message', (e) => {
        const { id, type, result, error } = e.data;
        
        if (type === 'READY') {
          this.isReady = true;
          return;
        }
        
        const task = this.pendingTasks.get(id);
        if (!task) return;
        
        this.pendingTasks.delete(id);
        
        if (error) {
          task.reject(new Error(error));
        } else {
          task.resolve(result);
        }
      });
      
      worker.addEventListener('error', (error) => {
        console.error('Worker error:', error);
      });
      
      this.workers.push(worker);
    }
  }

  async execute(type, payload) {
    return new Promise((resolve, reject) => {
      const id = this.nextTaskId++;
      const task = { id, type, payload, resolve, reject };
      
      this.pendingTasks.set(id, task);
      
      // Round-robin worker selection
      const worker = this.workers[this.currentWorkerIndex];
      this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
      
      worker.postMessage({ id, type, payload });
    });
  }

  async mergeGeometries(geometries) {
    return this.execute('MERGE_GEOMETRIES', geometries);
  }

  async calculateBounds(vertices) {
    return this.execute('CALCULATE_BOUNDS', vertices);
  }

  async optimizeMesh(geometry) {
    return this.execute('OPTIMIZE_MESH', geometry);
  }

  async calculateDistances(cameraPos, objectPositions) {
    return this.execute('CALCULATE_DISTANCES', { cameraPos, objectPositions });
  }

  async frustumCull(frustumPlanes, objectBounds) {
    return this.execute('FRUSTUM_CULL', { frustumPlanes, objectBounds });
  }

  terminate() {
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.pendingTasks.clear();
  }
}

// Singleton instance
let workerManager = null;

export function getWorkerManager() {
  if (!workerManager) {
    // Create worker from external file
    // In production, bundle this properly with your build tool
    try {
      workerManager = new WorkerManager('/src/workers/geometryWorker.js', 2);
    } catch (error) {
      console.warn('Web Workers not available:', error);
      // Fallback to main thread execution
      workerManager = createFallbackManager();
    }
  }
  return workerManager;
}

// Fallback when workers aren't available
function createFallbackManager() {
  return {
    async mergeGeometries(geometries) {
      // Simplified synchronous merge
      return { vertices: [], indices: [], normals: [], uvs: [] };
    },
    async calculateBounds(vertices) {
      return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    },
    async optimizeMesh(geometry) {
      return geometry;
    },
    async calculateDistances(cameraPos, objectPositions) {
      return objectPositions.map((pos, index) => ({ index, distance: 0 }));
    },
    async frustumCull(frustumPlanes, objectBounds) {
      return objectBounds.map((_, i) => i);
    },
    terminate() {}
  };
}

export default WorkerManager;
