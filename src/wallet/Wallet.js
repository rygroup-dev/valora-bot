import nacl from 'tweetnacl';
import bs58 from 'bs58';

// Parse a secret key provided as either a base58 string or a JSON byte array.
// Accepts 64-byte (secret+public) or 32-byte (seed) inputs.
function parseSecret(key) {
  let bytes;
  if (typeof key !== 'string') throw new Error('wallet key must be a string');
  const trimmed = key.trim();
  if (trimmed.startsWith('[')) {
    bytes = Uint8Array.from(JSON.parse(trimmed));
  } else {
    bytes = bs58.decode(trimmed);
  }
  if (bytes.length === 64) return nacl.sign.keyPair.fromSecretKey(bytes);
  if (bytes.length === 32) return nacl.sign.keyPair.fromSeed(bytes);
  throw new Error(`invalid secret key length: ${bytes.length}`);
}

export class Wallet {
  constructor({ label, key, telegramTag } = {}) {
    this.label = label;
    this.telegramTag = telegramTag;
    this._kp = parseSecret(key);
    this.publicKey = bs58.encode(this._kp.publicKey);
  }

  // Sign a UTF-8 message with ed25519. Returns base58 (default) or base64.
  signMessage(message, encoding = 'base58') {
    const msgBytes = new TextEncoder().encode(message);
    const sig = nacl.sign.detached(msgBytes, this._kp.secretKey);
    return encoding === 'base64'
      ? Buffer.from(sig).toString('base64')
      : bs58.encode(sig);
  }

  // Sign a raw transaction (serialized VersionedTransaction message bytes).
  // Returns the 64-byte detached signature bytes (used by SolanaRpc layer).
  signRaw(bytes) {
    return nacl.sign.detached(Uint8Array.from(bytes), this._kp.secretKey);
  }

  get secretKeyBytes() {
    return this._kp.secretKey;
  }
}
