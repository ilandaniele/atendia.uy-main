import { defineSchema } from "convex/server";
import { AssistantSchema } from "./schemas/assistant.schema";
import { ChannelSchema } from "./schemas/channel.schema";
import { ClientMemberSchema } from "./schemas/client-member.schema";
import { ChatSchema } from "./schemas/chat.schema";
import { ClientSchema } from "./schemas/client.schema";
import { ConversationStateSchema } from "./schemas/conversation-state.schema";
import { KnowledgeBaseSchema } from "./schemas/knowledge-base.schema";
import { KnowledgeChunkSchema } from "./schemas/knowledge-chunk.schema";
import { KnowledgeEmbeddingSchema } from "./schemas/knowledge-embedding.schema";
import { LeadSchema } from "./schemas/lead.schema";
import { OrderSchema } from "./schemas/order.schema";
import { ProfileSchema } from "./schemas/profile.schema";
import { PushSubscriptionSchema } from "./schemas/push-subscription.schema";
import { AppointmentSchema } from "./schemas/appointment.schema";
import { AvailabilitySchema } from "./schemas/availability.schema";
import { ProductSchema } from "./schemas/product.schema";
import { authTables } from "@convex-dev/auth/server";
import { InviteSchema } from "./schemas/invite.schema";
import { InvoiceSchema } from "./schemas/invoice.schema";
import { PlanSchema } from "./schemas/plan.schema";
import { FaqSchema } from "./schemas/faq.schema";
import { PrivacySchema } from "./schemas/privacy.schema";
import { TermsSchema } from "./schemas/terms.schema";
import { TicketSchema } from "./schemas/ticket.schema";
import { ContactFormSchema } from "./schemas/contact-form.schema";
import { SystemConfigSchema } from "./schemas/system-config.schema";
import { TokenUsageLogSchema } from "./schemas/token-usage-log.schema";
import { ExcelImportSchema } from "./schemas/excel-import.schema";
import { ExcelImportRowSchema } from "./schemas/excel-import-row.schema";
import { ContactSchema } from "./schemas/contact.schema";
import { ImpersonationSessionSchema } from "./schemas/impersonation-session.schema";

export default defineSchema({
    ...authTables,
    appointments: AppointmentSchema,
    assistants: AssistantSchema,
    contacts: ContactSchema,
    availability: AvailabilitySchema,
    channels: ChannelSchema,
    chats: ChatSchema,
    client_members: ClientMemberSchema,
    clients: ClientSchema,
    conversation_states: ConversationStateSchema,
    invites: InviteSchema,
    invoices: InvoiceSchema,
    excel_imports: ExcelImportSchema,
    excel_import_rows: ExcelImportRowSchema,
    impersonation_sessions: ImpersonationSessionSchema,
    knowledge_bases: KnowledgeBaseSchema,
    knowledge_chunks: KnowledgeChunkSchema,
    knowledge_embeddings: KnowledgeEmbeddingSchema,
    leads: LeadSchema,
    orders: OrderSchema,
    plans: PlanSchema,
    faq: FaqSchema,
    privacy: PrivacySchema,
    products: ProductSchema,
    terms: TermsSchema,
    profiles: ProfileSchema,
    push_subscriptions: PushSubscriptionSchema,
    tickets: TicketSchema,
    contact_forms: ContactFormSchema,
    system_config: SystemConfigSchema,
    token_usage_logs: TokenUsageLogSchema,
});