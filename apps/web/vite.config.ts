import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";

/*
 * Crash reports point at our source lines only if Sentry has the source
 * maps (docs/16-DEPLOYMENT.md §Observability). With a token, the build uploads them
 * and deletes them from dist, so they are never served to browsers;
 * without one, no maps are produced at all.
 */
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_WEB_PROJECT);
const release = process.env.RENDER_GIT_COMMIT ?? "";

/**
 * The product web app (docs/21 W2). Same rendering setup as the demo
 * (tools/design-preview/vite.config.ts), so the shared screens look the same:
 * `react-native` is react-native-web, and react-native-svg uses its web build.
 */
export default defineConfig({
  plugins: [
    react(),
    /*
     * Installable (docs/21 W2), and the prerequisite for Web Push on iOS.
     * The service worker precaches the app shell only: the built JS, CSS,
     * HTML and icons. It never caches /api (every answer must be the
     * server's current one).
     *
     * The art (/clips, /world) is kept as it is seen and refreshed behind
     * it. The server sends it `no-cache`, so without this every open asked
     * the server again, and an open during a deploy (the server answering
     * 502 while it restarts) drew the app with its pictures missing.
     */
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "PRO NOW",
        short_name: "PRO NOW",
        description: "מקצוען מאומת, שבא עכשיו.",
        lang: "he",
        dir: "rtl",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#17121F",
        theme_color: "#17121F",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html}", "icons/*.png"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Web Push: the worker's push and click handlers (docs/21 W9).
        importScripts: ["/push-handler.js"],
        runtimeCaching: [
          {
            urlPattern: /\/(clips|world)\/(?:[^/]+\/)*[^/]+\.(jpe?g|png|webp)$/, // subfolders too: /world/m/ holds the shop textures
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "art",
              // Room for every file under /world and /clips (about 140 with the
              // street's walkers, traffic and props), with headroom, not more.
              expiration: { maxEntries: 200 },
            },
          },
        ],
      },
    }),
    ...(uploadSourceMaps
      ? [
          sentryVitePlugin({
            authToken: process.env.SENTRY_AUTH_TOKEN,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_WEB_PROJECT,
            release: release ? { name: release } : undefined,
            sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
            telemetry: false,
          }),
        ]
      : []),
  ],
  build: { sourcemap: uploadSourceMaps ? "hidden" : false },
  resolve: {
    alias: [
      { find: /^react-native-svg$/, replacement: "react-native-svg/lib/module/ReactNativeSVG.web.js" },
      { find: /^react-native$/, replacement: "react-native-web" },
    ],
    extensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".jsx", ".js"],
    /*
     * packages/ui sits in the workspace next to apps that pin React 18
     * (Expo, Next). Without this, a shared screen would import the
     * root's React 18 while this app renders with React 19 — two Reacts
     * in one page.
     */
    dedupe: ["react", "react-dom", "react-native-web", "react-native-svg"],
  },
  /*
   * Pre-bundled up front. Otherwise Vite discovers a dependency the first
   * time a screen imports it, re-bundles, and reloads mid-session, and a page
   * that survives the reload can briefly hold two copies of React ("Invalid
   * hook call"). Development only; production is one bundle.
   */
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-native-web",
      "react-router",
      "@tanstack/react-query",
      "better-auth/react",
      "better-auth/client/plugins",
    ],
  },
  define: {
    global: "window",
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
    // The deployed commit, so a crash report names the build it came from.
    "import.meta.env.VITE_RELEASE": JSON.stringify(release),
  },
  server: {
    port: 5180,
    strictPort: true,
    host: true,
    /*
     * Same origin in development as in production: the browser only ever
     * talks to this server, which hands /api to Fastify. Session cookies
     * and sign-in links then work exactly as they will when Fastify serves
     * the built app itself.
     */
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: false } },
  },
  preview: { port: 5180, strictPort: true, host: true, proxy: { "/api": { target: "http://localhost:4000" } } },
});
