import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const port = process.env.PORT ?? "5176";
const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const defaultCertFile = resolve(repoRoot, ".certs/herd-dev.pem");
const defaultKeyFile = resolve(repoRoot, ".certs/herd-dev-key.pem");
const certFile = process.env.HTTPS_CERT_FILE ?? (existsSync(defaultCertFile) ? defaultCertFile : undefined);
const keyFile = process.env.HTTPS_KEY_FILE ?? (existsSync(defaultKeyFile) ? defaultKeyFile : undefined);
const protocol = certFile !== undefined && keyFile !== undefined ? "https" : "http";
const configuredOrigin = process.env.VITE_POSITIONING_LAB_PUBLIC_ORIGIN ?? process.env.POSITIONING_LAB_PUBLIC_ORIGIN;
const publicOrigin = configuredOrigin ?? inferLanOrigin(port, protocol);
const configuredServerOrigin = process.env.VITE_SERVER_URL;
const serverOrigin = configuredServerOrigin ?? inferLanOrigin(process.env.SERVER_PORT ?? "8787", protocol);

console.log(`Positioning Lab public origin: ${publicOrigin}`);
console.log(`Positioning Lab API origin: ${publicOrigin} -> ${serverOrigin}`);

const child = spawn("vite", ["--host", "0.0.0.0", "--port", port, "--strictPort"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(certFile === undefined ? {} : { HTTPS_CERT_FILE: certFile }),
    ...(keyFile === undefined ? {} : { HTTPS_KEY_FILE: keyFile }),
    VITE_POSITIONING_LAB_PUBLIC_ORIGIN: publicOrigin,
    VITE_SERVER_URL: publicOrigin,
    VITE_POSITIONING_LAB_API_TARGET: serverOrigin,
  },
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 0;
});

function inferLanOrigin(devPort: string, originProtocol: "http" | "https"): string {
  const fallback = `${originProtocol}://localhost:${devPort}`;
  const candidates = Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((networkInterface) => networkInterface.family === "IPv4" && isUsableLanAddress(networkInterface.address))
    .sort((left, right) => scoreLanAddress(right.address) - scoreLanAddress(left.address));

  return candidates[0] === undefined ? fallback : `${originProtocol}://${candidates[0].address}:${devPort}`;
}

function isUsableLanAddress(address: string): boolean {
  return (
    !address.startsWith("127.") &&
    !address.startsWith("0.") &&
    !address.startsWith("169.254.") &&
    (
      address.startsWith("192.168.") ||
      address.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
    )
  );
}

function scoreLanAddress(address: string): number {
  if (address.startsWith("192.168.")) return 3;
  if (address.startsWith("10.")) return 2;
  return 1;
}
