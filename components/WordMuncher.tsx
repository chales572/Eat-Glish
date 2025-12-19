
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getStudyBuddyAdvice, speakWord } from '../services/geminiService';
import { Point, WordTreat, Particle, Quiz, DebugInfo, TreatType } from '../types';
import { Loader2, Trophy, BookOpen, Star, Sparkles, School, BrainCircuit, Volume2 } from 'lucide-react';

const QUIZ_LIST: Quiz[] = [
  { image: '🍎', word: 'Apple', hint: '사과', category: 'Fruits' },
  { image: '🍌', word: 'Banana', hint: '바나나', category: 'Fruits' },
  { image: '🐶', word: 'Dog', hint: '강아지', category: 'Animals' },
  { image: '🐱', word: 'Cat', hint: '고양이', category: 'Animals' },
  { image: '🚗', word: 'Car', hint: '자동차', category: 'Transport' },
  { image: '🌞', word: 'Sun', hint: '태양', category: 'Nature' },
  { image: '📚', word: 'Book', hint: '책', category: 'Objects' },
  { image: '⚽', word: 'Ball', hint: '공', category: 'Sports' }
];

const TREAT_CONFIG: Record<TreatType, { emoji: string; color: string }> = {
  cupcake: { emoji: '🧁', color: '#ff80ab' },
  cookie: { emoji: '🍪', color: '#a1887f' },
  donut: { emoji: '🍩', color: '#f06292' },
  icecream: { emoji: '🍦', color: '#81d4fa' },
  cake: { emoji: '🍰', color: '#ffd54f' },
  cherry: { emoji: '🍒', color: '#ef5350' }
};

const MOUTH_OPEN_THRESHOLD = 0.045;

