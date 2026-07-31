'use strict';
const { getUserFromRequest, getAdminClient } = require('../lib/supabaseAdmin');
const { getQuestionById } = require('../lib/questions');

const PREMIUM_SCORE_MULTIPLIER = 1.25;
const POINTS_BY_DIFFICULTY = { easy: 7, medium: 10, hard: 15, expert: 22 };
const STREAK_MILESTONES = { 3: 15, 7: 40, 14: 80, 30: 200, 50: 400, 100: 1000 };
const FREE_DAILY_PRACTICE_LIMIT = 3;

function practiceBonusForLevel(level){
  return Math.min(5, Math.floor((level - 1) / 2));
}
function levelForScore(score){
  return Math.floor(Math.sqrt(Math.max(0, score) / 40)) + 1;
}
function todayStr(){
  return new Date().toISOString().slice(0, 10);
}

// POST /api/finish-round — requires a signed-in user.
// Body: { questionId, foundCount, completedAll, isDaily, useShield }
//
// This is the authoritative scoring endpoint. The client can (and
// should, for snappy UI) keep computing an optimistic score locally
// while a round is in progress, but this is what actually gets saved —
// it recomputes score/streak/practice-limit/content-gating from
// scratch server-side so nobody can just edit browser JS to grant
// themselves points, a finished streak, or access to a locked category.
module.exports = async function handler(req, res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const user = await getUserFromRequest(req);
  if(!user) return res.status(401).json({ error: 'Not signed in' });

  const { questionId, foundCount, completedAll, isDaily, useShield } = req.body || {};
  const question = getQuestionById(questionId);
  if(!question) return res.status(404).json({ error: 'Unknown question' });

  const safeFoundCount = Math.max(0, Math.min(Number(foundCount) || 0, question.answers.length));

  const supabase = getAdminClient();
  const { data: profile, error: profileErr } = await supabase.from('profiles')
    .select('*').eq('id', user.id).single();
  if(profileErr || !profile) return res.status(404).json({ error: 'Profile not found' });

  // ---- server-side content gating (mirrors the client's paywall, but authoritative) ----
  const isGated = (question.topic || 'geography') === 'general' || question.difficulty !== 'easy';
  if(!isDaily && isGated && !profile.premium){
    return res.status(403).json({ error: 'This category requires Premium' });
  }

  // ---- daily free-practice cap ----
  let practiceDate = profile.practice_date;
  let practiceCount = profile.practice_count;
  if(practiceDate !== todayStr()){
    practiceDate = todayStr();
    practiceCount = 0;
  }
  const level = levelForScore(profile.score);
  const limit = FREE_DAILY_PRACTICE_LIMIT + practiceBonusForLevel(level);
  if(!isDaily && !profile.premium){
    if(practiceCount >= limit){
      return res.status(403).json({ error: 'Daily free practice limit reached' });
    }
    practiceCount += 1;
  }

  // ---- scoring ----
  const multiplier = profile.premium ? PREMIUM_SCORE_MULTIPLIER : 1;
  const basePerCorrect = POINTS_BY_DIFFICULTY[question.difficulty] || 7;

  let score = profile.score + Math.round(basePerCorrect * multiplier * safeFoundCount);
  let streak = profile.streak;
  let bestStreak = profile.best_streak;
  let shieldDate = profile.shield_date;
  let milestoneBonus = 0;
  let shieldUsed = false;

  if(completedAll){
    streak += 1;
    bestStreak = Math.max(bestStreak, streak);
    score += Math.round(25 * multiplier);
    if(STREAK_MILESTONES[streak]){
      milestoneBonus = Math.round(STREAK_MILESTONES[streak] * multiplier);
      score += milestoneBonus;
    }
  } else if(safeFoundCount < question.answers.length){
    const shieldAvailable = profile.premium && shieldDate !== todayStr();
    if(useShield && streak > 0 && shieldAvailable){
      shieldDate = todayStr();
      shieldUsed = true;
    } else {
      streak = 0;
    }
  }

  const updates = {
    score,
    streak,
    best_streak: bestStreak,
    shield_date: shieldDate,
    practice_date: practiceDate,
    practice_count: practiceCount,
    last_seen_level: Math.max(profile.last_seen_level, levelForScore(score))
  };
  if(isDaily){
    updates.daily_date = todayStr();
    updates.daily_question_id = question.id;
    updates.daily_completed = true;
  }

  const { data: updatedProfile, error: updateErr } = await supabase.from('profiles')
    .update(updates).eq('id', user.id).select().single();
  if(updateErr) return res.status(500).json({ error: 'Could not save round' });

  await supabase.from('round_history').insert({
    user_id: user.id,
    question_id: question.id,
    title: question.title,
    icon: question.icon,
    difficulty: question.difficulty,
    found_count: safeFoundCount,
    total: question.answers.length,
    completed_all: !!completedAll
  });

  res.status(200).json({ profile: updatedProfile, milestoneBonus, shieldUsed });
};
