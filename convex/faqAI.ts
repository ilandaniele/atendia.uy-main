"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { GoogleGenAI } from "@google/genai";
import { YoutubeTranscript } from "youtube-transcript";

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractVideoId(url: string): string | null {
    const match = url.match(
        /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
    );
    return match ? match[1] : null;
}

async function fetchYoutubeTranscript(url: string): Promise<string> {
    const videoId = extractVideoId(url);
    if (!videoId) throw new Error("URL de YouTube inválida");

    // Intenta español primero, luego sin filtro de idioma
    try {
        const lines = await YoutubeTranscript.fetchTranscript(videoId, { lang: "es" });
        return lines.map((l) => l.text).join(" ");
    } catch {
        try {
            const lines = await YoutubeTranscript.fetchTranscript(videoId);
            return lines.map((l) => l.text).join(" ");
        } catch {
            throw new Error(
                "No se pudo obtener la transcripción del video. Verificá que el video tenga subtítulos habilitados."
            );
        }
    }
}

export const generateKeywords = action({
    args: { id: v.id("faq") },
    handler: async (ctx, { id }) => {
        const faq = await ctx.runQuery(api.faq.get, { id });
        if (!faq) throw new Error("Pregunta no encontrada");

        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY no configurada");

        let sourceText = "";

        if (faq.answerType === "content" && faq.content) {
            sourceText = stripHtml(faq.content);
        } else if (faq.answerType === "youtube" && faq.youtubeUrl) {
            sourceText = await fetchYoutubeTranscript(faq.youtubeUrl);
        }

        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const prompt = `Analizá la siguiente pregunta frecuente de una plataforma de atención al cliente (chatbots y automatización).

PREGUNTA: ${faq.question}
${sourceText ? `\nCONTENIDO:\n${sourceText.slice(0, 4000)}` : ""}

Generá entre 8 y 15 palabras clave o frases cortas en español que un usuario podría escribir al describir este problema o pregunta en un formulario de soporte. Pensá en sinónimos, variantes de escritura, errores comunes y formas alternativas de expresar la misma idea. Las palabras clave deben ayudar a que esta pregunta frecuente aparezca cuando el usuario describe su problema.

Respondé ÚNICAMENTE con un JSON array de strings en minúsculas, sin texto adicional ni bloques de código markdown. Ejemplo: ["palabra clave", "otra frase", "término relacionado"]`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { temperature: 0.3 },
        });

        const raw = response.text ?? "[]";
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        const keywords: string[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        await ctx.runMutation(api.faq.saveKeywords, { id, keywords });
        return keywords;
    },
});
