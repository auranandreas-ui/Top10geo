'use strict';
const { getStripe } = require('../lib/stripe');
const { getUserFromRequest, getAdminClient } = require('../lib/supabaseAdmin');

// POST /api/portal — requires a signed-in user with a Stripe customer on
// file. Opens the Stripe-hosted Billing Portal so the user can update
// their card, switch plans, or cancel — self-serve, no code needed here.
module.exports = async function handler(req, res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = await getUserFromRequest(req);
  if(!user) return res.status(401).json({ error: 'Not signed in' });

  const supabase = getAdminClient();
  const { data: profile } = await supabase.from('profiles')
    .select('stripe_customer_id').eq('id', user.id).single();

  if(!profile || !profile.stripe_customer_id){
    return res.status(400).json({ error: 'No billing account on file yet — subscribe first' });
  }

  const stripe = getStripe();
  const siteUrl = process.env.PUBLIC_SITE_URL || `https://${req.headers.host}`;

  try{
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${siteUrl}/`
    });
    res.status(200).json({ url: session.url });
  }catch(err){
    console.error('Billing portal error:', err);
    res.status(500).json({ error: 'Could not open billing portal' });
  }
};
