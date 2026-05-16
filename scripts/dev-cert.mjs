#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { networkInterfaces, hostname } from "node:os";
import { join, resolve } from "node:path";

const outDir = resolve(".certs");
const certFile = join(outDir, "herd-dev.pem");
const keyFile = join(outDir, "herd-dev-key.pem");
const rootCaCopy = join(outDir, "herd-dev-rootCA.pem");

if (!hasCommand("mkcert")) {
  console.error("mkcert is required for a phone-trustable local HTTPS certificate.");
  console.error("");
  console.error("Install it, then rerun:");
  console.error("  brew install mkcert");
  console.error("  pnpm dev:cert");
  console.error("");
  console.error("A plain openssl self-signed leaf cert is not enough for iPhone Safari unless you also install and fully trust its CA.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const names = unique([
  "localhost",
  "127.0.0.1",
  "::1",
  ...localHostNames(),
  ...lanIPv4Addresses(),
  ...process.argv.slice(2),
]).filter((name) => name.length > 0);

run("mkcert", ["-install"]);
run("mkcert", ["-cert-file", certFile, "-key-file", keyFile, ...names]);

const caRoot = execFileSync("mkcert", ["-CAROOT"], { encoding: "utf8" }).trim();
const rootCa = join(caRoot, "rootCA.pem");
if (existsSync(rootCa)) {
  copyFileSync(rootCa, rootCaCopy);
}

console.log("");
console.log("Herd dev certificate ready.");
console.log(`  Cert: ${certFile}`);
console.log(`  Key:  ${keyFile}`);
console.log(`  Hosts: ${names.join(", ")}`);
if (existsSync(rootCaCopy)) {
  console.log(`  iPhone CA install file: ${rootCaCopy}`);
}
console.log("");
console.log("Run the HTTPS server:");
console.log(`  HTTPS_CERT_FILE=${relative(certFile)} HTTPS_KEY_FILE=${relative(keyFile)} pnpm --filter @herd/server start`);
console.log("");
console.log("Or run hot dev with HTTPS for the positioning lab and API server:");
console.log(`  HTTPS_CERT_FILE=${relative(certFile)} HTTPS_KEY_FILE=${relative(keyFile)} pnpm dev`);
console.log("");
console.log("On iPhone, install the copied root CA profile, then enable full trust in Settings > General > About > Certificate Trust Settings.");

function hasCommand(command) {
  return spawnSync("which", [command], { stdio: "ignore" }).status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function lanIPv4Addresses() {
  return Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((networkInterface) =>
      networkInterface.family === "IPv4" &&
      isUsableLanAddress(networkInterface.address),
    )
    .map((networkInterface) => networkInterface.address);
}

function isUsableLanAddress(address) {
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

function localHostNames() {
  const current = hostname().trim();
  if (current.length === 0) return [];
  const base = current.replace(/\.local$/i, "");
  return [base, `${base}.local`];
}

function unique(values) {
  return [...new Set(values)];
}

function relative(path) {
  return path.replace(`${process.cwd()}/`, "");
}
