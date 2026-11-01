const DATA0 = /*DATA*/null;      // spelersdata, door build.py ingevoegd (public/data/players.json)
const SITE = /*SITE*/null;       // site.json: naam, tagline, url, startdatum (door build.py ingevoegd)
const TZ = "Europe/Amsterdam";
const START = SITE.startDate;    // dag 0; moet gelijk zijn aan START_DATE in supabase/schema.sql
const BRAND = SITE.brand, TAGLINE = SITE.tagline;
const COLORS = {AJA:"#d2122e",AZ:"#e30613",GRO:"#008a3e",TWE:"#e2001a",UTR:"#e30613",FEY:"#e30613",FOR:"#ffd200",GAE:"#e30613",NEC:"#d71920",PEC:"#005ca9",PSV:"#ed1c24",HEE:"#0055a5",SPA:"#e30613",TEL:"#ffffff",EXC:"#e30613",ADO:"#00843d",CAM:"#ffd200",WIL:"#e30613"};
const POS = {1:"KEE",2:"VER",3:"MID",4:"AAN"};
const POSNL = {1:"keeper",2:"verdediger",3:"middenvelder",4:"aanvaller"};
const TOL = {price:10, own:8, pts:10, gw:3};
const KEYS = ["team","pos","price","own","pts","gw"];

/* ---------- utils ---------- */
const $ = s => document.querySelector(s);
const el = (tag, attrs={}, ...kids) => { const e=document.createElement(tag); for(const [k,v] of Object.entries(attrs)){ if(k==="class") e.className=v; else if(k==="text") e.textContent=v; else if(k.startsWith("on")) e.addEventListener(k.slice(2),v); else if(v!==false&&v!=null) e.setAttribute(k,v===true?"":v);} for(const k of kids.flat()){ if(k==null||k===false) continue; e.append(k.nodeType?k:document.createTextNode(String(k))); } return e; };
const norm = s => (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/ø/g,"o").replace(/ß/g,"ss").toLowerCase();
const ls = { get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }, set(k,v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,JSON.stringify(v)); }catch(e){} } };
function dayStr(d=new Date()){ return new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(d); }
const DAY = 864e5;
const dms = ds => Date.parse(ds+"T00:00:00Z");
const dayIndex = ds => Math.round((dms(ds)-dms(START))/DAY);
const fmtPrice = c => "€"+(c/10).toFixed(1).replace(".",",")+"m";
const fmtOwn = o => (+o%1===0 ? (+o).toFixed(0) : (+o).toFixed(1))+"%";
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.remove("hide"); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.add("hide"),2200); }
const errText = e => String((e && e.message) || "Er ging iets mis");

/* ---------- data (zoeken en oefenronde) ---------- */
let DATA, P = {}, LIST = [], TEAM = {};
function useData(d){
  DATA = d; P = {}; TEAM = {};
  for(const [id,s,n] of d.teams) TEAM[id] = {s,n};
  LIST = d.players.map(r => { const p = {code:r[0],web:r[1],full:r[2],team:r[3],pos:r[4],price:r[5],own:r[6],pts:r[7],gw:r[8],g:r[9],a:r[10],cs:r[11],min:r[12],num:r[13]??null}; p.key = norm(p.web+" "+p.full); P[p.code]=p; return p; });
  LIST.sort((a,b)=>b.own-a.own || b.pts-a.pts);
}
useData(DATA0);
const teamS = id => (TEAM[id]||{s:"?"}).s, teamN = id => (TEAM[id]||{n:"?"}).n;

/* ---------- server (Supabase, alleen via functies) ---------- */
const CFG = window.GAME_CONFIG || {};
const API = CFG.supabaseUrl && CFG.supabaseAnonKey ? CFG.supabaseUrl.replace(/\/+$/,"") + "/rest/v1/rpc/" : null;
async function rpc(fn, args){
  const r = await fetch(API + fn, {method:"POST", headers:{"Content-Type":"application/json", apikey:CFG.supabaseAnonKey, Authorization:"Bearer "+CFG.supabaseAnonKey}, body:JSON.stringify(args||{})});
  const txt = await r.text(); let j = null; try{ j = txt ? JSON.parse(txt) : null; }catch(e){}
  if(!r.ok) throw new Error((j && j.message) || ("Serverfout "+r.status));
  return j;
}
const ID_KEY = "dnl:id";
const auth = () => ({p_player:S.id.player, p_secret:S.id.secret});
function fetchJSON(url){ return fetch(url+"?v="+Date.now(),{cache:"no-store"}).then(r=>r.ok?r.json():null).catch(()=>null); }

/* ---------- app state ---------- */
const S = {
  tab:"play", today:dayStr(), mode:"daily",
  id: ls.get(ID_KEY),        // {player, secret} op dit apparaat
  srv:null,                  // spel van vandaag zoals de server het geeft
  me:null, leagues:[],
  practice:null,
  loading:true, err:null, busy:false,
  board:(ls.get("dnl:boardtab")==="total"?"total":"week"), scope:null, rows:null, boardErr:null, boardLoading:false,
  q:"", hi:0, pendingJoin:null
};

/* ---------- vergelijken (oefenronde; de echte vergelijking doet de server) ---------- */
function compare(g, a){
  const num = k => { const d=a[k]-g[k]; if(Math.abs(d)<1e-9) return {c:"exact"}; return {c:Math.abs(d)<=TOL[k]+1e-9?"close":"miss", d:d>0?1:-1}; };
  return {team:{c:g.team===a.team?"exact":"miss"}, pos:{c:g.pos===a.pos?"exact":"miss"}, price:num("price"), own:num("own"), pts:num("pts"), gw:num("gw")};
}
// Eerste letter van de achternaam (hint 2), gelijk aan dn_initial op de server
const initialOf = web => norm(String(web||"").replace(/^(van der |van den |van de |van |de |den |der |ter |ten |te |el |al )/i,"")).charAt(0).toUpperCase();
const scoreFor = (n, hints, won) => won ? Math.max(0, 70-10*n-5*hints) : 0;

// Eén weergave voor zowel het echte spel als de oefenronde
function view(){
  if(S.mode==="practice"){
    const g = S.practice, a = P[g.answer];
    const rows = g.guesses.map(c=>({...P[c], fb:compare(P[c], a)}));
    const won = g.guesses.includes(g.answer), done = won || g.guesses.length>=6 || !!g.gaveUp;
    let hint = null;
    if(g.hints>=1) hint = {goals:a.g, assists:a.a, initial: g.hints>=2 ? initialOf(a.web) : null};
    return {rows, hints:g.hints, hint, done, won, gave_up:!!g.gaveUp, points:scoreFor(rows.length, g.hints, won), answer: done ? a : null,
            practice:true};
  }
  return S.srv;
}

// Van welke afgeronde gameweek de cijfers zijn: de server is leidend, anders het databestand
const gwNow = () => (S.mode!=="practice" && S.srv && S.srv.round) || DATA.gw;

