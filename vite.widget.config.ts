import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    build: {
        emptyOutDir: false,
        lib: {
            entry: resolve(__dirname, "src/widget/bootstraper.ts"),
            name: "AtendiaWidget",
            formats: ["iife"],
            fileName: () => "atendia-widget.min.js"
        },
        rollupOptions: {
            external: ["react", "react-dom"]
        }
    }
});