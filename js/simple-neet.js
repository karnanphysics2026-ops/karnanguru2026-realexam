const SUPABASE_URL = 'https://vtswgisxeylubvazcefe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lTpVWMDF42ocz84PXirWww_iVcNyeZ-';
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const EXAM = { total: 180, minutes: 180, physics: 45, chemistry: 45, biology: 90, correct: 4, wrong: -1 };
const DREAMS = [
  { key:'general', label:'General Physician', icon:'🩺' },
  { key:'cardio', label:'Cardiologist', icon:'❤️' },
  { key:'neuro', label:'Neurologist', icon:'🧠' },
  { key:'ortho', label:'Orthopedic Surgeon', icon:'🦴' },
  { key:'pedia', label:'Pediatrician', icon:'👶' },
  { key:'dental', label:'Dentist', icon:'🦷' },
  { key:'eye', label:'Ophthalmologist', icon:'👁️' },
  { key:'path', label:'Pathologist', icon:'🔬' }
];
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
    if (event === 'SIGNED_IN' && session?.user && session.user.id !== user?.id) await setUser(session.user);
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
  const progress = loadProgress();
  renderFocusAreas(progress);
  renderRoadmap(progress);
  renderDreamCard();
}

function renderFocusAreas(p){
  const el = $('focus-panel');
  if (!el) return;
  const all = Object.values(p.chapters).filter(c => c.total >= 3);
  if (!all.length) { el.innerHTML = '<p class="muted">Take your first mock test to discover your strengths and focus areas.</p>'; return; }
  const weak = all.map(c => ({ ...c, rate: c.wrong / c.total })).sort((a, b) => b.rate - a.rate).slice(0, 3);
  const strong = all.map(c => ({ ...c, rate: c.correct / c.total })).sort((a, b) => b.rate - a.rate).slice(0, 3);
  el.innerHTML = `
    <div class="focus-col"><h4>🎯 Focus areas</h4>${weak.map(c => `<div class="focus-row weak"><span>${esc(c.chapter)}</span><b>${Math.round(c.rate * 100)}% wrong</b></div>`).join('')}</div>
    <div class="focus-col"><h4>💪 Strengths</h4>${strong.map(c => `<div class="focus-row strong"><span>${esc(c.chapter)}</span><b>${Math.round(c.rate * 100)}% correct</b></div>`).join('')}</div>`;
}

