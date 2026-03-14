import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || 'mock-key' });

export const calculateWeeklyRating = async (
  completedHours: number,
  goalHours: number,
  screenTimeHours: number
): Promise<number> => {
  try {
    if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      // Fallback calculation if no API key
      let rating = (completedHours / goalHours) * 10;
      rating -= (screenTimeHours / 10); // Penalty for screen time
      return Math.max(0, Math.min(10, Number(rating.toFixed(1))));
    }

    const prompt = `
      As an AI productivity coach, rate this week's performance on a scale of 0.0 to 10.0.
      - Goal Hours: ${goalHours}
      - Completed Hours: ${completedHours}
      - Screen Time Hours: ${screenTimeHours}
      
      Return ONLY the numerical rating (e.g., 8.5).
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    const rating = parseFloat(response.text?.trim() || "0");
    return isNaN(rating) ? 0 : Math.max(0, Math.min(10, rating));
  } catch (error) {
    console.error("Error calculating rating:", error);
    // Fallback calculation
    let rating = (completedHours / goalHours) * 10;
    rating -= (screenTimeHours / 10);
    return Math.max(0, Math.min(10, Number(rating.toFixed(1))));
  }
};

export const verifyTaskImage = async (
  taskTitle: string,
  taskDescription: string,
  base64Image: string,
  mimeType: string
): Promise<{ verified: boolean; reason: string }> => {
  try {
    if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY === 'mock-key') {
      return { 
        verified: false, 
        reason: "AI Verification is disabled. Please set NEXT_PUBLIC_GEMINI_API_KEY in your environment variables to enable real verification." 
      };
    }

    const prompt = `
      You are a strict AI productivity verifier. The user claims they completed the following task:
      Title: "${taskTitle}"
      Description: "${taskDescription}"
      
      They have provided an image as proof. 
      Your job is to CRITICALLY analyze the image to determine if it provides CLEAR evidence that the task was actually worked on or completed.
      
      Guidelines:
      1. If the image is generic, unrelated, or doesn't show progress toward the specific task, REJECT it.
      2. If the image is a black screen, a random selfie, or a meme, REJECT it.
      3. If the image shows a workspace, code, a book, or a document that matches the task description, ACCEPT it.
      4. Be skeptical. If you are unsure, REJECT it.
      
      Respond ONLY in JSON format with these fields:
      {
        "verified": boolean,
        "reason": "A concise explanation of your decision. If rejected, be specific about why the proof was insufficient."
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    const result = JSON.parse(text);
    
    return {
      verified: typeof result.verified === 'boolean' ? result.verified : false,
      reason: result.reason || "Unable to determine verification status.",
    };
  } catch (error) {
    console.error("Error verifying task image:", error);
    return { verified: false, reason: "Error contacting verification service. Please check your API key and connection." };
  }
};
