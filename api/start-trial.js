'use strict';
const { getUserFromRequest, getAdminClient } = require('../lib/supabaseAdmin');

// POST /api/start-trial — requires a signed-in user.
// Server-authoritative: this is what makes the free trial trustworthy —
// a user can't just flip a local flag to get Premium for free, because
// the client no longer decides its own premium status at all.
module.exports = async function handler(req, res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = await getUserFromRequest(req);
  if(!user) return res.status(401).json({ error: 'Not signed in' });

  const supabase = getAdminClient();
  const { data: profile, error } = await supabase.from('profiles')
    .select('trial_used, premium').eq('id', user.id).single();
  if(error || !profile) return res.status(404).json({ error: 'Profile not found' });
  if(profile.trial_used) return res.status(400).json({ error: 'Free trial already used on this account' });
  if(profile.premium) return res.status(400).json({ error: 'Already Premium' });

  const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: updated, error: updateErr } = await supabase.from('profiles').update({
    premium: true,
    premium_source: 'trial',
    trial_used: true,
    trial_ends_at: trialEndsAt
  }).eq('id', user.id).select().single();

  if(updateErr) return res.status(500).json({ error: 'Could not start trial' });
  res.status(200).json({ profile: updated });
};