function renderRoadmap(p){
  const el = $('roadmap-panel');
  if (!el) return;
  const hist = p.history;
  if (hist.length < 2) { el.innerHTML = '<p class="muted">Take at least 2 tests to see your roadmap graph.</p>'; return; }
  const W = 560, H = 160, PAD = 26;
  const scores = hist.map(x => x.score);
  const maxS = Math.max(720, ...scores), minS = Math.min(0, ...scores);
  const pts = hist.map((x, i) => {
    const px = PAD + (i / (hist.length - 1)) * (W - 2 * PAD);
    const py = H - PAD - ((x.score - minS) / ((maxS - minS) || 1)) * (H - 2 * PAD);
    return [px, py];
  });
  const path = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' ');
  const dots = pts.map((pt, i) => `<circle cx="${pt[0].toFixed(1)}" cy="${pt[1].toFixed(1)}" r="4" fill="var(--cyan)"><title>${esc(new Date(hist[i].date).toLocaleDateString())}: ${hist[i].score}</title></circle>`).join('');

  const recent = hist.slice(-8);
  const n = recent.length;
  const xs = recent.map((_, i) => i), ys = recent.map(x => x.score);
  const xMean = xs.reduce((a, b) => a + b, 0) / n, yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - xMean) * (ys[i] - yMean); den += (xs[i] - xMean) ** 2; }
  const slope = den ? num / den : 0;
  const target = 650, last = ys[ys.length - 1];
  let projection;
  if (slope > 1) {
    const attemptsNeeded = Math.ceil((target - last) / slope);
    projection = attemptsNeeded <= 0
      ? `You're already at a NEET-ready score (${target}+). Keep practicing to hold this level with confidence.`
      : `At your current pace, roughly ${attemptsNeeded} more mock test${attemptsNeeded === 1 ? '' : 's'} to reach a NEET-ready score of ${target}+.`;
  } else {
    projection = 'Take a few more tests at a steady pace to build a clear trend — practice makes man perfect.';
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="roadmap-svg">
      <line x1="${PAD}" y1="${H-PAD-((target-minS)/((maxS-minS)||1))*(H-2*PAD)}" x2="${W-PAD}" y2="${H-PAD-((target-minS)/((maxS-minS)||1))*(H-2*PAD)}" stroke="var(--gold)" stroke-dasharray="4 4" stroke-width="1.5"/>
      <path d="${path}" fill="none" stroke="var(--cyan)" stroke-width="2.5"/>${dots}
    </svg><p class="roadmap-note">${esc(projection)}</p>`;
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
    const progress = loadProgress();
    const weakPhysics = weakChapters(progress, 'Physics').slice(0, 3).map(c => c.chapter);
    const weakChemistry = weakChapters(progress, 'Chemistry').slice(0, 3).map(c => c.chapter);
    const weakBiology = weakChapters(progress, 'Biology').slice(0, 3).map(c => c.chapter);
    const paper = [
      ...pickAdaptive(pool.physics, EXAM.physics, seed, weakPhysics),
      ...pickAdaptive(pool.chemistry, EXAM.chemistry, seed + 1, weakChemistry),
      ...pickAdaptive(pool.biology, EXAM.biology, seed + 2, weakBiology)
    ];
    // Keep subject blocks in NEET order; after the first few attempts, weight selection
    // toward chapters the student has been getting wrong, on top of the seeded shuffle.
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
function pickAdaptive(pool,n,seed,weakChapterNames){
  if(!weakChapterNames||!weakChapterNames.length||pool.length<=n) return pickSeeded(pool,n,seed);
  const weakPool=pool.filter(q=>weakChapterNames.includes(q.chapter));
  const weakCount=Math.min(Math.round(n*0.5),weakPool.length);
  const chosenWeak=pickSeeded(weakPool,weakCount,seed);
  const chosenIds=new Set(chosenWeak.map(q=>q.id));
  const remainingPool=pool.filter(q=>!chosenIds.has(q.id));
  const chosenRest=pickSeeded(remainingPool,n-chosenWeak.length,seed+101);
  return pickSeeded([...chosenWeak,...chosenRest],n,seed+7);
}

function progressKey(){ return `karnan_progress_${user?.id||'guest'}`; }
function loadProgress(){ try{ return JSON.parse(localStorage.getItem(progressKey()))||{chapters:{},history:[]}; }catch(e){ return {chapters:{},history:[]}; } }
function saveProgress(p){ try{ localStorage.setItem(progressKey(),JSON.stringify(p)); }catch(e){/* storage unavailable */} }
function updateProgress(r){
  const p=loadProgress();
  for(let i=0;i<questions.length;i++){
    const q=questions[i], a=answers[i];
    const key=`${q.subject}::${q.chapter||'General'}`;
    if(!p.chapters[key]) p.chapters[key]={subject:q.subject,chapter:q.chapter||'General',correct:0,wrong:0,total:0};
    const c=p.chapters[key];
    c.total++;
    if(a!==undefined && a===q.correct) c.correct++; else c.wrong++;
  }
  p.history.push({date:new Date().toISOString(),score:r.score,correct:r.correct,wrong:r.wrong,unanswered:r.unanswered,type:r.type});
  if(p.history.length>50) p.history=p.history.slice(-50);
  saveProgress(p);
  return p;
}
function weakChapters(p,subject,minAttempts=3){
  return Object.values(p.chapters).filter(c=>c.subject===subject && c.total>=minAttempts).map(c=>({...c,rate:c.wrong/c.total})).sort((a,b)=>b.rate-a.rate);
}

function dreamKey(){ return `karnan_dream_${user?.id||'guest'}`; }
function loadDream(){ try{ return localStorage.getItem(dreamKey())||''; }catch(e){ return ''; } }
function setDream(key){ try{ localStorage.setItem(dreamKey(),key); }catch(e){/* storage unavailable */} renderDreamCard(); }
function renderDreamCard(){
  const el=$('dream-chips');
  if(!el) return;
  const chosen=loadDream();
  el.innerHTML=DREAMS.map(d=>`<button class="dream-chip ${d.key===chosen?'active':''}" onclick="setDream('${d.key}')"><span>${d.icon}</span>${d.label}</button>`).join('');
  const d=DREAMS.find(x=>x.key===chosen);
  $('dream-selected').innerHTML=d?`Your dream: <b>${d.icon} ${esc(d.label)}</b> — come with aspiration, go with confidence.`:'Choose your dream specialization above.';
}
function renderDreamBanner(){
  const el=$('dream-banner');
  if(!el) return;
  const chosen=loadDream();
  const d=DREAMS.find(x=>x.key===chosen);
  const name=profile?.display_name||'Student';
  const floaters=['🩺','🎓','⭐','✨','❤️'].map((ic,i)=>`<span class="float-icon" style="--i:${i}">${ic}</span>`).join('');
  el.innerHTML=`<div class="dream-float">${floaters}</div><p>${d?`${d.icon} <b>${esc(name)}, future ${esc(d.label)}</b> — every test brings you closer to that white coat.`:'🌟 Set your dream specialization on the home screen and watch how close each test brings you to it.'}</p>`;
}

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
  updateProgress(result);
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
  renderDreamBanner();
  const rev=$('review-list'); rev.classList.remove('open'); rev.innerHTML=''; delete rev.dataset.rendered;
  $('review-toggle').textContent='📖 Review Answers & Explanations';
}
function toggleReview(){
  const el=$('review-list');
  const open=el.classList.toggle('open');
  $('review-toggle').textContent=open?'📖 Hide Review':'📖 Review Answers & Explanations';
  if(open && !el.dataset.rendered){ renderReviewList(); el.dataset.rendered='1'; }
}
function englishOnly(s){
  const str=String(s||'').trim();
  if(!str) return '';
  const parts=str.split(/\s*[|/\n]\s*/).filter(Boolean);
  if(parts.length>1){
    const eng=parts.filter(p=>!/[஀-௿]/.test(p));
    if(eng.length) return eng.join(' ').trim();
  }
  return str.replace(/[஀-௿]+/g,' ').replace(/\s{2,}/g,' ').replace(/^[\s.,:;\-–—|/]+|[\s.,:;\-–—|/]+$/g,'').trim();
}
function renderReviewList(){
  $('review-list').innerHTML=questions.map((q,i)=>{
    const a=answers[i];
    const isWrong=a===undefined || a!==q.correct;
    const opts=q.options.map((o,j)=>{
      const cls=j===q.correct?'correct':j===a?'wrong':'';
      return `<div class="review-opt ${cls}"><span>${j+1}</span>${esc(o)}</div>`;
    }).join('');
    const status=a===undefined?'<em>Unanswered</em>':a===q.correct?'<b class="ok">Correct</b>':'<b class="bad">Wrong</b>';
    const explanationText=englishOnly(q.explanation);
    const explanation=(isWrong && explanationText)?`<div class="explanation-box">${esc(explanationText)}</div>`:'';
    return `<div class="review-item"><div class="review-item-head"><span>Q${i+1} · ${q.subject}</span>${status}</div><p>${esc(q.question)}</p>${opts}${explanation}</div>`;
  }).join('');
}
function backFromResult(){ activeTest=null; show('home'); renderHome(); }

window.addEventListener('DOMContentLoaded', boot);
