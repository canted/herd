import type { Composition } from "@herd/composition";
import { buildPackageObjectKey } from "./packageStorage";

export interface CompositionRecord {
  id: string;
  ownerEmail: string;
  compositionId: string;
  name: string;
  composition: Composition;
  createdAt: number;
  updatedAt: number;
}

export interface PackageRecord {
  id: string;
  ownerEmail: string;
  compositionRecordId: string;
  compositionId: string;
  name: string;
  version: number;
  objectKey: string;
  status: "pendingUpload" | "ready";
  contentType?: string;
  sizeBytes?: number;
  sha256?: string;
  uploadConfirmedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SaveCompositionInput {
  ownerEmail: string;
  composition: Composition;
}

export interface CreatePackageInput {
  ownerEmail: string;
  composition: Composition;
  filename?: string;
}

export interface ConfirmPackageUploadInput {
  ownerEmail: string;
  packageId: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export type MaybePromise<T> = T | Promise<T>;

export interface CreatorRepository {
  readonly kind: "memory" | "postgres";
  saveComposition(input: SaveCompositionInput, now?: number): MaybePromise<CompositionRecord>;
  listCompositions(ownerEmail: string): MaybePromise<CompositionRecord[]>;
  createPackage(input: CreatePackageInput, now?: number): MaybePromise<PackageRecord>;
  getPackage(ownerEmail: string, packageId: string): MaybePromise<PackageRecord | null>;
  confirmPackageUpload(input: ConfirmPackageUploadInput, now?: number): MaybePromise<PackageRecord>;
  listPackages(ownerEmail: string): MaybePromise<PackageRecord[]>;
}

export class CreatorStore implements CreatorRepository {
  readonly kind = "memory";

  private readonly compositionsByOwnerAndComposition = new Map<string, CompositionRecord>();
  private readonly packagesByOwner = new Map<string, PackageRecord[]>();
  private compositionCounter = 1;
  private packageCounter = 1;

  saveComposition(input: SaveCompositionInput, now = Date.now()): CompositionRecord {
    const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
    const key = compositionKey(ownerEmail, input.composition.id);
    const existing = this.compositionsByOwnerAndComposition.get(key);
    const record: CompositionRecord = {
      id: existing?.id ?? `composition-record-${this.compositionCounter++}`,
      ownerEmail,
      compositionId: input.composition.id,
      name: input.composition.name,
      composition: input.composition,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.compositionsByOwnerAndComposition.set(key, record);
    return record;
  }

  listCompositions(ownerEmail: string): CompositionRecord[] {
    const normalized = normalizeOwnerEmail(ownerEmail);
    return [...this.compositionsByOwnerAndComposition.values()]
      .filter((record) => record.ownerEmail === normalized)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  createPackage(input: CreatePackageInput, now = Date.now()): PackageRecord {
    const composition = this.saveComposition(input, now);
    const ownerEmail = composition.ownerEmail;
    const version = this.nextPackageVersion(ownerEmail, composition.compositionId);
    const id = `package-${this.packageCounter++}`;
    const record: PackageRecord = {
      id,
      ownerEmail,
      compositionRecordId: composition.id,
      compositionId: composition.compositionId,
      name: composition.name,
      version,
      objectKey: buildPackageObjectKey({
        ownerEmail,
        packageId: id,
        version,
        ...(input.filename === undefined ? {} : { filename: input.filename }),
      }),
      status: "pendingUpload",
      createdAt: now,
      updatedAt: now,
    };

    const packages = this.packagesByOwner.get(ownerEmail) ?? [];
    packages.push(record);
    this.packagesByOwner.set(ownerEmail, packages);
    return record;
  }

  getPackage(ownerEmail: string, packageId: string): PackageRecord | null {
    const normalized = normalizeOwnerEmail(ownerEmail);
    return (this.packagesByOwner.get(normalized) ?? []).find((record) => record.id === packageId) ?? null;
  }

  confirmPackageUpload(input: ConfirmPackageUploadInput, now = Date.now()): PackageRecord {
    const normalized = normalizeOwnerEmail(input.ownerEmail);
    const packages = this.packagesByOwner.get(normalized) ?? [];
    const index = packages.findIndex((record) => record.id === input.packageId);
    const existing = packages[index];

    if (existing === undefined) {
      throw new Error(`Package "${input.packageId}" was not found.`);
    }

    const updated: PackageRecord = {
      ...existing,
      status: "ready",
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      uploadConfirmedAt: now,
      updatedAt: now,
    };

    packages[index] = updated;
    this.packagesByOwner.set(normalized, packages);
    return updated;
  }

  listPackages(ownerEmail: string): PackageRecord[] {
    return [...(this.packagesByOwner.get(normalizeOwnerEmail(ownerEmail)) ?? [])]
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private nextPackageVersion(ownerEmail: string, compositionId: string): number {
    const packages = this.packagesByOwner.get(ownerEmail) ?? [];
    return packages.filter((record) => record.compositionId === compositionId).length + 1;
  }
}

export function normalizeOwnerEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    throw new Error("A valid owner email is required.");
  }
  return normalized;
}

function compositionKey(ownerEmail: string, compositionId: string): string {
  return `${ownerEmail}:${compositionId}`;
}
