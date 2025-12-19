
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface Point {
  x: number;
  y: number;
}

export type TreatType = 'cupcake' | 'donut' | 'cake' | 'cookie' | 'icecream' | 'cherry';

export interface WordTreat {
  id: string;
  x: number;
  y: number;
  type: TreatType;
  word: string;
  isCorrect: boolean;
  active: boolean;
  velocity: number;
}

export interface Treat {
  id: string;
  x: number;
  y: number;
  type: TreatType;
  active: boolean;
  points: number;
  emoji: string;
  scale: number;
  velocity: number;
}

export interface Quiz {
  image: string;      // Emoji as image
  word: string;       // Correct English word
  hint: string;       // Korean hint
  category: string;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface StudyHint {
  message: string;
  explanation?: string;
  rationale?: string;
  targetRow?: number;
  targetCol?: number;
  recommendedColor?: BubbleColor;
}

export interface DebugInfo {
  latency: number;
  screenshotBase64?: string;
  rawResponse: string;
  timestamp: string;
  promptContext?: string;
  parsedResponse?: any;
  error?: string;
}

export interface AiResponse {
  hint: StudyHint;
  debug: DebugInfo;
}

export type BubbleColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';

export interface Bubble {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  color: BubbleColor;
  active: boolean;
}

export interface TargetCandidate {
  id: string;
  color: BubbleColor;
  size: number;
  row: number;
  col: number;
  pointsPerBubble: number;
  description: string;
}

declare global {
  interface Window {
    FaceMesh: any;
    Camera: any;
    Hands: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
  }
}
