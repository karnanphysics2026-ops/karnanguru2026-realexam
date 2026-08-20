const SUPABASE_URL = 'https://vtswgisxeylubvazcefe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lTpVWMDF42ocz84PXirWww_iVcNyeZ-';
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EXAM = { total: 180, minutes: 180, physics: 45, chemistry: 45, biology: 90, correct: 4, wrong: -1 };
const MOCKS = [
  { id: 'mock-1', name: 'NEET Mock Test 01', subtitle: 'Full syllabus · Exam simulation' },
  { id: 'mock-2', name: 'NEET Mock Test 02', subtitle: 'Full syllabus · Exam simulation' }
];
let user = null;
let profile = null;
let activeTest = null;
let questions = [];
let answers = {};
let marked = {};
let current = 0;
let secondsLeft = EXAM.minutes * 60;
let timer = null;
let testStartedAt = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function show(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  $(id)?.classList.add('active');
}

function isPaid() {
  return ['premium','paid','pro','unlimited'].includes((profile?.plan || '').toLowerCase());
}

async function boot() {
  const { data } = await db.auth.getSession();
  if (data.session?.user) await setUser(data.session.user);
  else show('landing');
  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') { user = null; profile = null; show('landing'); renderHeader(); }
    if (event === 'SIGNED_IN' && session?.user) await setUser(session.user);
  });
}

async function setUser(u) {
  user = u;
  const fallback = { id: u.id, display_name: u.user_metadata?.display_name || u.email?.split('@')[0] || 'Student', plan: 'free' };
  try {
    const { data } = await db.from('user_profiles').select('id,display_name,plan').eq('id', u.id).maybeSingle();
    profile = data || fallback;
  } catch (e) {
    profile = fallback;
  }
  renderHeader();
  show('home');
  renderHome();
}

function renderHeader() {
  const logged = !!user;
  $('header-actions').innerHTML = logged
    ? `<span class="user-pill">${esc(profile?.display_name || user.email)}</span><button class="ghost" onclick="logout()">Sign out</button>`
    : `<button class="ghost" onclick="openLogin()">Sign in</button><button class="primary small" onclick="openRegister()">Create account</button>`;
}

function renderHome() {
  $('student-name').textContent = profile?.display_name || 'Student';
  $('access-badge').textContent = isPaid() ? 'PREMIUM ACCESS' : 'FREE ACCOUNT';
  $('access-badge').className = `badge ${isPaid() ? 'paid' : 'free'}`;
  const lock = !isPaid();
  $('mock-grid').innerHTML = MOCKS.map((m, i) => `
    <article class="test-card ${lock ? 'locked' : ''}">
      <div class="test-icon">${String(i+1).padStart(2,'0')}</div>
      <div><h3>${m.name}</h3><p>${m.subtitle}</p></div>
      <button class="primary full" onclick="startNamedTest('${m.id}')">${lock ? '🔒 Premium only' : 'Start Mock →'}</button>
    </article>`).join('');
  $('real-card').classList.toggle('locked', lock);
  $('real-button').textContent = lock ? '🔒 Premium only' : 'Start Real Exam →';
  $('premium-note').style.display = lock ? 'block' : 'none';
}

function openLogin(){ $('auth-title').textContent='Welcome back'; $('auth-submit').textContent='Sign in'; $('auth-mode').value='login'; $('auth-error').textContent=''; $('name-wrap').style.display='none'; show('auth'); }
function openRegister(){ $('auth-title').textContent='Create your account'; $('auth-submit').textContent='Create account'; $('auth-mode').value='register'; $('auth-error').textContent=''; $('name-wrap').style.display='block'; show('auth'); }

async function submitAuth() {
  const mode = $('auth-mode').value, email = $('auth-email').value.trim(), password = $('auth-password').value;
  const name = $('auth-name').value.trim();
  $('auth-error').textContent = '';
  if (!email || password.length < 6 || (mode === 'register' && !name)) { $('auth-error').textContent = 'Please enter valid details. Password must be at least 6 characters.'; return; }
  $('auth-submit').disabled = true;
  try {
    let result;
    if (mode === 'login') result = await db.auth.signInWithPassword({ email, password });
    else result = await db.auth.signUp({ email, password, options: { data: { display_name: name } } });
    if (result.error) { $('auth-error').textContent = result.error.message; return; }
    if (mode === 'register' && result.data.user) {
      await db.from('user_profiles').upsert({ id: result.data.user.id, display_name: name, plan: 'free' }, { onConflict: 'id' });
    }
    if (result.data.session) await setUser(result.data.user);
    else $('auth-error').textContent = 'Account created. Please check your email to confirm, then sign in.';
  } catch (e) {
    $('auth-error').textContent = 'Something went wrong. Please check your connection and try again.';
  } finally {
    $('auth-submit').disabled = false;
  }
}

