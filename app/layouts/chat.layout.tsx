import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Outlet } from "react-router";
import { getEnv } from "utils/utils";

const convex = new ConvexReactClient(getEnv("VITE_CONVEX_URL")!);

export default function ChatLayout() {
    return (
        <ConvexProvider client={convex}>
            <Outlet />
        </ConvexProvider>
    );
}
