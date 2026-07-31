'use strict';
const { getQuestionById, checkGuess } = require('../lib/questions');

// POST /api/guess — public (no auth required, so the free daily question
// works with zero signup friction). Body: { questionId, guess, foundIndexes }
// This is the ONLY place the real answer key is ever consulted — the
// client never receives the full answers array, only a right/wrong
// verdict for the single guess it just made.
module.exports = async function handler(req, res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { questionId, guess, foundIndexes } = req.body || {};
  const question = getQuestionById(questionId);
  if(!question) return res.status(404).json({ error: 'Unknown question' });
  if(typeof guess !== 'string' || !guess.trim()){
    return res.status(400).json({ error: 'Missing guess' });
  }

  const safeFoundIndexes = Array.isArray(foundIndexes)
    ? foundIndexes.filter(i => Number.isInteger(i))
    : [];

  const result = checkGuess(question, guess, safeFoundIndexes);
  res.status(200).json({
    matchedIndex: result.matchedIndex,
    canonicalAnswer: result.canonicalAnswer || null,
    correct: result.matchedIndex !== -1
  });
};
