import { useMemo, memo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';

/**
 * Merged Static Geometry - combines floor + zones into single draw call
 * This is a critical Blender-style optimization
 * Instead of 10+ draw calls for zones, we get 1 draw call total
 */
export const MergedStaticGeometry = memo(function MergedStaticGeometry({
  floor,
  zones,
  planeSize,
  floorY,
}) {
  const { scene: floorScene } = useGLTF("/models/floor-model.glb");
  const { scene: zoneScene } = useGLTF("/models/zone-green.glb");
  
  const mergedGeometry = useMemo(() => {
    const geometries = [];
    const materials = [];
    
    try {
      // Add floor geometry
      if (floor) {
        floorScene.traverse((child) => {
          if (child.isMesh) {
            const geo = child.geometry.clone();
            
            // Apply floor transformations
            const matrix = new THREE.Matrix4();
            const scale = floor.scale || 1;
            matrix.makeScale(scale, scale, scale);
            matrix.setPosition(0, floorY, 0);
            geo.applyMatrix4(matrix);
            
            geometries.push(geo);
            materials.push(child.material.clone());
          }
        });
      }
      
      // Add zone geometries
      zones.forEach((zone) => {
        zoneScene.traverse((child) => {
          if (child.isMesh) {
            const geo = child.geometry.clone();
            
            // Calculate zone transformation
            const w = Math.max(0.02, Number(zone.w) || 1) * planeSize;
            const d = Math.max(0.02, Number(zone.h) || 1) * planeSize;
            const wNorm = Math.min(1, Math.max(0, Number(zone.w) || 0.2));
            const hNorm = Math.min(1, Math.max(0, Number(zone.h) || 0.18));
            const cx = Math.min(1, Math.max(0, (Number(zone.x) || 0) + wNorm / 2));
            const cy = Math.min(1, Math.max(0, (Number(zone.y) || 0) + hNorm / 2));
            
            // Position conversion
            const x = (cx - 0.5) * planeSize;
            const z = (0.5 - cy) * planeSize;
            const y = floorY + 0.03; // Slightly above floor
            
            const rot = (Number(zone.rotationDeg) || 0) * (Math.PI / 180);
            
            // Apply transformation matrix
            const matrix = new THREE.Matrix4();
            
            // Get zone model bounds
            const box = new THREE.Box3().setFromObject(new THREE.Mesh(child.geometry));
            const modelSize = new THREE.Vector3();
            box.getSize(modelSize);
            
            // Calculate scale to fit zone dimensions
            const scaleX = modelSize.x > 0 ? w / modelSize.x : 1;
            const scaleZ = modelSize.z > 0 ? d / modelSize.z : 1;
            const scaleY = 1;
            
            // Build transformation: translate -> rotate -> scale
            matrix.makeTranslation(x, y, z);
            matrix.multiply(new THREE.Matrix4().makeRotationY(rot));
            matrix.multiply(new THREE.Matrix4().makeScale(scaleX, scaleY, scaleZ));
            
            geo.applyMatrix4(matrix);
            
            geometries.push(geo);
            materials.push(child.material.clone());
          }
        });
      });
      
      // Merge all geometries
      if (geometries.length > 0) {
        const merged = mergeGeometries(geometries, false);
        return { geometry: merged, materials };
      }
    } catch (error) {
      console.error('Failed to merge geometries:', error);
    }
    
    return null;
  }, [floor, zones, planeSize, floorY, floorScene, zoneScene]);
  
  if (!mergedGeometry) return null;
  
  return (
    <mesh
      geometry={mergedGeometry.geometry}
      material={mergedGeometry.materials[0] || new THREE.MeshStandardMaterial()}
      renderOrder={0}
      receiveShadow={false}
      castShadow={false}
    />
  );
});

// Preload models
useGLTF.preload("/models/floor-model.glb");
useGLTF.preload("/models/zone-green.glb");

export default MergedStaticGeometry;
