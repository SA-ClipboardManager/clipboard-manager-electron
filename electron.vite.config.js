import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: "electron/main/main.js",
      },
      rollupOptions: {
        external: ["better-sqlite3"],
      },
    },
  },
  preload: {
    build: {
      lib: {
        entry: "electron/preload/preload.js",
      },
    },
  },
  renderer: {
    root: "src",
    build: {
      rollupOptions: {
        input: "src/index.html",
      },
    },
    css: {
      postcss: {
        plugins: [tailwindcss(), autoprefixer()],
      },
    },
    plugins: [react()],
  },
});
