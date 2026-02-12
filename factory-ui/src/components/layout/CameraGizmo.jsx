import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * Camera Rotation Gizmo - Blender-style camera control widget
 * Shows X, Y, Z axes and allows click-drag rotation
 * Must be rendered OUTSIDE of Canvas, with refs passed from inside
 * 
 * Keyboard Controls (Blender-style):
 * - Numpad 1/3/7: Front/Right/Top views (Add Ctrl for opposite)
 * - Numpad 2/4/6/8: Incremental rotation (turntable style, 15° steps)
 * - Numpad 5: Toggle Perspective/Orthographic
 * - Numpad .: Frame selected
 * - Home: Frame all
 * - Numpad 9: Flip to opposite view
 */
export function CameraGizmo({ size = 120, orbitControlsRef, cameraRef, canvasElement }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredAxis, setHoveredAxis] = useState(null);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const rotationStartRef = useRef({ azimuth: 0, polar: 0 });
  const animationRef = useRef(null);
  const axisButtonsRef = useRef([]);
  const ROTATION_STEP = THREE.MathUtils.degToRad(15); // 15 degrees per step

  // Calculate camera angles for gizmo orientation
  const getCameraAngles = () => {
    const controls = orbitControlsRef?.current;
    if (controls) {
      try {
        return {
          azimuth: controls.getAzimuthalAngle(),
          polar: controls.getPolarAngle()
        };
      } catch (e) {
        // Fallback if methods not available
      }
    }
    
    // Fallback: calculate from camera position
    const camera = cameraRef?.current;
    if (!camera) return { azimuth: 0, polar: Math.PI / 4 };
    
    const target = new THREE.Vector3(0, 0, 0);
    if (controls?.target) {
      target.copy(controls.target);
    }
    
    const offset = new THREE.Vector3().subVectors(camera.position, target);
    const azimuth = Math.atan2(offset.x, offset.z);
    const polar = Math.acos(Math.max(-1, Math.min(1, offset.y / offset.length())));
    
    return { azimuth, polar };
  };

  // Snap camera to specific axis view
  const snapCameraToAxis = (axis) => {
    const camera = cameraRef?.current;
    const controls = orbitControlsRef?.current;
    if (!camera || !controls) return;
    
    const target = controls.target.clone();
    const distance = camera.position.distanceTo(target);
    
    let newPosition;
    
    // Define camera positions for each axis view
    switch(axis) {
      case 'x': // Right view
        newPosition = new THREE.Vector3(distance, 0, 0);
        break;
      case '-x': // Left view
        newPosition = new THREE.Vector3(-distance, 0, 0);
        break;
      case 'y': // Top view
        newPosition = new THREE.Vector3(0, distance, 0);
        break;
      case '-y': // Bottom view
        newPosition = new THREE.Vector3(0, -distance, 0);
        break;
      case 'z': // Front view
        newPosition = new THREE.Vector3(0, 0, distance);
        break;
      case '-z': // Back view
        newPosition = new THREE.Vector3(0, 0, -distance);
        break;
      default:
        return;
    }
    
    // Add target offset
    newPosition.add(target);
    
    // Smoothly animate to new position
    const startPos = camera.position.clone();
    const startTime = Date.now();
    const duration = 300; // ms
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      
      camera.position.lerpVectors(startPos, newPosition, eased);
      camera.lookAt(target);
      controls.update();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  };

  // Step-based rotation (Blender Numpad 2, 4, 6, 8 style)
  // Turntable mode: horizontal rotation around global Z, vertical tilt clamped
  const stepRotateCamera = (direction) => {
    const camera = cameraRef?.current;
    const controls = orbitControlsRef?.current;
    if (!camera || !controls) return;
    
    const target = controls.target.clone();
    const offset = camera.position.clone().sub(target);
    
    // Convert to spherical coordinates
    const radius = offset.length();
    let theta = Math.atan2(offset.x, offset.z); // Azimuthal angle (horizontal)
    let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius))); // Polar angle (vertical)
    
    // Apply rotation based on direction
    switch(direction) {
      case 'left': // Numpad 4 - rotate left around Z axis
        theta += ROTATION_STEP;
        break;
      case 'right': // Numpad 6 - rotate right around Z axis
        theta -= ROTATION_STEP;
        break;
      case 'up': // Numpad 8 - tilt up
        phi -= ROTATION_STEP;
        break;
      case 'down': // Numpad 2 - tilt down
        phi += ROTATION_STEP;
        break;
    }
    
    // Clamp vertical rotation (turntable mode - prevent flipping)
    phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
    
    // Convert back to Cartesian coordinates
    const newX = radius * Math.sin(phi) * Math.sin(theta);
    const newY = radius * Math.cos(phi);
    const newZ = radius * Math.sin(phi) * Math.cos(theta);
    
    const newPosition = new THREE.Vector3(newX, newY, newZ).add(target);
    
    // Smooth animation
    const startPos = camera.position.clone();
    const startTime = Date.now();
    const duration = 150; // Faster for step rotation
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out
      const eased = 1 - Math.pow(1 - progress, 2);
      
      camera.position.lerpVectors(startPos, newPosition, eased);
      camera.lookAt(target);
      controls.update();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  };

  // Toggle between perspective and orthographic camera
  const togglePerspective = () => {
    const camera = cameraRef?.current;
    if (!camera) return;
    
    // Note: This is a simplified toggle for demo purposes
    // In a real implementation, you'd need to switch between different camera instances
    // or recreate the camera with new projection settings
    if (camera.isPerspectiveCamera) {
      camera.fov = camera.fov === 45 ? 34 : 45; // Toggle FOV as indicator
      camera.updateProjectionMatrix();
      console.log('Perspective/Orthographic toggle (simplified demo)');
    }
  };

  // Frame all objects in scene
  const frameAll = () => {
    const camera = cameraRef?.current;
    const controls = orbitControlsRef?.current;
    if (!camera || !controls) return;
    
    // Reset to default position with scene in view
    const defaultDistance = 20;
    const target = new THREE.Vector3(0, 0, 0);
    const newPosition = new THREE.Vector3(12, 10, 12);
    
    controls.target.copy(target);
    
    const startPos = camera.position.clone();
    const startTime = Date.now();
    const duration = 400;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      
      camera.position.lerpVectors(startPos, newPosition, eased);
      camera.lookAt(target);
      controls.update();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  };

  // Frame selected object (placeholder - would need selected object info)
  const frameSelected = () => {
    // In a real implementation, this would receive the selected object
    // For now, just zoom in slightly
    const camera = cameraRef?.current;
    const controls = orbitControlsRef?.current;
    if (!camera || !controls) return;
    
    const target = controls.target.clone();
    const currentDistance = camera.position.distanceTo(target);
    const newDistance = currentDistance * 0.7;
    
    const direction = camera.position.clone().sub(target).normalize();
    const newPosition = target.clone().add(direction.multiplyScalar(newDistance));
    
    const startPos = camera.position.clone();
    const startTime = Date.now();
    const duration = 300;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      
      camera.position.lerpVectors(startPos, newPosition, eased);
      camera.lookAt(target);
      controls.update();
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  };

  // Render gizmo visualization
  useEffect(() => {
    const canvas = canvasRef.current;
    const camera = cameraRef?.current;
    if (!canvas || !camera) return;

    const ctx = canvas.getContext('2d');
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size * 0.35;

    const animate = () => {
      ctx.clearRect(0, 0, size, size);
      
      // Get camera direction vectors
      const forward = new THREE.Vector3(0, 0, -1);
      forward.applyQuaternion(camera.quaternion);
      
      const right = new THREE.Vector3(1, 0, 0);
      right.applyQuaternion(camera.quaternion);
      
      const up = new THREE.Vector3(0, 1, 0);
      up.applyQuaternion(camera.quaternion);
      
      // Draw circle background - transparent by default, light grey on hover
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      if (isHovered || isDragging) {
        ctx.fillStyle = 'rgba(180, 180, 180, 0.3)';
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Clear axis buttons for click detection
      axisButtonsRef.current = [];
      
      // Draw axes
      const axisLength = radius * 0.85;
      const circleRadius = 9; // Decreased from 12
      
      // Helper to draw axis with filled circle
      const drawAxis = (dir3D, dir, color, label, axisKey, isPositive) => {
        const screenX = centerX + dir.x * axisLength;
        const screenY = centerY - dir.y * axisLength; // Flip Y for screen coords
        
        // Calculate depth (z-component of direction in camera space)
        // Positive z means away from camera (dimmed), negative means towards camera
        const depth = dir3D.z;
        
        // Calculate dimming factor (0.5 to 1.0)
        const dimFactor = depth > 0 ? 0.5 : 1.0;
        
        // Only draw line for positive axes
        if (isPositive) {
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(screenX, screenY);
          
          // Apply dimming to line color
          const rgb = color === '#ef4444' ? [239, 68, 68] : 
                      color === '#22c55e' ? [34, 197, 94] : [59, 130, 246];
          ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${dimFactor})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.stroke();
        }
        
        // Draw circle at end
        ctx.beginPath();
        ctx.arc(screenX, screenY, circleRadius, 0, Math.PI * 2);
        
        if (isPositive) {
          // Positive axis: filled circle with dimming
          const rgb = color === '#ef4444' ? [239, 68, 68] : 
                      color === '#22c55e' ? [34, 197, 94] : [59, 130, 246];
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${dimFactor})`;
          ctx.fill();
        } else {
          // Negative axis: outlined with dimmed fill
          const rgb = color === '#ef4444' ? [239, 68, 68] : 
                      color === '#22c55e' ? [34, 197, 94] : [59, 130, 246];
          ctx.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.3)`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${dimFactor})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        
        // Draw text label
        const isHover = hoveredAxis === axisKey;
        // For negative axes, only show label on hover
        if (isPositive || isHover) {
          ctx.fillStyle = isHover ? '#ffffff' : '#000000';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, screenX, screenY);
        }
        
        // Store button info for click detection
        axisButtonsRef.current.push({
          x: screenX,
          y: screenY,
          radius: circleRadius,
          axis: axisKey,
          label: label
        });
      };
      
      // Draw all 6 axes
      // Positive X (red) - right
      drawAxis(
        right,
        new THREE.Vector3(right.x, right.y, 0),
        '#ef4444',
        'X',
        'x',
        true
      );
      
      // Negative X (red) - left
      drawAxis(
        new THREE.Vector3(-right.x, -right.y, -right.z),
        new THREE.Vector3(-right.x, -right.y, 0),
        '#ef4444',
        '-X',
        '-x',
        false
      );
      
      // Positive Y (green) - up
      drawAxis(
        up,
        new THREE.Vector3(up.x, up.y, 0),
        '#22c55e',
        'Y',
        'y',
        true
      );
      
      // Negative Y (green) - down
      drawAxis(
        new THREE.Vector3(-up.x, -up.y, -up.z),
        new THREE.Vector3(-up.x, -up.y, 0),
        '#22c55e',
        '-Y',
        '-y',
        false
      );
      
      // Positive Z (blue) - forward
      drawAxis(
        new THREE.Vector3(-forward.x, -forward.y, -forward.z),
        new THREE.Vector3(-forward.x, forward.y, 0),
        '#3b82f6',
        'Z',
        'z',
        true
      );
      
      // Negative Z (blue) - backward
      drawAxis(
        forward,
        new THREE.Vector3(forward.x, -forward.y, 0),
        '#3b82f6',
        '-Z',
        '-z',
        false
      );
      
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [cameraRef, size, isHovered, isDragging, hoveredAxis]);

  // Handle mouse events for rotation
  useEffect(() => {
    const canvas = canvasRef.current;
    const camera = cameraRef?.current;
    if (!canvas || !camera) return;

    const handleMouseEnter = () => {
      setIsHovered(true);
    };

    const handleMouseLeave = () => {
      setIsHovered(false);
      setHoveredAxis(null);
    };

    const getClickedAxis = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      for (const btn of axisButtonsRef.current) {
        const dx = x - btn.x;
        const dy = y - btn.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= btn.radius) {
          return btn.axis;
        }
      }
      return null;
    };

    const handleMouseMove = (e) => {
      if (isDragging) {
        // Handle drag rotation using movementX/Y for pointer lock freedom
        const dx = e.movementX || 0;
        const dy = e.movementY || 0;
        
        const sensitivity = 0.005;
        
        // Update rotation angles incrementally
        const currentAzimuth = rotationStartRef.current.azimuth;
        const currentPolar = rotationStartRef.current.polar;
        
        const newAzimuth = currentAzimuth - dx * sensitivity;
        const newPolar = THREE.MathUtils.clamp(
          currentPolar + dy * sensitivity,
          0.1,
          Math.PI - 0.1
        );
        
        // Store updated angles for next movement
        rotationStartRef.current.azimuth = newAzimuth;
        rotationStartRef.current.polar = newPolar;
        
        if (orbitControlsRef?.current) {
          const controls = orbitControlsRef.current;
          const target = controls.target.clone();
          const radius = camera.position.distanceTo(target);
          
          const x = radius * Math.sin(newPolar) * Math.sin(newAzimuth);
          const y = radius * Math.cos(newPolar);
          const z = radius * Math.sin(newPolar) * Math.cos(newAzimuth);
          
          camera.position.set(
            target.x + x,
            target.y + y,
            target.z + z
          );
          
          camera.lookAt(target);
          controls.update();
        }
      } else {
        // Check for hover over axis buttons
        const axis = getClickedAxis(e);
        setHoveredAxis(axis);
      }
    };

    const handleMouseDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Check if clicking on an axis button
      const clickedAxis = getClickedAxis(e);
      if (clickedAxis) {
        snapCameraToAxis(clickedAxis);
        return;
      }
      
      // Otherwise start drag rotation
      // Hide cursor for cleaner interaction
      document.body.style.cursor = 'none';
      canvas.style.cursor = 'none';
      
      setIsDragging(true);
      
      const angles = getCameraAngles();
      rotationStartRef.current = angles;
      
      if (orbitControlsRef?.current) {
        orbitControlsRef.current.enabled = false;
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        // Restore cursor
        document.body.style.cursor = '';
        canvas.style.cursor = 'grab';
        
        setIsDragging(false);
        
        if (orbitControlsRef?.current) {
          orbitControlsRef.current.enabled = true;
        }
      }
    };

    canvas.addEventListener('mouseenter', handleMouseEnter);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      // Ensure cursor is restored on cleanup
      document.body.style.cursor = '';
      
      canvas.removeEventListener('mouseenter', handleMouseEnter);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, cameraRef, orbitControlsRef, snapCameraToAxis]);

  // Numpad navigation (Blender-style)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only respond to numpad keys and Home
      if (!e.code.startsWith('Numpad') && e.code !== 'Home') return;
      
      let axis = null;
      let handled = false;
      
      switch(e.code) {
        case 'Numpad1':
          axis = e.ctrlKey ? 'z' : '-z'; // Front (normal) or Back (ctrl)
          handled = true;
          break;
        case 'Numpad3':
          axis = e.ctrlKey ? '-x' : 'x'; // Right (normal) or Left (ctrl)
          handled = true;
          break;
        case 'Numpad7':
          axis = e.ctrlKey ? '-y' : 'y'; // Top (normal) or Bottom (ctrl)
          handled = true;
          break;
          
        // Step-based rotation (Blender 2/4/6/8)
        case 'Numpad2':
          stepRotateCamera('down');
          handled = true;
          break;
        case 'Numpad4':
          stepRotateCamera('left');
          handled = true;
          break;
        case 'Numpad6':
          stepRotateCamera('right');
          handled = true;
          break;
        case 'Numpad8':
          stepRotateCamera('up');
          handled = true;
          break;
          
        // Perspective/Orthographic toggle
        case 'Numpad5':
          togglePerspective();
          handled = true;
          break;
          
        // Frame selected
        case 'NumpadDecimal': // Numpad .
          frameSelected();
          handled = true;
          break;
          
        // Frame all
        case 'Home':
          frameAll();
          handled = true;
          break;
          
        case 'Numpad9':
          // Flip to opposite view
          const camera = cameraRef?.current;
          const controls = orbitControlsRef?.current;
          if (camera && controls) {
            const target = controls.target.clone();
            const currentOffset = camera.position.clone().sub(target);
            const opposite = currentOffset.clone().negate();
            const newPos = target.clone().add(opposite);
            
            const startPos = camera.position.clone();
            const startTime = Date.now();
            const duration = 300;
            
            const animate = () => {
              const elapsed = Date.now() - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const eased = 1 - Math.pow(1 - progress, 3);
              
              camera.position.lerpVectors(startPos, newPos, eased);
              camera.lookAt(target);
              controls.update();
              
              if (progress < 1) {
                requestAnimationFrame(animate);
              }
            };
            
            animate();
          }
          handled = true;
          break;
      }
      
      if (axis) {
        snapCameraToAxis(axis);
      }
      
      if (handled) {
        e.preventDefault();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cameraRef, orbitControlsRef, snapCameraToAxis, stepRotateCamera, togglePerspective, frameSelected, frameAll]);

  // Pointer Lock for main canvas (Blender-style middle mouse orbit)
  // This makes the cursor disappear during orbit, exactly like Blender
  useEffect(() => {
    if (!canvasElement) return;
    
    let isMiddleMouseDown = false;
    const canvas = canvasElement;
    
    const handlePointerLockChange = () => {
      setIsPointerLocked(document.pointerLockElement === canvas);
    };
    
    const handleMouseDown = (e) => {
      // Middle mouse button (button 1)
      if (e.button === 1) {
        e.preventDefault();
        isMiddleMouseDown = true;
        
        // Request pointer lock for Blender-style cursor hiding
        canvas.requestPointerLock();
      }
    };
    
    const handleMouseUp = (e) => {
      if (e.button === 1) {
        isMiddleMouseDown = false;
        
        // Exit pointer lock
        if (document.pointerLockElement === canvas) {
          document.exitPointerLock();
        }
      }
    };
    
    const handleMouseMove = (e) => {
      // When pointer is locked and middle mouse is down, the orbit controls
      // will handle the rotation automatically using movement deltas
      // No need to do anything here - OrbitControls handles it
    };
    
    // Prevent context menu on canvas
    const handleContextMenu = (e) => {
      e.preventDefault();
    };
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      
      // Ensure pointer lock is released on cleanup
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    };
  }, [canvasElement]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        width: `${size}px`,
        height: `${size}px`,
        pointerEvents: 'auto',
        zIndex: 1000,
        borderRadius: '50%',
        cursor: 'grab',
      }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{
          borderRadius: '50%',
        }}
      />
    </div>
  );
}



