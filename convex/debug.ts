import { query } from "./_generated/server";

export const listAuthAccounts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("authAccounts").take(5);
  },
});
