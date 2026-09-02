/**
 * Generates the VAPID keypair that identifies this server to push services.
 *
 * Run once: `node scripts/generate-vapid-keys.mjs`, then paste the output into
 * .env. Regenerating invalidates every existing subscription — every device
 * would silently stop receiving notifications until it re-subscribed — so this
 * is a one-time setup step, not something to re-run when debugging.
 */
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Add these to .env (and to the server's .env if deploying):

VAPID_PUBLIC_KEY="${publicKey}"
VAPID_PRIVATE_KEY="${privateKey}"
VAPID_SUBJECT="mailto:you@yourdomain.com"

Keep the private key secret; it is what proves notifications came from you.
`);