/* ---------- opstarten ---------- */
function applyGet(r){ S.srv = r; S.me = r.me; S.leagues = r.leagues || []; }
async function refresh(){
  if(!API || !S.id) return;
  try{
    const r = await rpc("dn_get", auth());
    applyGet(r); S.err = null; S.today = dayStr();
  }catch(e){
    if(/Onbekende speler/.test(errText(e))){ ls.set(ID_KEY, null); S.id = null; S.me = null; S.srv = null; askName(); }
    else S.err = "Geen verbinding met de server. Probeer het zo opnieuw, of speel intussen een oefenronde.";
  }
  S.loading = false; render();
}
async function boot(){
  render();
  fetchJSON("data/players.json").then(d=>{ if(d && d.players && (d.updated>DATA.updated || d.gw>DATA.gw)){ useData(d); render(); } });
  const m = location.hash.match(/^#poule-([A-Za-z0-9]{6})$/); if(m) S.pendingJoin = m[1].toUpperCase();
  if(!API){ S.loading=false; S.err="Het spel is nog niet gekoppeld aan de server. Je kunt wel een oefenronde spelen."; render(); return; }
  if(!S.id){ S.loading=false; render(); askName(); return; }
  await refresh();
  handlePendingJoin();
  maybeYesterday();
}

/* ---------- wie was het gisteren? ---------- */
const YDAY_KEY = "dnl:yday";
async function fetchYesterday(){
  if(!API || !S.id) return null;
  try{ return await rpc("dn_yesterday", auth()); }catch(e){ return null; }
}
async function maybeYesterday(){
  if(!S.srv || !(S.srv.day > 0) || ls.get(YDAY_KEY) === S.srv.day) return;
  const y = await fetchYesterday(); if(!y || !y.answer) return;
  if($("#modal").children.length) return;          // geen popup over een ander scherm heen
  ls.set(YDAY_KEY, S.srv.day);
  showYesterday(y);
}
async function openYesterday(){
  const y = await fetchYesterday();
  if(!y || !y.answer){ toast("Nog geen puzzel van gisteren"); return; }
  showYesterday(y);
}
function showYesterday(y){
  const a = y.answer, full = (P[a.code] && P[a.code].full) || a.web;
  const mine = !y.played ? "Je speelde gisteren niet mee."
    : y.won ? "Jij had hem in "+y.n+"/6 (+"+y.points+" ptn)."
    : y.gave_up ? "Jij was gisteren een kleine speler 🏳️🤏"
    : "Jij had hem niet in zes pogingen.";
  const box = el("div",{class:"proud yday"});
  box.insertAdjacentHTML("beforeend", shirtSVG(a));
  box.append(el("div",{class:"eyebrow"},"Wie was het gisteren?"),
    el("h2",{}, full),
    el("p",{}, teamN(a.team)+" · "+POSNL[a.pos]+" · "+fmtPrice(a.price)+" · "+fmtOwn(a.own)+" eigendom"),
    el("p",{class:"note",style:"margin-top:6px"}, mine),
    el("div",{class:"row"}, el("button",{class:"btn",onclick:closeModal},"Naar de puzzel van vandaag")));
  openModal(box, false);
  const bx = document.querySelector(".modal .box"); if(bx) bx.classList.add("pop");
}

/* ---------- profiel ---------- */
async function createPlayer(name){
  name = name.trim().slice(0,24); if(!name){ toast("Kies een naam"); return false; }
  if(!API){ toast("Nog niet gekoppeld aan de server"); return false; }
  try{
    const r = await rpc("dn_create_player", {p_name:name}); const row = Array.isArray(r) ? r[0] : r;
    S.id = {player:row.player_id, secret:row.secret}; ls.set(ID_KEY, S.id);
    await refresh(); return true;
  }catch(e){ toast(errText(e)); return false; }
}
async function rename(name){
  name = name.trim().slice(0,24); if(!name) return;
  try{ await rpc("dn_rename", {...auth(), p_name:name}); S.me.name = name; toast("Naam opgeslagen"); render(); }
  catch(e){ toast(errText(e)); }
}
async function restore(code){
  if(!API) return;
  try{
    const r = await rpc("dn_restore", {p_recovery:code}); const row = Array.isArray(r) ? r[0] : r;
    if(!row) throw new Error("Onbekende herstelcode");
    S.id = {player:row.player_id, secret:row.secret}; ls.set(ID_KEY, S.id);
    closeModal(); await refresh(); toast("Welkom terug, "+row.name+"!"); handlePendingJoin();
  }catch(e){ toast(/herstelcode/i.test(errText(e)) ? "Deze herstelcode ken ik niet" : errText(e)); }
}
const fmtRec = r => String(r||"").replace(/(.{4})(?=.)/g,"$1-");
const cleanRec = v => { let t = String(v||"").toUpperCase(); const i = t.lastIndexOf(":"); if(i>=0) t = t.slice(i+1); return t.replace(/[^A-Z0-9]/g,"").slice(-12); };
function askName(){
  const inp = el("input",{placeholder:"Bijv. Klopp's Kabouters", maxlength:24});
  const btn = el("button",{class:"btn"},"Start");
  const go = async () => { btn.disabled = true; if(await createPlayer(inp.value)){ closeModal(); render(); handlePendingJoin(); } btn.disabled = false; };
  btn.addEventListener("click", go);
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter") go(); });
  openModal(el("div",{},
    el("h2",{text:"Kies je managernaam"}),
    el("p",{class:"note",style:"margin-bottom:14px",text:"Deze naam zie je terug in het klassement. Je kunt hem later aanpassen."}),
    el("div",{class:"field"}, inp, btn),
    el("p",{class:"note",style:"margin-top:10px"}, "Speelde je al eerder? ", el("button",{class:"linkbtn",onclick:askRestore},"Herstel je profiel met je herstelcode")),
    el("div",{style:"margin-top:18px"}, howTo())
  ), false);
  setTimeout(()=>inp.focus(),50);
}
function askRestore(){
  const inp = el("input",{placeholder:"XXXX-XXXX-XXXX", autocapitalize:"characters", autocomplete:"off", spellcheck:"false", style:"text-transform:uppercase"});
  // Plakt iemand een hele zin ("Mijn herstelcode: ABCD-…"), houd dan alleen de code over
  const clean = () => { const c = cleanRec(inp.value); const f = fmtRec(c); if(inp.value !== f) inp.value = f; };
  inp.addEventListener("input", clean);
  inp.addEventListener("paste", () => setTimeout(clean, 0));
  const go = () => restore(cleanRec(inp.value));
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter") go(); });
  openModal(el("div",{},
    el("h2",{text:"Profiel herstellen"}),
    el("p",{class:"note",style:"margin-bottom:14px"},"Vul de herstelcode in die je op je vorige telefoon onder Profiel vond. Je punten, reeks en poules komen dan mee."),
    el("div",{class:"field"}, inp, el("button",{class:"btn",onclick:go},"Herstel")),
    el("div",{class:"row",style:"margin-top:14px"}, el("button",{class:"btn ghost",onclick:()=>{ closeModal(); if(!S.id) askName(); }},"Terug"))
  ), false);
  setTimeout(()=>inp.focus(),50);
}

/* ---------- modal ---------- */
function openModal(content, closable=true){
  const m = $("#modal"); m.innerHTML="";
  const box = el("div",{class:"box"}, content);
  if(closable) box.append(el("div",{class:"row",style:"margin-top:16px"}, el("button",{class:"btn ghost",onclick:closeModal},"Sluiten")));
  const wrap = el("div",{class:"modal", onclick:e=>{ if(closable && e.target===wrap) closeModal(); }}, box);
  m.append(wrap);
}
function closeModal(){ $("#modal").innerHTML=""; }
function howTo(){
  return el("div",{class:"howto"},
    el("div",{class:"devwarn"}, el("b",{},"⚠️ Speel op één apparaat, of zet je profiel over met je herstelcode")),
    el("h3",{style:"font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--hd);margin-bottom:8px",text:"Zo speel je"}),
    el("p",{},"Raad elke dag de geheime Eredivisie-speler in zes pogingen. Bij elke gok zie je hoe dichtbij je zit op club, positie, fantasy-prijs, eigendom, seizoenspunten en punten van de laatste speelronde. Pijlen wijzen naar het antwoord."),
    el("ul",{},
      el("li",{},el("b",{class:"chip",style:"background:var(--exact)"},"Groen")," = exact"),
      el("li",{},el("b",{class:"chip",style:"background:var(--close)"},"Geel")," = dichtbij (±€1,0m, ±8% eigendom, ±10 ptn, ±3 ptn in de laatste speelronde)"),
      el("li",{},"Na je eerste gok kun je een hint openen: eerst de goals en assists van dit seizoen, daarna de eerste letter van de achternaam. Elke hint kost 5 punten."),
      el("li",{},"Score: 60 punten bij de eerste gok, 50, 40… tot 10 bij de zesde. Elke hintstap kost 5. Niet geraden = 0."),
      el("li",{},"Weet je het echt niet? Druk op 🏳️ Kleine speler om op te geven: 0 punten en je reeks stopt."),
      el("li",{},"Het klassement is er per poule: per dag, per week (ma–zo) en per seizoen. Wie een week de meeste punten in de poule haalt, wint een weekbeker 🏆; gelijk = allebei."),
      el("li",{},"Maak onder Klassement een poule en deel de code met je vrienden, of doe mee met hun code.")
    )
  );
}

/* ---------- render ---------- */
function render(){
  $("#sub").textContent = "Nr. "+(dayIndex(S.today)+1)+" · "+TAGLINE;
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on", b.dataset.tab===S.tab));
  const v = $("#view"); v.innerHTML = "";
  if(S.tab==="play") v.append(renderPlay());
  if(S.tab==="board") v.append(renderBoard());
  if(S.tab==="me") v.append(renderMe());
}

function tileFor(p, fb, k){
  const c = fb[k], arrow = c.d>0 ? "▲" : c.d<0 ? "▼" : "";
  if(k==="team"){ const s=teamS(p.team); return el("div",{class:"tile "+c.c}, el("span",{class:"club"},s), el("i",{class:"stripe",style:"background:"+(COLORS[s]||"#888")})); }
  const main = k==="pos" ? POS[p.pos] : k==="price" ? (p.price/10).toFixed(1) : k==="own" ? fmtOwn(p.own) : p[k];
  return el("div",{class:"tile "+c.c}, el("span",{class:"num"},main), arrow && el("span",{class:"ar"},arrow));
}

// Wat je weet: afgeleid uit de gekleurde vakjes (zonder het antwoord te kennen)
function knowledge(rows){
  const out = [];
  const tHit = rows.find(r=>r.fb.team.c==="exact");
  const notT = [...new Set(rows.filter(r=>r.fb.team.c!=="exact").map(r=>teamS(r.team)))];
  out.push(["Club", tHit ? teamN(tHit.team) : (notT.length ? "niet "+notT.join(", ") : "?")]);
  const pHit = rows.find(r=>r.fb.pos.c==="exact");
  const notP = [...new Set(rows.filter(r=>r.fb.pos.c!=="exact").map(r=>POS[r.pos]))];
  out.push(["Positie", pHit ? POS[pHit.pos] : (notP.length ? "niet "+notP.join(", ") : "?")]);
  const range = (k, fmt) => {
    let lo=-Infinity, hi=Infinity, loIn=false, hiIn=false;
    const setLo=(v,inc)=>{ if(v>lo || (v===lo && !inc)){ lo=v; loIn=inc; } }, setHi=(v,inc)=>{ if(v<hi || (v===hi && !inc)){ hi=v; hiIn=inc; } };
    for(const r of rows){ const f=r.fb[k], v=+r[k], t=TOL[k];
      if(f.c==="exact") return fmt(v);
      if(f.d>0){ if(f.c==="close"){ setLo(v,false); setHi(v+t,true); } else setLo(v+t,false); }
      else { if(f.c==="close"){ setHi(v,false); setLo(v-t,true); } else setHi(v-t,false); }
    }
    if(lo===-Infinity && hi===Infinity) return "?";
    if(lo===-Infinity) return (hiIn?"≤ ":"< ")+fmt(hi);
    if(hi===Infinity) return (loIn?"≥ ":"> ")+fmt(lo);
    return fmt(lo)+" – "+fmt(hi);
  };
  out.push(["Prijs", range("price", v=>fmtPrice(Math.max(0,v)))]);
  out.push(["Eigendom", range("own", v=>Math.max(0,+v.toFixed(1))+"%")]);
  out.push(["Seizoenspunten", range("pts", v=>String(v))]);
  out.push(["Punten speelronde "+gwNow(), range("gw", v=>String(v))]);
  return out;
}

function hintText(v){
  const h = v.hint || {};
  const ga = (h.goals??"?")+" "+(h.goals===1?"goal":"goals")+" en "+(h.assists??"?")+" "+(h.assists===1?"assist":"assists")+" dit seizoen";
  return el("span",{}, el("span",{style:"display:block"}, "⚽ "+ga),
    h.initial ? el("span",{style:"display:block;margin-top:4px"}, "🔤 Achternaam begint met een "+h.initial) : null);
}

function searchBox(v){
  const inp = el("input",{placeholder:"Zoek een speler…", autocomplete:"off", autocapitalize:"off", spellcheck:"false", value:S.q, disabled:S.busy});
  const sugg = el("div",{class:"sugg hide"});
  const guessed = new Set(v.rows.map(r=>r.code));
  const draw = () => {
    const q = norm(inp.value.trim()); S.q = inp.value; sugg.innerHTML="";
    if(!q){ sugg.classList.add("hide"); return; }
    const res = LIST.filter(p=>!guessed.has(p.code) && (p.key.includes(q) || p.key.split(/[\s-]/).some(w=>w.startsWith(q)))).slice(0,8);
    if(!res.length) sugg.append(el("div",{class:"note",style:"padding:12px"},"Geen speler gevonden"));
    S.hi = Math.min(S.hi, Math.max(0,res.length-1));
    res.forEach((p,i)=>sugg.append(el("button",{class:i===S.hi?"hi":"", onmousedown:e=>e.preventDefault(), onclick:()=>makeGuess(p.code)},
      el("span",{class:"nm"}, p.web, p.web!==p.full ? el("small",{},p.full) : null),
      el("span",{class:"meta num"}, teamS(p.team)+" · "+POS[p.pos]+" · "+fmtPrice(p.price)))));
    sugg.classList.remove("hide"); sugg._res = res;
  };
  inp.addEventListener("input",()=>{ S.hi=0; draw(); });
  inp.addEventListener("keydown",e=>{
    const res = sugg._res||[];
    if(e.key==="ArrowDown"){ S.hi=Math.min(res.length-1,S.hi+1); draw(); e.preventDefault(); }
    else if(e.key==="ArrowUp"){ S.hi=Math.max(0,S.hi-1); draw(); e.preventDefault(); }
    else if(e.key==="Enter" && res[S.hi]) makeGuess(res[S.hi].code);
    else if(e.key==="Escape") sugg.classList.add("hide");
  });
  inp.addEventListener("blur",()=>setTimeout(()=>sugg.classList.add("hide"),300));
  inp.addEventListener("focus",()=>{ if(inp.value) draw(); });
  const box = el("div",{class:"searchbox"}, inp, sugg);
  box.insertAdjacentHTML("afterbegin",'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>');
  if(S.q) setTimeout(draw,0);
  return box;
}

function renderPlay(){
  const box = el("div");
  if(S.mode==="practice") box.append(el("div",{class:"banner"}, el("span",{},"Oefenronde, telt niet mee voor je reeks of het klassement."), el("button",{onclick:()=>{S.mode="daily";render();}},"Terug naar vandaag")));
  const v = view();
  if(!v){
    if(S.err) box.append(el("div",{class:"banner"}, el("span",{},S.err), API && S.id ? el("button",{onclick:()=>{ S.loading=true; render(); refresh(); }},"Opnieuw") : null));
    else box.append(el("div",{class:"panel",style:"text-align:center"}, el("p",{class:"note"}, S.loading ? "Puzzel laden…" : "Kies eerst een managernaam om te beginnen.")));
    box.append(el("div",{class:"row",style:"margin-top:8px"}, el("button",{class:"btn ghost",onclick:startPractice},"Speel een oefenronde")));
    return box;
  }
  if(S.err && !v.practice) box.append(el("div",{class:"banner"}, el("span",{},S.err)));
  const n = v.rows.length;
  if(!v.done) box.append(searchBox(v));
  else if(S.hold){ const sb = searchBox(v), i = sb.querySelector("input"); if(i) i.disabled = true; box.append(sb); }
  else box.append(renderResult(v));

  const bd = el("div",{class:"board"}); box.append(bd);
  const pips = el("div",{class:"pips"}); for(let i=0;i<6;i++) pips.append(el("i",{class: i<n ? (v.won && i===n-1 ? "win":"used") : ""}));
  bd.append(el("div",{class:"meter"}, el("span",{}, v.done ? (v.won?"Geraden in "+n+"/6":v.gave_up?"Kleine speler 🏳️":"Niet geraden") : S.busy ? "Even checken…" : "Poging "+(n+1)+" van 6"), pips));
  bd.append(el("div",{class:"colhead"}, ["Club","Pos","Prijs","Eig.","Ptn","SR"+gwNow()].map(t=>el("div",{},t))));
  const seenKey = (v.practice ? "p"+S.practice.answer : "d"+S.today), seen = S.seen && S.seen.k===seenKey ? S.seen.n : 0;
  v.rows.forEach((r,ri)=>{
    const hit = KEYS.every(k=>r.fb[k].c==="exact"), isNew = ri >= seen;
    const tiles = KEYS.map((k,ki)=>{ const t = tileFor(r,r.fb,k); if(isNew){ t.classList.add("anim"); t.style.setProperty("--i", ki); } return t; });
    bd.append(el("div",{class:"guess"},
      el("div",{class:"gname"}, r.web, el("span",{}, hit ? "✓ raak" : "")),
      el("div",{class:"tiles"}, tiles)));
  });
  S.seen = {k:seenKey, n};
  if(!v.done) bd.append(el("div",{class:"guess empty"}, el("div",{class:"gname"}," "), el("div",{class:"tiles"}, KEYS.map(()=>el("div",{class:"tile"})))));
  bd.append(el("div",{class:"legend"}, el("span",{},el("b",{style:"background:var(--exact)"}),"Exact"), el("span",{},el("b",{style:"background:var(--close)"}),"Dichtbij"), el("span",{},el("b",{style:"background:var(--miss)"}),"Mis"), el("span",{},"▲▼ richting antwoord"),
    el("div",{style:"flex-basis:100%;text-align:center;margin-top:2px"},"Dichtbij = prijs ±€1,0m · eigendom ±8% · punten ±10 · SR ±3")));

  if(!v.done){
    const gb = el("button",{class:"giveup"+(S.confirmGiveUp?" confirm":""), disabled:S.busy, onclick:()=>{
      if(!S.confirmGiveUp){ S.confirmGiveUp = true; render(); clearTimeout(S.cgT); S.cgT = setTimeout(()=>{ S.confirmGiveUp=false; render(); }, 5000); return; }
      S.confirmGiveUp = false; giveUp(); }}, S.confirmGiveUp ? "Echt een kleine speler? Tik nog een keer" : "🏳️ Kleine speler");
    bd.append(el("div",{class:"row",style:"margin:2px 0 12px"}, gb));
  }
  if(!v.done){
    const avail = n>=1 && !S.busy && v.hints<2;
    let body;
    if(n<1) body = "Komt vrij na je eerste gok";
    else if(v.hints===0) body = "Hoeveel goals en assists heeft hij dit seizoen? Tik om te openen";
    else body = el("span",{}, hintText(v), v.hints===1 ? el("span",{style:"display:block;color:var(--mute);margin-top:4px"},"Tik nog een keer (−5) voor de eerste letter van de achternaam.") : null);
    const label = "Hint" + (v.hints===0 ? " · −5" : v.hints===1 ? " · nog een keer −5" : "");
    box.append(el("div",{class:"panel"}, el("h3",{},"Hint"),
      el("div",{class:"hints",style:"grid-template-columns:1fr"},
        el("button",{class:"hint wide"+(v.hints?" open":""), disabled:!avail, onclick:()=>{ if(avail) useHint(); }}, el("b",{},label), body))));
    if(n) box.append(el("div",{class:"panel"}, el("h3",{},"Wat je weet"), el("dl",{class:"know"}, knowledge(v.rows).flatMap(([t,val])=>[el("dt",{},t), el("dd",{class:"num"},val)]))));
  }
  if(S.mode==="daily" && !v.done && !n) box.append(el("p",{class:"note",style:"text-align:center;margin-top:6px"}, "Liever eerst oefenen? ", el("button",{class:"linkbtn",onclick:startPractice},"Speel een oefenronde")));
  if(!v.practice && v.day > 0) box.append(el("p",{class:"note",style:"text-align:center;margin-top:6px"}, el("button",{class:"linkbtn",onclick:openYesterday},"Wie was het gisteren?")));
  return box;
}

// Gokverdeling zoals bij Wordle; mark = index van vandaag (0..5 geraden in n, 6 = niet geraden)
function distBars(dist, mark){
  if(!dist || !dist.some(x=>x>0)) return null;
  const max = Math.max(...dist), labels = ["1","2","3","4","5","6","❌"];
  return el("div",{class:"dist"}, dist.map((c,i)=>el("div",{class:"drow"},
    el("span",{class:"dl"}, labels[i]),
    el("span",{class:"dbar"+(i===mark?" now":""), style:"width:"+Math.max(8, Math.round(100*c/max))+"%"}, el("b",{class:"num"}, String(c))))));
}
function todayLine(v){
  const t = v.today; if(!t || !t.played) return null;
  const pct = Math.round(100*t.won/t.played);
  return el("div",{class:"todayline"}, t.played===1 ? "Jij bent de eerste die vandaag klaar is." : pct+"% van de "+t.played+" spelers had hem vandaag.");
}

function renderResult(v){
  const a = v.answer, n = v.rows.length;
  const r = el("div",{class:"panel result"});
  r.append(el("div",{class:"big num"}, String(v.points), el("small",{}," ptn")));
  if(v.gave_up) r.append(el("div",{class:"sub",style:"margin-top:4px"},"🏳️ Kleine speler 🤏"));
  if(a){
    const full = (P[a.code] && P[a.code].full) || a.web;
    r.append(el("div",{class:"ans"}, full));
    r.append(el("div",{class:"sub"}, teamN(a.team)+" · "+POSNL[a.pos]+" · "+fmtPrice(a.price)+" · "+fmtOwn(a.own)+" eigendom"));
  }
  if(!v.practice){
    const s = v.stats || {played:0,won:0,streak:0,best:0};
    const pct = s.played ? Math.round(100*s.won/s.played) : 0;
    r.append(el("div",{class:"stats"}, [["Gespeeld",s.played],["Gewonnen",pct+"%"],["Reeks",s.streak],["Beste",s.best]].map(([t,val])=>el("div",{},el("b",{class:"num"},String(val)),el("span",{},t)))));
    const tl = todayLine(v); if(tl) r.append(tl);
    const db = distBars(s.dist, v.won ? n-1 : 6); if(db) r.append(db);
    r.append(el("div",{class:"row"}, el("button",{class:"btn",onclick:()=>copyShare(v)},"📤 Deel resultaat"),
      el("button",{class:"btn ghost",onclick:()=>{S.tab="board";render();loadBoard();}},"Klassement"),
      el("button",{class:"btn ghost",onclick:startPractice},"Oefenronde")));
    const cd = el("div",{class:"count num"}); r.append(cd);
    const tick = () => { const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:TZ,hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).map(x=>[x.type,x.value])); const left = 86400-(+parts.hour*3600 + +parts.minute*60 + +parts.second); cd.textContent = "Nieuwe puzzel over "+Math.floor(left/3600)+":"+String(Math.floor(left%3600/60)).padStart(2,"0")+":"+String(left%60).padStart(2,"0"); };
    tick(); clearInterval(renderResult.t); renderResult.t = setInterval(()=>{ if(!document.body.contains(cd)) return clearInterval(renderResult.t); tick(); },1000);
  } else {
    r.append(el("div",{class:"row",style:"margin-top:16px"}, el("button",{class:"btn",onclick:startPractice},"Nog een oefenronde"), el("button",{class:"btn ghost",onclick:()=>{S.mode="daily";render();}},"Terug naar vandaag")));
  }
  return r;
}