async function logout(){ await db.auth.signOut(); }
function goHome(){ if (activeTest) { if (!confirm('Exit this exam? Your current attempt will be lost.')) return; stopTimer(); } activeTest=null; show('home'); renderHome(); }

function requirePaid() {
  if (!user) { openLogin(); return false; }
  if (!isPaid()) { $('upgrade-modal').classList.add('open'); return false; }
  return true;
}

function closeUpgrade(){ $('upgrade-modal').classList.remove('open'); }
function startReal(){ if (!requirePaid()) return; prepareTest('real'); }
function startNamedTest(id){ if (!requirePaid()) return; prepareTest(id); }

async function prepareTest(type) {
  show('loading');
  $('loading-text').textContent = 'Preparing your NEET paper…';
  try {
    const pool = await loadQuestionPool();
    if (pool.physics.length < 45 || pool.chemistry.length < 45 || pool.biology.length < 90) throw new Error('Not enough active questions in the question bank.');
    const seed = type === 'mock-1' ? 11 : type === 'mock-2' ? 29 : 47;
    const paper = [
      ...pickSeeded(pool.physics, EXAM.physics, seed),
      ...pickSeeded(pool.chemistry, EXAM.chemistry, seed + 1),
      ...pickSeeded(pool.biology, EXAM.biology, seed + 2)
    ];
    // Keep subject blocks in NEET order and randomize questions inside each subject.
    questions = paper;
    answers = {}; marked = {}; current = 0; secondsLeft = EXAM.minutes * 60; testStartedAt = Date.now();
    activeTest = type;
    show('exam'); renderExam(); startTimer();
  } catch(e) {
    show('home'); alert(e.message || 'Could not load the exam.');
  }
}

async function loadQuestionPool() {
  const result = { physics: [], chemistry: [], biology: [] };
  const subjects = [['Physics','physics'],['Chemistry','chemistry'],['Biology','biology']];
  for (const [label,key] of subjects) {
    let rows = [];
    const normalized = await db.from('questions').select(`id,chapter_label,topic,correct_option,question_tag,status,question_translations!inner(question_text,explanation),options(option_key,option_text)`).eq('language','English').eq('standard','12th').eq('subject',label).eq('status','active').eq('question_translations.lang_id',1).eq('options.lang_id',1);
    if (!normalized.error && normalized.data?.length) {
      rows = normalized.data.map(r => {
        const tr = Array.isArray(r.question_translations) ? r.question_translations[0] : r.question_translations;
        const opts = ['A','B','C','D'].map(k => (r.options || []).find(o => o.option_key === k)?.option_text || '');
        return { id:r.id, subject:label, chapter:r.chapter_label || '', topic:r.topic || '', question:tr?.question_text || '', options:opts, correct:'ABCD'.indexOf(r.correct_option || 'A'), explanation:tr?.explanation || '', tag:r.question_tag || '' };
      }).filter(q => q.question && q.options.every(Boolean) && q.correct >= 0);
    } else {
      const legacy = await db.from('questions').select('id,chapter_label,topic,question,options,correct,correct_option,explanation,question_tag,status').eq('language','English').eq('standard','12th').eq('subject',label).eq('status','active');
      if (!legacy.error) rows = (legacy.data || []).map(r => ({ id:r.id,subject:label,chapter:r.chapter_label||'',topic:r.topic||'',question:r.question||'',options:r.options||[],correct:r.correct ?? 'ABCD'.indexOf(r.correct_option||'A'),explanation:r.explanation||'',tag:r.question_tag||'' })).filter(q=>q.question && q.options.length===4 && q.correct>=0);
    }
    result[key] = rows;
  }
  return result;
}

function hash(s){ let h=2166136261; for(let i=0;i<s.length;i++) h=Math.imul(h^s.charCodeAt(i),16777619); return h>>>0; }
function pickSeeded(arr,n,seed){ const copy=arr.slice(); let x=seed>>>0; for(let i=copy.length-1;i>0;i--){ x=(Math.imul(x,1664525)+1013904223)>>>0; const j=x%(i+1); [copy[i],copy[j]]=[copy[j],copy[i]]; } return copy.slice(0,n); }

