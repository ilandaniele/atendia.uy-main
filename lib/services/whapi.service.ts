import type { WhapiChannel, HealthStatus } from "../../types/whapi";
// Referencia: docs/whapi.doc.md

export type ChannelSettings = {
    callback_backoff_delay_ms?: number;
    max_callback_backoff_delay_ms?: number;
    callback_persist?: boolean;
    media?: { 
        auto_download: Array<string>, 
        init_avatars: boolean 
    };
    webhooks: Array<{
        mode: "body";
        events: Array<{
            type: "messages" | "statuses" | "calls" | "media";
            method: "post" | "delete" | "put";
        }>;
        url: string
    }>;
    proxy?: string;
    mobile_proxy?: string;
    offline_mode?: boolean;
    full_history?: boolean;
};

/**
 * Conjunto de eventos a suscribir al crear o regenerar un canal de Whapi.
 * - messages: mensajes entrantes (incluye type="voice" con voice.id para descargar via getMedia).
 * - calls:    llamadas entrantes (rechazo y aviso al llamante).
 *
 * NOTA: NO suscribirse a "media" — Whapi reenvía cada media descargada (incluyendo backfill
 * histórico) y termina disparando handleInboundMessage muchas veces sin voice info,
 * cayendo en el flujo de "multimedia bloqueada" y generando spam al usuario.
 * El evento "messages" ya nos trae voice.id cuando aplica.
 */
export const DEFAULT_WHAPI_WEBHOOK_EVENTS: ChannelSettings["webhooks"][number]["events"] = [
    { type: "messages", method: "post" },
    { type: "calls",    method: "post" },
];

/**
 * Configuración de descarga automática de media en Whapi.
 * Con `audio` en `auto_download`, Whapi descarga las notas de voz apenas llegan
 * y las deja disponibles vía /media/{id} — necesario para que el flujo de
 * transcripción pueda invocar `getMedia` y obtener el archivo.
 */
export const DEFAULT_WHAPI_MEDIA_SETTINGS: NonNullable<ChannelSettings["media"]> = {
    auto_download: ["audio"],
    init_avatars: false,
};

export class WhapiService {
    private token: string;
    private WHAPI_URL: string = "https://gate.whapi.cloud";

    constructor(config: { token?: string, apiUrl?: string } = {}) {
        const token = config.token || "";
        this.token = token;
        if (config.apiUrl) {
            this.WHAPI_URL = config.apiUrl;
        }
    }

