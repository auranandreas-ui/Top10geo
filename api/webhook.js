'use strict';
const { getStripe } = require('../lib/stripe');
const { getAdminClient } = require('../lib/supabaseAdmin');

// POST /api/webhook — called by Stripe, not by the browser.
// This is what actually flips a user's premium status in the database
// once a real payment succeeds (or fails / gets cancelled). Stripe
// signs every request, and we verify that signature below — that's
// what makes this trustworthy instead of just another endpoint anyone
// could hit to grant themselves Premium.
//
// IMPORTANT: this route needs the raw request body to verify the
// signature, so body parsing is disabled below. After deploying, copy
// this function's URL (https://yourdomain.com/api/webhook) into your
// Stripe Dashboard -> Developers -> Webhooks, and copy the signing
// secret it gives you into STRIPE_WEBHOOK_SECRET.
module.exports.config = { api: { bodyParser: false } };

function readRawBody(req){
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const stripe = getStripe();
  const sig = req.headers['stripe-signature'];
  let event;

  try{
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  }catch(err){
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const supabase = getAdminClient();

  try{
    switch(event.type){
      // A checkout finished — either a subscription started or a
      // one-time Lifetime purchase went through.
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        if(!userId) break;
        const isLifetime = session.mode === 'payment';
        await supabase.from('profiles').update({
          premium: true,
          lifetime: isLifetime,
          premium_source: isLifetime ? 'lifetime' : ((session.metadata && session.metadata.plan) || 'monthly'),
          trial_used: true, // starting a real paid plan also burns the trial eligibility
          stripe_customer_id: session.customer || null,
          stripe_subscription_id: session.subscription || null
        }).eq('id', userId);
        break;
      }

      // Recurring subscription renewed, paused, past-due, etc.
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const active = sub.status === 'active' || sub.status === 'trialing';
        await supabase.from('profiles')
          .update({ premium: active })
          .eq('stripe_subscription_id', sub.id);
        break;
      }

      // Subscription cancelled / ended.
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await supabase.from('profiles')
          .update({ premium: false, premium_source: null, stripe_subscription_id: null })
          .eq('stripe_subscription_id', sub.id);
        break;
      }

      default:
        break; // ignore everything else
    }
  }catch(err){
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }

  res.status(200).json({ received: true });
};
