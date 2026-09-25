import { createHash } from "crypto";

/**
 * Menghasilkan bucket 0-99 yang deterministik untuk kombinasi flagKey+userId
 * - selalu menghasilkan angka yang SAMA untuk input yang sama (itulah yang
 * membuat rollout & assignment konsisten per pengguna).
 */
export function hashBucket(flagKey: string, userId: string): number {
  const hash = createHash("sha256").update(`${flagKey}:${userId}`).digest();
  const uint32 = hash.readUInt32BE(0);
  return uint32 % 100;
}
