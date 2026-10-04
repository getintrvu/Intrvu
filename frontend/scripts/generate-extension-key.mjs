// Generates a fixed extension key so the extension id never changes between builds.
//
// The id is part of the Google/Supabase OAuth redirect URL (https://<id>.chromiumapp.org/) and of
// the backend CORS origin (chrome-extension://<id>), so it must be stable.
//
//   node scripts/generate-extension-key.mjs
//
// Put EXTENSION_PUBLIC_KEY in frontend/.env, add the id to the backend's CHROME_EXTENSION_IDS, and
// add the redirect URL to Supabase (Authentication -> URL configuration -> Redirect URLs).
// Keep key.pem private and backed up: it is also what you need to publish updates under this id.
import { createHash, generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const der = publicKey.export({ type: 'spki', format: 'der' });

// Chrome derives the id from the first 128 bits of sha256(public key), encoded with a-p.
const id = [...createHash('sha256').update(der).digest().subarray(0, 16)]
  .map((byte) => String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 0xf)))
  .join('');

writeFileSync('key.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });

console.log('Wrote key.pem (keep it secret; it is git-ignored).\n');
console.log(`EXTENSION_PUBLIC_KEY=${der.toString('base64')}\n`);
console.log(`Extension id:        ${id}`);
console.log(`OAuth redirect URL:  https://${id}.chromiumapp.org/`);
console.log(`Backend CORS origin: chrome-extension://${id}   (CHROME_EXTENSION_IDS=${id})`);
