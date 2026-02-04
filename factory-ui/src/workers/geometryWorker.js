/**
 * Web Worker for heavy geometry calculations
 * Offloads CPU-intensive work from main thread (Blender uses multi-threading)
 * Keeps main thread free for smooth rendering
 */

// Listen for messages from main thread
self.addEventListener('message', (e) => {
  const { type, payload, id } = e.data;

  try {
    let result;

    switch (type) {
      case 'MERGE_GEOMETRIES':
        result = mergeGeometries(payload);
        break;

      case 'CALCULATE_BOUNDS':
        result = calculateBounds(payload);
        break;

      case 'OPTIMIZE_MESH':
        result = optimizeMesh(payload);
        break;

      case 'CALCULATE_DISTANCES':
        result = calculateDistances(payload);
        break;

      case 'FRUSTUM_CULL':
        result = frustumCull(payload);
        break;

      default:
        throw new Error(`Unknown worker task type: ${type}`);
    }

    // Send result back to main thread
    self.postMessage({ id, result, error: null });
  } catch (error) {
    self.postMessage({ id, result: null, error: error.message });
  }
});

/**
 * Merge multiple geometries into one (reduces draw calls)
 */
function mergeGeometries(geometries) {
  if (!Array.isArray(geometries) || geometries.length === 0) {
    return null;
  }

  // Simple merge - combine all vertices
  const merged = {
    vertices: [],
    indices: [],
    normals: [],
    uvs: [],
  };

  let vertexOffset = 0;

  geometries.forEach((geo) => {
    if (!geo) return;

    // Add vertices
    if (geo.vertices) {
      merged.vertices.push(...geo.vertices);
    }

    // Add indices with offset
    if (geo.indices) {
      geo.indices.forEach((index) => {
        merged.indices.push(index + vertexOffset);
      });
      vertexOffset += geo.vertices.length / 3;
    }

    // Add normals
    if (geo.normals) {
      merged.normals.push(...geo.normals);
    }

    // Add UVs
    if (geo.uvs) {
      merged.uvs.push(...geo.uvs);
    }
  });

  return merged;
}

/**
 * Calculate bounding box for geometry
 */
function calculateBounds(vertices) {
  if (!vertices || vertices.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }

  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };

  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];

    min.x = Math.min(min.x, x);
    min.y = Math.min(min.y, y);
    min.z = Math.min(min.z, z);

    max.x = Math.max(max.x, x);
    max.y = Math.max(max.y, y);
    max.z = Math.max(max.z, z);
  }

  return { min, max };
}

/**
 * Optimize mesh by removing duplicate vertices
 */
function optimizeMesh(geometry) {
  if (!geometry || !geometry.vertices) return geometry;

  const vertices = geometry.vertices;
  const uniqueVertices = [];
  const indexMap = new Map();
  const newIndices = [];

  // Find unique vertices
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

    if (!indexMap.has(key)) {
      const newIndex = uniqueVertices.length / 3;
      indexMap.set(key, newIndex);
      uniqueVertices.push(x, y, z);
    }

    newIndices.push(indexMap.get(key));
  }

  return {
    ...geometry,
    vertices: uniqueVertices,
    indices: newIndices,
  };
}

/**
 * Calculate distances from camera to all objects
 * Used for LOD and culling decisions
 */
function calculateDistances({ cameraPos, objectPositions }) {
  const distances = [];
  const cx = cameraPos.x;
  const cy = cameraPos.y;
  const cz = cameraPos.z;

  for (let i = 0; i < objectPositions.length; i++) {
    const obj = objectPositions[i];
    const dx = obj.x - cx;
    const dy = obj.y - cy;
    const dz = obj.z - cz;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    distances.push({ index: i, distance });
  }

  return distances;
}

/**
 * Frustum culling - determine which objects are visible
 */
function frustumCull({ frustumPlanes, objectBounds }) {
  const visible = [];

  for (let i = 0; i < objectBounds.length; i++) {
    const bounds = objectBounds[i];
    let isVisible = true;

    // Check against all 6 frustum planes
    for (let p = 0; p < frustumPlanes.length; p++) {
      const plane = frustumPlanes[p];
      
      // Get the positive vertex (furthest point in plane normal direction)
      const px = plane.normal.x > 0 ? bounds.max.x : bounds.min.x;
      const py = plane.normal.y > 0 ? bounds.max.y : bounds.min.y;
      const pz = plane.normal.z > 0 ? bounds.max.z : bounds.min.z;
      
      // Calculate distance to plane
      const distance = 
        plane.normal.x * px + 
        plane.normal.y * py + 
        plane.normal.z * pz + 
        plane.constant;
      
      if (distance < 0) {
        isVisible = false;
        break;
      }
    }

    if (isVisible) {
      visible.push(i);
    }
  }

  return visible;
}

// Signal that worker is ready
self.postMessage({ type: 'READY' });
