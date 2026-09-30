import 'server-only';
import { KMSClient, GetPublicKeyCommand, SignCommand } from '@aws-sdk/client-kms';
import {
  getAddress,
  keccak256,
  hashMessage,
  hashTypedData,
  serializeTransaction,
  serializeSignature,
  recoverAddress,
  type Hex,
  type LocalAccount,
} from 'viem';
import { toAccount } from 'viem/accounts';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Resolves the verifier's signing account, in whichever mode this deployment
 * uses.
 *
 * `env` reads a raw private key — fine for a testnet demo, never for
 * production, since the key sits in the server's process environment.
 * `kms` never lets the private key leave AWS: signing happens inside KMS,
 * and this module only ever sees a public key and DER signatures.
 *
 * `SIGNER_EXPECTED_ADDRESS` is checked in both modes at startup. A voucher
 * signed by the wrong key does not fail loudly — it just reverts on-chain,
 * or worse, gets rejected after the user was told "settled". Fail here
 * instead, once, before any goal is ever evaluated.
 */

const SIGNER_MODE = process.env.SIGNER_MODE ?? 'env';

export const verifierConfigured = Boolean(
  SIGNER_MODE === 'kms'
    ? process.env.SIGNER_KMS_KEY_ID && process.env.SIGNER_KMS_REGION
    : process.env.SIGNER_PRIVATE_KEY,
);

let cached: Promise<LocalAccount> | null = null;

/** The verifier's account, or null when this deployment has none configured. */
export function verifierAccount(): Promise<LocalAccount> | null {
  if (!verifierConfigured) return null;
  if (!cached) {
    cached = (SIGNER_MODE === 'kms' ? kmsAccount() : envAccount()).then((account) => {
      const expected = process.env.SIGNER_EXPECTED_ADDRESS;
      if (expected && getAddress(expected) !== getAddress(account.address)) {
        throw new Error(
          `SIGNER_EXPECTED_ADDRESS (${expected}) does not match the resolved signer address ` +
            `(${account.address}). Refusing to start with a signer that isn't the one configured.`,
        );
      }
      return account;
    });
  }
  return cached;
}

async function envAccount(): Promise<LocalAccount> {
  const key = process.env.SIGNER_PRIVATE_KEY!;
  return privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as Hex);
}

// ---- KMS mode ---------------------------------------------------------

const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HALF_N = SECP256K1_N / 2n;

function kmsClient(): KMSClient {
  return new KMSClient({ region: process.env.SIGNER_KMS_REGION });
}

/** Pulls the raw 65-byte uncompressed EC point out of KMS's DER-wrapped SPKI. */
function extractRawPublicKey(der: Uint8Array): Uint8Array {
  // The SubjectPublicKeyInfo's BIT STRING content is the raw point, and it is
  // always the last field: 0x04 (uncompressed marker) followed by X and Y,
  // 32 bytes each. No ASN.1 library needed to find the tail of the buffer.
  const point = der.slice(der.length - 65);
  if (point.length !== 65 || point[0] !== 0x04) {
    throw new Error('Unexpected public key format from KMS — not a secp256k1 point.');
  }
  return point;
}

function addressFromRawPublicKey(point: Uint8Array): Hex {
  const hash = keccak256(point.slice(1));
  return getAddress(`0x${hash.slice(-40)}`);
}

/** Minimal DER INTEGER/SEQUENCE reader — just enough for ECDSA-Sig-Value. */
function parseDerSignature(der: Uint8Array): { r: bigint; s: bigint } {
  let offset = 0;
  const readLength = () => {
    let len = der[offset++];
    if (len & 0x80) {
      const n = len & 0x7f;
      len = 0;
      for (let i = 0; i < n; i++) len = (len << 8) | der[offset++];
    }
    return len;
  };
  const readInteger = () => {
    if (der[offset++] !== 0x02) throw new Error('Malformed ECDSA signature from KMS.');
    const len = readLength();
    const bytes = der.slice(offset, offset + len);
    offset += len;
    return BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  };

  if (der[offset++] !== 0x30) throw new Error('Malformed ECDSA signature from KMS.');
  readLength();
  const r = readInteger();
  const s = readInteger();
  return { r, s };
}

async function kmsAccount(): Promise<LocalAccount> {
  const keyId = process.env.SIGNER_KMS_KEY_ID!;
  const client = kmsClient();

  const { PublicKey } = await client.send(new GetPublicKeyCommand({ KeyId: keyId }));
  if (!PublicKey) throw new Error('KMS returned no public key for SIGNER_KMS_KEY_ID.');
  const rawPoint = extractRawPublicKey(PublicKey);
  const address = addressFromRawPublicKey(rawPoint);

  async function signDigest(digest: Hex): Promise<{ r: Hex; s: Hex; yParity: 0 | 1 }> {
    const { Signature } = await client.send(
      new SignCommand({
        KeyId: keyId,
        Message: Buffer.from(digest.slice(2), 'hex'),
        MessageType: 'DIGEST',
        SigningAlgorithm: 'ECDSA_SHA_256',
      }),
    );
    if (!Signature) throw new Error('KMS returned no signature.');

    let { r, s } = parseDerSignature(Signature as Uint8Array);
    // Ethereum requires the canonical (low-S) form; KMS does not guarantee it.
    if (s > HALF_N) s = SECP256K1_N - s;

    const rHex = `0x${r.toString(16).padStart(64, '0')}` as Hex;
    const sHex = `0x${s.toString(16).padStart(64, '0')}` as Hex;

    for (const yParity of [0, 1] as const) {
      const recovered = await recoverAddress({
        hash: digest,
        signature: { r: rHex, s: sHex, yParity },
      });
      if (getAddress(recovered) === address) return { r: rHex, s: sHex, yParity };
    }
    throw new Error('Could not recover a signature matching the KMS key — signing failed.');
  }

  return toAccount({
    address,
    async signMessage({ message }) {
      const signature = await signDigest(hashMessage(message));
      return serializeSignature(signature);
    },
    async signTransaction(transaction, { serializer } = {}) {
      const signableHash = keccak256(serializeTransaction(transaction));
      const signature = await signDigest(signableHash);
      return (serializer ?? serializeTransaction)(transaction, signature);
    },
    async signTypedData(typedData) {
      const signature = await signDigest(hashTypedData(typedData));
      return serializeSignature(signature);
    },
  });
}
