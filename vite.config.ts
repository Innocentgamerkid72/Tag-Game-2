import { defineConfig } from "vite";

export default defineConfig({
  // Change "/Tag-Game-2/" to match your GitHub repo name if deploying to GitHub Pages.
  // For Netlify/Vercel, remove the base line entirely.
  base: process.env.GITHUB_ACTIONS ? "/Tag-Game-2/" : "/",
  server: {
    host: true, // expose on LAN so other devices can connect
  },
});
