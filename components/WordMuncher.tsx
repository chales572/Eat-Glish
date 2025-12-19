/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import { Quiz, TreatType } from '../types';
import { Loader2, BookOpen, Star } from 'lucide-react';

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

const TREAT_TYPES: TreatType[] = ['cupcake', 'cookie', 'donut', 'icecream', 'cake'];
const TREAT_EMOJIS: Record<TreatType, string> = {
  cupcake: '🧁', cookie: '🍪', donut: '🍩', icecream: '🍦', cake: '🍰', cherry: '🍒'
};

interface FallingWord {
  id: string;
  x: number;
  y: number;
  word: string;
  emoji: string;
  isCorrect: boolean;
  velocity: number;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  color: string;
  size: number;
}

// 입 벌림 감지 임계값 (입술 상하 거리 / 얼굴 높이)
const MOUTH_OPEN_THRESHOLD = 0.06;

const WordMuncher: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationRef = useRef<number>(0);

  const [loading, setLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('초기화 중...');
  const [score, setScore] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [mouthOpen, setMouthOpen] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);

  const currentQuiz = QUIZ_LIST[quizIndex];

  // Game state refs
  const wordsRef = useRef<FallingWord[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const mouthPosRef = useRef({ x: 0, y: 0 });
  const isMouthOpenRef = useRef(false);
  const scoreRef = useRef(0);
  const lastSpawnRef = useRef(0);
  const quizIndexRef = useRef(0);
  const runningRef = useRef(true);

  // 단어 스폰
  const spawnWord = useCallback((width: number) => {
    const type = TREAT_TYPES[Math.floor(Math.random() * TREAT_TYPES.length)];
    const quiz = QUIZ_LIST[quizIndexRef.current];
    const isCorrect = Math.random() < 0.35;
    const word = isCorrect
      ? quiz.word
      : QUIZ_LIST.filter(q => q.word !== quiz.word)[
          Math.floor(Math.random() * (QUIZ_LIST.length - 1))
        ].word;

    wordsRef.current.push({
      id: Math.random().toString(36).slice(2),
      x: 100 + Math.random() * (width - 200),
      y: -60,
      word,
      emoji: TREAT_EMOJIS[type],
      isCorrect,
      velocity: 2 + Math.random() * 2
    });
  }, []);

  // 파티클 생성
  const createParticles = useCallback((x: number, y: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      particlesRef.current.push({
        x, y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1, color, size: 3 + Math.random() * 5
      });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 캔버스 크기 설정
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const init = async () => {
      try {
        // face-api.js 모델 로드
        setLoadingMsg('얼굴 인식 모델 로딩 중...');

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models')
        ]);
        console.log('Face-api models loaded');

        // 카메라 시작
        setLoadingMsg('카메라 연결 중...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false
        });

        video.srcObject = stream;

        // 비디오 메타데이터 로드 대기
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => {
            video.play().then(() => {
              console.log('Camera started:', video.videoWidth, video.videoHeight);
              resolve();
            });
          };
        });

        setLoading(false);
        runningRef.current = true;

        // 게임 루프 시작
        gameLoop();
        // 얼굴 감지 시작
        startFaceDetection();

      } catch (err) {
        console.error('Init error:', err);
        setLoadingMsg('초기화 실패: ' + (err as Error).message);
      }
    };

    // 얼굴 감지 (별도 인터벌로 실행)
    let faceDetectionInterval: number | null = null;

    const detectFace = async () => {
      if (!runningRef.current || video.readyState < 2) return;

      try {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
          .withFaceLandmarks(true);

        if (detection) {
          setFaceDetected(true);
          const landmarks = detection.landmarks;
          const positions = landmarks.positions;

          const upperLip = positions[62];
          const lowerLip = positions[66];
          const faceHeight = detection.detection.box.height;

          const scaleX = canvas.width / video.videoWidth;
          const scaleY = canvas.height / video.videoHeight;

          const mouthX = canvas.width - ((upperLip.x + lowerLip.x) / 2) * scaleX;
          const mouthY = ((upperLip.y + lowerLip.y) / 2) * scaleY;
          mouthPosRef.current = { x: mouthX, y: mouthY };

          const lipDist = Math.abs(lowerLip.y - upperLip.y);
          const mouthOpenRatio = lipDist / faceHeight;

          const wasOpen = isMouthOpenRef.current;
          isMouthOpenRef.current = mouthOpenRatio > MOUTH_OPEN_THRESHOLD;

          if (wasOpen !== isMouthOpenRef.current) {
            console.log('Mouth:', isMouthOpenRef.current ? 'OPEN' : 'CLOSED', 'ratio:', mouthOpenRatio.toFixed(3));
          }
          setMouthOpen(isMouthOpenRef.current);
        } else {
          setFaceDetected(false);
        }
      } catch (e) {
        console.error('Face detection error:', e);
      }
    };

    // 게임 루프 (렌더링만 담당)
    const gameLoop = () => {
      if (!runningRef.current) return;

      const width = canvas.width;
      const height = canvas.height;

      // 캔버스 클리어
      ctx.clearRect(0, 0, width, height);

      // 비디오 그리기 (미러링)
      if (video.readyState >= 2) {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, width, height);
        ctx.restore();

        // 오버레이
        ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
        ctx.fillRect(0, 0, width, height);
      }

      // 입 위치 원 그리기
      const mouth = mouthPosRef.current;
      if (mouth.x > 0 && mouth.y > 0) {
        ctx.beginPath();
        ctx.arc(mouth.x, mouth.y, 50, 0, Math.PI * 2);
        ctx.strokeStyle = isMouthOpenRef.current ? '#facc15' : '#64748b';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 8]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (isMouthOpenRef.current) {
          ctx.fillStyle = 'rgba(250, 204, 21, 0.3)';
          ctx.fill();
        }
      }

      // 단어 스폰
      const now = Date.now();
      if (now - lastSpawnRef.current > 1500) {
        lastSpawnRef.current = now;
        spawnWord(width);
        console.log('Word spawned, total:', wordsRef.current.length);
      }

      // 단어 업데이트 및 그리기
      for (let i = wordsRef.current.length - 1; i >= 0; i--) {
        const word = wordsRef.current[i];
        word.y += word.velocity;

        if (word.y > height + 60) {
          wordsRef.current.splice(i, 1);
          continue;
        }

        // 충돌 체크
        const dx = word.x - mouth.x;
        const dy = word.y - mouth.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (isMouthOpenRef.current && dist < 70) {
          wordsRef.current.splice(i, 1);
          if (word.isCorrect) {
            scoreRef.current += 100;
            setScore(scoreRef.current);
            createParticles(word.x, word.y, '#4ade80');
            setTimeout(() => {
              quizIndexRef.current = (quizIndexRef.current + 1) % QUIZ_LIST.length;
              setQuizIndex(quizIndexRef.current);
              wordsRef.current = [];
            }, 300);
          } else {
            scoreRef.current = Math.max(0, scoreRef.current - 50);
            setScore(scoreRef.current);
            createParticles(word.x, word.y, '#f87171');
          }
          continue;
        }

        // 단어 그리기
        ctx.font = '50px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(word.emoji, word.x, word.y);

        ctx.font = 'bold 22px Arial';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 8;
        ctx.fillText(word.word, word.x, word.y + 45);
        ctx.shadowBlur = 0;
      }

      // 파티클 그리기
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.025;

        if (p.life <= 0) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    // 얼굴 감지 시작 함수
    const startFaceDetection = () => {
      faceDetectionInterval = window.setInterval(detectFace, 100);
    };

    init();

    return () => {
      runningRef.current = false;
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (faceDetectionInterval) {
        clearInterval(faceDetectionInterval);
      }
      if (video.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [spawnWord, createParticles]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900">
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="absolute inset-0" />

      {loading && (
        <div className="absolute inset-0 bg-slate-900 flex items-center justify-center z-50">
          <div className="text-center">
            <Loader2 className="w-16 h-16 text-yellow-400 animate-spin mx-auto mb-4" />
            <p className="text-xl text-white font-bold">{loadingMsg}</p>
          </div>
        </div>
      )}

      {/* 퀴즈 패널 */}
      <div className="absolute top-4 left-4 z-20 bg-white rounded-2xl p-4 shadow-xl border-4 border-yellow-400 flex items-center gap-4">
        <div className="text-5xl">{currentQuiz.image}</div>
        <div>
          <p className="text-xs font-bold text-yellow-600 uppercase flex items-center gap-1">
            <BookOpen size={12} /> What is this?
          </p>
          <h2 className="text-2xl font-black text-slate-800">{currentQuiz.hint}</h2>
          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">
            {currentQuiz.category}
          </span>
        </div>
      </div>

      {/* 점수 */}
      <div className="absolute top-4 right-4 z-20 bg-slate-800/90 backdrop-blur rounded-xl px-4 py-3 flex items-center gap-3">
        <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
        <span className="text-2xl font-black text-white">{score}</span>
      </div>

      {/* 상태 표시 */}
      {!loading && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          {!faceDetected ? (
            <div className="bg-red-500/80 backdrop-blur px-4 py-2 rounded-full text-white font-bold">
              얼굴을 카메라에 보여주세요 👀
            </div>
          ) : !mouthOpen ? (
            <div className="bg-white/20 backdrop-blur px-4 py-2 rounded-full text-white font-bold animate-pulse">
              입을 벌려 단어를 먹으세요! 😮
            </div>
          ) : (
            <div className="bg-yellow-400/80 backdrop-blur px-4 py-2 rounded-full text-slate-900 font-bold">
              입 벌림 감지! 🍽️
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WordMuncher;
