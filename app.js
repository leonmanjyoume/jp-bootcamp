// Bootcamp app with optional Supabase sync.
// Local-first: everything works offline via localStorage.
// If logged in, it mirrors your localStorage snapshot to Supabase automatically.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const LS_PREFIX = "bootcamp.";
const LS = {
  startDate: "bootcamp.startDate",
  dayChecks: (d) => `bootcamp.day.${d}.checks`,
  vocab: "bootcamp.vocab",
  output: (d) => `bootcamp.day.${d}.output`,
  lastModified: "bootcamp.lastModified",
};

function nowTs(){ return Date.now(); }
function iso(d){ return d.toISOString().slice(0,10); }
function parseISO(s){ const [y,m,dd]=s.split("-").map(Number); return new Date(y, m-1, dd); }

function touchModified(){ localStorage.setItem(LS.lastModified, String(nowTs())); }

function getStartDate(){
  const v = localStorage.getItem(LS.startDate);
  if(v) return parseISO(v);
  const t = new Date(); t.setHours(0,0,0,0);
  localStorage.setItem(LS.startDate, iso(t));
  touchModified();
  return t;
}
function setStartDate(d){
  d.setHours(0,0,0,0);
  localStorage.setItem(LS.startDate, iso(d));
  touchModified();
}

function dayIndexFromStart(start, date){
  const ms = date - start;
  return Math.floor(ms / (1000*60*60*24)) + 1;
}
function today0(){ const t = new Date(); t.setHours(0,0,0,0); return t; }

const DAILY_TWISTS = [
  {emoji:"🌱", title:"Flow day", tip:"Read for story; look up max 2 words."},
  {emoji:"🌱", title:"Character day", tip:"Pick 1 character; write 2 sentences describing them."},
  {emoji:"🧠", title:"Grammar noticing", tip:"Copy 1 speech bubble and underline particles."},
  {emoji:"🌱", title:"Dialogue day", tip:"Read bubbles aloud for 2 minutes."},
  {emoji:"🔁", title:"Review day", tip:"Re-read yesterday’s page(s) quickly, no dictionary."},
  {emoji:"🌱", title:"Onomatopoeia", tip:"Pick 1 擬音語/擬態語; write meaning + your own sentence."},
  {emoji:"📚", title:"Longer reading", tip:"Weekend: 30–45 min reading stamina."},
];
function twistForDay(n){ return DAILY_TWISTS[(n-1) % DAILY_TWISTS.length]; }

