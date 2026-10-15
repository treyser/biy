import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  base: "/biy/",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        background: resolve(__dirname, "background.html"),
        menu: resolve(__dirname, "menu.html"),
        index: resolve(__dirname, "index.html"),
        bar: resolve(__dirname, "bar.html"),
        roll: resolve(__dirname, "roll.html"),
        death: resolve(__dirname, "death.html"),
      },
    },
  },
});
