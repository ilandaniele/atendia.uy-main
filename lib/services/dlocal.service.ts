import devug from "@mafer.solutions/devug";

export interface DLocalServiceConfig { 
    apiUrl: string;
    apiKey: string;
    secretKey: string;
    siteUrl: string;
}

type PaginationOptions = { 
    page: number; 
    pageSize: number; 
}

type FrequencyType = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type PaymentStatus = "PENDING" | "PAID" | "CANCELLED" | "REJECTED" | "EXPIRED";
type ExecutionStatus = "CREATED" | "CONFIRMED";

interface RequestPayload {
    name: string;
    description: string;
    currency: "USD";
    amount: number;
    frequency_type: FrequencyType;
    frequency_value: number;
    free_trial_days?: number;
    notification_url: string;
    success_url: string;
    back_url: string;
    error_url: string;
}

// Respuestas
export interface CreatePaymentResponse {
    id: string;
    amount: number;
    currency: string;
    country: string;
    description: string;
    created_date: string;
    status: string;
    order_id: number;
    notification_url: string;
    success_url: string;
    back_url: string;
    redirect_url: string;
    merchant_checkout_token: string;
    direct: boolean;
}

export interface RetrievePaymentResponse {
    id: string;
    amount: number;
    currency: string;
    balance_amount: number;
    balance_fee: number;
    balance_currency: string;
    payment_method_type: "CREDIT_CARD";
    country: string;
    description: string;
    created_date: string;
    approved_date: string;
    status: PaymentStatus;
    order_id: number;
    notification_url: string;
    success_url: string;
    back_url: string;
    redirect_url: string;
    merchant_checkout_token: string;
    direct: boolean;
    payer: {
        first_name: string;
        last_name: string;
        email: string;
        document_type: string;
        document: string;
    };
    card: {
        bin: string;
        issuer: string;
        last_four: string;
    };
    custom_data: Record<string, string>;
}

export interface PlanResponse {
    data: Plan[];
    total_elements: number;
    total_pages: number;
    page: number;
    number_of_elements: number;
    size: number;
}

export interface Plan {
    id: number;
    merchant_id: number;
    name: string;
    description: string;
    country: string;
    currency: "USD";
    amount: number;
    frequency_type: FrequencyType;
    frequency_value: 1;
    active: boolean;
    free_trial_days: number;
    plan_token: string;
    created_at: string;
    updated_at: string;
    notification_url: string;
    subscribe_url: string;
    back_url: string;
    success_url: string;
    error_url: string;
}

export interface SubscriptionResponse {
    "@id": string;
    id: number;
    plan: Plan;
    country: string;
    subscription_token: string;
    status: "CREATED" | "CONFIRMED";
    client_id: string;
    client_first_name: string;
    client_last_name: string;
    client_document_type: string;
    client_document: string;
    client_email: string;
    language: string;
    dlocal_account_type: string;
    scheduled_date: string;
    active: boolean;
    created_at: string;
    updated_at: string;
}

export interface PlanSubscriptionsResponse {
    data: Array<SubscriptionResponse>;
    total_elements: number;
    total_pages: number;
    page: number;
    number_of_elements: number;
    size: number;
}

export interface SubscriptionExecutionResponse {
    "@id": string;
    id: number;
    subscription: SubscriptionResponse;
    status: ExecutionStatus;
    order_id: string;
    merchant_checkout_id: number;
    currency: "UYU" | "USD";
    external_id: number;
    created_at: string;
    updated_at: string;
}

// Inputs
interface CreatePlanInput {
    name: string; 
    description: string; 
    amount: number; 
    frequencyType?: FrequencyType;
    frequencyValue?: number;
    freeTrialDays?: number;
}

interface UpdatePlanInput {
    name?: string;
    description?: string;
    amount?: number;
    notification_url?: string;
    success_url?: string;
    error_url?: string;
    back_url?: string;
}

/**
 * SDK de DLocal Go para pagos y suscripciones
 */
