import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, ChevronDown, ChevronUp, Compass, Layers, Radio } from 'lucide-react';
import type { TelnyxPopNode } from '../../shared/types.ts';

interface Carrier3DLandingProps {
  pops: TelnyxPopNode[];
  onEnterDashboard: (targetTab?: 'billing' | 'trunks' | 'dids' | 'stream' | 'architecture') => void;
}

type CameraPreset = 'global' | 'americas' | 'eurasia' | 'overhead';

const CAMERA_PRESETS: Record<
  CameraPreset,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  global: { label: 'Global Core', pos: [0.4, 3.6, 6.2], target: [0, 0.45, 0] },
  americas: { label: 'North America', pos: [-4.2, 2.5, 3.8], target: [-2.1, 0.4, -0.2] },
  eurasia: { label: 'Europe & APAC', pos: [4.2, 2.6, 3.6], target: [1.7, 0.45, -0.3] },
  overhead: { label: 'Top Plan', pos: [0.01, 7.4, 0.01], target: [0, 0, 0] },
};

// Pre-allocated math helpers at module scope to prevent GC churn inside the animation loop
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);

function createArchitecturalFloorTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Solid dark architectural slate background — zero gradients
  ctx.fillStyle = '#0B111E';
  ctx.fillRect(0, 0, size, size);

  // Subtle primary & secondary structural grid lines
  ctx.strokeStyle = '#152033';
  ctx.lineWidth = 1;
  const minorStep = size / 8;
  for (let i = 0; i <= 8; i += 1) {
    const p = i * minorStep;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  ctx.strokeStyle = '#1E2D45';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 14);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const Carrier3DLanding: React.FC<Carrier3DLandingProps> = ({
  pops,
  onEnterDashboard,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [selectedPopCode, setSelectedPopCode] = useState<string>('IAD1');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('global');
  const [flowSpeed, setFlowSpeed] = useState<number>(1);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [webglUnavailable, setWebglUnavailable] = useState<boolean>(false);

  const presetRef = useRef<CameraPreset>('global');
  const flowSpeedRef = useRef<number>(1);
  const selectedPopRef = useRef<string>('IAD1');
  const onSelectPopCallbackRef = useRef<(code: string) => void>((code: string) => {
    setSelectedPopCode(code);
  });

  useEffect(() => {
    presetRef.current = cameraPreset;
  }, [cameraPreset]);

  useEffect(() => {
    flowSpeedRef.current = flowSpeed;
  }, [flowSpeed]);

  useEffect(() => {
    selectedPopRef.current = selectedPopCode;
  }, [selectedPopCode]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect software WebGL renderer string
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0b111e, 1);

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    const handleContextRestored = () => {
      setWebglUnavailable(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b111e);
    scene.fog = new THREE.FogExp2(0x0b111e, 0.042);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 120);
    camera.position.set(...CAMERA_PRESETS.global.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.6;
    controls.maxDistance = 12.5;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.target.set(...CAMERA_PRESETS.global.target);

    let userInteracting = false;
    let manualOverride = false;
    const onControlStart = () => {
      userInteracting = true;
      manualOverride = true;
    };
    const onControlEnd = () => {
      userInteracting = false;
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('end', onControlEnd);

    // 3-Point Studio Lighting Rig (Warm Key + Cool Hemisphere Fill + Rim Backlight)
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.85);
    keyLight.position.set(5.5, 8.5, 4.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.15);
    rimLight.position.set(-6.0, 4.0, -5.5);
    scene.add(rimLight);

    // Architectural Datum Floor Plane at y = 0
    const floorTex = createArchitecturalFloorTexture();
    floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const floorGeo = new THREE.PlaneGeometry(36, 36);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.88,
      metalness: 0.12,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Shared PBR Material Library (varied roughness >= 0.25 and metalness between adjacent parts)
    const darkAnodizedMat = new THREE.MeshStandardMaterial({
      color: 0x162032,
      roughness: 0.55,
      metalness: 0.72,
    });
    const brushedSteelMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.24,
      metalness: 0.9,
    });
    const ceramicSlateMat = new THREE.MeshStandardMaterial({
      color: 0x26354d,
      roughness: 0.78,
      metalness: 0.15,
    });
    const telnyxEmeraldMat = new THREE.MeshStandardMaterial({
      color: 0x00875a,
      roughness: 0.3,
      metalness: 0.35,
      emissive: 0x004d33,
      emissiveIntensity: 0.45,
    });
    const activeCobaltMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.28,
      metalness: 0.4,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.55,
    });
    const warningAmberMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.35,
      metalness: 0.3,
      emissive: 0x92400e,
      emissiveIntensity: 0.5,
    });

    // 1. Central Telnyx Optical Core Switch (Multi-Part Composite THREE.Group — 8 distinct parts, grounded at y = 0)
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 0, 0);

    // Part 1: Octagonal Base Plinth (bottom at y = 0)
    const plinthGeo = new THREE.CylinderGeometry(0.88, 1.02, 0.14, 8);
    const plinthMesh = new THREE.Mesh(plinthGeo, ceramicSlateMat);
    plinthMesh.position.y = 0.07;
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;
    coreGroup.add(plinthMesh);

    // Part 2: Lower Anodized Switch Chassis
    const lowerChassisGeo = new THREE.CylinderGeometry(0.68, 0.76, 0.36, 8);
    const lowerChassisMesh = new THREE.Mesh(lowerChassisGeo, darkAnodizedMat);
    lowerChassisMesh.position.y = 0.32;
    lowerChassisMesh.castShadow = true;
    coreGroup.add(lowerChassisMesh);

    // Part 3: Brushed Steel Mid-Collar Ring
    const midCollarGeo = new THREE.CylinderGeometry(0.74, 0.74, 0.08, 24);
    const midCollarMesh = new THREE.Mesh(midCollarGeo, brushedSteelMat);
    midCollarMesh.position.y = 0.54;
    coreGroup.add(midCollarMesh);

    // Part 4: Optical Routing Rotor Assembly (rotates smoothly in tick)
    const rotorGroup = new THREE.Group();
    rotorGroup.position.y = 0.82;
    const rotorHubGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.44, 16);
    const rotorHubMesh = new THREE.Mesh(rotorHubGeo, darkAnodizedMat);
    rotorGroup.add(rotorHubMesh);

    const statorRingGeo = new THREE.TorusGeometry(0.54, 0.045, 12, 32);
    const statorRingMesh = new THREE.Mesh(statorRingGeo, telnyxEmeraldMat);
    statorRingMesh.rotation.x = Math.PI / 2;
    rotorGroup.add(statorRingMesh);

    // 4 Vertical Optical Transceiver Blades around the rotor
    const bladeGeo = new THREE.BoxGeometry(0.1, 0.38, 0.24);
    for (let b = 0; b < 4; b += 1) {
      const angle = (b * Math.PI) / 2;
      const blade = new THREE.Mesh(bladeGeo, brushedSteelMat);
      blade.position.set(Math.cos(angle) * 0.44, 0, Math.sin(angle) * 0.44);
      blade.rotation.y = -angle;
      rotorGroup.add(blade);
    }
    coreGroup.add(rotorGroup);

    // Part 5: Top Telemetry Crown Cap
    const crownGeo = new THREE.CylinderGeometry(0.24, 0.42, 0.16, 8);
    const crownMesh = new THREE.Mesh(crownGeo, ceramicSlateMat);
    crownMesh.position.y = 1.12;
    crownMesh.castShadow = true;
    coreGroup.add(crownMesh);

    // Part 6: Precision Beacon Finial
    const finialGeo = new THREE.CylinderGeometry(0.06, 0.12, 0.18, 12);
    const finialMesh = new THREE.Mesh(finialGeo, telnyxEmeraldMat);
    finialMesh.position.y = 1.29;
    coreGroup.add(finialMesh);

    scene.add(coreGroup);

    // 2. Regional Telnyx PoP Routing Towers (Each a 5-part grounded THREE.Group + layer(1) raycast proxy)
    const popRayTargets: THREE.Object3D[] = [];
    const popCapMeshes: Map<string, THREE.Mesh> = new Map();
    const popRingMeshes: Map<string, THREE.Mesh> = new Map();
    const curves: THREE.CatmullRomCurve3[] = [];

    const towerFootGeo = new THREE.CylinderGeometry(0.28, 0.35, 0.1, 6);
    const towerMastGeo = new THREE.CylinderGeometry(0.14, 0.2, 0.56, 6);
    const towerCollarGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.06, 16);
    const towerBeaconGeo = new THREE.CylinderGeometry(0.09, 0.14, 0.18, 12);
    const selectionHaloGeo = new THREE.RingGeometry(0.38, 0.45, 24);
    const proxyBoxGeo = new THREE.BoxGeometry(0.85, 1.15, 0.85);
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

    pops.forEach((pop) => {
      const [px, , pz] = pop.coords3d;
      const popGroup = new THREE.Group();
      popGroup.position.set(px, 0, pz);

      const foot = new THREE.Mesh(towerFootGeo, ceramicSlateMat);
      foot.position.y = 0.05;
      foot.castShadow = true;
      foot.receiveShadow = true;
      popGroup.add(foot);

      const mast = new THREE.Mesh(towerMastGeo, darkAnodizedMat);
      mast.position.y = 0.38;
      mast.castShadow = true;
      popGroup.add(mast);

      const collar = new THREE.Mesh(towerCollarGeo, brushedSteelMat);
      collar.position.y = 0.68;
      popGroup.add(collar);

      const statusMat = pop.status === 'Failover' ? warningAmberMat : telnyxEmeraldMat;
      const beacon = new THREE.Mesh(towerBeaconGeo, statusMat);
      beacon.position.y = 0.8;
      popGroup.add(beacon);
      popCapMeshes.set(pop.code, beacon);

      // Ground selection ring offset by 0.025 on Y to prevent Z-fighting
      const halo = new THREE.Mesh(
        selectionHaloGeo,
        new THREE.MeshBasicMaterial({
          color: pop.code === selectedPopRef.current ? 0x00875a : 0x334155,
          side: THREE.DoubleSide,
        }),
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.025;
      popGroup.add(halo);
      popRingMeshes.set(pop.code, halo);

      // Dedicated raycast collision proxy on layer 1
      const proxy = new THREE.Mesh(proxyBoxGeo, proxyMat);
      proxy.position.y = 0.55;
      proxy.layers.set(1);
      proxy.userData.popCode = pop.code;
      popGroup.add(proxy);
      popRayTargets.push(proxy);

      scene.add(popGroup);

      // Fiber Conduit Curve from Central Optical Core (y = 0.82) to PoP Collar (y = 0.68)
      const midX = px * 0.5;
      const midZ = pz * 0.5;
      const arcHeight = 1.25 + Math.hypot(px, pz) * 0.16;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.82, 0),
        new THREE.Vector3(midX, arcHeight, midZ),
        new THREE.Vector3(px, 0.68, pz),
      ]);
      curves.push(curve);

      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.018, 8, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0x1e3a5f,
        roughness: 0.45,
        metalness: 0.6,
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      scene.add(tubeMesh);
    });

    // 3. Instanced Optical Packet Pulses traveling along fiber conduits (Zero GC in loop)
    const pulsesPerCurve = 4;
    const totalPulses = curves.length * pulsesPerCurve;
    const pulseGeo = new THREE.SphereGeometry(0.042, 10, 10);
    const pulseInstanced = new THREE.InstancedMesh(pulseGeo, activeCobaltMat, totalPulses);
    pulseInstanced.frustumCulled = false;
    scene.add(pulseInstanced);

    // Raycaster restricted to layer 1
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();
    let lastHoverCheck = 0;

    const updatePointer = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 45) return;
      lastHoverCheck = now;
      updatePointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(popRayTargets, false);
      renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
    };

    const onPointerDown = (ev: PointerEvent) => {
      updatePointer(ev);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(popRayTargets, false);
      if (hits.length > 0) {
        const code = hits[0].object.userData.popCode as string | undefined;
        if (code) {
          onSelectPopCallbackRef.current(code);
        }
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let lastTime = performance.now();
    let elapsedTotal = 0;
    let lastPresetApplied: CameraPreset = presetRef.current;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      const now = performance.now();
      const delta = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const speed = flowSpeedRef.current;
      elapsedTotal += delta * speed;

      // Rotate central optical collimator rotor
      rotorGroup.rotation.y += delta * 0.55 * speed;

      // Update instanced optical packet pulses along curves
      let instanceIdx = 0;
      for (let c = 0; c < curves.length; c += 1) {
        const curve = curves[c];
        for (let p = 0; p < pulsesPerCurve; p += 1) {
          const t = (elapsedTotal * 0.38 + p / pulsesPerCurve + c * 0.13) % 1;
          curve.getPointAt(t, _vec3A);
          _mat4.compose(_vec3A, _quat, _scale);
          pulseInstanced.setMatrixAt(instanceIdx, _mat4);
          instanceIdx += 1;
        }
      }
      pulseInstanced.instanceMatrix.needsUpdate = true;

      // Highlight selected PoP ground ring
      const activeCode = selectedPopRef.current;
      popRingMeshes.forEach((ringMesh, code) => {
        const mat = ringMesh.material as THREE.MeshBasicMaterial;
        mat.color.setHex(code === activeCode ? 0x00875a : 0x334155);
      });

      // Exponential camera preset damping unless user grabbed OrbitControls
      if (presetRef.current !== lastPresetApplied) {
        lastPresetApplied = presetRef.current;
        manualOverride = false;
      }
      if (!manualOverride && !userInteracting) {
        const preset = CAMERA_PRESETS[presetRef.current];
        _vec3A.set(preset.pos[0], preset.pos[1], preset.pos[2]);
        _vec3B.set(preset.target[0], preset.target[1], preset.target[2]);
        camera.position.lerp(_vec3A, 1 - Math.exp(-4.5 * delta));
        controls.target.lerp(_vec3B, 1 - Math.exp(-4.5 * delta));
        if (camera.position.distanceTo(_vec3A) < 0.02) {
          manualOverride = true;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('end', onControlEnd);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
      floorTex.dispose();
      envTarget.dispose();
      controls.dispose();
      renderer.dispose();
    };
  }, [pops]);

  const activePop = pops.find((p) => p.code === selectedPopCode) ?? pops[0];

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0B111E] text-white select-none">
      {/* Dedicated Isolated WebGL Canvas Container */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Graceful Fallback if WebGL Context is Unavailable */}
      {webglUnavailable && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0B111E] p-8">
          <div className="max-w-lg border border-[#1E293B] bg-[#111827] p-8 text-center">
            <p className="font-mono-tabular text-xs text-[#00875A] mb-2">
              TELNYX CARRIER TOPOLOGY
            </p>
            <h2 className="text-2xl font-semibold text-white mb-3">
              Global SIP &amp; Billing Telemetry Core
            </h2>
            <p className="text-sm text-[#94A3B8] mb-6">
              3D hardware acceleration is suspended in this browser session. Enter the full
              Telnyx Carrier &amp; Billing Monitor workspace directly.
            </p>
            <button
              type="button"
              onClick={() => onEnterDashboard('billing')}
              className="inline-flex items-center gap-2 bg-[#00875A] px-6 py-3 text-sm font-semibold text-white hover:bg-[#006E49] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Click here</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* BAND 1: Top Bar Contract — Strictly 3 Zones (Wordmark — 4 Single-Line Links — 1 Primary CTA) */}
      <header className="relative z-20 flex items-center justify-between gap-8 px-6 lg:px-10 py-4 border-b border-[#1E293B] bg-[#0B111E]/95">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setCameraPreset('global');
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Telnyx Monitor
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#CBD5E1]">
          <button
            type="button"
            onClick={() => onEnterDashboard('billing')}
            className="hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Billing
          </button>
          <button
            type="button"
            onClick={() => onEnterDashboard('trunks')}
            className="hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            SIP Trunks
          </button>
          <button
            type="button"
            onClick={() => onEnterDashboard('dids')}
            className="hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            DID Lookup
          </button>
          <button
            type="button"
            onClick={() => onEnterDashboard('architecture')}
            className="hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            System &amp; DSA
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => onEnterDashboard('billing')}
            className="inline-flex items-center gap-2 bg-[#00875A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#006E49] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Click here</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* BAND 2: Focused Hero & Selected 3D PoP Telemetry Panel (Unobstructed Center 3D Core) */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 pointer-events-none px-6 lg:px-10 pt-8 max-w-xl"
      >
        <div className="pointer-events-auto border border-[#1E293B] bg-[#0F172A]/95 p-6">
          <p className="font-mono-tabular text-xs font-medium text-[#00875A] mb-2">
            3D CARRIER TOPOLOGY · FINOPS &amp; SIP TELEMETRY
          </p>
          <h1
            className="font-display text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight mb-3"
            style={{ textWrap: 'balance' }}
          >
            Telnyx Carrier &amp; Billing Operations
          </h1>
          <p className="text-sm text-[#94A3B8] leading-relaxed mb-5">
            Inspect global SIP trunk routing, prepaid balance burn rate, E.164 prefix lookup, and
            real-time CDR streams powered by custom DSA indices.
          </p>

          {/* Primary Entry CTA Button — Exact "Click here" label requested */}
          <div className="flex flex-wrap items-center gap-4">
            <motion.button
              type="button"
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              transition={{ duration: 0.14 }}
              onClick={() => onEnterDashboard('billing')}
              className="inline-flex items-center gap-2.5 bg-[#00875A] px-6 py-3 text-sm font-semibold text-white hover:bg-[#006E49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00875A] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Click here</span>
              <ArrowRight className="w-4 h-4" />
            </motion.button>

            <button
              type="button"
              onClick={() => onEnterDashboard('architecture')}
              className="inline-flex items-center gap-2 border border-[#334155] bg-[#162032] px-4 py-3 text-xs font-medium text-[#E2E8F0] hover:border-[#64748B] hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Layers className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Inspect DSA Backend</span>
            </button>
          </div>

          {/* Selected 3D PoP Node Telemetry Readout */}
          {activePop && (
            <div className="mt-5 pt-4 border-t border-[#1E293B] grid grid-cols-3 gap-4 text-xs">
              <div>
                <div className="text-[#94A3B8] mb-0.5">Selected PoP</div>
                <div className="font-mono-tabular font-semibold text-white">
                  {activePop.code} · {activePop.city}
                </div>
              </div>
              <div>
                <div className="text-[#94A3B8] mb-0.5">Active Channels</div>
                <div className="font-mono-tabular font-semibold text-white">
                  {activePop.activeChannels.toLocaleString()} / {activePop.maxChannels.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[#94A3B8] mb-0.5">RTT &amp; State</div>
                <div className="font-mono-tabular font-semibold text-[#00875A]">
                  {activePop.rttMs} ms · {activePop.status}
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.section>

      {/* BAND 3: Unified Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 w-[min(880px,94vw)] flex flex-col items-center pointer-events-none">
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          className="pointer-events-auto inline-flex items-center gap-1.5 border border-b-0 border-[#1E293B] bg-[#0F172A] px-3.5 py-1.5 text-xs font-medium text-[#CBD5E1] hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show 3D Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide 3D Controls</span>
            </>
          )}
        </button>

        <AnimatePresence initial={false}>
          {!dockCollapsed && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto w-full border border-[#1E293B] bg-[#0F172A] px-4 py-3 flex flex-wrap items-center justify-between gap-4"
            >
              {/* Camera View Presets */}
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs text-[#94A3B8] mr-1 whitespace-nowrap">
                  <Compass className="w-3.5 h-3.5" />
                  <span>Camera</span>
                </span>
                {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCameraPreset(key)}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      cameraPreset === key
                        ? 'bg-[#00875A] text-white'
                        : 'bg-[#162032] text-[#CBD5E1] hover:text-white'
                    }`}
                  >
                    {CAMERA_PRESETS[key].label}
                  </button>
                ))}
              </div>

              {/* PoP Node Selector */}
              <div className="flex items-center gap-1">
                <span className="inline-flex items-center gap-1 text-xs text-[#94A3B8] mr-1 whitespace-nowrap">
                  <Radio className="w-3.5 h-3.5" />
                  <span>PoP</span>
                </span>
                {pops.map((pop) => (
                  <button
                    key={pop.code}
                    type="button"
                    onClick={() => setSelectedPopCode(pop.code)}
                    className={`px-2 py-1 font-mono-tabular text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      selectedPopCode === pop.code
                        ? 'bg-[#1D4ED8] text-white'
                        : 'bg-[#162032] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {pop.code}
                  </button>
                ))}
              </div>

              {/* Optical Packet Flow Speed */}
              <div className="flex items-center gap-1">
                {[
                  { label: 'Pause', val: 0 },
                  { label: '1x', val: 1 },
                  { label: '2x', val: 2 },
                ].map((spd) => (
                  <button
                    key={spd.label}
                    type="button"
                    onClick={() => setFlowSpeed(spd.val)}
                    className={`px-2.5 py-1 font-mono-tabular text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      flowSpeed === spd.val
                        ? 'bg-white text-[#0F172A] font-semibold'
                        : 'bg-[#162032] text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {spd.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
