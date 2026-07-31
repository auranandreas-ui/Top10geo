'use strict';
const { getStripe } = require('../lib/stripe');
const { getUserFromRequest } = require('../lib/supabaseAdmin');

// POST /api/checkout — requires a signed-in user. Body: { plan: "monthly" | "annual" | "lifetime" }
// Creates a real Stripe Checkout Session and returns its URL for the
// browser to redirect to. Replaces the old "Simulate Subscribe" button.
module.exports = async function handler(req, res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = await getUserFromRequest(req);
  if(!user) return res.status(401).json({ error: 'Not signed in' });

  const { plan } = req.body || {};
  const PRICE_IDS = {
    monthly: process.env.STRIPE_PRICE_MONTHLY,
    annual: process.env.STRIPE_PRICE_ANNUAL,
    lifetime: process.env.STRIPE_PRICE_LIFETIME
  };
  const priceId = PRICE_IDS[plan];
  if(!priceId){
    return res.status(400).json({ error: 'Unknown plan. Expected monthly, annual, or lifetime.' });
  }

  const stripe = getStripe();
  const isLifetime = plan === 'lifetime';
  const siteUrl = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;

  try{
    const session = await stripe.checkout.sessions.create({
      mode: isLifetime ? 'payment' : 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: { plan, user_id: user.id },
      success_url: `${siteUrl}/?checkout=success`,
      cancel_url: `${siteUrl}/?checkout=cancelled`,
      allow_promotion_codes: true
    });
    res.status(200).json({ url: session.url });
  }catch(err){
    console.error('Checkout session error:', err);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
};
