import type { Config } from "@react-router/dev/config";

const siteUrl = process.env.VITE_SITE_URL ?? process.env.SITE_URL ?? "";
const siteHost = siteUrl ? new URL(siteUrl).host : "";

const isDev = process.env.NODE_ENV !== "production";

export default {
  ssr: true,
  allowedActionOrigins: [
    ...(siteHost ? [siteHost] : []),
    ...(isDev ? ["localhost:5173", "localhost:5174", "localhost:3000"] : []),
  ],
} satisfies Config;