/**
 * Base64 디코딩 유틸리티
 */
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * PCM 데이터를 AudioBuffer로 변환
 */
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const WordMuncher: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  const treats = useRef<WordTreat[]>([]);
  const particles = useRef<Particle[]>([]);
  const scoreRef = useRef(0);
  const mouthPos = useRef<Point>({ x: 0, y: 0 });
  const isMouthOpen = useRef(false);
  const lastCaptureTime = useRef(0);

  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz>(QUIZ_LIST[0]);
  const [advice, setAdvice] = useState<string>("단어를 찾아보세요!");
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Resize handler
  const updateCanvasSize = useCallback(() => {
    if (canvasRef.current && containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      if (canvasRef.current.width !== clientWidth || canvasRef.current.height !== clientHeight) {
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;
      }
    }
  }, []);

  /**
   * 단어 발음 재생
   */
  const playWordPronunciation = async (word: string) => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    
    if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
    }

    setIsPlayingAudio(true);
    const base64Audio = await speakWord(word);
    
    if (base64Audio) {
        const audioBytes = decodeBase64(base64Audio);
        const audioBuffer = await decodeAudioData(audioBytes, audioContextRef.current, 24000, 1);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsPlayingAudio(false);
        source.start();
    } else {
        setIsPlayingAudio(false);
    }
  };

  const spawnTreat = useCallback((width: number, correctWord: string) => {
    const types: TreatType[] = ['cupcake', 'cookie', 'donut', 'icecream', 'cake'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    const isCorrect = Math.random() < 0.3;
    let word = "";
    if (isCorrect) {
        word = correctWord;
    } else {
        const otherQuizzes = QUIZ_LIST.filter(q => q.word !== correctWord);
        word = otherQuizzes[Math.floor(Math.random() * otherQuizzes.length)].word;
    }

    const newTreat: WordTreat = {
      id: Math.random().toString(36).substr(2, 9),
      x: Math.random() * (width - 150) + 75,
      y: -50,
      type,
      word,
      isCorrect,
      active: true,
      velocity: 1.5 + Math.random() * 2
    };
    treats.current.push(newTreat);
  }, []);

  const createParticles = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      particles.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1.0,
        color,
        size: 2 + Math.random() * 4
      });
    }
  };

  const nextQuiz = () => {
    const nextIndex = (QUIZ_LIST.indexOf(currentQuiz) + 1) % QUIZ_LIST.length;
    setCurrentQuiz(QUIZ_LIST[nextIndex]);
    treats.current = [];
  };

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !containerRef.current) return;

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

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
      const width = canvas.width;
      const height = canvas.height;

      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, 0, 0, width, height);
      ctx.fillStyle = 'rgba(23, 37, 84, 0.6)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        const topLip = landmarks[13];
        const bottomLip = landmarks[14];

        const cx = (1 - (topLip.x + bottomLip.x) / 2) * width;
        const cy = (topLip.y + bottomLip.y) / 2 * height;
        mouthPos.current = { x: cx, y: cy };

        const dist = Math.sqrt(Math.pow(topLip.x - bottomLip.x, 2) + Math.pow(topLip.y - bottomLip.y, 2));
        isMouthOpen.current = dist > MOUTH_OPEN_THRESHOLD;

        ctx.beginPath();
        ctx.arc(cx, cy, 50, 0, Math.PI * 2);
        ctx.strokeStyle = isMouthOpen.current ? '#fbbf24' : '#fff';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 3;
        ctx.stroke();
        
        if (isMouthOpen.current) {
            ctx.fillStyle = 'rgba(251, 191, 36, 0.2)';
            ctx.fill();
        }
      }

      // --- 게임 로직 ---
      if (Math.random() < 0.015) spawnTreat(width, currentQuiz.word);

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

        const dToMouth = Math.sqrt(Math.pow(t.x - mouthPos.current.x, 2) + Math.pow(t.y - mouthPos.current.y, 2));
        if (isMouthOpen.current && dToMouth < 70) {
            t.active = false;
            if (t.isCorrect) {
                scoreRef.current += 100;
                setScore(scoreRef.current);
                createParticles(t.x, t.y, '#4ade80', 20);
                // 정답을 먹었을 때 발음 재생
                playWordPronunciation(t.word);
                setTimeout(nextQuiz, 500);
            } else {
                scoreRef.current = Math.max(0, scoreRef.current - 50);
                setScore(scoreRef.current);
                createParticles(t.x, t.y, '#f87171', 10);
            }
        }

        const config = TREAT_CONFIG[t.type];
        ctx.font = '40px serif';
        ctx.textAlign = 'center';
        ctx.fillText(config.emoji, t.x, t.y);

        ctx.font = 'bold 18px Roboto';
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#000';
        ctx.fillText(t.word, t.x, t.y + 35);
        ctx.shadowBlur = 0;
      }

      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i];
        p.x += p.vx; p.y += p.vy; p.life -= 0.02;
        if (p.life <= 0) particles.current.splice(i, 1);
        else {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      if (Date.now() - lastCaptureTime.current > 7000) {
        lastCaptureTime.current = Date.now();
        const screenshot = canvas.toDataURL('image/jpeg', 0.5);
        setIsAiThinking(true);
        getStudyBuddyAdvice(screenshot, currentQuiz, scoreRef.current).then(res => {
            setAdvice(res.hint.message);
            setExplanation(res.hint.explanation || null);
            setIsAiThinking(false);
        });
      }
    };

    faceMesh.onResults(onResults);
    const camera = new window.Camera(videoRef.current, {
      onFrame: async () => { if (videoRef.current) await faceMesh.send({ image: videoRef.current }); },
      width: 1280, height: 720,
    });
    camera.start();

    return () => { 
        window.removeEventListener('resize', updateCanvasSize);
        camera.stop(); 
        faceMesh.close(); 
    };
  }, [spawnTreat, currentQuiz, updateCanvasSize]);

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-[#0f172a] overflow-hidden">
      <video ref={videoRef} className="hidden" playsInline />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0f172a] z-50">
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-yellow-500 animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white tracking-widest uppercase">영어 교실 입장 중...</h1>
          </div>
        </div>
      )}

      {/* QUIZ PANEL (Top Left) */}
      <div className="absolute top-6 left-6 z-40 flex flex-col gap-4">
        <div className="bg-white p-6 rounded-[2rem] shadow-2xl border-4 border-yellow-400 flex items-center gap-6">
            <div className="text-7xl bg-yellow-50 p-4 rounded-2xl border-2 border-yellow-100 select-none">
                {currentQuiz.image}
            </div>
            <div>
                <p className="text-sm font-black text-yellow-600 uppercase tracking-widest mb-1 flex items-center gap-2">
                    <BookOpen className="w-4 h-4" /> What is this?
                </p>
                <div className="flex items-center gap-3">
                  <h2 className="text-4xl font-black text-slate-800 tracking-tight">
                      {currentQuiz.hint}
                  </h2>
                  {isPlayingAudio && <Volume2 className="w-6 h-6 text-blue-500 animate-bounce" />}
                </div>
                <div className="mt-2 flex gap-2">
                    <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-bold rounded-full">
                        {currentQuiz.category}
                    </span>
                </div>
            </div>
        </div>

        {/* Score Card */}
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-4 rounded-2xl flex items-center gap-4 w-fit">
            <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
            <span className="text-2xl font-black text-white">{score}</span>
        </div>
      </div>

      {/* AI TEACHER PANEL (Right) */}
      <div className="absolute top-6 right-6 w-80 z-40 flex flex-col gap-3">
        <div className="bg-blue-600/90 backdrop-blur-lg p-5 rounded-3xl shadow-2xl border-b-4 border-blue-800">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-white">
                    <BrainCircuit className="w-5 h-5" />
                    <span className="text-[10px] font-black tracking-widest uppercase">Study Buddy</span>
                </div>
                {isAiThinking && <Sparkles className="w-4 h-4 text-yellow-300 animate-pulse" />}
            </div>
            <p className="text-white font-bold leading-tight mb-2">"{advice}"</p>
            {explanation && (
                <p className="text-blue-100 text-xs italic leading-relaxed bg-blue-700/50 p-2 rounded-xl">
                    {explanation}
                </p>
            )}
        </div>
      </div>

      {/* CENTER HUD */}
      {!isMouthOpen.current && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md px-6 py-2 rounded-full border border-white/20 text-white font-bold animate-pulse">
            입을 벌려 단어를 드세요! 😮
        </div>
      )}
    </div>
  );
};

export default WordMuncher;
