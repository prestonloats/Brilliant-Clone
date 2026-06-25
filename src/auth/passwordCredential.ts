// Pure, synchronous, dependency-free password credential core.
//
// This module deliberately avoids `node:crypto`, the DOM, React, and Firebase so the exact
// same code runs in the browser bundle and under Node's `node --test` (esbuild -> CommonJS).
// SHA-256 is implemented from scratch and operates on the UTF-8 bytes of the input string.

/** Legacy default used to migrate accounts that predate per-user passwords. */
export const DEFAULT_LEGACY_PASSWORD = '123456'

/** A stored password as a salt plus the salted, key-stretched hash. Plaintext is never kept. */
export type PasswordCredential = { hash: string; salt: string }

// Number of times SHA-256 is applied for mild key stretching. >= 1000 per the contract.
const HASH_ITERATIONS = 1000

// Salt size in bytes. 16 bytes => 32 lowercase hex chars (>= the 16-hex-char minimum).
const SALT_BYTES = 16

// SHA-256 round constants (first 32 bits of the fractional parts of the cube roots of the
// first 64 primes).
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

const rotr = (value: number, shift: number): number => (value >>> shift) | (value << (32 - shift))

const toHex8 = (value: number): string => (value >>> 0).toString(16).padStart(8, '0')

// Encode a JS string as its UTF-8 byte sequence, handling surrogate pairs explicitly so the
// result is independent of any platform TextEncoder.
const utf8Bytes = (input: string): number[] => {
  const bytes: number[] = []
  for (let i = 0; i < input.length; i += 1) {
    let codePoint = input.charCodeAt(i)
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < input.length) {
      const low = input.charCodeAt(i + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00)
        i += 1
      }
    }

    if (codePoint < 0x80) {
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f))
    } else if (codePoint < 0x10000) {
      bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f))
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      )
    }
  }
  return bytes
}

const sha256Bytes = (bytes: number[]): string => {
  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  // Padding: append 0x80, then zeros until length === 56 (mod 64), then the 64-bit big-endian
  // bit length. Bit length is split into high/low 32-bit words to stay within JS integer limits.
  const message = bytes.slice()
  const bitLength = message.length * 8
  message.push(0x80)
  while (message.length % 64 !== 56) message.push(0)
  const high = Math.floor(bitLength / 0x100000000)
  const low = bitLength >>> 0
  message.push((high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff)
  message.push((low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff)

  const w = new Array<number>(64)

  for (let offset = 0; offset < message.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4
      w[i] = (message[j] << 24) | (message[j + 1] << 16) | (message[j + 2] << 8) | message[j + 3]
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + s1 + ch + K[i] + w[i]) | 0
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (s0 + maj) | 0

      h = g
      g = f
      f = e
      e = (d + temp1) | 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) | 0
    }

    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
    h5 = (h5 + f) | 0
    h6 = (h6 + g) | 0
    h7 = (h7 + h) | 0
  }

  return (
    toHex8(h0) + toHex8(h1) + toHex8(h2) + toHex8(h3) +
    toHex8(h4) + toHex8(h5) + toHex8(h6) + toHex8(h7)
  )
}

/** Pure synchronous SHA-256 of a string's UTF-8 bytes, as lowercase hex. */
export function sha256Hex(input: string): string {
  return sha256Bytes(utf8Bytes(input))
}

// Random salt as hex. Prefer crypto.getRandomValues, mirroring the createId fallback style in
// src/backend/LocalBackend.ts for non-secure contexts that lack the Web Crypto API.
const generateSalt = (): string => {
  const buffer = new Uint8Array(SALT_BYTES)
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(buffer)
  } else {
    for (let i = 0; i < buffer.length; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256)
    }
  }

  let hex = ''
  for (let i = 0; i < buffer.length; i += 1) {
    hex += buffer[i].toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * Hash a password with a salt and mild key stretching. The result is deterministic for a given
 * (password, salt); when `salt` is omitted a fresh random salt of >= 16 hex chars is generated.
 */
export function hashPassword(password: string, salt?: string): PasswordCredential {
  const resolvedSalt = salt ?? generateSalt()
  let hash = sha256Hex(resolvedSalt + password)
  for (let i = 1; i < HASH_ITERATIONS; i += 1) {
    hash = sha256Hex(resolvedSalt + hash)
  }
  return { hash, salt: resolvedSalt }
}

// Length-safe constant-time string comparison: accumulates differences across the longer of the
// two lengths so timing does not reveal where (or whether) the strings first diverge.
const constantTimeEqual = (a: string, b: string): boolean => {
  const length = Math.max(a.length, b.length)
  let diff = a.length === b.length ? 0 : 1
  for (let i = 0; i < length; i += 1) {
    const charA = i < a.length ? a.charCodeAt(i) : 0
    const charB = i < b.length ? b.charCodeAt(i) : 0
    diff |= charA ^ charB
  }
  return diff === 0
}

/**
 * Verify a password against a stored credential. Recomputes the hash with the credential's salt
 * and compares in constant time. Never throws; returns false for any malformed input.
 */
export function verifyPassword(password: string, credential: PasswordCredential): boolean {
  try {
    if (!credential || typeof credential.hash !== 'string' || typeof credential.salt !== 'string') {
      return false
    }
    const recomputed = hashPassword(password, credential.salt).hash
    return constantTimeEqual(recomputed, credential.hash)
  } catch {
    return false
  }
}
