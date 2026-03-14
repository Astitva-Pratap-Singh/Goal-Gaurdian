import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'mock-key' });

export const calculateWeeklyRating = async (
  completedHours: number,
  goalHours: number,
  screenTimeHours: number
): Promise<number> => {
  try {
    if (!process.env.GEMINI_API_KEY) {
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
