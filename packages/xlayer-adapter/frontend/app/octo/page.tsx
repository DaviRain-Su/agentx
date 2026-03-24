"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// TechTentacle class for the 3D animation
class TechTentacle {
  numSegments: number;
  segmentLength: number;
  baseOffset: THREE.Vector3;
  index: number;
  points: THREE.Vector3[];
  coreLine: THREE.Line;
  sheathLines: THREE.Line[];
  nodes: THREE.InstancedMesh;
  speed: number;
  drag: number;
  wanderOffset: number;

  constructor(numSegments: number, length: number, baseOffset: THREE.Vector3, index: number, scene: THREE.Scene) {
    this.numSegments = numSegments;
    this.segmentLength = length / numSegments;
    this.baseOffset = baseOffset;
    this.index = index;
    this.points = [];
    
    for (let i = 0; i < numSegments; i++) {
      this.points.push(new THREE.Vector3(
        this.baseOffset.x, 
        this.baseOffset.y, 
        this.baseOffset.z - i * this.segmentLength
      ));
    }

    // Core line
    const coreGeo = new THREE.BufferGeometry().setFromPoints(this.points);
    const coreMat = new THREE.LineBasicMaterial({ 
      color: 0x333333, 
      linewidth: 1, 
      transparent: true,
      opacity: 0.5
    });
    this.coreLine = new THREE.Line(coreGeo, coreMat);
    scene.add(this.coreLine);

    // Sheath lines
    this.sheathLines = [];
    for (let i = 0; i < 3; i++) {
      const sheathGeo = new THREE.BufferGeometry().setFromPoints(this.points);
      const sheathMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: i === 0 ? 0.8 : 0.3
      });
      const sheath = new THREE.Line(sheathGeo, sheathMat);
      this.sheathLines.push(sheath);
      scene.add(sheath);
    }

    // Nodes
    const nodeGeo = new THREE.OctahedronGeometry(2, 0);
    const nodeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    this.nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, numSegments);
    
    for (let i = 0; i < numSegments; i++) {
      const dummy = new THREE.Object3D();
      dummy.position.copy(this.points[i]);
      dummy.updateMatrix();
      this.nodes.setMatrixAt(i, dummy.matrix);
    }
    scene.add(this.nodes);
    
    this.speed = 0.1 + Math.random() * 0.05;
    this.drag = 0.6 + Math.random() * 0.2;
    this.wanderOffset = Math.random() * Math.PI * 2;
  }

  update(target: THREE.Vector3, time: number) {
    const wanderX = Math.sin(time * 0.002 + this.wanderOffset) * 50;
    const wanderY = Math.cos(time * 0.0015 + this.wanderOffset) * 50;
    
    const targetX = target.x + wanderX + this.baseOffset.x * 0.5;
    const targetY = target.y + wanderY + this.baseOffset.y * 0.5;
    const targetZ = target.z;

    this.points[0].x += (targetX - this.points[0].x) * this.speed;
    this.points[0].y += (targetY - this.points[0].y) * this.speed;
    this.points[0].z += (targetZ - this.points[0].z) * this.speed;

    for (let i = 1; i < this.numSegments; i++) {
      const current = this.points[i];
      const prev = this.points[i - 1];

      const dx = prev.x - current.x;
      const dy = prev.y - current.y;
      const dz = prev.z - current.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (distance > this.segmentLength) {
        const ratio = this.segmentLength / distance;
        const targetPosX = prev.x - dx * ratio;
        const targetPosY = prev.y - dy * ratio;
        const targetPosZ = prev.z - dz * ratio;

        current.x += (targetPosX - current.x) * this.drag;
        current.y += (targetPosY - current.y) * this.drag;
        current.z += (targetPosZ - current.z) * this.drag;
      }
    }

    this.coreLine.geometry.setFromPoints(this.points);
    
    this.sheathLines.forEach((sheath, sIdx) => {
      const offsetPoints = this.points.map((p, pIdx) => {
        if (pIdx === 0) return p;
        const offsetAmount = Math.sin(time * 0.005 + pIdx * 0.2 + sIdx * 10) * 3;
        const prev = this.points[pIdx - 1];
        const angle = Math.atan2(p.y - prev.y, p.x - prev.x);
        return new THREE.Vector3(
          p.x + Math.sin(angle) * offsetAmount * (sIdx === 0 ? 0 : 1),
          p.y - Math.cos(angle) * offsetAmount * (sIdx === 0 ? 0 : 1),
          p.z
        );
      });
      sheath.geometry.setFromPoints(offsetPoints);
    });

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.numSegments; i++) {
      dummy.position.copy(this.points[i]);
      if (i < this.numSegments - 1) {
        dummy.lookAt(this.points[i + 1]);
      }
      const scale = 1 - (i / this.numSegments) * 0.8;
      dummy.scale.set(scale, scale, scale);
      dummy.rotateZ(time * 0.002);
      dummy.updateMatrix();
      this.nodes.setMatrixAt(i, dummy.matrix);
    }
    this.nodes.instanceMatrix.needsUpdate = true;
  }
}

