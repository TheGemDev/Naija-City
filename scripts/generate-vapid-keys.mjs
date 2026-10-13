import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const base64url = (value) => Buffer.from(value).toString('base64url');

const uncompressedPublicKey = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(pub.x, 'base64url'),
  Buffer.from(pub.y, 'base64url'),
]);
console.log(`VAPID_PUBLIC_KEY=${base64url(uncompressedPublicKey)}`);
console.log(`VAPID_PRIVATE_KEY=${base64url(Buffer.from(priv.d, 'base64url'))}`);
