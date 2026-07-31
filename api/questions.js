'use strict';
const { getPublicQuestions } = require('../lib/questions');

// GET /api/questions — public, no auth needed.
// Returns every question WITHOUT its answers array, so the client can
// render titles/prompts/facts without ever downloading the answer key.
module.exports = async function handler(req, res){
  if(req.method !== 'GET'){
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  res.status(200).json({ questions: getPublicQuestions() });
};