function shareText(v){
  const n = v.rows.length, st = (v.stats && v.stats.streak) || 0;
  const datum = new Date().toLocaleDateString("nl-NL",{timeZone:TZ,weekday:"short",day:"numeric",month:"short"});
  // Zoals Transferroute: alleen bij geraden de blokjes; niet geraden of opgegeven verraadt niets
  const rows = v.rows.map(r=>KEYS.map(k=>r.fb[k].c==="exact"?"🟩":r.fb[k].c==="close"?"🟨":"⬛").join(""));
  const head = "⚽️ "+datum+" ⚽️\n"+BRAND+" #"+(dayIndex(S.today)+1)+(v.hints?" "+"💡".repeat(v.hints):"");
  const body = v.won ? rows.join("\n")+"\n"+n+"/6 · "+v.points+" ptn" : v.gave_up ? "❌🏳️ kleine speler 🤏" : "❌ niet geraden";
  const reeks = st>0 ? "🔥 Reeks: "+st+" "+(st===1?"dag":"dagen") : "💔 Reeks: 0";
  return head+"\n"+body+"\n"+reeks+"\n"+SITE.url;
}
async function copyShare(v){
  const t = shareText(v);
  try{ await navigator.clipboard.writeText(t); toast("Gekopieerd, plak het in je groepsapp"); }
  catch(e){ openModal(el("div",{}, el("h2",{text:"Deel je resultaat"}), el("p",{class:"note"},"Selecteer en kopieer de tekst:"), el("textarea",{class:"copyarea",readonly:true,onfocus:e=>e.target.select()}, t))); }
}
function copyText(txt){
  const fallback = () => openModal(el("div",{}, el("h2",{text:"Kopieer de tekst"}), el("textarea",{class:"copyarea",readonly:true}, txt)));
  try{ navigator.clipboard.writeText(txt).then(()=>toast("Gekopieerd!"), fallback); }catch(e){ fallback(); }
}