export class DLocalService {
    private apiUrl: string;
    private siteUrl: string;
    private headers = new Headers();

    constructor(config: DLocalServiceConfig) {
        if (!config.siteUrl) throw new Error("DLocalService: siteUrl es obligatorio (SITE_URL o VITE_SITE_URL no configurado)");
        if (!config.apiUrl) throw new Error("DLocalService: apiUrl es obligatorio (DLOCALGO_API_URL no configurado)");
        if (!config.apiKey) throw new Error("DLocalService: apiKey es obligatorio (DLOCALGO_API_KEY no configurado)");
        if (!config.secretKey) throw new Error("DLocalService: secretKey es obligatorio (DLOCALGO_SECRET_KEY no configurado)");

        this.apiUrl = config.apiUrl;
        this.siteUrl = config.siteUrl;
        this.headers.append("Authorization", `Bearer ${config.apiKey}:${config.secretKey}`);
        this.headers.append("Content-Type", "application/json");
    }

    // PAGOS

    async retrievePayment(paymentId: string): Promise<RetrievePaymentResponse> {
        const response = await fetch(`${this.apiUrl}/payments/${paymentId}`);

        if (!response.ok) {
            const errorData = await response.text();
            devug.error("Error dLocal Go:", errorData);
            throw new Error(`Error al obtener el pago: ${response.statusText}`);
        }
        
        const data = await response.json() as RetrievePaymentResponse;
        return data;
    }

    // PLANES

    async createPlan(plan: CreatePlanInput): Promise<Plan> {
        const body: RequestPayload = {
            name: plan.name,
            description: plan.description,
            amount: plan.amount,
            currency: "USD",
            frequency_type: plan.frequencyType || "MONTHLY",
            frequency_value: plan.frequencyValue || 1,
            notification_url: `${this.siteUrl}/api/webhooks/dlocal`,
            success_url: `${this.siteUrl}/panel/facturacion?success=true`,
            error_url: `${this.siteUrl}/panel/facturacion?success=false`,
            back_url: `${this.siteUrl}/panel/facturacion`,
        };

        if (plan.freeTrialDays && plan.freeTrialDays > 0) {
            body.free_trial_days = plan.freeTrialDays;
        }

        const response = await fetch(`${this.apiUrl}/subscription/plan`, {
            headers: this.headers,
            method: "POST",
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            console.log("error", await response.text())
            devug.error("[Error DLocal Go]", response.statusText);
            throw new Error("Error DLocal Go: Error al crear el plan");
        }

        const data = await response.json() as Plan;
        return data;
    }

    async updatePlan(planId: number, plan: UpdatePlanInput): Promise<Plan> {
        const body: UpdatePlanInput = {};
        if (plan.name) { body.name = plan.name; }
        if (plan.description) { body.description = plan.description; }
        if (plan.amount) { body.amount = plan.amount; }
        if (plan.notification_url) { body.notification_url = plan.notification_url; }
        if (plan.success_url) { body.success_url = plan.success_url; }
        if (plan.error_url) { body.error_url = plan.error_url; }
        if (plan.back_url) { body.back_url = plan.back_url; }

        const response = await fetch(`${this.apiUrl}/subscription/plan/${planId}`, {
            headers: this.headers,
            method: "PATCH",
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            devug.error("[Error DLocal Go]", response.statusText);
            throw new Error(`Error DLocal Go: Error al actualizar el plan #${planId}`);
        }

        const data = await response.json() as Plan;
        return data;
    }

    async cancelPlan(planId: number): Promise<Omit<Plan, "notification_url" | "subscribe_url" | "success_url" | "error_url" | "back_url">> {
        const response = await fetch(`${this.apiUrl}/subscription/plan/${planId}/deactivate`, {
            headers: this.headers,
            method: "PATCH",
        });
        if (!response.ok) {
            devug.error("[Error DLocal Go]", response.statusText);
            throw new Error(`Error DLocal Go: Error al desactivar el plan #${planId}`);
        }

        const data = await response.json() as Omit<Plan, "notification_url" | "subscribe_url" | "success_url" | "error_url" | "back_url">;
        return data;
    }

    async retrieveAllPlans(pagination?: PaginationOptions): Promise<PlanResponse> {
        const apiUrl = new URL(`${this.apiUrl}/subscription/plan/all`);
        if (pagination) {
            apiUrl.searchParams.append("page", pagination.page.toString());
            apiUrl.searchParams.append("page_size", pagination.pageSize.toString());
        }
        const response = await fetch(apiUrl, { headers: this.headers });
        if (!response.ok) {
            devug.error("[Error DLocal Go]", response.statusText);
            throw new Error("Error DLocal Go: Error al obtener todos los planes");
        }

        const data = await response.json() as PlanResponse;
        return data;
    }

    async retrievePlan(planId: number): Promise<Plan> {
        const response = await fetch(
            `${this.apiUrl}/subscription/plan/${planId}`, 
            { headers: this.headers }
        );
        if (!response.ok) {
            devug.error("[Error DLocal Go]", response.statusText);
            throw new Error(`Error DLocal Go: Error al obtener el plan #${planId}`);
        }

        const data = await response.json() as Plan;
        return data;
    }

    // SUSCRIPCIONES

    async updateSubscription(planId: number, subscriptionId: number, newPlanId: number): Promise<SubscriptionResponse> {
        const apiUrl = new URL(`${this.apiUrl}/subscription/plan/${planId}/${subscriptionId}/change-plan`);
        apiUrl.searchParams.append("new_plan_id", newPlanId.toString());

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: this.headers,
        });
        if (!response.ok) {
            devug.error("[Error DLocal Go]", response.statusText);
            throw new Error(`Error DLocal Go: Error al actualizar la suscripción #${subscriptionId}`);
        }

        const data = await response.json() as SubscriptionResponse;
        return data;
    }
    