function renderExam(){
  const q=questions[current];
  $('exam-title').textContent = activeTest==='real' ? 'REAL NEET EXAM' : activeTest==='mock-1' ? 'NEET MOCK TEST 01' : 'NEET MOCK TEST 02';
  $('question-number').textContent=`Question ${current+1} of ${questions.length}`;
  $('subject-label').textContent=q.subject;
  $('question-text').textContent=q.question;
  $('question-options').innerHTML=q.options.map((o,i)=>`<button class="option ${answers[current]===i?'selected':''}" onclick="answer(${i})"><span>${i+1}</span>${esc(o)}</button>`).join('');
  $('mark-btn').classList.toggle('active',!!marked[current]);
  $('prev-btn').disabled=current===0;
  $('next-btn').textContent=current===questions.length-1?'Submit Exam →':'Save & Next →';
  renderPalette();
}
function answer(i){ answers[current]=i; renderExam(); }
function toggleMark(){ marked[current]=!marked[current]; renderExam(); }
function clearAnswer(){ delete answers[current]; renderExam(); }
function jump(i){ current=i; renderExam(); window.scrollTo({top:0,behavior:'smooth'}); }
function renderPalette(){
  $('palette').innerHTML=questions.map((q,i)=>`<button class="palette-q ${answers[i]!==undefined?'answered':''} ${marked[i]?'marked':''} ${i===current?'current':''}" onclick="jump(${i})">${i+1}</button>`).join('');
  const attempted=Object.keys(answers).length, markedCount=Object.values(marked).filter(Boolean).length;
  $('attempted-count').textContent=attempted; $('marked-count').textContent=markedCount; $('unanswered-count').textContent=questions.length-attempted;
}
function nextQuestion(){ if(current===questions.length-1) submitExam(); else { current++; renderExam(); } }
function startTimer(){ stopTimer(); timer=setInterval(()=>{secondsLeft--; updateTimer(); if(secondsLeft<=0){stopTimer(); submitExam(true);}},1000); updateTimer(); }
function stopTimer(){ if(timer){clearInterval(timer);timer=null;} }
function updateTimer(){ const m=Math.floor(secondsLeft/60),s=secondsLeft%60; $('timer').textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; $('timer').classList.toggle('danger',secondsLeft<=600); }

async function submitExam(auto=false){
  if(!auto && !confirm('Submit your exam now? You will not be able to change answers.')) return;
  stopTimer(); show('loading'); $('loading-text').textContent='Calculating your result…';
  const result=calculateResult();
  await saveAttempt(result);
  renderResult(result,auto); show('result');
}
function calculateResult(){
  let correct=0,wrong=0,unanswered=0; const subjects={};
  for(let i=0;i<questions.length;i++){
    const q=questions[i], a=answers[i]; if(!subjects[q.subject]) subjects[q.subject]={correct:0,wrong:0,unanswered:0,score:0};
    if(a===undefined){unanswered++;subjects[q.subject].unanswered++;}
    else if(a===q.correct){correct++;subjects[q.subject].correct++;subjects[q.subject].score+=4;}
    else{wrong++;subjects[q.subject].wrong++;subjects[q.subject].score-=1;}
  }
  return {score:correct*4-wrong,correct,wrong,unanswered,subjects,timeUsed:EXAM.minutes*60-secondsLeft,type:activeTest};
}
async function saveAttempt(r){
  if(!user)return;
  try{await db.from('exam_attempts').insert({user_id:user.id,test_type:r.type,score:r.score,correct:r.correct,wrong:r.wrong,unanswered:r.unanswered,time_spent:r.timeUsed,details:r.subjects,completed_at:new Date().toISOString()});}catch(e){/* optional table */}
}
function renderResult(r,auto){
  $('result-score').textContent=r.score; $('result-correct').textContent=r.correct; $('result-wrong').textContent=r.wrong; $('result-unanswered').textContent=r.unanswered;
  $('result-message').textContent=r.score>=600?'Excellent! Practice makes man perfect — walk into the real exam with this same confidence. You are one step closer to becoming a doctor.':r.score>=500?'Good progress. Review your mistakes and practice again — that is how confidence is built. Push the next mock higher.':'This is your baseline, not your limit. Come back with the same aspiration, practice again, and go with more confidence next time.';
  $('result-subjects').innerHTML=Object.entries(r.subjects).map(([s,v])=>`<div class="result-row"><b>${s}</b><span>${v.correct} correct · ${v.wrong} wrong · ${v.unanswered} unanswered</span><strong>${v.score}</strong></div>`).join('');
  $('auto-note').style.display=auto?'block':'none';
}
function backFromResult(){ activeTest=null; show('home'); renderHome(); }

window.addEventListener('DOMContentLoaded', boot);
