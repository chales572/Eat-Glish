/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getGourmetAdvice } from '../services/geminiService';
import { Point, Treat, Particle, TreatType, DebugInfo } from '../types';
import { Loader2, Trophy, Utensils, Zap, Terminal, Eye, Brain, ChefHat, Sparkles } from 'lucide-react';

const TREAT_CONFIG: Record<TreatType, { emoji: string; points: number; color: string }> = {
  cupcake: { emoji: '🧁', points: 100, color: '#ff80ab' },
  cookie: { emoji: '🍪', points: 150, color: '#a1887f' },
  donut: { emoji: '🍩', points: 200, color: '#f06292' },
  icecream: { emoji: '🍦', points: 300, color: '#81d4fa' },
  cake: { emoji: '🍰', points: 500, color: '#ffd54f' },
  cherry: { emoji: '🍒', points: 1000, color: '#ef5350' }
};

const MOUTH_OPEN_THRESHOLD = 0.045; // Normalized distance

const CakeMuncher: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game Refs
  const treats = useRef<Treat[]>([]);
  const particles = useRef<Particle[]>([]);
  const scoreRef = useRef(0);
  const mouthPos = useRef<Point>({ x: 0, y: 0 });
  const mouthOpenAmount = useRef(0);
  const isMouthOpen = useRef(false);
  const lastCaptureTime = useRef(0);

  // React State
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [advice, setAdvice] = useState<string>("Waiting for the Chef...");
  const [rationale, setRationale] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [multiplier, setMultiplier] = useState(1);

  const spawnTreat = useCallback((width: number) => {
    const types: TreatType[] = ['cupcake', 'cookie', 'donut', 'icecream', 'cake', 'cherry'];
    // Weight the types
    const weights = [40, 30, 15, 8, 5, 2];
    let rand = Math.random() * 100;
    let sum = 0;
    let type: TreatType = 'cupcake';
    for(let i=0; i<weights.length; i++) {
        sum += weights[i];
        if(rand < sum) {
            type = types[i];
            break;
        }
    }

    const config = TREAT_CONFIG[type];
    const newTreat: Treat = {
      id: Math.random().toString(36).substr(2, 9),
      x: Math.random() * (width - 100) + 50,
      y: -50,
      type,
      active: true,
      points: config.points,
      emoji: config.emoji,
      scale: 1,
      velocity: 2 + Math.random() * 3
    };
    treats.current.push(newTreat);
  }, []);

  const createCrumbs = (x: number, y: number, color: string) => {
    for (let i = 0; i < 12; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color,
        size: 3 + Math.random() * 5
      });
    }
  };

  const handleAiAnalysis = async (canvas: HTMLCanvasElement) => {
    if (isAiThinking || treats.current.filter(t => t.active).length === 0) return;
    
    setIsAiThinking(true);
    const screenshot = canvas.toDataURL('image/jpeg', 0.5);
    
    getGourmetAdvice(screenshot, [...treats.current]).then(res => {
        setAdvice(res.hint.message);
        setRationale(res.hint.rationale || null);
        setDebugInfo(res.debug);
        setIsAiThinking(false);
    });
  };

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const faceMesh = new window.FaceMesh({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    const onResults = (results: any) => {
      setLoading(false);
      const width = containerRef.current?.clientWidth || 800;
      const height = containerRef.current?.clientHeight || 600;
      canvas.width = width;
      canvas.height = height;

      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(results.image, 0, 0, width, height);

      // Dark Overlay
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(0, 0, width, height);

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Mouth Landmarks: 13 (top lip), 14 (bottom lip)
        const topLip = landmarks[13];
        const bottomLip = landmarks[14];
        const mouthLeft = landmarks[61];
        const mouthRight = landmarks[291];

        const cx = (topLip.x + bottomLip.x) / 2 * width;
        const cy = (topLip.y + bottomLip.y) / 2 * height;
        mouthPos.current = { x: cx, y: cy };

        const dist = Math.sqrt(Math.pow(topLip.x - bottomLip.x, 2) + Math.pow(topLip.y - bottomLip.y, 2));
        mouthOpenAmount.current = dist;
        isMouthOpen.current = dist > MOUTH_OPEN_THRESHOLD;

        // Draw Mouth Target
        ctx.beginPath();
        ctx.ellipse(cx, cy, 40, 30 + (dist * 500), 0, 0, Math.PI * 2);
        ctx.strokeStyle = isMouthOpen.current ? '#4ade80' : '#f87171';
        ctx.lineWidth = 4;
        ctx.setLineDash(isMouthOpen.current ? [] : [5, 5]);
        ctx.stroke();

        if (isMouthOpen.current) {
            ctx.fillStyle = 'rgba(74, 222, 128, 0.2)';
            ctx.fill();
        }

        // Draw HUD over mouth
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Roboto';
        ctx.textAlign = 'center';
        ctx.fillText(isMouthOpen.current ? 'MUNCH!' : 'OPEN WIDE', cx, cy - 60);
      }

      // --- Treat Logic ---
      if (Math.random() < 0.02) spawnTreat(width);

      for (let i = treats.current.length - 1; i >= 0; i--) {
        const t = treats.current[i];
        if (!t.active) {
            treats.current.splice(i, 1);
            continue;
        }

        t.y += t.velocity;
        if (t.y > height + 50) {
            t.active = false;
            continue;
        }

        // Collision Check
        const dToMouth = Math.sqrt(Math.pow(t.x - mouthPos.current.x, 2) + Math.pow(t.y - mouthPos.current.y, 2));
        if (isMouthOpen.current && dToMouth < 60) {
            t.active = false;
            scoreRef.current += t.points * multiplier;
            setScore(scoreRef.current);
            createCrumbs(t.x, t.y, TREAT_CONFIG[t.type].color);
        }

        // Draw Treat
        ctx.font = '48px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Shadow for treat
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.fillText(t.emoji, t.x, t.y);
        ctx.shadowBlur = 0;
      }

      // Particles
      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) {
            particles.current.splice(i, 1);
        } else {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // AI Trigger
      if (Date.now() - lastCaptureTime.current > 5000) {
        lastCaptureTime.current = Date.now();
        handleAiAnalysis(canvas);
      }
    };

    faceMesh.onResults(onResults);

    const camera = new window.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) await faceMesh.send({ image: videoRef.current });
      },
      width: 1280,
      height: 720,
    });
    camera.start();

    return () => {
      camera.stop();
      faceMesh.close();
    };
  }, [spawnTreat, multiplier]);

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-[#0f172a] overflow-hidden">
      <video ref={videoRef} className="hidden" playsInline />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0f172a] z-50">
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-pink-500 animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white tracking-widest uppercase">Preparing the Buffet...</h1>
          </div>
        </div>
      )}

      {/* TOP HUD */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none z-40">
        {/* Score */}
        <div className="bg-slate-900/80 border border-slate-700 p-4 rounded-3xl shadow-2xl backdrop-blur-md flex items-center gap-4 min-w-[200px]">
            <div className="p-3 bg-pink-500/20 rounded-2xl">
                <Trophy className="w-8 h-8 text-pink-400" />
            </div>
            <div>
                <p className="text-xs text-slate-400 uppercase font-bold tracking-tighter">Total Munch</p>
                <p className="text-4xl font-black text-white">{score.toLocaleString()}</p>
            </div>
        </div>

        {/* AI Gourmet Panel */}
        <div className="w-80 bg-slate-900/90 border-l-4 border-pink-500 p-5 rounded-l-3xl shadow-2xl backdrop-blur-md flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 text-pink-400">
                    <ChefHat className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">Gourmet Coach</span>
                </div>
                {isAiThinking && <Zap className="w-4 h-4 text-yellow-400 animate-pulse" />}
            </div>
            <p className="text-lg font-bold text-white leading-tight">"{advice}"</p>
            {rationale && (
                <p className="text-sm text-slate-400 italic">... {rationale}</p>
            )}
        </div>
      </div>

      {/* DEBUG PANEL (RIGHT) */}
      <div className="absolute bottom-6 right-6 w-72 h-48 bg-black/80 rounded-2xl border border-slate-700 overflow-hidden flex flex-col z-40">
        <div className="p-2 border-b border-slate-700 bg-slate-900 flex items-center gap-2">
            <Terminal className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] text-slate-500 font-bold uppercase">Vision Debug</span>
        </div>
        <div className="flex-1 p-3 overflow-y-auto font-mono text-[9px] text-slate-400 space-y-2">
            {debugInfo ? (
                <>
                    <div className="flex justify-between">
                        <span>LATENCY</span>
                        <span className="text-green-400">{debugInfo.latency}ms</span>
                    </div>
                    <div className="border border-slate-700 rounded p-1 overflow-hidden">
                        <img src={debugInfo.screenshotBase64} alt="Debug" className="w-full opacity-50 grayscale" />
                    </div>
                    <div className="text-slate-500 break-words">
                        RAW: {debugInfo.rawResponse}
                    </div>
                </>
            ) : (
                <div className="flex items-center justify-center h-full opacity-30 italic">No cycles analyzed yet</div>
            )}
        </div>
      </div>

      {/* MULTIPLIER POPUP */}
      <div className="absolute bottom-6 left-6">
        <div className="flex items-center gap-2 bg-yellow-500/20 text-yellow-500 px-4 py-2 rounded-full border border-yellow-500/50 font-bold animate-bounce">
            <Sparkles className="w-4 h-4" />
            <span>X{multiplier} COMBO</span>
        </div>
      </div>
    </div>
  );
};

export default CakeMuncher;