export default function OctoKineticPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [syncValue, setSyncValue] = useState("99.8%");
  const [syncMatrix, setSyncMatrix] = useState("██████████████░░");
  const [tensionValue, setTensionValue] = useState("842 N");
  const [hexStream, setHexStream] = useState("0x00000000");
  const [cursorCoords, setCursorCoords] = useState("[ 0.000, 0.000 ]");
  const [logs, setLogs] = useState<Array<{time: string, msg: string, highlight: string}>>([]);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.001);

    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 1, 2000);
    camera.position.z = 800;

    const pointer = new THREE.Vector2(0, 0);
    const target3D = new THREE.Vector3(0, 0, 0);
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const raycaster = new THREE.Raycaster();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      raycaster.ray.intersectPlane(plane, target3D);
      setCursorCoords(`[ ${target3D.x.toFixed(3)}, ${target3D.y.toFixed(3)} ]`);
    };

    canvas.addEventListener('mousemove', handleMouseMove);

    // Create tentacles
    const tentacles: TechTentacle[] = [];
    const NUM_TENTACLES = 8;
    const SEGMENTS = 40;
    const LENGTH = 600;

    const coreGeo = new THREE.IcosahedronGeometry(20, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    scene.add(coreMesh);

    for (let i = 0; i < NUM_TENTACLES; i++) {
      const angle = (i / NUM_TENTACLES) * Math.PI * 2;
      const radius = 40;
      const baseOffset = new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        -200
      );
      tentacles.push(new TechTentacle(SEGMENTS, LENGTH, baseOffset, i, scene));
    }

    // UI update function
    const updateUI = (time: number) => {
      const chars = ['█', '░', '|', '-'];
      let str = '';
      for (let i = 0; i < 16; i++) {
        str += (Math.random() > 0.3) ? '█' : (Math.random() > 0.5 ? '░' : '|');
      }
      setSyncMatrix(str);

      const sync = (99.0 + Math.random() * 0.9).toFixed(2);
      setSyncValue(`${sync}%`);

      if (Math.random() > 0.8) {
        setHexStream('0x' + Math.floor(Math.random() * 16777215).toString(16).toUpperCase().padStart(8, '0'));
      }

      const dist = Math.sqrt(target3D.x * target3D.x + target3D.y * target3D.y);
      const tension = Math.floor(400 + dist * 1.5 + Math.random() * 50);
      setTensionValue(`${tension} N`);

      if (time % 10 === 0) {
        const nodeIdx = Math.floor(Math.random() * NUM_TENTACLES);
        const segIdx = Math.floor(Math.random() * SEGMENTS);
        const pos = tentacles[nodeIdx].points[segIdx];
        
        const newLog = {
          time: new Date().toISOString().slice(14, 21),
          msg: `APP_0${nodeIdx}::SEG_${segIdx.toString().padStart(2, '0')}`,
          highlight: `X:${pos.x.toFixed(0)} Y:${pos.y.toFixed(0)}`
        };
        
        setLogs(prev => {
          const updated = [newLog, ...prev].slice(0, 5);
          return updated;
        });
      }
    };

    let animationId: number;
    const animate = (time: number) => {
      animationId = requestAnimationFrame(animate);
      
      coreMesh.rotation.x = time * 0.0005;
      coreMesh.rotation.y = time * 0.001;

      const pulseTarget = new THREE.Vector3(
        target3D.x + Math.sin(time * 0.001) * 20,
        target3D.y + Math.cos(time * 0.0013) * 20,
        target3D.z
      );

      tentacles.forEach(t => t.update(pulseTarget, time));
      updateUI(Math.floor(time));
      renderer.render(scene, camera);
    };

    animate(0);

    const handleResize = () => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#020202] text-white overflow-hidden relative"
         style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Grid Background */}
      <div className="fixed inset-0 pointer-events-none z-0"
           style={{
             backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.1) 1px, transparent 1px)',
             backgroundSize: '20px 20px'
           }} />
      
      {/* Scanlines */}
      <div className="fixed inset-0 pointer-events-none z-[100] opacity-30"
           style={{
             background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.2) 51%)',
             backgroundSize: '100% 4px'
           }} />

      {/* Back Button */}
      <Link href="/" 
            className="fixed top-6 left-6 z-50 flex items-center gap-2 px-4 py-2 
                       border border-white/15 hover:bg-white/5 transition-colors text-xs uppercase tracking-widest">
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      {/* Left Panel */}
      <aside className="fixed left-0 top-0 bottom-0 w-80 bg-[#060606] border-r border-white/15 
                        p-8 flex flex-col gap-16 z-10 overflow-y-auto"
             style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        
        {/* Logo Section */}
        <div>
          <div className="w-15 h-15 mb-4">
            <svg viewBox="0 0 100 100" className="w-full h-full stroke-white stroke-[4] fill-none">
              <path d="M 15,45 Q 30,45 35,60 T 45,85 Q 55,55 70,30 L 90,30" />
              <path d="M 60,45 L 85,45" />
            </svg>
          </div>
          <div className="text-[9px] text-[#888888] uppercase tracking-[0.15em] mb-1">SYSTEM INITIALIZED</div>
          <div className="text-[13px] text-white font-bold tracking-wide">OCTO-KINETIC V.8</div>
        </div>

        {/* Module 1 - Neural Sync */}
        <div className="relative">
          <div className="absolute -left-8 top-1 w-1 h-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
          <div className="flex justify-between items-end border-b border-white/15 pb-1 mb-1">
            <span className="text-[9px] text-[#888888] uppercase tracking-[0.15em]">01 // NEURAL SYNC</span>
            <span className="text-[9px] text-[#888888] uppercase tracking-[0.15em] animate-pulse">ACTIVE</span>
          </div>
          <div className="text-[48px] font-light tracking-tight leading-none my-4"
               style={{ fontFamily: "'Inter', sans-serif" }}>
            {syncValue}
          </div>
          <div className="text-[10px] text-white tracking-wider whitespace-pre mb-2">{syncMatrix}</div>
          <div className="flex justify-between text-[11px] mt-2">
            <span className="text-[#888888]">LATENCY</span>
            <span className="text-white text-right">0.004ms</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#888888]">PACKET LOSS</span>
            <span className="text-white text-right">0.000%</span>
          </div>
        </div>

        {/* Module 2 - Appendage Kinematics */}
        <div className="relative">
          <div className="absolute -left-8 top-1 w-1 h-1 bg-[#333333]" />
          <div className="flex justify-between items-end border-b border-white/15 pb-1 mb-1">
            <span className="text-[9px] text-[#888888] uppercase tracking-[0.15em]">02 // APPENDAGE KINEMATICS</span>
            <span className="text-[9px] text-[#888888] uppercase tracking-[0.15em]">TRACKING</span>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-[9px] text-[#888888] uppercase tracking-[0.15em]">TENSION</div>
              <div className="text-[13px] text-white tracking-wide">{tensionValue}</div>
            </div>
            <div>
              <div className="text-[9px] text-[#888888] uppercase tracking-[0.15em]">FLUID PRES.</div>
              <div className="text-[13px] text-white tracking-wide">12.4 MPa</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="text-[9px] text-[#888888] uppercase tracking-[0.15em] mb-2">NODE TELEMETRY (REALTIME)</div>
            <ul className="flex flex-col gap-0.5 opacity-70">
              {logs.map((log, i) => (
                <li key={i} className="text-[9px] flex gap-2">
                  <span className="text-[#333333]">[{log.time}]</span>
                  <span className="text-[#888888]">{log.msg}</span>
                  <span className="text-white">{log.highlight}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Module 3 - Power Routing */}
        <div className="relative">
          <div className="absolute -left-8 top-1 w-1 h-1 bg-[#333333]" />
          <div className="flex justify-between items-end border-b border-white/15 pb-1 mb-1">
            <span className="text-[9px] text-[#888888] uppercase tracking-[0.15em]">03 // POWER ROUTING</span>
            <span className="text-[9px] text-[#888888] uppercase tracking-[0.15em]">NOMINAL</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#888888]">CORE DRAW</span>
            <span className="text-white text-right">4,200 MW</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#888888]">THERMAL DISSIPATION</span>
            <span className="text-white text-right">OPTIMAL</span>
          </div>
          <div className="text-[10px] text-white tracking-wider whitespace-pre mt-2">░░██████░░░░░░░░</div>
          <div className="text-[10px] text-white tracking-wider whitespace-pre">░░░░████████░░░░</div>
          <div className="text-[10px] text-white tracking-wider whitespace-pre">░░░░░░░░████████</div>
        </div>

        <div className="flex-grow" />
        
        <div className="text-[9px] text-[#888888] uppercase tracking-[0.15em] opacity-50">
          AUTHORIZED PERSONNEL ONLY<br />
          OVERRIDE PROTOCOL: OMEGA-7
        </div>
      </aside>

      {/* Main Arena */}
      <main className="fixed left-80 right-0 top-0 bottom-0 bg-[radial-gradient(circle_at_center,#080808_0%,#020202_100%)]">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        
        {/* Corner Marks */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-5 left-5 w-5 h-5 border-l border-t border-[#333333]" />
          <div className="absolute top-5 right-5 w-5 h-5 border-r border-t border-[#333333]" />
          <div className="absolute bottom-5 left-5 w-5 h-5 border-l border-b border-[#333333]" />
          <div className="absolute bottom-5 right-5 w-5 h-5 border-r border-b border-[#333333]" />
        </div>

        {/* Crosshair */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 pointer-events-none">
          <div className="absolute top-1/2 left-0 w-full h-px bg-white/20" />
          <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
        </div>

        {/* System Status */}
        <div className="absolute top-5 left-1/2 -translate-x-1/2 flex gap-8 border border-white/15 
                        px-4 py-1 bg-black/50 backdrop-blur-sm">
          <div className="text-[9px] text-[#888888] uppercase tracking-[0.15em]">
            TARGET ACQUISITION: <span className="text-white animate-pulse">MANUAL</span>
          </div>
          <div className="text-[9px] text-[#333333]">|</div>
          <div className="text-[9px] text-[#888888] uppercase tracking-[0.15em]">
            MODE: <span className="text-white">FLUID_DYNAMICS</span>
          </div>
        </div>

        {/* Target Coords */}
        <div className="absolute bottom-10 right-10 text-right pointer-events-none">
          <div className="text-[9px] text-[#888888] uppercase tracking-[0.15em]">CURSOR/TARGET VECTOR</div>
          <div className="text-[18px] text-white mt-1 tracking-wide">{cursorCoords}</div>
          <div className="text-[9px] text-[#333333] mt-1">{hexStream}</div>
        </div>
      </main>
    </div>
  );
}
