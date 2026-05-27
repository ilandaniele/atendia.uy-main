import { v } from "convex/values";
import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import type { Id } from "./_generated/dataModel";

export const list = query({
    args: {
        paginationOpts: paginationOptsValidator,
        clientId: v.optional(v.id("clients")),
        source: v.optional(v.union(v.literal("whatsapp"), v.literal("web"))),
    },
    handler: async (ctx, args) => {
        let q;

        if (args.clientId) {
            q = ctx.db
                .query("token_usage_logs")
                .withIndex("by_client", (qi) => qi.eq("clientId", args.clientId!))
                .order("desc");
        } else {
            q = ctx.db.query("token_usage_logs").order("desc");
        }

        const page = await q.paginate(args.paginationOpts);

        // Enrich each log with client and channel names
        const enriched = await Promise.all(
            page.page.map(async (log) => {
                const [client, channel] = await Promise.all([
                    ctx.db.get(log.clientId),
                    log.channelId ? ctx.db.get(log.channelId) : Promise.resolve(null),
                ]);
                return {
                    ...log,
                    clientName: (client && "name" in client ? client.name : null) ?? "—",
                    channelName: (channel && "name" in channel ? channel.name : null) ?? "—",
                };
            })
        );

        // Filter by source after enrichment (index doesn't cover combined filters)
        const filtered = args.source
            ? { ...page, page: enriched.filter((l) => l.source === args.source) }
            : { ...page, page: enriched };

        return filtered;
    },
});

export const summary = query({
    args: {
        fromTs: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const allLogs = await ctx.db.query("token_usage_logs").collect();

        const filtered = args.fromTs
            ? allLogs.filter((l) => l._creationTime >= args.fromTs!)
            : allLogs;

        // Total global
        const totalTokens = filtered.reduce((sum, l) => sum + l.tokensUsed, 0);

        // Por fuente
        const bySource = filtered.reduce<Record<string, number>>((acc, l) => {
            acc[l.source] = (acc[l.source] ?? 0) + l.tokensUsed;
            return acc;
        }, {});

        // Por cliente (top N)
        const byClientMap = filtered.reduce<Record<string, { tokens: number; clientId: string }>>((acc, l) => {
            const id = l.clientId as string;
            if (!acc[id]) acc[id] = { tokens: 0, clientId: id };
            acc[id].tokens += l.tokensUsed;
            return acc;
        }, {});

        // Enrich with names
        const byClient = await Promise.all(
            Object.values(byClientMap)
                .sort((a, b) => b.tokens - a.tokens)
                .slice(0, 20)
                .map(async (entry) => {
                    const client = await ctx.db.get(entry.clientId as Id<"clients">);
                    return {
                        clientId: entry.clientId,
                        clientName: client?.name ?? "—",
                        tokens: entry.tokens,
                    };
                })
        );

        return { totalTokens, bySource, byClient };
    },
});

export const clients = query({
    args: {},
    handler: async (ctx) => {
        return ctx.db.query("clients").collect();
    },
});