const CHEERS = ["Topper!","Sterk!","Netjes!","Goed zo!","Op het nippertje!","Pfoe, net!"];
// Eerst de tegels laten omdraaien (6 × 0,32 s + 0,55 s), dan pas de pop-up; het scorescherm komt pas als die dicht is
const FLIP_MS = 2500;
function holdThenReveal(won, pop, lostMsg){
  S.hold = true; clearTimeout(S.holdT);
  S.holdT = setTimeout(()=>{
    if(won) pop();
    else { S.hold = false; render(); toast(lostMsg); }
  }, FLIP_MS);
}
function releaseHold(){
  closeModal();
  if(S.hold){ S.hold = false; render(); try{ window.scrollTo({top:0, behavior:"smooth"}); }catch(e){} }
}
async function makeGuess(code){
  if(S.busy) return;
  if(S.mode==="practice"){
    const g = S.practice; if(g.guesses.includes(code) || view().done) return;
    g.guesses.push(code); S.q=""; S.hi=0;
    const v = view(); if(v.done) holdThenReveal(v.won, ()=>celebrate(view()), "Helaas: het was "+P[g.answer].web);
    render(); if(!v.done){ const i=document.querySelector(".searchbox input"); if(i) i.focus(); }
    return;
  }
  if(!S.id){ askName(); return; }
  if(!S.srv || S.srv.done) return;
  S.busy = true; S.q = ""; S.hi = 0; render();
  try{
    if(dayStr()!==S.today){ await refresh(); toast("Er is een nieuwe puzzel!"); return; }
    const r = await rpc("dn_guess", {...auth(), p_code:code});
    S.srv = {...S.srv, ...r}; S.err = null;
    if(r.done){ holdThenReveal(r.won, ()=>celebrate(S.srv), "Helaas: het was "+r.answer.web); loadBoard(); }
  }catch(e){ toast("Je gok kwam niet aan. Check je verbinding en probeer opnieuw."); }
  S.busy = false; render();
  if(S.srv && !S.srv.done){ const i=document.querySelector(".searchbox input"); if(i) i.focus(); }
}
async function useHint(){
  if(S.mode==="practice"){ S.practice.hints++; render(); return; }
  S.busy = true; render();
  try{ const r = await rpc("dn_hint", auth()); S.srv = {...S.srv, ...r}; }
  catch(e){ toast("De hint kwam niet aan. Probeer het opnieuw."); }
  S.busy = false; render();
}
async function giveUp(){
  if(S.mode==="practice"){ S.practice.gaveUp = true; toast("Het was "+P[S.practice.answer].web); render(); return; }
  if(!S.id || !S.srv || S.srv.done) return;
  S.busy = true; render();
  try{ const r = await rpc("dn_giveup", auth()); S.srv = {...S.srv, ...r}; if(r.answer) toast("Het was "+r.answer.web); loadBoard(); }
  catch(e){ toast("Opgeven lukte niet. Check je verbinding en probeer opnieuw."); }
  S.busy = false; render();
}
function startPractice(){
  const pool = LIST.slice(0,240), today = S.srv && S.srv.answer ? S.srv.answer.code : null;
  let c; do { c = pool[Math.floor(Math.random()*pool.length)].code; } while(c===today);
  S.practice = {answer:c, guesses:[], hints:0, gaveUp:false}; S.confirmGiveUp = false; S.mode = "practice"; S.tab="play"; S.q=""; render();
}

