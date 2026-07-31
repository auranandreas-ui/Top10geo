'use strict';
const { getUserFromRequest, getAdminClient } = require('../lib/supabaseAdmin');

// GET /api/me — requires a signed-in user (Authorization: Bearer <token>).
// Returns their profile row (score, streak, premium status, etc.) and
// auto-expires an ended free trial before returning it.
module.exports = async function handler(req, res){
  if(req.method !== 'GET'){
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = await getUserFromRequest(req);
  if(!user) return res.status(401).json({ error: 'Not signed in' });

  const supabase = getAdminClient();
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if(error || !profile) return res.status(404).json({ error: 'Profile not found' });

  if(profile.premium_source === 'trial' && profile.trial_ends_at && new Date(profile.trial_ends_at) < new Date()){
    const { data: updated, error: updateErr } = await supabase.from('profiles')
      .update({ premium: false, premium_source: null })
      .eq('id', user.id)
      .select()
      .single();
    if(!updateErr) return res.status(200).json({ profile: updated });
  }

  res.status(200).json({ profile });
};
