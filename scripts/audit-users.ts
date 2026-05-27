
import { getAdminSupabase } from "../utils/supabase";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { getEnv } from "../utils/utils";

async function main() {
    console.log("Starting User Audit...");

    // 1. Setup Supabase
    let sbAdmin;
    try {
        sbAdmin = getAdminSupabase();
    } catch (e: any) {
        console.error("Failed to init Supabase:", e.message);
        process.exit(1);
    }

    // 2. Setup Convex
    const CONVEX_URL = getEnv("VITE_CONVEX_URL");
    if (!CONVEX_URL) {
        console.error("VITE_CONVEX_URL is missing");
        process.exit(1);
    }
    const convex = new ConvexHttpClient(CONVEX_URL);

    // 3. Fetch Profiles
    console.log("Fetching profiles from Convex...");
    const profiles = await convex.query(api.profiles.list);
    console.log(`Found ${profiles.length} profiles.`);

    // 4. Check Supabase
    console.log("Checking Supabase for each profile...");
    
    let missingCount = 0;

    for (const profile of profiles) {
        if (!profile.supabaseId) {
            console.warn(`Profile ${profile._id} (${profile.name}) has no supabaseId!`);
            continue;
        }

        const { data: { user }, error } = await sbAdmin.auth.admin.getUserById(profile.supabaseId);

        if (error || !user) {
            console.error(`[MISSING] Profile ${profile.name} (${profile.email}) points to Supabase ID ${profile.supabaseId} but user not found! Error: ${error?.message}`);
            missingCount++;
        } else {
            console.log(`[OK] ${profile.name} (${profile.email}) found in Supabase.`);
        }
    }

    console.log("Audit complete.");
    if (missingCount > 0) {
        console.error(`FOUND ${missingCount} MISSING USERS IN SUPABASE!`);
    } else {
        console.log("All profiles have valid Supabase users.");
    }
}

main();
