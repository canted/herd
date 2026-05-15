import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";

const port = process.env.PORT ?? "5176";
const configuredOrigin = process.env.VITE_POSITIONING_LAB_PUBLIC_ORIGIN ?? process.env.POSITIONING_LAB_PUBLIC_ORIGIN;
const publicOrigin = configuredOrigin ?? inferLanOrigin(port);

const child = spawn("vite", ["--host", "0.0.0.0", "--port", port, "--strictPort"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_POSITIONING_LAB_PUBLIC_ORIGIN: publicOrigin,
  },
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 0;
});

function inferLanOrigin(devPort: string): string {
  const fallback = `http://localhost:${devPort}`;
  const candidates = Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((networkInterface) =>
      networkInterface.family === "IPv4" &&
      !networkInterface.internal &&
      !networkInterface.address.startsWith("169.254."),
    );

  return candidates[0] === undefined ? fallback : `http://${candidates[0].address}:${devPort}`;
}