    private getHeaders() {
        return {
            "Authorization": `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
        };
    }

    // --- MENSAJES ---

    /**
     * Obtiene un mensaje de Whapi.
     * @param messageId ID del mensaje a obtener.
     * @returns Mensaje o null si falla.
     */
    async getMessage(messageId: string) {
        try {
            const response = await fetch(`${this.WHAPI_URL}/messages/${messageId}`, {
                method: "GET",
                headers: this.getHeaders()
            });
            const data = await response.json();

            // Whapi devuelve un array 'messages' con un solo elemento
            if (data.messages && data.messages.length > 0) {
                return data.messages[0];
            }
            return null;
        } catch (error) {
            console.error("[Whapi GetMessage Error]", error);
            return null;
        }
    }

    /**
     * Envía un mensaje a un número de WhatsApp.
     * @param phone Número de WhatsApp a enviar el mensaje.
     * @param message Mensaje a enviar.
     * @returns ID del mensaje enviado o null si falla.
     */
    async sendMessage(phone: string, message: string) {
        try {
            // Whapi espera solo números
            const chatId = phone.replace(/[^0-9]/g, "");

            const response = await fetch(`${this.WHAPI_URL}/messages/text`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    to: chatId,
                    body: message,
                    typing_time: 0
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error("[Whapi Error] Payload:", JSON.stringify(data));
                throw new Error(data.error?.message || data.message || "Error enviando mensaje Whapi");
            }

            // Normalizamos respuesta
            const sentId = data.messages?.[0]?.id || data.message?.id || data.id;

            return {
                id: sentId,
                status: 'sent'
            };

        } catch (error) {
            console.error("[Whapi Exception]", error);
            throw error;
        }
    }

    /**
     * Elimina un mensaje de Whapi.
     * @param messageId ID del mensaje a eliminar.
     * @returns Respuesta de la API o error si falla.
     */
    async deleteMessage(messageId: string) {
        try {
            await fetch(`${this.WHAPI_URL}/messages/${messageId}`, {
                method: "DELETE",
                headers: this.getHeaders()
            });
            console.log(`[Whapi] Mensaje ${messageId} eliminado.`);
        } catch (error) {
            console.error("[Whapi Delete Error]", error);
        }
    }

    // --- MEDIA ---

    /**
     * Obtiene un archivo de media de Whapi.
     * @param mediaId ID del archivo de media.
     * @returns Buffer del archivo de media o null si falla.
     */
    async getMedia(mediaId: string): Promise<ArrayBuffer | null> {
        try {
            // Endpoint: GET /media/{mediaId}
            const response = await fetch(`${this.WHAPI_URL}/media/${mediaId}`, {
                method: "GET",
                headers: this.getHeaders()
            });

            if (!response.ok) {
                console.error(`[Whapi] Error obteniendo media ${mediaId}: ${response.status}`);
                return null;
            }

            return await response.arrayBuffer();
        } catch (error) {
            console.error("[Whapi Media Error]", error);
            return null;
        }
    }

    /**
     * Descarga un archivo de media de Whapi.
     * @param url URL del archivo de media.
     * @returns Buffer del archivo de media o null si falla.
     */
    async downloadMedia(url: string): Promise<ArrayBuffer | null> {
        try {
            const fetchHeaders: HeadersInit = {};
            if (url.includes("whapi.cloud")) {
                fetchHeaders["Authorization"] = `Bearer ${this.token}`;
            }

            const response = await fetch(url, { headers: fetchHeaders });

            if (!response.ok) {
                console.error(`Error descargando media: ${response.statusText}`);
                return null;
            }

            return await response.arrayBuffer();
        } catch (error) {
            console.error("[Whapi Download Error]", error);
            return null;
        }
    }

    // --- CANALES ---

    /**
     * Verifica el estado del canal.
     * 
     * @see https://whapi.readme.io/reference/health
     * 
     * @returns Respuesta de la API o null si falla.
     */
    async checkHealth() {
        try {
            const response = await fetch(`${this.WHAPI_URL}/health`, {
                method: "GET",
                headers: this.getHeaders()
            });

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            return await response.json() as HealthStatus;
        } catch (error) {
            console.error("[Whapi Check Health Error]", error);
            return null;
        }
    }

    /**
     * Actualiza la configuración de un canal.
     * 
     * @see https://whapi.readme.io/reference/updatechannelsettings
     * 
     * @param callback_backoff_delay_ms Retraso inicial del callback de backoff.
     * @param max_callback_backoff_delay_ms Retraso máximo del callback de backoff.
     * @param callback_persist Si true, el callback se guarda en la base de datos.
     * @param media Configuración de media.
     * @param webhooks Configuración de webhooks.
     * @param proxy Configuración de proxy.
     * @param mobile_proxy Configuración de proxy móvil.
     * @param offline_mode Si true, el canal está en modo offline.
     * @param full_history Si true, se guarda el historial completo.
     * 
     * @returns Respuesta de la API o null si falla.
     */

    /**
     * Obtiene la configuración de un canal.
     * 
     * @see https://whapi.readme.io/reference/getchannelsettings
     * 
     * @returns Configuración del canal o null si falla.
     */
    async getChannelSettings() {
        try {
            const response = await fetch(`${this.WHAPI_URL}/settings`, {
                method: "GET",
                headers: this.getHeaders()
            });

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            return await response.json() as ChannelSettings;
        } catch (error) {
            console.error("[Whapi Get Channel Settings Error]", error);
            return null;
        }
    }

    async updateChannelSettings(settings: ChannelSettings, retries = 5, delayMs = 3000): Promise<any> {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(`${this.WHAPI_URL}/settings`, {
                    method: "PATCH",
                    headers: this.getHeaders(),
                    body: JSON.stringify(settings)
                });

                if (!response.ok) {
                    if (response.status === 502 || response.status === 503) {
                        throw new Error(`Service Unavailable (${response.status})`);
                    }
                    throw new Error(response.statusText || `Status ${response.status}`);
                }

                return await response.json();
            } catch (error: any) {
                if (i === retries - 1) {
                    console.error("[Whapi Update Channel Settings Error] Final attempt failed:", error);
                    return null;
                }
                console.warn(`[Whapi Update Channel Settings Warning] Attempt ${i + 1} failed, retrying in ${delayMs}ms:`, error.message);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
        return null;
    }

    // --- AUTENTICACIÓN ---

    /**
     * Obtiene un código de vinculación por número de teléfono (Pairing Code).
     * Alternativa al QR para vincular desde el propio celular.
     *
     * @param phoneNumber Número de teléfono con código de país, solo dígitos (ej: 59899123456)
     * @returns El código de vinculación (8 caracteres) o lanza error.
     */
    async getPairingCode(phoneNumber: string): Promise<string> {
        const cleanPhone = phoneNumber.replace(/[^0-9]/g, "");
        try {
            const response = await fetch(`${this.WHAPI_URL}/users/login/${cleanPhone}`, {
                method: "GET",
                headers: this.getHeaders(),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({})) as Record<string, any>;
                throw new Error(data?.error?.message || data?.message || response.statusText);
            }

            const data = await response.json() as Record<string, any>;
            if (!data?.code) {
                throw new Error("No se recibió el código. Verificá el número e intentá de nuevo.");
            }
            return data.code as string;
        } catch (error) {
            console.error("[Whapi Pairing Code Error]", error);
            throw error;
        }
    }

    /**
     * Obtiene la imagen QR para iniciar sesión en WhatsApp.
     *
     * @see https://whapi.readme.io/reference/loginuser
     *
     * @returns Respuesta de la API o null si falla.
     */
    async getQRCode() {
        const url = new URL(`${this.WHAPI_URL}/users/login`);
        url.searchParams.set("wakeup", "true");
        url.searchParams.set("size", "100");
        url.searchParams.set("width", "100");
        url.searchParams.set("height", "100");
        url.searchParams.set("color_light", "#fff");
        url.searchParams.set("color_dark", "#000");

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: this.getHeaders()
            });

            if (response.status === 409) {
                return { status: "ALREADY_LOGGED_IN" };
            }

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            return await response.json();
        } catch (error) {
            console.error("[Whapi Login Error]", error);
            return null;
        }
    }

    /**
     * Cierra la sesión del usuario en Whapi.
     * 
     * @see https://whapi.readme.io/reference/logoutuser
     * 
     * @returns Respuesta de la API o null si falla (200 - OK, 409 - Sesión ya cerrada, 500 - Error del servidor).
     */
    async logout() {
        try {
            const response = await fetch(`${this.WHAPI_URL}/users/logout`, {
                method: "POST",
                headers: this.getHeaders()
            });

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            return await response.json();
        } catch (error) {
            console.error("[Whapi Logout Error]", error);
            return null;
        }
    }

    async rejectCall(callId: string, callFrom: string) {
        try {
            const response = await fetch(`${this.WHAPI_URL}/calls/${callId}`, {
                method: "DELETE",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    callFrom,
                })
            });

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            return await response.json();
        } catch (error) {
            console.error("[Whapi Reject Call Error]", error);
        }
    }
}

export class WhapiPartnerService {
    private token: string;
    private WHAPI_PARTNER_URL: string = "https://manager.whapi.cloud";
    private projectId: string = "9fsRBeYuoj4rCoBsaOAP";

    constructor(config: { token: string }) {
        const token = config.token;
        this.token = token;
    }

    private getHeaders() {
        return {
            "Authorization": `Bearer ${this.token}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
        };
    }

