// npm run vapid-keys: a new key pair for push reminders. Run it yourself, once.
//   - The public key goes in .env.local and the GitHub secrets as VITE_VAPID_PUBLIC_KEY.
//   - The JSON goes in Supabase (Edge Functions > Secrets) as VAPID_KEYS. It holds the
//     private key: never commit it, or paste it anywhere else.
//   - The job secret goes in Supabase twice: as the function's CRON_SECRET, and in Vault
//     as reminders_cron_secret (docs/REMINDERS_SETUP.md).
// The JSON is in the form @negrel/webpush's importVapidKeys reads (both keys as JWK).

const { subtle } = globalThis.crypto

const keys = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as import('node:crypto').webcrypto.CryptoKeyPair
const exported = { publicKey: await subtle.exportKey('jwk', keys.publicKey), privateKey: await subtle.exportKey('jwk', keys.privateKey) }
const raw = new Uint8Array(await subtle.exportKey('raw', keys.publicKey))
const publicKey = Buffer.from(raw).toString('base64url')

console.log('\nVITE_VAPID_PUBLIC_KEY (public; .env.local and GitHub secrets):\n')
console.log(publicKey)
console.log('\nVAPID_KEYS (secret; Supabase > Edge Functions > Secrets only):\n')
console.log(JSON.stringify(exported))
console.log('\nCRON_SECRET (secret; the function secret and the Vault secret reminders_cron_secret):\n')
console.log(Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))).toString('base64url'))
console.log('')
