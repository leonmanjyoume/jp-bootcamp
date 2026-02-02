const $ = (sel) => document.querySelector(sel);

function configured(){
  const url = window.BOOTCAMP_SUPABASE_URL;
  const key = window.BOOTCAMP_SUPABASE_ANON_KEY;
  return url && key && !url.startsWith("PASTE_") && !key.startsWith("PASTE_");
}

let supabase = null;

function getKeysSnapshot(){
  const snap = {};
  for(let i=0; i<localStorage.length; i++){
    const k = localStorage.key(i);
    if(k && k.startsWith("bootcamp.")) snap[k] = localStorage.getItem(k);
  }
  return snap;
}

async function refreshStatus(){
  const { data } = await supabase.auth.getSession();
  const who = $("#whoami");
  const btn = $("#logoutBtn");
  if(data?.session){
    who.textContent = `Logged in as: ${data.session.user.email}`;
    btn.style.display = "inline-block";
  } else {
    who.textContent = "Not logged in.";
    btn.style.display = "none";
  }
}

async function main(){
  if(!configured()){
    $("#whoami").textContent = "Sync not configured. Edit config.js and paste your Supabase URL + anon key.";
    return;
  }
  supabase = window.supabase.createClient(window.BOOTCAMP_SUPABASE_URL, window.BOOTCAMP_SUPABASE_ANON_KEY);

  await refreshStatus();

  $("#logoutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    await refreshStatus();
    alert("Logged out.");
  });

  $("#signinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#inEmail").value.trim();
    const password = $("#inPass").value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if(error) return alert(error.message);
    await refreshStatus();
    alert("Signed in. Go back to the bootcamp page — it will sync automatically.");
  });

  $("#signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#upEmail").value.trim();
    const password = $("#upPass").value;
    const { error } = await supabase.auth.signUp({ email, password });
    if(error) return alert(error.message);
    await refreshStatus();
    alert("Account created. If email confirmation is enabled, check your email; otherwise sign in immediately.");
  });

  $("#pushBtn").addEventListener("click", async () => {
    const { data } = await supabase.auth.getSession();
    if(!data?.session) return alert("Please sign in first.");

    const snap = getKeysSnapshot();
    const payload = { user_id: data.session.user.id, state: snap, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("bootcamp_state").upsert(payload, { onConflict: "user_id" });
    $("#pushStatus").textContent = error ? `Error: ${error.message}` : "Pushed local progress to cloud ✓";
  });
}

main();