function loadChecks(dayNum){
  const raw = localStorage.getItem(LS.dayChecks(dayNum));
  if(!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}
function saveChecks(dayNum, obj){
  localStorage.setItem(LS.dayChecks(dayNum), JSON.stringify(obj));
  touchModified();
}

function currentDayNum(){
  const start = getStartDate();
  const idx = dayIndexFromStart(start, today0());
  return Math.min(Math.max(idx, 1), 30);
}
function overrideDay(){
  const v = sessionStorage.getItem("bootcamp.dayOverride");
  if(!v) return null;
  const n = Number(v);
  if(Number.isFinite(n) && n>=1 && n<=30) return n;
  return null;
}
function effectiveDay(){ return overrideDay() ?? currentDayNum(); }

function renderCalendar(){
  const grid = $("#calendarGrid");
  grid.innerHTML = "";
  const start = getStartDate();
  const todayIdx = dayIndexFromStart(start, today0());

  for(let d=1; d<=30; d++){
    const date = new Date(start);
    date.setDate(start.getDate() + (d-1));
    const dateStr = iso(date);

    const checks = loadChecks(d);
    const coreDone = checks.anki && checks.read && checks.output;
    const anyDone = Object.values(checks).some(Boolean);

    const twist = twistForDay(d);

    const el = document.createElement("div");
    el.className = "day";
    el.innerHTML = `
      <div class="row space">
        <div>
          <div class="dnum">Day ${d} <span class="sub small">${dateStr}</span></div>
          <div class="sub small">${twist.emoji} ${twist.title}</div>
        </div>
        <div class="row gap">
          ${d === todayIdx ? `<span class="badge today">Today</span>` : ``}
          ${coreDone ? `<span class="badge done">Core ✓</span>` : anyDone ? `<span class="badge">In progress</span>` : `<span class="badge">—</span>`}
        </div>
      </div>
      <div class="sub small" style="margin-top:8px">${twist.tip}</div>
    `;
    el.addEventListener("click", () => {
      sessionStorage.setItem("bootcamp.dayOverride", String(d));
      applyDayUI();
      window.location.hash = "#today";
    });
    grid.appendChild(el);
  }
}

function applyDayUI(){
  const d = effectiveDay();
  const checks = loadChecks(d);

  $$("input[type=checkbox][data-task]").forEach(cb => {
    const key = cb.dataset.task;
    cb.checked = !!checks[key];
    cb.onchange = () => {
      const updated = loadChecks(d);
      updated[key] = cb.checked;
      saveChecks(d, updated);
      renderCalendar();
      scheduleSync("checks");
    };
  });

  const out = localStorage.getItem(LS.output(d)) || "";
  $("#outputBox").value = out;
  $("#outputStatus").textContent = overrideDay()
    ? `Viewing Day ${d} (clicked from calendar). Refresh to return to today.`
    : (out ? `Loaded Day ${d} output` : `No saved output for Day ${d}`);
}

/* Buttons */
$("#resetDayBtn").addEventListener("click", () => {
  const d = effectiveDay();
  saveChecks(d, {});
  renderCalendar();
  applyDayUI();
  scheduleSync("reset-day");
});
$("#clearPlanBtn").addEventListener("click", () => {
  if(!confirm("Delete ALL progress, vocab list, and outputs stored in this browser?")) return;
  Object.keys(localStorage).forEach(k => { if(k.startsWith(LS_PREFIX)) localStorage.removeItem(k); });
  sessionStorage.removeItem("bootcamp.dayOverride");
  touchModified();
  renderCalendar(); applyDayUI(); renderVocab();
  scheduleSync("clear-all");
});

/* Start date dialog */
const dlg = $("#startDialog");
$("#setStartBtn").addEventListener("click", () => {
  const s = getStartDate();
  $("#startDateInput").value = iso(s);
  dlg.showModal();
});
$("#saveStartDate").addEventListener("click", () => {
  const v = $("#startDateInput").value;
  if(v){
    setStartDate(parseISO(v));
    sessionStorage.removeItem("bootcamp.dayOverride");
    renderCalendar(); applyDayUI();
    scheduleSync("set-start-date");
  }
});
$("#startDayBtn").addEventListener("click", () => {
  sessionStorage.removeItem("bootcamp.dayOverride");
  applyDayUI();
  window.location.hash = "#today";
});

/* Vocab */
function loadVocab(){
  const raw = localStorage.getItem(LS.vocab);
  if(!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
function saveVocab(items){
  localStorage.setItem(LS.vocab, JSON.stringify(items));
  touchModified();
}
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function renderVocab(){
  const tbody = $("#vocabTable tbody");
  tbody.innerHTML = "";
  const items = loadVocab();
  for(const it of items){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(it.word||"")}</td>
      <td>${escapeHtml(it.reading||"")}</td>
      <td>${escapeHtml(it.meaning||"")}</td>
      <td>${escapeHtml(it.source||"")}</td>
      <td><button class="del">Delete</button></td>
    `;
    tr.querySelector("button.del").addEventListener("click", () => {
      const next = loadVocab().filter(x => x.id !== it.id);
      saveVocab(next);
      renderVocab();
      scheduleSync("delete-vocab");
    });
    tbody.appendChild(tr);
  }
}
$("#vocabForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const word = $("#vWord").value.trim();
  const reading = $("#vReading").value.trim();
  const meaning = $("#vMeaning").value.trim();
  const source = $("#vSource").value.trim();
  if(!word) return;
  const items = loadVocab();
  items.unshift({ id: crypto.randomUUID(), word, reading, meaning, source, ts: Date.now() });
  saveVocab(items);
  $("#vWord").value=""; $("#vReading").value=""; $("#vMeaning").value=""; $("#vSource").value="";
  renderVocab();
  scheduleSync("add-vocab");
});
function csv(v){
  const s = String(v ?? "");
  if(/[",\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}
$("#exportVocab").addEventListener("click", () => {
  const items = loadVocab();
  const header = ["word","reading","meaning","source"].join(",");
  const rows = items.map(it => [it.word,it.reading,it.meaning,it.source].map(csv).join(","));
  const csvText = [header, ...rows].join("\n");
  const blob = new Blob([csvText], {type:"text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "bootcamp_vocab.csv"; a.click();
  URL.revokeObjectURL(url);
});

/* Output */
$("#saveOutput").addEventListener("click", () => {
  const d = effectiveDay();
  const val = $("#outputBox").value;
  localStorage.setItem(LS.output(d), val);
  touchModified();
  $("#outputStatus").textContent = `Saved Day ${d} output`;

  const updated = loadChecks(d);
  updated.output = val.trim().length > 0 ? true : updated.output;
  saveChecks(d, updated);

  $$("input[type=checkbox][data-task]").forEach(cb => { if(cb.dataset.task === "output") cb.checked = !!updated.output; });
  renderCalendar();
  scheduleSync("save-output");
});
$("#clearOutput").addEventListener("click", () => {
  $("#outputBox").value = "";
  $("#outputStatus").textContent = "Cleared (not saved)";
});

/* Timer */
let timer = {remaining: 30*60, running:false, t:null};
function renderTimer(){
  const m = Math.floor(timer.remaining/60);
  const s = timer.remaining % 60;
  $("#timerDisplay").textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function setTimerMinutes(min){
  timer.remaining = min*60; timer.running=false;
  if(timer.t) clearInterval(timer.t);
  timer.t=null; renderTimer();
}
$$("button[data-minutes]").forEach(b => b.addEventListener("click", () => setTimerMinutes(Number(b.dataset.minutes))));
$("#timerStart").addEventListener("click", () => {
  if(timer.running) return;
  timer.running = true;
  timer.t = setInterval(() => {
    timer.remaining -= 1;
    if(timer.remaining <= 0){
      timer.remaining = 0; renderTimer();
      clearInterval(timer.t); timer.t=null; timer.running=false;
      alert("Time! Nice work — jot 3–5 sentences.");
      return;
    }
    renderTimer();
  }, 1000);
});
$("#timerPause").addEventListener("click", () => { if(timer.t) clearInterval(timer.t); timer.t=null; timer.running=false; });
$("#timerReset").addEventListener("click", () => setTimerMinutes(30));

/* Supabase Sync */
let supabase = null;
let syncReady = false;
let syncDebounce = null;

function pill(state, msg){
  const p = $("#syncPill");
  const m = $("#syncMsg");
  if(!p || !m) return;
  p.classList.remove("on","off");
  if(state === "on"){ p.classList.add("on"); p.textContent = "Sync ON"; }
  else if(state === "off"){ p.classList.add("off"); p.textContent = "Sync OFF"; }
  else { p.textContent = "Checking…"; }
  m.textContent = msg;
}
function getKeysSnapshot(){
  const snap = {};
  for(let i=0; i<localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith(LS_PREFIX)) snap[k] = localStorage.getItem(k);
  }
  return snap;
}
function restoreSnapshot(snap){
  Object.keys(localStorage).forEach(k => { if(k.startsWith(LS_PREFIX)) localStorage.removeItem(k); });
  for(const [k,v] of Object.entries(snap || {})) localStorage.setItem(k, v);
}
function localModified(){ const v = localStorage.getItem(LS.lastModified); return v ? Number(v) : 0; }

async function initSupabase(){
  const url = window.BOOTCAMP_SUPABASE_URL;
  const key = window.BOOTCAMP_SUPABASE_ANON_KEY;
  if(!url || !key || url.startsWith("PASTE_") || key.startsWith("PASTE_")){
    pill("off","Sync not configured. Add keys in config.js, then use login.html.");
    return;
  }
  supabase = window.supabase.createClient(url, key);
  const { data } = await supabase.auth.getSession();
  if(!data?.session){
    pill("off","Not logged in. Go to “Sync / Login” to enable syncing.");
    return;
  }
  pill("on","Logged in. Syncing across devices.");
  syncReady = true;
  await pullFromCloudIfNewer();
  setInterval(() => { pullFromCloudIfNewer().catch(()=>{}); }, 60_000);
}

async function pullFromCloudIfNewer(){
  if(!supabase) return;
  const { data: sess } = await supabase.auth.getSession();
  if(!sess?.session) return;

  const { data, error } = await supabase
    .from("bootcamp_state")
    .select("state, updated_at")
    .eq("user_id", sess.session.user.id)
    .maybeSingle();

  if(error) return;

  if(!data){
    await pushToCloud("initial-push");
    return;
  }
  const remoteTs = new Date(data.updated_at).getTime();
  const localTs = localModified();
  if(remoteTs > localTs + 1000){
    restoreSnapshot(data.state);
    localStorage.setItem(LS.lastModified, String(remoteTs));
    renderCalendar(); applyDayUI(); renderVocab();
    pill("on","Pulled newer progress from cloud.");
  }
}

async function pushToCloud(reason){
  if(!syncReady || !supabase) return;
  const { data: sess } = await supabase.auth.getSession();
  if(!sess?.session){ syncReady=false; pill("off","Logged out. Sync paused."); return; }

  const snap = getKeysSnapshot();
  const ts = new Date();
  const payload = { user_id: sess.session.user.id, state: snap, updated_at: ts.toISOString() };
  const { error } = await supabase.from("bootcamp_state").upsert(payload, { onConflict: "user_id" });
  if(!error){
    localStorage.setItem(LS.lastModified, String(ts.getTime()));
    pill("on", `Synced (${reason}).`);
  }
}
function scheduleSync(reason){
  if(!syncReady) return;
  if(syncDebounce) clearTimeout(syncDebounce);
  syncDebounce = setTimeout(() => { pushToCloud(reason).catch(()=>{}); }, 800);
}

/* Init */
renderCalendar(); applyDayUI(); renderVocab(); renderTimer();
initSupabase().catch(()=> pill("off","Sync error. Check config.js keys and Supabase policies."));
