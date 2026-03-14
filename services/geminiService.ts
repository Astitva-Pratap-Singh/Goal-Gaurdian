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
    if (!process.env.NEXT_PUBLIC_GEMINI_API_KEY) {
      return { verified: true, reason: "Mock verification (No API Key)" };
    }

    const prompt = `
      You are an AI productivity verifier. The user claims they completed the following task:
      Title: "${taskTitle}"
      Description: "${taskDescription}"
      
      They have provided an image as proof. Analyze the image to determine if it reasonably proves the task was completed or worked on.
      
      Respond in JSON format with two fields:
      - "verified": boolean (true if the image is acceptable proof, false otherwise)
      - "reason": string (a short explanation of why it was accepted or rejected)
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

    const result = JSON.parse(response.text || "{}");
    return {
      verified: !!result.verified,
      reason: result.reason || "Unable to verify",
    };
  } catch (error) {
    console.error("Error verifying task image:", error);
    return { verified: false, reason: "Error contacting verification service." };
  }
};