    // --- CANALES ---

    /**
     * Obtiene un canal de Whapi.
     * 
     * @see https://whapi-partner.readme.io/reference/getchannel
     * 
     * @param channelId ID del canal a obtener.
     * @returns Respuesta de la API o null si falla.
     */
    async getChannel(channelId: string) {
        try {
            const response = await fetch(`${this.WHAPI_PARTNER_URL}/channels/${channelId}`, {
                method: "GET",
                headers: this.getHeaders()
            });

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            return await response.json() as WhapiChannel;
        } catch (error) {
            console.error("[Whapi Partner Get Channel Error]", error);
            return null;
        }
    }

    async createChannel(name: string) {
        try {
            const payload: {
                name: string;
                projectId: string;
            } = {
                name,
                projectId: this.projectId,
            };

            const response = await fetch(`${this.WHAPI_PARTNER_URL}/channels`, {
                method: "PUT",
                headers: this.getHeaders(),
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            return await response.json() as WhapiChannel;
        } catch (error) {
            console.error("[Whapi Partner Create Channel Error]", error);
            return null;
        }
    }

    /**
     * Cambia el modo de un canal.
     * 
     * @see https://whapi-partner.readme.io/reference/changechannelmode
     * 
     * @param channelId ID del canal a cambiar el modo.
     * @param mode Modo a cambiar.
     * @returns Respuesta de la API o null si falla.
     */
    async changeChannelMode(channelId: string, mode: "trial" | "dev" | "dev_archive" | "live") {
        try {
            const response = await fetch(`${this.WHAPI_PARTNER_URL}/channels/${channelId}/mode`, {
                method: "PATCH",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    mode,
                })
            });

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            return await response.json();
        } catch (error) {
            console.error("[Whapi Partner Change Channel Mode Error]", error);
            return null;
        }
    }

    /**
     * Extiende el tiempo de un canal.
     * 
     * @see https://whapi-partner.readme.io/reference/extendchannel
     * 
     * @param channelId ID del canal a extender.
     * @param days Días a extender.
     * @param comment Comentario de la extensión.
     * @param amount Monto de la extensión.
     * @param currency Moneda de la extensión.
     * @returns Respuesta de la API o null si falla.
     */
    async extendChannel(
        channelId: string,
        days: number,
        comment: string,
        amount: number,
        currency: "USD" | "EUR"
    ) {
        try {
            const response = await fetch(`${this.WHAPI_PARTNER_URL}/channels/${channelId}/extend`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    days,
                    comment,
                    amount,
                    currency,
                })
            });

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            return await response.json();
        } catch (error) {
            console.error("[Whapi Partner Extend Channel Error]", error);
            return null;
        }
    }

    /**
     * Elimina un canal de Whapi.
     * 
     * @see https://whapi-partner.readme.io/reference/deletechannel
     * 
     * @param channelId ID del canal a eliminar.
     * @returns Respuesta de la API o null si falla.
     */
    async deleteChannel(channelId: string) {
        try {
            const response = await fetch(`${this.WHAPI_PARTNER_URL}/channels/${channelId}`, {
                method: "DELETE",
                headers: this.getHeaders()
            });

            if (!response.ok) {
                throw new Error(response.statusText);
            }

            return await response.json();
        } catch (error) {
            console.error("[Whapi Partner Delete Channel Error]", error);
            return null;
        }
    }
};
