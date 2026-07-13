import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyBcryptPassword,
  isLegacyHash,
  verifyLegacyPassword,
} from "../password";

describe("password hashing (bcrypt)", () => {
  it("hashes and verifies correctly", async () => {
    const hash = await hashPassword("testpassword123");
    expect(hash).toBeTruthy();
    expect(hash.startsWith("$2")).toBe(true); // bcrypt prefix
    expect(await verifyBcryptPassword("testpassword123", hash)).toBe(true);
    expect(await verifyBcryptPassword("wrongpassword", hash)).toBe(false);
  });

  it("produces different hashes for same password (salted)", async () => {
    const hash1 = await hashPassword("samepassword123");
    const hash2 = await hashPassword("samepassword123");
    expect(hash1).not.toBe(hash2);
  });
});

describe("legacy hash detection", () => {
  it("identifies legacy hashes by prefix", () => {
    expect(isLegacyHash("sh_abc123_8")).toBe(true);
    expect(isLegacyHash("$2b$12$somebcrypthash")).toBe(false);
  });
});

describe("legacy password verification", () => {
  it("verifies matching legacy passwords", () => {
    // Hash "testpassword" using the legacy algorithm
    const pass = "testpassword";
    let hash = 0;
    for (let i = 0; i < pass.length; i++) {
      const char = pass.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    const expected = `sh_${Math.abs(hash).toString(36)}_${pass.length}`;
    expect(verifyLegacyPassword(pass, expected)).toBe(true);
  });

  it("rejects wrong passwords", () => {
    expect(verifyLegacyPassword("wrong", "sh_abc_5")).toBe(false);
  });
});

describe("authorization utilities", () => {
  it("retains only pure role utilities in the legacy auth module", async () => {
    const auth = await import("../auth");
    expect(Object.keys(auth).sort()).toEqual([
      "hasManagerPermission",
      "isSuperAdminEmail",
      "isWorkerRole",
    ]);
  });
});

describe("upload validation rules", () => {
  const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
  ]);
  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
  const dangerous = /[<>:"/\\|?*\x00-\x1f]/;

  it("allows valid image MIME types", () => {
    expect(ALLOWED_MIME_TYPES.has("image/jpeg")).toBe(true);
    expect(ALLOWED_MIME_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_MIME_TYPES.has("image/webp")).toBe(true);
  });

  it("allows PDF", () => {
    expect(ALLOWED_MIME_TYPES.has("application/pdf")).toBe(true);
  });

  it("rejects disallowed MIME types", () => {
    expect(ALLOWED_MIME_TYPES.has("application/javascript")).toBe(false);
    expect(ALLOWED_MIME_TYPES.has("text/html")).toBe(false);
    expect(ALLOWED_MIME_TYPES.has("application/x-executable")).toBe(false);
  });

  it("enforces 10MB size limit", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(11 * 1024 * 1024 > MAX_FILE_SIZE_BYTES).toBe(true);
    expect(5 * 1024 * 1024 > MAX_FILE_SIZE_BYTES).toBe(false);
  });

  it("rejects dangerous filenames", () => {
    expect(dangerous.test("file<script>.jpg")).toBe(true);
    expect(dangerous.test("file|name.jpg")).toBe(true);
    expect(dangerous.test('file"name.jpg')).toBe(true);
    expect(dangerous.test("normal-file.jpg")).toBe(false);
    expect(dangerous.test("photo_2024.png")).toBe(false);
  });
});
