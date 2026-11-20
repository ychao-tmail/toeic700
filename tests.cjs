const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const store=new Map(),appNode={innerHTML:''},toast={textContent:'',classList:{add(){},remove(){}}};
const context={window:{scrollTo(){},addEventListener(){}},document:{querySelector:s=>s==='#app'?appNode:s==='#toast'?toast:null,querySelectorAll:()=>[],addEventListener(){},visibilityState:'visible'},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},console,Date,Intl,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,Blob,URL};
vm.createContext(context);
for(const f of ['dist/data.js','dist/data-more.js'])vm.runInContext(fs.readFileSync(f,'utf8'),context);
context.BANK=context.window.BANK;const bank=context.BANK;

/* 題庫結構 */
const SKILLS=['詞性','動詞形式','時態與語態','介系詞','連接詞','代名詞與關係詞','字彙','比較與數量','句子插入'];
const expect={reading:[8,3,4],listening:[8,3,4],part5:[8,6,4],part6:[6,4,4],part2:[6,5,3]};
const ids=new Set();let questionCount=0;
for(const [kind,[sets,per,choices]] of Object.entries(expect)){
  assert.equal(bank[kind].length,sets,kind+' set count');
  for(const s of bank[kind]){
    assert(!ids.has(s.id),'duplicate id '+s.id);ids.add(s.id);
    assert(s.title&&s.tag&&Number.isInteger(s.minutes));assert.equal(s.questions.length,per,s.id);assert(['基礎','進階'].includes(s.level));
    for(const q of s.questions){questionCount++;assert(q.q&&q.explain,s.id);assert.equal(q.options.length,choices,s.id);assert.equal(new Set(q.options).size,choices,s.id);assert(Number.isInteger(q.answer)&&q.answer>=0&&q.answer<choices);if(kind==='part5'||kind==='part6')assert(SKILLS.includes(q.skill),s.id+' skill')}
    if(kind==='part5')for(const q of s.questions)assert(q.q.includes('_____'),s.id);
    if(kind==='part6'){for(let n=1;n<=per;n++)assert(s.text.includes(`[${n}]`),s.id+' blank '+n);assert(s.from&&s.subject)}
    if(kind==='listening'){const wav=fs.readFileSync('dist/audio/'+s.id+'.wav');assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');assert(wav.length>320000,'Expected more than ten seconds of audio');assert.equal(wav.readUInt32LE(24),16000);}
  }
}
assert.equal(questionCount,150);
assert.equal(bank.vocabulary.length,300);const words=new Set();
for(const v of bank.vocabulary){assert(!ids.has(v.id));ids.add(v.id);assert(v.word&&v.phrase&&v.example&&v.meaning&&v.pos&&v.tag);assert(!words.has(v.word.toLowerCase()),'duplicate word '+v.word);words.add(v.word.toLowerCase())}
for(const form of ['A','B']){const sets=bank.forms[form];let n=0;for(const [k,id] of sets){const s=bank[k].find(x=>x.id===id);assert(s,form+' '+id);n+=s.questions.length}assert.equal(n,33,'diagnostic form '+form)}
assert.equal(new Set([...bank.forms.A,...bank.forms.B].map(x=>x[1])).size,16,'Forms A and B do not overlap');

/* 載入應用程式 */
let code=fs.readFileSync('dist/app.js','utf8').replace(/\r\n/g,'\n');const marker='render();\n})();';assert(code.includes(marker));
code=code.replace(marker,`globalThis.test={getState:()=>state,getRun:()=>run,getDeck:()=>deck,getExam:()=>exam,start,submitQuiz,startDeck,advanceCard,recordCard,prepareCard,dateKey,shiftDay,normalize,dueCards,filteredDeck,save,setCause,startExam,submitExam,examTotals,compareDictation,parseTranscript,nextSet,bandOf,render,setView:v=>{view=v},meaningSegs};\nrender();\n})();`);
vm.runInContext(code,context);const t=context.test,today=t.dateKey();
assert(appNode.innerHTML.includes('把今天的努力'));assert(appNode.innerHTML.includes('先做一次程度診斷'));

/* 計分、重複交卷、未完成交卷 */
t.start('reading','r1');t.getRun().answers={0:0,1:2,2:0};t.submitQuiz();assert.equal(t.getState().history.length,1);assert.equal(t.getState().history[0].correct,2);
const key='reading:r1:0';assert.equal(Object.keys(t.getState().wrong).length,1);assert.equal(t.getState().wrong[key].due,t.shiftDay(today,1),'New wrong answer is due tomorrow');assert.equal(t.getState().wrong[key].stage,0);assert.equal(t.getState().days[today].sets.length,1);
t.submitQuiz();assert.equal(t.getState().history.length,1,'Duplicate submission must not double count');

/* 錯題間隔複習：提前答對不計、到期答對兩次才移出 */
t.start('reading','r1');t.getRun().answers={0:1,1:2,2:0};t.submitQuiz();assert(t.getState().wrong[key],'Early correct retry keeps the wrong question');assert.equal(t.getRun().result.early,1);assert.equal(t.getState().days[today].sets.length,1,'Daily set completion is unique');
t.getState().wrong[key].due=today;t.start('reading','r1');t.getRun().answers={0:1,1:2,2:0};t.submitQuiz();assert.equal(t.getState().wrong[key].stage,1);assert.equal(t.getState().wrong[key].due,t.shiftDay(today,3),'First spaced success schedules three days later');
t.getState().wrong[key].due=today;t.start('reading','r1');t.getRun().answers={0:1,1:2,2:0};t.submitQuiz();assert(!t.getState().wrong[key],'Second spaced success clears the wrong question');
t.start('reading','r1');t.getRun().answers={0:0,1:2,2:0};t.submitQuiz();t.getState().wrong[key].due=today;t.start('reading','r1');t.getRun().answers={0:2,1:2,2:0};t.submitQuiz();assert.equal(t.getState().wrong[key].misses,2,'Repeated miss is counted');assert.equal(t.getState().wrong[key].stage,0);

/* 錯誤原因標記 */
t.setCause(key,'找不到依據');assert.equal(t.getState().wrong[key].cause,'找不到依據');assert.equal(t.getState().causes.filter(c=>c.key===key).length,1);
t.setCause(key,'字彙不懂');assert.equal(t.getState().causes.filter(c=>c.key===key&&c.date===today).length,1,'Changing cause on the same day replaces it');assert.equal(t.getState().causes.at(-1).cause,'字彙不懂');
t.setCause(key,'沒聽清楚');assert.equal(t.getState().wrong[key].cause,'字彙不懂','Listening-only cause is rejected for reading');
t.setCause(key,'字彙不懂');assert.equal(t.getState().wrong[key].cause,null,'Clicking the same cause clears it');

/* 未完成交卷、聽力 */
t.start('listening','l1');t.getRun().answers={0:1};t.submitQuiz();const hl=t.getState().history.length;t.getRun().answers={0:1,1:0,2:2};t.submitQuiz();assert.equal(t.getState().history.length,hl+1);assert.equal(t.getState().history.at(-1).correct,3);

/* Part 5 文法技能統計、Part 2、Part 6 呈現 */
const p5=bank.part5[0];t.start('part5',p5.id);t.getRun().answers=Object.fromEntries(p5.questions.map((q,i)=>[i,q.answer]));t.submitQuiz();assert.equal(t.getState().history.at(-1).correct,6);const skillTotal=Object.values(t.getState().skills).reduce((n,v)=>n+v[1],0);assert.equal(skillTotal,6);
const p2=bank.part2[0];t.start('part2',p2.id);assert(!appNode.innerHTML.includes(p2.questions[0].options[0].replace(/'/g,'&#39;')),'Part 2 options are hidden before submission');t.getRun().answers=Object.fromEntries(p2.questions.map((q,i)=>[i,(q.answer+1)%3]));t.submitQuiz();assert.equal(t.getState().history.at(-1).correct,0);assert(appNode.innerHTML.includes('聽寫練習'));assert(appNode.innerHTML.includes('這題錯在哪裡'));
t.start('part6','p6-1');assert(appNode.innerHTML.includes('class="blank"'));

/* 推薦題組 */
const rec=t.nextSet('grammar');assert(['part5','part6'].includes(rec.kind));assert(!t.getState().history.some(h=>h.id===rec.set.id),'Recommendation prefers an unfinished set');

/* 單字：記憶階段、測驗、選項不重複意思 */
t.startDeck('flash');const first=t.getDeck().cards[0].id;t.recordCard(true);assert.equal(t.getState().cards[first].stage,1);assert.equal(t.getState().cards[first].due,t.shiftDay(today,1));t.recordCard(true);assert.equal(t.getState().cards[first].stage,2);assert.equal(t.getState().cards[first].due,t.shiftDay(today,3));t.recordCard(false);assert.equal(t.getState().cards[first].stage,0);assert.equal(t.getState().cards[first].due,today);assert(t.dueCards().some(v=>v.id===first));
for(let n=0;n<200;n++){t.prepareCard();const d=t.getDeck(),v=d.cards[d.index];assert.equal(d.choices.length,4);assert.equal(new Set(d.choices.map(c=>c.id)).size,4);for(const c of d.choices)if(c.id!==v.id)assert(!t.meaningSegs(c.meaning).some(x=>t.meaningSegs(v.meaning).includes(x)),'Distractor meaning overlaps: '+v.word+' / '+c.word)}
t.startDeck('quiz');const hv=t.getState().history.length;for(let i=0;i<10;i++)t.advanceCard(i%2===0);assert(t.getDeck().finished);assert.equal(t.getState().history.length,hv+1);assert.equal(t.getState().history.at(-1).correct,5);assert.equal(t.getState().history.at(-1).total,10);assert.equal(t.getState().days[today].vocab.length,10);

/* 程度診斷：A/B 輪替、分級、難度設定 */
t.startExam('diagnostic');let ex=t.getExam();assert.equal(ex.form,'A');assert.equal(ex.limit,null);assert.equal(t.examTotals().total,33);
ex.sets.forEach(x=>bank[x.kind].find(s=>s.id===x.id).questions.forEach((q,i)=>{if(i%3!==2)ex.answers[`${x.kind}:${x.id}:${i}`]=q.answer}));
t.submitExam(false);const d1=t.getState().exams.at(-1);assert.equal(d1.type,'diagnostic');assert.equal(d1.total,33);assert(d1.correct>=20&&d1.correct<=24);assert.equal(d1.band,t.bandOf(Math.round(d1.correct/33*100)).band);assert.equal(t.getState().level,t.bandOf(Math.round(d1.correct/33*100)).level);
assert.equal(Object.values(d1.parts).reduce((n,p)=>n+p[1],0),33);assert(t.getState().history.filter(h=>h.mode==='exam').length===8);assert(appNode.innerHTML.includes('程度分組'));
t.startExam('diagnostic');assert.equal(t.getExam().form,'B','Second diagnostic uses form B');
ex=t.getExam();ex.sets.forEach(x=>bank[x.kind].find(s=>s.id===x.id).questions.forEach((q,i)=>ex.answers[`${x.kind}:${x.id}:${i}`]=q.answer));t.submitExam(false);assert.equal(t.getState().exams.at(-1).band,'接近目標');assert.equal(t.getState().level,'進階');assert(appNode.innerHTML.includes('與上次'));
assert.equal(t.bandOf(30).level,'基礎');assert.equal(t.bandOf(70).band,'進階衝刺');

/* 計時模考：時間計算、未作答計錯 */
t.startExam('mock','mini');ex=t.getExam();assert.equal(ex.sets.length,8);assert.equal(ex.limit,180+360+360+240+ex.sets.filter(x=>x.kind==='reading').reduce((n,x)=>n+bank.reading.find(s=>s.id===x.id).questions.length*90,0));
const before=Object.keys(t.getState().wrong).length;t.submitExam(true);const m=t.getState().exams.at(-1);assert.equal(m.type,'mock');assert.equal(m.correct,0);assert.equal(m.total,t.examTotals().total);assert(Object.keys(t.getState().wrong).length>before,'Unanswered questions are added to review');
t.startExam('mock','full');assert.equal(t.getExam().sets.length,16);

/* 聽寫比對、逐字稿說話者 */
const dc=t.compareDictation("I have a ten o'clock appointment with Ms. Carter.","i have ten oclock appointment with ms carter");assert.equal(dc.total,9);assert.equal(dc.hit,7);
assert.equal(new Set(t.parseTranscript(bank.listening[0].transcript).map(x=>x.speaker)).size,2);assert.equal(new Set(t.parseTranscript(bank.listening[1].transcript).map(x=>x.speaker)).size,1);

/* 備份：v2 往返、v1 舊資料轉換、無效資料過濾 */
const roundTrip=t.normalize(JSON.parse(JSON.stringify(t.getState())));assert.equal(roundTrip.history.length,t.getState().history.length);assert.equal(Object.keys(roundTrip.cards).length,10);assert.equal(roundTrip.exams.length,3);assert.deepEqual(Object.keys(roundTrip.wrong).sort(),Object.keys(t.getState().wrong).sort());assert.deepEqual(JSON.parse(JSON.stringify(roundTrip.skills)),JSON.parse(JSON.stringify(t.getState().skills)));assert.equal(roundTrip.level,'進階');
assert.throws(()=>t.normalize({version:99}));
const v1={version:1,goal:60,created:'2026-11-01',days:{'2026-11-01':{seconds:600,vocab:['v1'],sets:['r1']}},history:[{date:'2026-11-01',kind:'reading',id:'r1',correct:2,total:3}],wrong:{'reading:r1:0':{kind:'reading',id:'r1',index:0}},cards:{v1:{stage:1,due:'2026-11-02'}}};
const mig=t.normalize(v1);assert.equal(mig.version,2);assert.equal(mig.goal,60);assert.equal(mig.wrong['reading:r1:0'].stage,0);assert.equal(mig.wrong['reading:r1:0'].due,today);assert.equal(mig.wrong['reading:r1:0'].misses,1);assert.deepEqual(mig.exams.length,0);assert.equal(mig.level,null);
const invalid=JSON.parse(JSON.stringify(t.getState()));invalid.cards.unrecognized={stage:4,due:today};invalid.wrong.invalid={kind:'reading',id:'missing',index:0};invalid.skills.魔法=[1,2];invalid.causes.push({date:today,key:'x',kind:'reading',cause:'亂寫'});invalid.exams.push({date:today,type:'unknown',correct:1,total:2,parts:{}});
const clean=t.normalize(invalid);assert(!clean.cards.unrecognized);assert(!clean.wrong.invalid);assert(!clean.skills.魔法);assert(!clean.causes.some(c=>c.cause==='亂寫'));assert.equal(clean.exams.length,3);
assert.equal(t.shiftDay('2026-12-31',1),'2027-01-01');assert.equal(t.shiftDay('2028-02-28',1),'2028-02-29');

/* 各頁面可繪製 */
for(const v of ['home','reading','listening','vocabulary','exam','review','stats']){t.setView(v);t.render();assert(appNode.innerHTML.length>2000,v+' renders')}
t.setView('review');t.render();assert(appNode.innerHTML.includes('今天可複習'));
t.save();assert(store.get('toeic700.studio.v1').includes('"version":2'));
console.log(`Passed: ${questionCount} questions (Part 2–7), 300 words, 8 WAV assets, diagnostic forms A/B, quiz scoring, duplicate protection, incomplete submission, spaced wrong-answer review, error causes, grammar skills, recommendations, vocabulary distractors, diagnostic banding, timed mock, dictation scoring, transcript speakers, v1→v2 backup migration, validation, calendar boundaries, page rendering and persistence.`);
