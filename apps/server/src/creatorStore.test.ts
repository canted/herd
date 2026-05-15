import { describe, expect, it } from "vitest";
import type { Composition } from "@herd/composition";
import fixture from "../../../packages/composition/fixtures/rehearsal-basic.json";
import { createCreatorRepository } from "./creatorRepository";
import { CreatorStore, normalizeOwnerEmail } from "./creatorStore";
import { buildPackageObjectKey, loadTigrisStorageConfig } from "./packageStorage";

const composition = fixture as unknown as Composition;

describe("CreatorStore", () => {
  it("saves authored Compositions by owner", () => {
    const store = new CreatorStore();
    const saved = store.saveComposition({
      ownerEmail: "Author@Example.com",
      composition,
    }, 1000);

    expect(saved.ownerEmail).toBe("author@example.com");
    expect(saved.name).toBe("Rehearsal Basic");
    expect(store.listCompositions("author@example.com")).toHaveLength(1);
  });

  it("creates versioned Package records with Tigris object keys", () => {
    const store = new CreatorStore();
    const first = store.createPackage({ ownerEmail: "author@example.com", composition }, 1000);
    const second = store.createPackage({ ownerEmail: "author@example.com", composition }, 2000);

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(first.objectKey).toMatch(/^users\/[a-f0-9]{20}\/packages\/package-1\/versions\/1\/package\.herd\.zip$/);
    expect(store.listPackages("author@example.com")).toEqual([second, first]);
  });

  it("validates owner emails", () => {
    expect(() => normalizeOwnerEmail("not an email")).toThrow("A valid owner email is required.");
  });
});

describe("createCreatorRepository", () => {
  it("uses the in-memory store unless DATABASE_URL is configured", () => {
    expect(createCreatorRepository({}).kind).toBe("memory");
    expect(createCreatorRepository({ DATABASE_URL: "postgres://user:pass@example.com/herd" }).kind).toBe("postgres");
  });
});

describe("packageStorage", () => {
  it("builds stable private object keys without exposing email addresses", () => {
    const key = buildPackageObjectKey({
      ownerEmail: "author@example.com",
      packageId: "package-42",
      version: 3,
      filename: "My Piece.herd.zip",
    });

    expect(key).toBe("users/b0eda69977c26118feff/packages/package-42/versions/3/my-piece.herd.zip");
    expect(key).not.toContain("author@example.com");
  });

  it("loads Tigris config only when all required secrets are present", () => {
    expect(loadTigrisStorageConfig({})).toBeNull();
    expect(loadTigrisStorageConfig({
      TIGRIS_ENDPOINT: "https://fly.storage.tigris.dev",
      TIGRIS_BUCKET: "herd-staging",
      TIGRIS_ACCESS_KEY_ID: "key",
      TIGRIS_SECRET_ACCESS_KEY: "secret",
    })).toEqual({
      endpoint: "https://fly.storage.tigris.dev",
      bucket: "herd-staging",
      accessKeyId: "key",
      secretAccessKey: "secret",
      region: "auto",
    });
  });
});