/* ---------- feest bij goed geraden (zoals Transferroute) ---------- */
function lum(hex){ const n=parseInt(hex.slice(1),16), r=n>>16&255, g=n>>8&255, b=n&255; return (0.299*r+0.587*g+0.114*b)/255; }
// Clubtenues (eigen, vereenvoudigde weergave): body, mouwen, kraag, strepen, letterkleur
// Clubkleuren voor het shirt in de pop-up (alleen kleuren, geen logo's of sponsors).
// b = romp, s = mouwen, c = kraag/biezen, i = naam en nummer, st = strepen, band = middenbaan, half = rechterhelft
const KITS = {
  AJA:{b:"#ffffff",band:"#d2122e",s:"#ffffff",c:"#d2122e",i:"#111111"}, AZ:{b:"#e30613",s:"#e30613",c:"#ffffff",i:"#ffffff"},
  GRO:{b:"#ffffff",st:"#008a3e",s:"#008a3e",c:"#008a3e",i:"#111111"}, TWE:{b:"#e2001a",s:"#e2001a",c:"#ffffff",i:"#ffffff"},
  UTR:{b:"#e30613",s:"#ffffff",c:"#ffffff",i:"#ffffff"}, FEY:{b:"#ffffff",half:"#e30613",s:"#e30613",c:"#111111",i:"#111111"},
  FOR:{b:"#ffd200",s:"#ffd200",c:"#00843d",i:"#00843d"}, GAE:{b:"#e30613",s:"#ffd200",c:"#ffd200",i:"#ffd200"},
  NEC:{b:"#d71920",st:"#111111",s:"#d71920",c:"#00843d",i:"#ffffff"}, PEC:{b:"#005ca9",s:"#ffffff",c:"#ffffff",i:"#ffffff"},
  PSV:{b:"#ed1c24",st:"#ffffff",s:"#ed1c24",c:"#ffffff",i:"#111111"}, HEE:{b:"#0055a5",st:"#ffffff",s:"#0055a5",c:"#ffffff",i:"#ffffff"},
  SPA:{b:"#e30613",st:"#ffffff",s:"#e30613",c:"#111111",i:"#111111"}, TEL:{b:"#ffffff",s:"#ffffff",c:"#1c3f94",i:"#1c3f94"},
  EXC:{b:"#e30613",st:"#111111",s:"#111111",c:"#111111",i:"#ffffff"}, ADO:{b:"#00843d",s:"#ffd200",c:"#ffd200",i:"#ffd200"},
  CAM:{b:"#ffd200",s:"#005ca9",c:"#005ca9",i:"#005ca9"}, WIL:{b:"#e30613",st:"#ffffff",s:"#1c3f94",c:"#1c3f94",i:"#111111"}
};
// Keepersshirts: een felle effen kleur die afsteekt tegen het veldshirt van de club
const GK_KITS = {
  AJA:"#2b2b2b", AZ:"#7ed957", GRO:"#ff8a00", TWE:"#2b2b2b", UTR:"#00b46e", FEY:"#2b2b2b", FOR:"#3a9bdc", GAE:"#2b2b2b",
  NEC:"#ffd600", PEC:"#ff8a00", PSV:"#2b2b2b", HEE:"#ffd600", SPA:"#2b2b2b", TEL:"#ff6fa8", EXC:"#3a9bdc", ADO:"#2b2b2b",
  CAM:"#2b2b2b", WIL:"#ffd600"
};
function gkKit(club){
  const b = GK_KITS[club] || "#7ed957"; const dark = lum(b) < 0.45;
  return {b, s:b, c: dark ? "#ffffff" : "#111111", i: dark ? "#ffffff" : "#111111", gk:true};
}
function shirtSVG(p){
  const club = teamS(p.team);
  const k = p.pos===1 ? gkKit(club) : (KITS[club] || {b:COLORS[club]||"#888", s:COLORS[club]||"#888", c:"#ffffff", i:"#ffffff"});
  const name = String(p.web||"").toUpperCase();
  const num = (P[p.code] && P[p.code].num != null) ? P[p.code].num : null;
  const fs = name.length<=6 ? 28 : name.length<=9 ? 24 : name.length<=12 ? 19 : 16;
  const esc = t => t.replace(/[&<>"]/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
  const body = "M70 42 L56 92 L56 164 Q100 174 144 164 L144 92 L130 42 Q118 52 100 52 Q82 52 70 42Z";
  const id = "k"+Math.random().toString(36).slice(2,7);
  const stripes = k.st ? [64,88,112,136].map(x=>`<rect x="${x-6}" y="30" width="12" height="150" fill="${k.st}"/>`).join("") : "";
  const extra = (k.band ? `<rect x="82" y="30" width="36" height="150" fill="${k.band}"/>` : "") + (k.half ? `<rect x="100" y="30" width="50" height="150" fill="${k.half}"/>` : "");
  const busy = k.st || k.band || k.half;
  const outline = 'stroke="rgba(0,0,0,.22)" stroke-width="2.5" stroke-linejoin="round"';
  return `<svg class="shirt" viewBox="0 0 200 200" aria-hidden="true">
    <defs><radialGradient id="${id}g" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#a7f6ff" stop-opacity=".35"/><stop offset="1" stop-color="#00ff87" stop-opacity=".12"/></radialGradient>
      <clipPath id="${id}c"><path d="${body}"/></clipPath>
      <linearGradient id="${id}s" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient></defs>
    <circle cx="100" cy="100" r="96" fill="url(#${id}g)"/>
    ${k.gk ? `<path d="M70 42 L52 48 L12 104 L30 116 L56 92 Z" fill="${k.s}" ${outline}/><path d="M130 42 L148 48 L188 104 L170 116 L144 92 Z" fill="${k.s}" ${outline}/>`
           : `<path d="M70 42 L52 48 L22 72 L38 102 L56 92 Z" fill="${k.s}" ${outline}/><path d="M130 42 L148 48 L178 72 L162 102 L144 92 Z" fill="${k.s}" ${outline}/>`}
    ${k.gk ? `<path d="M14 106 L29 115" stroke="${k.c}" stroke-width="6" stroke-linecap="round"/><path d="M186 106 L171 115" stroke="${k.c}" stroke-width="6" stroke-linecap="round"/>`
           : `<path d="M24 76 L38 100" stroke="${k.c}" stroke-width="6" stroke-linecap="round"/><path d="M176 76 L162 100" stroke="${k.c}" stroke-width="6" stroke-linecap="round"/>`}
    <path d="${body}" fill="${k.b}"/>
    <g clip-path="url(#${id}c)">${stripes}${extra}<rect x="50" y="30" width="100" height="150" fill="url(#${id}s)"/></g>
    <path d="${body}" fill="none" ${outline}/>
    <path d="M70 42 Q82 52 100 52 Q118 52 130 42" fill="none" stroke="${k.c}" stroke-width="6" stroke-linecap="round"/>
    <g font-family="Plus Jakarta Sans,system-ui" font-weight="800" text-anchor="middle" fill="${k.i}" ${busy ? 'paint-order="stroke" stroke="'+(k.st||k.band||k.half? (k.i==="#111111"?"#ffffff":"#111111") : k.b)+'" stroke-width="5" stroke-linejoin="round"' : ""}>
      <text x="100" y="${(num!=null ? 80 : 112)+fs/3}" font-size="${num!=null ? Math.min(fs,22) : fs}" letter-spacing="1" ${name.length*Math.min(fs,num!=null?22:fs)*0.7>80 ? 'textLength="80" lengthAdjust="spacingAndGlyphs"' : ""}>${esc(name)}</text>
      ${num!=null ? `<text x="100" y="150" font-size="56" letter-spacing="-1">${num}</text>` : ""}
    </g>
  </svg>`;
}
function ballRain(n){
  const box = el("div",{class:"ballrain"});
  for(let i=0;i<n;i++){ const b=el("span",{},"⚽"); const size=18+Math.random()*26, dur=1.8+Math.random()*1.6, delay=Math.random()*1.2;
    b.style.cssText=`left:${Math.random()*100}vw;font-size:${size}px;animation-duration:${dur}s;animation-delay:${delay}s;--spin:${(Math.random()<.5?-1:1)*(360+Math.random()*540)}deg;--drift:${(Math.random()-.5)*80}px`;
    box.append(b); }
  document.body.append(box); setTimeout(()=>box.remove(),5200);
}
function confetti(){
  const c=document.createElement("canvas"); c.className="confetti"; document.body.appendChild(c);
  const ctx=c.getContext("2d"), dpr=window.devicePixelRatio||1, W=c.width=innerWidth*dpr, H=c.height=innerHeight*dpr;
  const cols=["#610f8a","#00ff87","#a7f6ff","#ec1846","#ffd600","#ffffff"];
  const Q=Array.from({length:180},()=>({x:W/2+(Math.random()-.5)*W*.3,y:H*.35,vx:(Math.random()-.5)*14*dpr,vy:(-Math.random()*16-6)*dpr,s:(5+Math.random()*7)*dpr,r:Math.random()*6,vr:(Math.random()-.5)*.4,c:cols[Math.floor(Math.random()*cols.length)]}));
  const t0=performance.now();
  (function f(now){ const t=now-t0; ctx.clearRect(0,0,W,H);
    for(const p of Q){ p.vy+=.45*dpr; p.vx*=.99; p.x+=p.vx; p.y+=p.vy; p.r+=p.vr; ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.globalAlpha=Math.max(0,1-t/3500); ctx.fillStyle=p.c; ctx.fillRect(-p.s/2,-p.s/4,p.s,p.s/2); ctx.restore(); }
    if(t<3500) requestAnimationFrame(f); else c.remove(); })(t0);
}
function celebrate(v){
  const a = v.answer, n = v.rows.length, first = n===1;
  const full = (P[a.code] && P[a.code].full) || a.web;
  const box = el("div",{class:"proud"});
  box.insertAdjacentHTML("beforeend", shirtSVG(a));
  box.append(el("div",{class:"eyebrow"}, first ? "In één keer!" : "Geraden in "+n+"/6"),
    el("h2",{}, first ? "Wat een kenner." : n<=3 ? "Goed geraden!" : n<6 ? "Netjes!" : "Op het nippertje!"),
    el("p",{}, "Het was ", el("b",{}, full), " (" + teamN(a.team) + ")."),
    el("p",{class:"managore"}, "Jij bent een echte managore ", el("span",{style:"white-space:nowrap"},"fantasia 🧙‍♂️")),
    el("div",{class:"pts num"}, (v.practice ? "Oefenronde" : "+"+v.points+" ptn")),
    el("div",{class:"row"}, !v.practice ? el("button",{class:"btn",onclick:()=>copyShare(v)},"📤 Deel resultaat") : null, el("button",{class:"btn ghost",onclick:releaseHold},"Dank je")));
  openModal(box, false);
  const bx = document.querySelector(".modal .box"); if(bx) bx.classList.add("pop");
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  ballRain(first ? 40 : 26);
  if(first) confetti();
}

/* ---------- poules ---------- */
const leagueName = code => ((S.leagues.find(l=>l.code===code))||{}).name || ("Poule "+code);
const INVITE_BASE = SITE.url;
async function createLeague(name){
  name = name.trim().slice(0,30);
  if(!name){ toast("Geef je poule een naam"); return; }
  if(!S.id){ askName(); return; }
  try{ const code = await rpc("dn_create_league", {...auth(), p_name:name}); await refresh(); S.scope = code; S.tab = "board"; render(); loadBoard(); showInvite(code); }
  catch(e){ toast(errText(e)); }
}
async function joinLeague(raw){
  const code = String(raw||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(code.length!==6){ toast("Een poulecode heeft 6 tekens"); return; }
  if(!S.id){ askName(); return; }
  try{ const name = await rpc("dn_join_league", {...auth(), p_code:code}); await refresh(); S.scope = code; S.tab = "board"; render(); loadBoard(); toast("Je zit nu in "+name); }
  catch(e){ toast(errText(e)); }
}
function leaveLeague(code){
  openModal(el("div",{}, el("h2",{text:"Poule verlaten?"}),
    el("p",{class:"note",style:"margin-bottom:14px"},"Je verdwijnt uit de stand van "+leagueName(code)+". Je punten blijven bewaard en met de code kun je altijd terugkomen."),
    el("div",{class:"row"}, el("button",{class:"btn",onclick:async()=>{ closeModal(); try{ await rpc("dn_leave_league", {...auth(), p_code:code}); await refresh(); S.scope=null; S.rows=null; render(); loadBoard(); toast("Poule verlaten"); }catch(e){ toast(errText(e)); } }},"Verlaten"),
      el("button",{class:"btn ghost",onclick:closeModal},"Blijven"))), false);
}
function inviteText(code){ return "Doe mee met mijn poule “"+leagueName(code)+"” in "+BRAND+", "+TAGLINE+"! Poulecode: "+code+"\n"+INVITE_BASE+"#poule-"+code; }
function showInvite(code){
  openModal(el("div",{}, el("h2",{text:"Nodig je vrienden uit"}),
    el("p",{class:"note",style:"margin-bottom:12px"},"Stuur de link of de code naar je vrienden. Zodra ze meedoen, zien jullie samen de stand van "+leagueName(code)+"."),
    el("div",{class:"bigcode num"}, code),
    el("div",{class:"row",style:"margin-top:14px"}, el("button",{class:"btn",onclick:()=>copyText(inviteText(code))},"Kopieer uitnodiging"))));
}
async function handlePendingJoin(){
  if(!S.pendingJoin || !S.id || !S.me) return;
  const code = S.pendingJoin; S.pendingJoin = null;
  try{ history.replaceState(null,"",location.pathname+location.search); }catch(e){}
  if(S.leagues.some(l=>l.code===code)){ S.scope=code; S.tab="board"; render(); loadBoard(); return; }
  let name = null; try{ name = await rpc("dn_league_name", {p_code:code}); }catch(e){}
  if(!name){ toast("Poule "+code+" niet gevonden"); return; }
  openModal(el("div",{}, el("h2",{text:"Je bent uitgenodigd!"}),
    el("p",{class:"note",style:"margin-bottom:14px"},"Doe mee met poule “"+name+"” en vergelijk elke dag je score met je vrienden."),
    el("div",{class:"row"}, el("button",{class:"btn",onclick:()=>{ closeModal(); joinLeague(code); }},"Doe mee"), el("button",{class:"btn ghost",onclick:closeModal},"Nee, bedankt"))), false);
}

/* ---------- klassement ---------- */
async function loadBoard(){
  if(!API || !S.id) return;
  const scope = S.scope;
  if(!scope || scope==="+new") return;
  S.boardLoading = true;
  try{
    const r = await rpc("dn_board", {...auth(), p_scope: scope});
    if(scope===S.scope){ S.rows = r || []; S.boardErr = null; }
  }catch(e){ if(/niet in deze poule/.test(errText(e))){ S.scope=null; } S.boardErr = "Het klassement kan nu niet worden geladen."; }
  S.boardLoading = false;
  if(S.tab==="board") render();
}
function renderBoard(){
  const box = el("div");
  // Alleen poule-klassementen: zonder poule is er geen ranglijst
  if(S.scope !== "+new" && !S.leagues.some(l=>l.code===S.scope)){ S.scope = S.leagues.length ? S.leagues[S.leagues.length-1].code : null; S.rows = null; }
  if(!S.scope || S.scope==="+new"){
    if(S.leagues.length) box.append(leagueChips());
    box.append(pouleForm(!S.leagues.length));
    return box;
  }
  box.append(leagueChips());
  const panel = el("div",{class:"panel",style:"padding:12px 12px 14px"});
  box.append(panel);
  panel.append(el("h3",{class:"ptitle"}, leagueName(S.scope)));
  if(!S.rows){ panel.append(el("p",{class:"note",style:"padding:6px 0"}, S.boardErr || "Klassement laden…")); if(!S.boardLoading) loadBoard(); return box; }

  const myDone = !!(S.srv && S.srv.done);
  if(S.rows.length < 2) panel.append(el("div",{class:"notice"},"Je bent nog de enige. Deel de uitnodiging in je groepsapp, dan verschijnen je vrienden hier."));
  if(!myDone) panel.append(el("div",{class:"notice"},"Speel eerst de puzzel van vandaag. Daarna zie je hoe de rest het deed."));

  // weekwinnaar van vorige week
  const lw = Math.max(0, ...S.rows.map(r=>r.last_week_points||0));
  if(lw>0){
    const winners = S.rows.filter(r=>r.last_week_points===lw).map(r=>r.name);
    panel.append(el("div",{class:"winner"}, el("span",{class:"cup"},"🏆"), el("div",{}, el("b",{},"Weekwinnaar vorige week"), el("span",{}, winners.join(" & ")+" · "+lw+" ptn"))));
    panel.append(el("div",{class:"row",style:"margin:-4px 0 12px"}, el("button",{class:"btn ghost",onclick:()=>shareWeek(S.scope)},"🏆 Deel de weekuitslag")));
  }

  const tab = S.board==="total" ? "total" : "week";
  panel.append(el("div",{style:"text-align:center"}, el("div",{class:"seg"},
    [["week","Deze week"],["total","Totaal"]].map(([k,t])=>el("button",{class:tab===k?"on":"", onclick:()=>{ S.board=k; ls.set("dnl:boardtab",k); render(); }},t)))));
  const today = new Intl.DateTimeFormat("nl-NL",{timeZone:TZ, weekday:"short", day:"numeric", month:"short"}).format(new Date());
  panel.append(el("p",{class:"pool-sub"}, tab==="total" ? "Totaalstand · sinds de start" : "Weekstand · vandaag "+today));

  const key = tab==="total" ? "season_points" : "week_points";
  const rows = S.rows.slice().sort((a,b)=>(b[key]||0)-(a[key]||0) || b.streak-a.streak || String(a.name).localeCompare(String(b.name),"nl"));
  let rank=0, prev=null; rows.forEach((r,i)=>{ if(r[key]!==prev){ rank=i+1; prev=r[key]; } r.pos=rank; });
  const t = el("table",{class:"board"}, el("thead",{}, el("tr",{}, el("th",{}), el("th",{},"Speler"), el("th",{},"Vandaag"), el("th",{class:"r"},"Reeks"), el("th",{class:"r"},"Ptn"))));
  const tb = el("tbody");
  rows.forEach(r=>{
    const val = r[key]||0, medal = val>0 && r.pos<=3 ? ["🥇","🥈","🥉"][r.pos-1] : null;
    let td;
    if(!r.today_played) td = el("span",{class:"td wait"},"nog niet");
    else if(r.today_n==null) td = el("span",{class:"td",title:"Speel eerst zelf"},"🔒 gespeeld");
    else if(r.today_won) td = el("span",{class:"td"},"🟩 "+r.today_n+"/6");
    else if(r.today_gave_up) td = el("span",{class:"td"},"🏳️ opgegeven");
    else td = el("span",{class:"td"},"❌ niet geraden");
    tb.append(el("tr",{class:r.is_me?"me":""},
      el("td",{class:"pos num"+(medal?" medal":"")}, medal || String(r.pos)),
      el("td",{class:"nm"}, String(r.name), r.cups>0 ? el("span",{class:"cups",title:r.cups+" keer weekwinnaar"},"🏆"+(r.cups>1?"×"+r.cups:"")) : null, r.is_me ? el("small",{}," (jij)") : null),
      el("td",{}, td),
      el("td",{class:"r num"}, r.streak>0 ? "🔥 "+r.streak : "–"),
      el("td",{class:"r pts num"}, String(val))));
  });
  t.append(tb); panel.append(t);
  panel.append(el("p",{class:"note",style:"margin-top:10px"},"Punten: 60 bij de eerste gok, dan 50, 40… tot 10 bij de zesde; elke hintstap kost 5. Niet geraden of opgegeven is 0. De weekstand begint elke maandag opnieuw; het totaal telt door. Wie een week wint, krijgt een 🏆 die blijft staan. Bij een gelijke stand krijgen beide winnaars er een."));
  panel.append(el("div",{class:"row",style:"margin-top:12px"}, el("button",{class:"btn",onclick:()=>shareInvite(S.scope)},"Nodig vrienden uit")));
  const lv = el("button",{class:"mini"+(S.confirmLeave?" confirm":""), onclick:()=>{
    if(!S.confirmLeave){ S.confirmLeave = true; render(); clearTimeout(S.clT); S.clT = setTimeout(()=>{ S.confirmLeave=false; render(); }, 5000); return; }
    S.confirmLeave = false; doLeave(S.scope); }}, S.confirmLeave ? "Zeker? Tik nog een keer" : "Verlaat poule");
  panel.append(el("div",{class:"pool-foot"}, el("span",{class:"note"}, "Code ", el("b",{class:"num"},S.scope), S.me ? " · jij bent "+S.me.name : ""), lv));
  return box;
}
function leagueChips(){
  const pick = s => { if(S.scope!==s){ S.scope=s; S.rows=null; render(); loadBoard(); } };
  return el("div",{class:"chips"},
    S.leagues.map(l=>el("button",{class:S.scope===l.code?"on":"", onclick:()=>pick(l.code)}, l.name)),
    el("button",{class:"add"+(S.scope==="+new"?" on":""), onclick:()=>{ S.scope="+new"; render(); }},"＋ Poule"));
}
// Weekuitslag van vorige week (ma–zo) als tekst voor de groepsapp: top 3, gelijke stand = zelfde plek
function weekText(code){
  const d = dayIndex(S.today), start = d - ((d+5)%7) - 7;
  const fmt = n => new Intl.DateTimeFormat("nl-NL",{timeZone:"UTC", day:"numeric", month:"short"}).format(new Date(dms(START) + n*DAY)).replace(".","");
  const rows = (S.rows||[]).filter(r=>(r.last_week_points||0)>0).sort((a,b)=>b.last_week_points-a.last_week_points || String(a.name).localeCompare(String(b.name),"nl"));
  const lines = []; let rank=0, prev=null;
  rows.forEach((r,i)=>{ if(r.last_week_points!==prev){ rank=i+1; prev=r.last_week_points; } if(rank<=3) lines.push(["🥇","🥈","🥉"][rank-1]+" "+r.name+" · "+r.last_week_points+" ptn"); });
  return "🏆 Weekuitslag "+leagueName(code)+" ("+fmt(start)+" – "+fmt(start+6)+")\n"+lines.join("\n")+"\n\n"+BRAND+", "+TAGLINE+"\n"+SITE.url;
}
async function shareWeek(code){
  const text = weekText(code);
  if(navigator.share){ try{ await navigator.share({title:"Weekuitslag", text}); return; }catch(e){ if(e.name==="AbortError") return; } }
  copyText(text);
}
async function shareInvite(code){
  const text = inviteText(code);
  if(navigator.share){ try{ await navigator.share({title:BRAND, text}); return; }catch(e){ if(e.name==="AbortError") return; } }
  copyText(text);
}
async function doLeave(code){
  try{ await rpc("dn_leave_league", {...auth(), p_code:code}); await refresh(); S.scope=null; S.rows=null; render(); loadBoard(); toast("Je hebt de poule verlaten"); }
  catch(e){ toast(errText(e)); }
}
function pouleForm(first){
  const nameIn = el("input",{placeholder:"Naam, bijv. De Kantine", maxlength:30});
  const codeIn = el("input",{placeholder:"Code, bijv. K7P2QX", maxlength:6, autocapitalize:"characters"});
  const mk = () => createLeague(nameIn.value), jn = () => joinLeague(codeIn.value);
  nameIn.addEventListener("keydown",e=>{ if(e.key==="Enter") mk(); });
  codeIn.addEventListener("keydown",e=>{ if(e.key==="Enter") jn(); });
  const intro = !API || !S.id ? (!API ? "Het klassement is nog niet gekoppeld." : "Kies eerst een managernaam.")
    : first ? "Het klassement is er per poule. Maak een poule en deel de code met je vrienden, of doe mee met de code die je kreeg. Dan zien jullie de onderlinge stand per dag, week en seizoen, met weekbekers 🏆."
    : "Nog een poule maken of erbij? Je kunt in meerdere poules tegelijk zitten.";
  return el("div",{class:"panel"}, el("h3",{}, first ? "Klassement" : "Nog een poule"),
    el("p",{class:"note",style:"margin-bottom:12px"}, intro),
    el("div",{class:"lbl2"},"Nieuwe poule"),
    el("div",{class:"field",style:"margin-bottom:12px"}, nameIn, el("button",{class:"btn",onclick:mk},"Maak aan")),
    el("div",{class:"lbl2"},"Doe mee met een poule"),
    el("div",{class:"field"}, codeIn, el("button",{class:"btn ghost",onclick:jn},"Doe mee")));
}

/* ---------- profiel-tab ---------- */
function renderMe(){
  const box = el("div");
  const s = (S.srv && S.srv.stats) || {played:0,won:0,streak:0,best:0};
  const pct = s.played ? Math.round(100*s.won/s.played) : 0;
  box.append(el("div",{class:"panel"}, el("h3",{},"Jouw statistieken"),
    el("div",{class:"stats",style:"margin:0"}, [["Gespeeld",s.played],["Gewonnen",pct+"%"],["Reeks",s.streak],["Beste",s.best]].map(([t,val])=>el("div",{style:"text-align:center"},el("b",{class:"num"},String(val)),el("span",{},t)))),
    s.dist && s.dist.some(x=>x>0) ? el("h3",{style:"margin-top:14px"},"Gokverdeling") : null,
    distBars(s.dist, -1)));
  if(S.me){
    const inp = el("input",{value:S.me.name||"", maxlength:24, placeholder:"Managernaam"});
    const save = () => rename(inp.value);
    inp.addEventListener("keydown",e=>{ if(e.key==="Enter") save(); });
    box.append(el("div",{class:"panel"}, el("h3",{},"Managernaam"), el("div",{class:"field"}, inp, el("button",{class:"btn",onclick:save},"Opslaan")),
      el("p",{class:"note",style:"margin-top:8px"},"Je nummer #"+S.me.tag+" blijft hetzelfde.")));
    box.append(el("div",{class:"panel"}, el("h3",{},"Herstelcode"),
      el("p",{class:"note",style:"margin-bottom:10px"},"Nieuwe telefoon of browser? Met deze code haal je je profiel, punten en poules terug. Bewaar hem goed, bijvoorbeeld in je notities, en deel hem met niemand."),
      el("div",{class:"bigcode num",style:"font-size:24px"}, fmtRec(S.me.recovery)),
      el("div",{class:"row",style:"margin-top:12px"}, el("button",{class:"btn",onclick:()=>copyText(fmtRec(S.me.recovery))},"Kopieer herstelcode"))));
  } else if(API){
    box.append(el("div",{class:"panel"}, el("h3",{},"Profiel"), el("div",{class:"row"}, el("button",{class:"btn",onclick:askName},"Kies een managernaam"), el("button",{class:"btn ghost",onclick:askRestore},"Profiel herstellen"))));
  }
  if(S.me) box.append(el("p",{class:"note",style:"text-align:center;margin-bottom:12px"}, "Ander profiel terugzetten? ", el("button",{class:"linkbtn",onclick:askRestore},"Profiel herstellen met een herstelcode")));
  box.append(el("div",{class:"panel"}, howTo()));
  box.append(el("div",{class:"row",style:"margin:6px 0 14px"}, el("button",{class:"btn ghost",onclick:startPractice},"Speel een oefenronde")));
  box.append(el("div",{class:"panel"}, el("h3",{},"Op je beginscherm"), el("p",{class:"note"},"Zet "+BRAND+" als app op je telefoon. iPhone: open de site in Safari, tik op de deel-knop en kies ‘Zet op beginscherm’. Android: open het menu in Chrome en kies ‘App installeren’.")));
  box.append(el("p",{class:"note",style:"text-align:center"},"Speldata: Eredivisie na speelronde "+gwNow()+" (bijgewerkt "+String(DATA.updated).slice(0,10)+"). Niet gelieerd aan de Eredivisie, ESPN of de clubs."));
  return box;
}

/* ---------- boot ---------- */
document.querySelectorAll("nav button").forEach(b=>b.addEventListener("click",()=>{ S.tab=b.dataset.tab; render(); if(S.tab==="board") loadBoard(); }));
window.addEventListener("hashchange",()=>{ const m = location.hash.match(/^#poule-([A-Za-z0-9]{6})$/); if(m){ S.pendingJoin = m[1].toUpperCase(); handlePendingJoin(); } });
$("#helpBtn").addEventListener("click",()=>openModal(howTo()));
function syncThemeLbl(){ $("#themeBtn").setAttribute("aria-label", document.documentElement.dataset.theme==="dark" ? "Dagmodus" : "Nachtmodus"); }
$("#themeBtn").addEventListener("click",()=>{ const t = document.documentElement.dataset.theme==="dark" ? "light" : "dark"; document.documentElement.dataset.theme=t; try{ localStorage.setItem("dnl:theme",t); }catch(e){} syncThemeLbl(); });
syncThemeLbl();
setInterval(()=>{ if(dayStr()!==S.today){ S.today=dayStr(); S.mode="daily"; S.rows=null; refresh().then(maybeYesterday); } }, 30000);
document.addEventListener("visibilitychange",()=>{ if(!document.hidden && dayStr()!==S.today){ S.today=dayStr(); refresh().then(maybeYesterday); } });
/* ---------- advertenties ----------
   Uit tot je ze in config.js aanzet. Met Google AdSense toont Google zelf de toestemmingsmelding
   (Privacy & messaging, een door Google gecertificeerde CMP); zet die in AdSense aan vóór je live gaat.
   Advertenties staan in vaste plekken buiten #view, zodat ze niet bij elke klik opnieuw laden. */
function initAds(){
  const A = CFG.ads || {};
  const slots = [["ad-bottom", A.slots && A.slots.bottom]];
  if(A.placeholder){ for(const [id] of slots){ const e = $("#"+id); if(e){ e.classList.remove("hide"); e.classList.add("placeholder"); e.textContent = "Advertentie"; } } return; }
  if(!A.enabled || !A.client) return;
  const sc = document.createElement("script");
  sc.async = true; sc.crossOrigin = "anonymous";
  sc.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client="+encodeURIComponent(A.client);
  document.head.append(sc);
  for(const [id, slot] of slots){
    const box = $("#"+id); if(!box || !slot) continue;
    box.classList.remove("hide");
    box.append(el("ins",{class:"adsbygoogle", style:"display:block", "data-ad-client":A.client, "data-ad-slot":slot, "data-ad-format":"auto", "data-full-width-responsive":"true"}));
    try{ (window.adsbygoogle = window.adsbygoogle || []).push({}); }catch(e){}
  }
}
initAds();
boot();
if("serviceWorker" in navigator) window.addEventListener("load", ()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
