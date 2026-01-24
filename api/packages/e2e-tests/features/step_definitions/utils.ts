import * as crypto from 'crypto';

export function generateToken(name: string, date: string, privateKeyPem: string): string {
  const payload = JSON.stringify({ name, date });
  const payloadB64 = Buffer.from(payload).toString('base64url');
  
  const sign = crypto.createSign('SHA256');
  sign.update(payload);
  const signatureB64 = sign.sign(privateKeyPem, 'base64url');
  
  return `${payloadB64}.${signatureB64}`;
}
