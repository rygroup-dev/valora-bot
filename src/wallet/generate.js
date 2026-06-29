import nacl from 'tweetnacl';
import bs58 from 'bs58';

export function generateWallet({ label = 'main', telegramTag } = {}) {
  const kp = nacl.sign.keyPair();
  return {
    label,
    key: bs58.encode(kp.secretKey),
    pubkey: bs58.encode(kp.publicKey),
    ...(telegramTag ? { telegramTag } : {}),
  };
}
