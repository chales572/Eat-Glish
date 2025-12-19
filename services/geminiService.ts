
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI } from "@google/genai";
import { StudyHint, AiResponse, DebugInfo, Quiz, TargetCandidate, Treat } from "../types";

const MODEL_NAME = "gemini-3-flash-preview";
const TTS_MODEL_NAME = "gemini-2.5-flash-preview-tts";

export const getStudyBuddyAdvice = async (
  imageBase64: string,
  currentQuiz: Quiz,
  score: number
): Promise<AiResponse> => {
  const startTime = performance.now();
  const debug: DebugInfo = {
    latency: 0,
    screenshotBase64: imageBase64,
    rawResponse: "",
    timestamp: new Date().toLocaleTimeString()
  };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const prompt = `
    You are "Gemini Study Buddy," a friendly English teacher for kids.
    The player is playing a game where they must eat the correct English word for an image.
    
    ### CURRENT QUIZ:
    - Target Image: ${currentQuiz.image}
    - Correct Word: ${currentQuiz.word}
    - Korean Hint: ${currentQuiz.hint}
    - Player's Score: ${score}

    ### YOUR TASK:
    1. Give a very short, encouraging hint in Korean about the target word.
    2. Explain the word simply.
    
    ### OUTPUT FORMAT (JSON):
    {
      "message": "격려 메시지",
      "explanation": "단어 설명"
    }
  `;

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }
        ]
      },
      config: {
        responseMimeType: "application/json" 
      }
    });

    const endTime = performance.now();
    debug.latency = Math.round(endTime - startTime);
    const text = response.text || "{}";
    debug.rawResponse = text;
    debug.parsedResponse = JSON.parse(text);

    return {
        hint: {
            message: debug.parsedResponse.message || "화이팅!",
            explanation: debug.parsedResponse.explanation
        },
        debug
    };
  } catch (error: any) {
    debug.error = error.message;
    return {
        hint: { message: "선생님이 잠시 자리를 비웠어요." },
        debug: { ...debug }
    };
  }
};

/**
 * Gemini TTS 기능을 사용하여 단어의 발음 데이터를 생성합니다.
 */
export const speakWord = async (word: string): Promise<string | undefined> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  try {
    const response = await ai.models.generateContent({
      model: TTS_MODEL_NAME,
      contents: [{ parts: [{ text: `Say clearly: ${word}` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("TTS Error:", error);
    return undefined;
  }
};

export const getStrategicHint = async (
  imageBase64: string,
  allClusters: TargetCandidate[],
  maxRow: number
): Promise<AiResponse> => {
  const startTime = performance.now();
  const promptContext = `Clusters: ${JSON.stringify(allClusters)}, MaxRow: ${maxRow}`;
  const debug: DebugInfo = {
    latency: 0,
    screenshotBase64: imageBase64,
    rawResponse: "",
    timestamp: new Date().toLocaleTimeString(),
    promptContext
  };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const prompt = `
    You are "Gemini Slingshot Strategist."
    Analyze the bubble shooter game board. 
    Available clusters to target: ${JSON.stringify(allClusters)}.
    
    Provide tactical advice and pick the best targetRow, targetCol, and recommendedColor.
    
    Return JSON:
    {
      "message": "Tactical advice string",
      "rationale": "Short explanation",
      "targetRow": number,
      "targetCol": number,
      "recommendedColor": "red"|"blue"|"green"|"yellow"|"purple"|"orange"
    }
  `;

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    const endTime = performance.now();
    debug.latency = Math.round(endTime - startTime);
    debug.rawResponse = response.text || "{}";
    debug.parsedResponse = JSON.parse(debug.rawResponse);

    return {
      hint: debug.parsedResponse as any,
      debug
    };
  } catch (error: any) {
    debug.error = error.message;
    return {
      hint: { message: "Strategic calculation failed." } as any,
      debug
    };
  }
};

export const getGourmetAdvice = async (
  imageBase64: string,
  activeTreats: Treat[]
): Promise<AiResponse> => {
  const startTime = performance.now();
  const debug: DebugInfo = {
    latency: 0,
    screenshotBase64: imageBase64,
    rawResponse: "",
    timestamp: new Date().toLocaleTimeString()
  };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

  const prompt = `
    You are the "Gemini Gourmet Coach".
    The player is catching falling treats with their mouth.
    Active treats on screen: ${JSON.stringify(activeTreats.map(t => ({ type: t.type, points: t.points })))}.
    
    Return JSON:
    {
      "message": "Gourmet tip",
      "rationale": "Short explanation"
    }
  `;

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: {
        parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    const endTime = performance.now();
    debug.latency = Math.round(endTime - startTime);
    debug.rawResponse = response.text || "{}";
    debug.parsedResponse = JSON.parse(debug.rawResponse);

    return {
      hint: debug.parsedResponse as any,
      debug
    };
  } catch (error: any) {
    debug.error = error.message;
    return {
      hint: { message: "Kitchen is closed." } as any,
      debug
    };
  }
};
