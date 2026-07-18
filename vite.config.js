import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pwaHeadMarkup = `
    <link rel="manifest" href="/manifest.webmanifest">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <meta name="theme-color" content="#061b36">
    <meta name="application-name" content="ARGOS Field">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="ARGOS Field">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="format-detection" content="telephone=no">
`;

export default defineConfig({
  plugins: [
    react(),
    {
      name: "argos-pwa-head-metadata",

      transformIndexHtml(html) {
        if (html.includes('href="/manifest.webmanifest"')) {
          return html;
        }

        return html.replace(
          "</head>",
          `${pwaHeadMarkup}
  </head>`
        );
      }
    }
  ]
});