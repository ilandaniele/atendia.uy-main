
import { getAdminSupabase } from "../utils/supabase";
import { generatePassword } from "../utils/utils";

async function main() {
    console.log("Testing Supabase User Creation...");

    try {
        const sbAdmin = getAdminSupabase();
        const email = `test_user_${Date.now()}@example.com`;
        const password = generatePassword(12);
        
        console.log(`Attempting to create user: ${email}`);

        const { data, error } = await sbAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                name: "Test User"
            }
        });

        console.log("Result:");
        console.log("Error:", error);
        console.log("Data:", JSON.stringify(data, null, 2));

        if (error) {
            console.error("Creation failed!");
        } else if (!data.user) {
            console.error("No error, but user is null!");
        } else {
            console.log("User created successfully:", data.user.id);
            // Cleanup
            console.log("Cleaning up...");
            await sbAdmin.auth.admin.deleteUser(data.user.id);
            console.log("User deleted.");
        }

    } catch (e) {
        console.error("Exception:", e);
    }
}

main();
