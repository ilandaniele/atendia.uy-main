import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
    "Eliminar perfiles y sus clientes",
    { hourUTC: 3, minuteUTC: 0 },
    internal.profiles.deleteExpiredProfiles,
);

crons.daily(
    "Alerta trial terminando en 24 hs",
    { hourUTC: 10, minuteUTC: 0 },
    internal.billingCrons.checkTrialEnding,
);

crons.daily(
    "Desactivar trials expirados",
    { hourUTC: 10, minuteUTC: 30 },
    internal.billingCrons.checkTrialExpired,
);

crons.daily(
    "Desactivar canales Whapi sin suscripcion activa",
    { hourUTC: 11, minuteUTC: 0 },
    internal.billingCrons.checkWhapiChannelSubscriptions,
);

crons.daily(
    "Renovar webhooks Google Calendar",
    { hourUTC: 8, minuteUTC: 0 },
    internal.googleCalendar.renewWebhooks,
);

// 15 días = 360 horas — renueva los enlaces de suscripción dLocal Go
crons.interval(
    "Renovar enlaces dLocal Go",
    { hours: 360 },
    internal.planCrons.refreshAllPlanLinks,
);

crons.daily(
    "Limpiar sesiones de impersonacion antiguas",
    { hourUTC: 4, minuteUTC: 0 },
    internal.impersonation.purgeOld,
);

// Drive sync dispatcher: fires every 5 min, per-client gating uses
// client.config.driveSyncIntervalMinutes (default 15).
crons.interval(
    "Despachar sincronizacion de archivos de Google Drive",
    { minutes: 5 },
    internal.googleDrive.dispatchDriveSyncs,
);

export default crons;
