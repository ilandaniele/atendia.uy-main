export interface WhapiChannel {
    apiUrl: string;
    id: string;
    creationTS: number;
    ownerId: string;
    activeTill: number;
    token: string;
    server: number;
    stopped: boolean;
    status: string;
    trial: number;
    mode: "trial" | "dev" | "dev_archive" | "live";
    name: string;
    phone: string;
    projectId: string;
}

export interface HealthStatus {
    start_at: number;
    uptime: number;
    status: {
        code: number;
        text: string
    };
    version: string;
    user: any;
    ip: string;
    is_business: boolean;
    channel_id: string;
    api_version: string;
    core_version: string
}