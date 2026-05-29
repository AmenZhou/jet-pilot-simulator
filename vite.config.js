import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  plugins: [cesium()],
  server: {
    port: 5173,
    open: "/earth.html",
  },
  build: {
    rollupOptions: {
      input: {
        earth: "./earth.html",
      },
    },
  },
});
