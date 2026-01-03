import { GoogleGenAI } from "@google/genai";
import { Task } from "../types";

const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const verifyTaskProof = async (
  task: Task,
  imageBase64: string,
  mimeType: string = "image/jpeg"
): Promise<{ verified: boolean; reason?: string }> => {
  try {
    const ai = getClient();
    
    // Clean base64 string if it contains data URI prefix
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const prompt = `
      You are a strict productivity verifier. 
      The user claims to have completed the following task: "${task.title}".
      Description: "${task.description}".
      Expected Duration: ${task.durationHours} hours.
      
      Analyze the provided image evidence. Does the image reasonably prove that this specific task was worked on or completed?
      
      Rules:
      1. If the image is unrelated, blurry, or clearly fake, reject it.
      2. If the image shows work related to the task title, accept it.
      3. Reply with a strict JSON object: { "verified": boolean, "reason": "short explanation" }.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text || "{}";
    const result = JSON.parse(text);

    return {
      verified: result.verified === true,
      reason: result.reason || "AI could not determine verification status.",
    };

  } catch (error) {
    console.error("Gemini Verification Error:", error);
    return {
      verified: false,
      reason: "AI verification service failed. Please try again.",
    };
  }
};

export const calculateWeeklyRating = async (
  completedHours: number,
  goalHours: number,
  screenTimeHours: number
): Promise<number> => {
    // Simple algorithm, but we could use AI to be "judgey" about it in v2
    // For now, pure math as requested: 0.0 to 10.0
    
    if (goalHours === 0) return 0;

    const productivityScore = (completedHours / goalHours) * 10;
    
    // Penalize screen time: if screen time > 2 hours/day (14/week), start deducting
    const screenTimeThreshold = 14;
    let penalty = 0;
    if (screenTimeHours > screenTimeThreshold) {
        penalty = (screenTimeHours - screenTimeThreshold) * 0.5; // Lose 0.5 points per extra hour
    }

    let finalRating = productivityScore - penalty;
    finalRating = Math.max(0, Math.min(10, finalRating)); // Clamp

    return parseFloat(finalRating.toFixed(1));
};