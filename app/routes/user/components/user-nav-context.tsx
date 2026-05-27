import { createContext, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

type UserProfile = NonNullable<ReturnType<typeof useQuery<typeof api.profiles.me>>>;
type ClientMember = NonNullable<
    ReturnType<typeof useQuery<typeof api.clientMembers.getByProfile>>
>[number];
type Client = NonNullable<ReturnType<typeof useQuery<typeof api.clients.get>>>;

export type BadgeCounts = {
    leads: number;
    messages: number;
    orders: number;
    appointments: number;
};

export type UserNavValue = {
    userProfile: UserProfile | null | undefined;
    activeClientMember: ClientMember | undefined;
    client: Client | null | undefined;
    clientId: Id<"clients"> | undefined;
    userRole: "owner" | "member";
    hasClient: boolean;
    tokensBalance: number | null;
    features: { enableOrders: boolean; enableAgenda: boolean };
    badgeCounts: BadgeCounts;
    hasNotifications: boolean;
};

const UserNavContext = createContext<UserNavValue | null>(null);

export function useUserNavContext(): UserNavValue {
    const value = useContext(UserNavContext);
    if (!value) {
        throw new Error("useUserNavContext debe usarse dentro de <UserNavProvider />");
    }
    return value;
}

function playChime(notes: number[], stepSec: number) {
    try {
        const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext;
        const ctx = new AudioCtx();
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            osc.type = "sine";
            const t0 = ctx.currentTime + i * stepSec;
            gain.gain.setValueAtTime(0, t0);
            gain.gain.linearRampToValueAtTime(0.15, t0 + 0.05);
            gain.gain.linearRampToValueAtTime(0, t0 + stepSec + 0.05);
            osc.start(t0);
            osc.stop(t0 + stepSec + 0.05);
        });
    } catch {
        /* audio bloqueado por el navegador */
    }
}

export function UserNavProvider({ children }: { children: ReactNode }) {
    const userProfile = useQuery(api.profiles.me);

    const userClients = useQuery(
        api.clientMembers.getByProfile,
        userProfile ? { profileId: userProfile._id } : "skip"
    );

    const activeClientMember = userClients?.[0];
    const userRole: "owner" | "member" =
        activeClientMember?.role === "owner" ? "owner" : "member";
    const hasClient = !!userClients && userClients.length > 0;

    const client = useQuery(
        api.clients.get,
        activeClientMember ? { id: activeClientMember.client } : "skip"
    );

    const tokensBalance =
        typeof client?.tokensBalance === "number" ? client.tokensBalance : null;

    const features = {
        enableOrders: client?.features?.enableOrders ?? false,
        enableAgenda: client?.features?.enableAgenda ?? false,
    };

    const clientId = activeClientMember?.client;

    const leads = useQuery(
        api.leads.getByClient,
        clientId ? { clientId } : "skip"
    );
    const newLeadsCount = leads?.filter((l) => l.status === "new").length ?? 0;

    const conversationStates = useQuery(
        api.conversationStates.getByClient,
        clientId ? { clientId } : "skip"
    );
    const pendingMessagesCount =
        conversationStates?.filter((s) => s.pendingUserMessage === true).length ?? 0;

    const orders = useQuery(
        api.orders.getByClient,
        clientId && features.enableOrders ? { clientId } : "skip"
    );
    const pendingOrdersCount =
        orders?.filter((o) => o.status === "pending").length ?? 0;

    const now = Date.now();
    const appointments = useQuery(
        api.appointments.getByClient,
        clientId && features.enableAgenda ? { clientId } : "skip"
    );
    const pendingApptCount =
        appointments?.filter((a) => a.start > now && a.status === "pending")
            .length ?? 0;

    const badgeCounts: BadgeCounts = {
        leads: newLeadsCount,
        messages: pendingMessagesCount,
        orders: pendingOrdersCount,
        appointments: pendingApptCount,
    };

    const hasNotifications =
        newLeadsCount > 0 ||
        pendingMessagesCount > 0 ||
        pendingOrdersCount > 0 ||
        pendingApptCount > 0;

    // ─── Sonidos al recibir nuevos eventos ─────────────────────────────────
    const prevLeadsRef = useRef<number | null>(null);
    const leadsInitRef = useRef(false);
    useEffect(() => {
        if (leads === undefined) return;
        if (!leadsInitRef.current) {
            leadsInitRef.current = true;
            prevLeadsRef.current = newLeadsCount;
            return;
        }
        if (
            prevLeadsRef.current !== null &&
            newLeadsCount > prevLeadsRef.current
        ) {
            playChime([880, 1046, 1318], 0.12);
        }
        prevLeadsRef.current = newLeadsCount;
    }, [newLeadsCount, leads]);

    const prevApptRef = useRef<number | null>(null);
    const apptInitRef = useRef(false);
    useEffect(() => {
        if (appointments === undefined) return;
        if (!apptInitRef.current) {
            apptInitRef.current = true;
            prevApptRef.current = pendingApptCount;
            return;
        }
        if (
            prevApptRef.current !== null &&
            pendingApptCount > prevApptRef.current
        ) {
            playChime([523, 659, 784], 0.15);
        }
        prevApptRef.current = pendingApptCount;
    }, [pendingApptCount, appointments]);

    const value: UserNavValue = {
        userProfile,
        activeClientMember,
        client,
        clientId,
        userRole,
        hasClient,
        tokensBalance,
        features,
        badgeCounts,
        hasNotifications,
    };

    return (
        <UserNavContext.Provider value={value}>{children}</UserNavContext.Provider>
    );
}
