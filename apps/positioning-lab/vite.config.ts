import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const defaultCertFile = resolve(repoRoot, ".certs/herd-dev.pem");
const defaultKeyFile = resolve(repoRoot, ".certs/herd-dev-key.pem");
const httpsOptions = loadDevHttpsOptions();

export default defineConfig({
  base: "/positioning-lab/",
  plugins: [redirectLegacyDevicePath(), react()],
  server: {
    ...(httpsOptions === undefined ? {} : { https: httpsOptions }),
    proxy: {
      "/api": {
        target: process.env.VITE_POSITIONING_LAB_API_TARGET ?? process.env.VITE_SERVER_URL ?? "http://localhost:8787",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

function loadDevHttpsOptions() {
  const certFile = process.env.HTTPS_CERT_FILE ?? (existsSync(defaultCertFile) ? defaultCertFile : undefined);
  const keyFile = process.env.HTTPS_KEY_FILE ?? (existsSync(defaultKeyFile) ? defaultKeyFile : undefined);
  if (certFile === undefined && keyFile === undefined) {
    return undefined;
  }
  if (certFile === undefined || keyFile === undefined) {
    throw new Error("HTTPS_CERT_FILE and HTTPS_KEY_FILE must be set together.");
  }

  return {
    cert: readFileSync(certFile),
    key: readFileSync(keyFile),
  };
}

function redirectLegacyDevicePath(): Plugin {
  return {
    name: "herd-positioning-device-redirect",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? "";
        if (url === "/positioning-device" || url.startsWith("/positioning-device?") || url.startsWith("/positioning-device/")) {
          response.statusCode = 302;
          response.setHeader("Location", `/positioning-lab${url}`);
          response.end();
          return;
        }
        next();
      });
    },
  };
}
