import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_ALGORITHM = "scrypt";
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

function normalizeFlag(flag: string) {
  const trimmedFlag = flag.trim();
  if (!trimmedFlag) {
    throw new Error("CTF flag is required.");
  }

  return trimmedFlag;
}

export function hashCtfFlag(flag: string) {
  const normalizedFlag = normalizeFlag(flag);
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(normalizedFlag, salt, KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });

  return [
    HASH_ALGORITHM,
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    salt.toString("base64url"),
    Buffer.from(hash).toString("base64url"),
  ].join("$");
}

export function verifyCtfFlag(flag: string, payload: string) {
  const normalizedFlag = normalizeFlag(flag);
  const [
    algorithm,
    costPart,
    blockSizePart,
    parallelizationPart,
    saltPart,
    hashPart,
  ] = payload.split("$");

  if (
    algorithm !== HASH_ALGORITHM ||
    !costPart ||
    !blockSizePart ||
    !parallelizationPart ||
    !saltPart ||
    !hashPart
  ) {
    throw new Error("Invalid CTF flag hash payload.");
  }

  const cost = Number(costPart);
  const blockSize = Number(blockSizePart);
  const parallelization = Number(parallelizationPart);

  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelization) ||
    cost <= 1 ||
    blockSize <= 0 ||
    parallelization <= 0
  ) {
    throw new Error("Invalid CTF flag hash parameters.");
  }

  const salt = Buffer.from(saltPart, "base64url");
  const expectedHash = Buffer.from(hashPart, "base64url");
  const actualHash = scryptSync(normalizedFlag, salt, expectedHash.length, {
    N: cost,
    r: blockSize,
    p: parallelization,
  });

  return timingSafeEqual(expectedHash, actualHash);
}