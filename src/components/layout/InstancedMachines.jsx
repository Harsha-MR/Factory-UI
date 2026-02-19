import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Status to model URL mapping for non-fullscreen mode
const STATUS_MODEL_MAP = {
  RUNNING: "/models/machine-running.glb",
  DOWN: "/models/machine-down.glb",
  IDLE: "/models/machine-idle.glb",
  WARNING: "/models/machine-idle.glb",
  MAINTENANCE: "/models/machine-maintenance.glb",
  OFFLINE: "/models/machine-off.glb",
};

// Extract geometry and material from a scene
const extractGeometryMaterial = (scene) => {
  let geo = null;
  let mat = null;
  
  scene.traverse((child) => {
    if (child.isMesh && !geo) {
      geo = child.geometry;
      mat = child.material;
    }
  });
  
  return {
    geometry: geo?.clone() || new THREE.BoxGeometry(0.5, 0.5, 0.5),
    material: mat?.clone() || new THREE.MeshStandardMaterial()
  };
};

/**
 * Single status group instanced mesh
 */
function StatusInstancedMesh({ machines, planeSize, floorY, modelUrl, status, onMachineClick }) {
  const instancedRef = useRef();
  const tempObject = useMemo(() => new THREE.Object3D(), []);
  
  const { scene } = useGLTF(modelUrl);
  const { geometry, material } = useMemo(() => extractGeometryMaterial(scene), [scene]);
  
  const count = machines.length;
  
  // Position conversion helper
  const normToPlane = (xNorm, yNorm) => {
    const x = (Math.min(1, Math.max(0, xNorm)) - 0.5) * planeSize;
    const z = (0.5 - Math.min(1, Math.max(0, yNorm))) * planeSize;
    return { x, z };
  };
  
  // Update instance matrices
  useEffect(() => {
    if (!instancedRef.current || count === 0) return;
    
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
      
      tempObject.position.set(pos.x, floorY + 0.5, pos.z);
      tempObject.rotation.set(0, rotation, 0);
      tempObject.scale.set(finalScale, finalScale, finalScale);
      tempObject.updateMatrix();
      
      instancedRef.current.setMatrixAt(index, tempObject.matrix);
    });
    
    instancedRef.current.instanceMatrix.needsUpdate = true;
  }, [machines, planeSize, floorY, tempObject, count]);
  
  const handleClick = (e) => {
    if (!onMachineClick) return;
    e.stopPropagation();
    
    const instanceId = e.instanceId;
    if (instanceId !== undefined && machines[instanceId]) {
      onMachineClick(machines[instanceId], e);
    }
  };
  
  if (count === 0) return null;
  
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
    />
  );
}

/**
 * GPU Instanced Machines - renders 100+ machines in a single draw call
 * This is the key optimization for Blender-level performance
 */
export function InstancedMachines({ machines, planeSize, floorY, fullScreen, onMachineClick }) {
  const instancedRef = useRef();
  const tempObject = useMemo(() => new THREE.Object3D(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  
  // For fullscreen mode, use single model with color tinting
  const fullScreenModelUrl = "/models/machine.glb";
  const { scene: fullScreenScene } = useGLTF(fullScreenModelUrl);
  
  const { geometry, material } = useMemo(() => {
    if (!fullScreen) return { geometry: null, material: null };
    return extractGeometryMaterial(fullScreenScene);
  }, [fullScreenScene, fullScreen]);
  
  // Group machines by status for non-fullscreen mode
  const machinesByStatus = useMemo(() => {
    if (fullScreen) return {};
    
    const groups = {};
    machines.forEach((machine) => {
      const status = String(machine.status || "RUNNING").toUpperCase();
      const normalizedStatus = Object.keys(STATUS_MODEL_MAP).includes(status) ? status : "RUNNING";
      
      if (!groups[normalizedStatus]) {
        groups[normalizedStatus] = [];
      }
      groups[normalizedStatus].push(machine);
    });
    
    return groups;
  }, [machines, fullScreen]);
  
  const count = machines.length;
  
  // Create color array for per-instance colors (fullscreen mode)
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
    if (s === "OFFLINE") return "#94a3b8";
    return "#22c55e"; // RUNNING
  };
  
  // Position conversion helper
  const normToPlane = (xNorm, yNorm) => {
    const x = (Math.min(1, Math.max(0, xNorm)) - 0.5) * planeSize;
    const z = (0.5 - Math.min(1, Math.max(0, yNorm))) * planeSize;
    return { x, z };
  };
  
  // Update instance matrices and colors (fullscreen mode)
  useEffect(() => {
    if (!fullScreen || !instancedRef.current) return;
    
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
      
      tempObject.position.set(pos.x, floorY + 0.5, pos.z);
      tempObject.rotation.set(0, rotation, 0);
      tempObject.scale.set(finalScale, finalScale, finalScale);
      tempObject.updateMatrix();
      
      instancedRef.current.setMatrixAt(index, tempObject.matrix);
      
      const statusColor = getStatusColor(machine.status);
      tempColor.set(statusColor);
      colorArray[index * 3] = tempColor.r;
      colorArray[index * 3 + 1] = tempColor.g;
      colorArray[index * 3 + 2] = tempColor.b;
    });
    
    instancedRef.current.instanceMatrix.needsUpdate = true;
    
    if (instancedRef.current.geometry.attributes.instanceColor) {
      instancedRef.current.geometry.attributes.instanceColor.needsUpdate = true;
    }
  }, [machines, planeSize, floorY, colorArray, tempObject, tempColor, fullScreen]);
  
  // Handle clicks on instances (fullscreen mode)
  const handleClick = (e) => {
    if (!onMachineClick) return;
    e.stopPropagation();
    
    const instanceId = e.instanceId;
    if (instanceId !== undefined && machines[instanceId]) {
      onMachineClick(machines[instanceId], e);
    }
  };
  
  // Non-fullscreen mode: render separate instanced meshes for each status
  if (!fullScreen) {
    return (
      <group>
        {Object.entries(machinesByStatus).map(([status, statusMachines]) => (
          <StatusInstancedMesh
            key={status}
            machines={statusMachines}
            planeSize={planeSize}
            floorY={floorY}
            modelUrl={STATUS_MODEL_MAP[status]}
            status={status}
            onMachineClick={onMachineClick}
          />
        ))}
      </group>
    );
  }
  
  // Fullscreen mode: single instanced mesh with color tinting
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

// Preload all models
useGLTF.preload("/models/machine.glb");
useGLTF.preload("/models/machine-running.glb");
useGLTF.preload("/models/machine-down.glb");
useGLTF.preload("/models/machine-idle.glb");
useGLTF.preload("/models/machine-off.glb");
useGLTF.preload("/models/machine-maintenance.glb");

