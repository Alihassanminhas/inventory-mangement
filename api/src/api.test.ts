import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

process.env.JWT_SECRET = "test-only-secret-with-more-than-16-characters";
const { app } = await import("./index.js");

describe("HTTP API boundary", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("serves health and standard security headers without a database query", async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns a consistent JSON response for unknown API routes", async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Route not found" });
  });

  it("rejects malformed JSON with a safe client error", async () => {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Request body must contain valid JSON." });
  });
});
