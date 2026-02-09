import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * GPU Instanced Machines - renders 100+ machines in a single draw call
 * This is the key optimization for Blender-level performance
 */
export function InstancedMachines({ machines, planeSize, floorY, fullScreen, onMachineClick }) {
  const instancedRef = useRef();
  const tempObject = useMemo(() => new THREE.Object3D(), []);
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  
  // Load the model once
  const modelUrl = fullScreen ? "/models/machine_ultra_low.glb" : "/models/machine-running.glb";
  const { scene } = useGLTF(modelUrl);
  
  // Extract geometry and material from the model
  const { geometry, material } = useMemo(() => {
    let geo = null;
    let mat = null;
    
    scene.traverse((child) => {
      if (child.isMesh && !geo) {
        geo = child.geometry;
        mat = child.material;
      }
    });
    
    // Clone to avoid modifying cached version
    return {
      geometry: geo?.clone() || new THREE.BoxGeometry(0.5, 0.5, 0.5),
      material: mat?.clone() || new THREE.MeshStandardMaterial()
    };
  }, [scene]);
  
  const count = machines.length;
  
  // Create color array for per-instance colors
  const colorArray = useMemo(() => {
    return new Float32Array(count * 3);
  }, [count]);
  
  // Status color mapping
  const getStatusColor = (status) => {
    const s = String(status || "").toUpperCase();
    if (s === "DOWN") return "#ef4444";
    if (s === "IDLE") return "#eab308";
    if (s === "WARNING") return "#f59e0b";
    if (s === "MAINTENANCE") return "#a855f7";
    return "#22c55e"; // RUNNING
  };
  
  // Position conversion helper
  const normToPlane = (xNorm, yNorm) => {
    const x = (Math.min(1, Math.max(0, xNorm)) - 0.5) * planeSize;
    const z = (0.5 - Math.min(1, Math.max(0, yNorm))) * planeSize;
    return { x, z };
  };
  
  // Update instance matrices and colors
  useEffect(() => {
    if (!instancedRef.current) return;
    
    machines.forEach((machine, index) => {
      const wNorm = Math.min(1, Math.max(0, Number(machine.w) || 0.12));
      const hNorm = Math.min(1, Math.max(0, Number(machine.h) || 0.12));
      const cx = Math.min(1, Math.max(0, (Number(machine.x) || 0.5) + wNorm / 2));
      const cy = Math.min(1, Math.max(0, (Number(machine.y) || 0.5) + hNorm / 2));
      const pos = normToPlane(cx, cy);
      
      const fitScale = Math.max(0.02, wNorm) * planeSize * 0.88;
      const uniformScale = Math.max(0.01, Math.min(50, Number(machine.scale) || 1));
      const finalScale = fitScale * uniformScale;
      
      const rotation = (Number(machine.rotationDeg) || 0) * (Math.PI / 180);
      
      // Set transformation
      tempObject.position.set(pos.x, floorY + 0.5, pos.z);
      tempObject.rotation.set(0, rotation, 0);
      tempObject.scale.set(finalScale, finalScale, finalScale);
      tempObject.updateMatrix();
      
      instancedRef.current.setMatrixAt(index, tempObject.matrix);
      
      // Set color based on status
      const statusColor = getStatusColor(machine.status);
      tempColor.set(statusColor);
      colorArray[index * 3] = tempColor.r;
      colorArray[index * 3 + 1] = tempColor.g;
      colorArray[index * 3 + 2] = tempColor.b;
    });
    
    instancedRef.current.instanceMatrix.needsUpdate = true;
    
    // Update color attribute
    if (instancedRef.current.geometry.attributes.instanceColor) {
      instancedRef.current.geometry.attributes.instanceColor.needsUpdate = true;
    }
  }, [machines, planeSize, floorY, colorArray, tempObject, tempColor, normToPlane]);
  
  // Handle clicks on instances
  const handleClick = (e) => {
    if (!onMachineClick) return;
    e.stopPropagation();
    
    const instanceId = e.instanceId;
    if (instanceId !== undefined && machines[instanceId]) {
      onMachineClick(machines[instanceId], e);
    }
  };
  
  return (
    <instancedMesh
      ref={instancedRef}
      args={[geometry, material, count]}
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      <instancedBufferAttribute
        attach="geometry-attributes-instanceColor"
        args={[colorArray, 3]}
      />
    </instancedMesh>
  );
}

// Preload models
useGLTF.preload("/models/machine_ultra_low.glb");
useGLTF.preload("/models/machine-running.glb");