    async retrievePlanSubscriptions(planId: number): Promise<PlanSubscriptionsResponse> {
        const response = await fetch(
            `${this.apiUrl}/subscription/plan/${planId}/subscription/all`, 
            { headers: this.headers }
        );
        if (!response.ok) {
            devug.error("[Error DLocal Go]", response.statusText);
            throw new Error(`Error DLocal Go: Error al obtener las suscripciones del plan #${planId}`);
        }

        const data = await response.json() as PlanSubscriptionsResponse;
        return data;
    }

    async retrieveSubscriptionExecution(subscriptionId: number, executionId: string, pagination?: PaginationOptions): Promise<SubscriptionExecutionResponse> {
        const apiUrl = new URL(`${this.apiUrl}/subscription/${subscriptionId}/execution/${executionId}`);
        if (pagination) {
            apiUrl.searchParams.append("page", pagination.page.toString());
            apiUrl.searchParams.append("page_size", pagination.pageSize.toString());
        }

        const response = await fetch(apiUrl, { headers: this.headers });
        if (!response.ok) {
            devug.error("[Error DLocal Go]", response.statusText);
            throw new Error(`Error DLocal Go: Error al obtener la ejecución #${executionId} de la suscripción #${subscriptionId}`);
        }

        const data = await response.json() as SubscriptionExecutionResponse;
        return data;
    }

    async cancelPlanSubscription(planId: number, subscriptionId: number): Promise<SubscriptionResponse> {
        const response = await fetch(
            `${this.apiUrl}/subscription/plan/${planId}/subscription/${subscriptionId}/deactivate`,
            {
                method: "PATCH",
                headers: this.headers
            }
        );
        if (!response.ok) {
            devug.error("[Error DLocal Go]", response.statusText);
            throw new Error(`Error DLocal Go: Error al cancelar la suscripción #${subscriptionId} del plan #${planId}`);
        }

        const data = await response.json() as SubscriptionResponse;
        return data;
    }
}