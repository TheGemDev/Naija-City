// Bachs hosted checkout (https://docs.bachs.io), shared by the top-up shop and player ads.
// Secrets/vars are declared in worker/shop.ts: BACHS_API_KEY, BACHS_WEBHOOK_SECRET, BACHS_BASE_URL (sandbox by default).

export const bachsReady = (env: Env) => !!(env.BACHS_API_KEY && env.BACHS_WEBHOOK_SECRET);

/** Create a hosted checkout for `price` real naira. `reference` comes back on the webhook and must match a row of ours. */
export async function createBachsSession(
  env: Env,
  o: { reference: string; price: number; email?: string; metadata: Record<string, string>; successUrl: string; cancelUrl: string },
): Promise<{ id?: string; url: string } | null> {
  const res = await fetch(`${env.BACHS_BASE_URL ?? 'https://sandbox-api.bachs.io'}/v1/checkout-sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.BACHS_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      pricing: { currency: 'NGN', amount: `${o.price}.00` },
      ...(o.email ? { customer: { email: o.email } } : {}),
      reference: o.reference,
      metadata: o.metadata,
      success_url: o.successUrl,
      cancel_url: o.cancelUrl,
      expires_in_minutes: 60,
    }),
  });
  const raw = await res.text();
  let out: { checkout_id?: string; checkout_url?: string } | null = null;
  try { out = JSON.parse(raw); } catch { /* not JSON */ }
  if (!res.ok || !out?.checkout_url) console.error('Bachs checkout failed', res.status, env.BACHS_BASE_URL ?? 'sandbox default', raw.slice(0, 500));
  return res.ok && out?.checkout_url ? { id: out.checkout_id, url: out.checkout_url } : null;
}
