import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    // aws-amplify が必要とする global polyfill
    global: "globalThis",
  },
});
