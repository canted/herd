const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:8787";

const checks = [
  { method: "GET", path: "/healthz" },
  { method: "GET", path: "/readyz" },
  { method: "GET", path: "/version" },
  {
    method: "POST",
    path: "/api/sessions",
    body: { name: "Smoke test" },
  },
];

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, {
    method: check.method,
    headers: check.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: check.body === undefined ? undefined : JSON.stringify(check.body),
  });

  if (!response.ok) {
    throw new Error(`${check.method} ${check.path} failed with ${response.status}: ${await response.text()}`);
  }

  console.log(`${check.method} ${check.path} OK`);
}
