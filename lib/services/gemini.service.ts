import { GoogleGenAI } from "@google/genai";

export class GeminiService {
    private ai: GoogleGenAI;

    constructor(config: { apiKey: string }) {
        this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    }

    async generateEmbedding(text: string, taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" = "RETRIEVAL_DOCUMENT"): Promise<{ values: number[]; tokensUsed: number }> {
        const result = await this.ai.models.embedContent({
            model: "gemini-embedding-001",
            contents: text,
            config: {
                outputDimensionality: 1536,
                taskType: taskType
            }
        });

        if (!result.embeddings || result.embeddings.length === 0) {
            throw new Error("No embedding generated");
        }

        // Si la API no devuelve usageMetadata, estimamos a 4 chars/token.
        const reportedTokens = (result as { usageMetadata?: { totalTokenCount?: number } }).usageMetadata?.totalTokenCount;
        const tokensUsed = reportedTokens && reportedTokens > 0 ? reportedTokens : Math.ceil(text.length / 4);

        return { values: result.embeddings[0].values || [], tokensUsed };
    }

    async generateChatResponse(systemInstruction: string, history: any[], userMessage: string): Promise<{ text: string, tokensUsed: number }> {
        // Mapear el historial de Convex al formato de @google/genai.
        // El mensaje actual del usuario normalmente ya está guardado en la BD y
        // forma parte de history (es el último elemento), por eso NO lo agregamos
        // de nuevo. Pero si history viene vacío o sin mensajes con texto (ej.
        // primera nota de voz cuando el placeholder aún no fue actualizado),
        // forzamos el último mensaje del usuario para no llamar a Gemini con
        // `contents=[]` (el SDK rechaza con "contents are required").
        const formattedContents = history
            .filter((msg) => typeof msg?.content === "string" && msg.content.trim() !== "")
            .map(msg => ({
                role: msg.role === "assistant" ? "model" : "user",
                parts: [{ text: msg.content }]
            }));

        if (formattedContents.length === 0 && userMessage?.trim()) {
            formattedContents.push({ role: "user", parts: [{ text: userMessage }] });
        }
        if (formattedContents.length === 0) {
            return {
                text: "Disculpá, no pude entender bien tu mensaje. ¿Podés volver a escribirlo?",
                tokensUsed: 0,
            };
        }

        const response = await this.ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: formattedContents,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.3 // Baja temperatura para que no invente cosas
            }
        });

        return {
            text: response.text || "Disculpá, no pude entender bien tu mensaje. ¿Podés volver a escribirlo?",
            tokensUsed: response.usageMetadata?.totalTokenCount || 0
        }
    }

    async transcribeAudio(audio: ArrayBuffer, mimeType: string): Promise<{ text: string; tokensUsed: number }> {
        const base64 = Buffer.from(audio).toString("base64");
        const response = await this.ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
                role: "user",
                parts: [
                    { text: "Transcribí este audio palabra por palabra al español rioplatense. Devolvé únicamente la transcripción, sin comentarios, sin comillas, sin prefijos. Si el audio no se entiende, está en silencio, es ruido, o no forma una frase coherente, devolvé EXACTAMENTE el texto __INAUDIBLE__ (con doble guión bajo) y nada más." },
                    { inlineData: { mimeType, data: base64 } },
                ],
            }],
        });
        return {
            text: (response.text ?? "").trim(),
            tokensUsed: response.usageMetadata?.totalTokenCount ?? 0,
        };
    }
}