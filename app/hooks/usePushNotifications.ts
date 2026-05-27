import { useEffect, useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "convex/_generated/api";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushPermission = NotificationPermission | "unsupported";

export function usePushNotifications(userId: string | undefined) {
    const [permission, setPermission] = useState<PushPermission>("default");
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const upsertSubscription = useMutation(api.pushSubscriptions.upsertForUser);
    const removeSubscription = useMutation(api.pushSubscriptions.removeForUser);

    // Inicializar estado al montar
    useEffect(() => {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
            setPermission("unsupported");
            return;
        }
        setPermission(Notification.permission);

        navigator.serviceWorker.register("/sw.js").then((reg) => {
            reg.pushManager.getSubscription().then((sub) => {
                setIsSubscribed(!!sub);
            });
        });
    }, []);

    const subscribe = useCallback(async () => {
        if (!userId || !VAPID_PUBLIC_KEY || isLoading) return;
        setIsLoading(true);
        try {
            const perm = await Notification.requestPermission();
            setPermission(perm);
            if (perm !== "granted") return;

            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
            });

            await upsertSubscription({ userId, subscription: sub.toJSON() });
            setIsSubscribed(true);
        } catch (err) {
            console.error("[Push] Error al suscribirse:", err);
        } finally {
            setIsLoading(false);
        }
    }, [userId, isLoading, upsertSubscription]);

    const unsubscribe = useCallback(async () => {
        if (!userId || isLoading) return;
        setIsLoading(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                const endpoint = sub.endpoint;
                await sub.unsubscribe();
                await removeSubscription({ userId, endpoint });
            }
            setIsSubscribed(false);
        } catch (err) {
            console.error("[Push] Error al desuscribirse:", err);
        } finally {
            setIsLoading(false);
        }
    }, [userId, isLoading, removeSubscription]);

    return { permission, isSubscribed, isLoading, subscribe, unsubscribe };
}
