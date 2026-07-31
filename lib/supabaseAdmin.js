'use strict';
const { createClient } = require('@supabase/supabase-js');

// Service-role client — full DB access, bypasses Row Level Security.
// ONLY ever import this in /api files (server-side). Never send the
// service role key to the browser.
function getAdminClient(){
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Verifies the Supabase access token sent by the browser (Authorization:
// Bearer <token>, set by the frontend after magic-link sign-in) and
// returns the authenticated user, or null if the token is missing/invalid.
async function getUserFromRequest(req){
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if(!token) return null;
  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if(error || !data || !data.user) return null;
  return data.user;
}

module.exports = { getAdminClient, getUserFromRequest };
