// Morning App: every screen of the app and web page. Plain JavaScript, no build step.
// Screens: Morning (routine, journal, gratitude), Tasks (pick 3 MITs and 10 LITs), Plan (output, steps, time blocks),
// Evening (habits, MIT results, ratings), Stats, Settings. Everything is saved straight away through /api/.
"use strict";

const app = document.getElementById("app");
const S = { tab: "morning", date: localDate(new Date()), day: null, tasks: [], search: "", settings: null, stats: null };

function localDate(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return localDate(d);
}
function niceDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function hhmm(t) { return t ? String(t).slice(0, 5) : ""; }

let toastTimer;
function toast(msg, error) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  el.setAttribute("role", error ? "alert" : "status");
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), error ? 4500 : 1800);
}

async function api(path, body) {
  const opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  let r;
  try {
    r = await fetch(path, Object.assign({ credentials: "include", cache: "no-store" }, opt));
  } catch (e) {
    toast("Can't reach the app. Check your connection.", true);
    throw e;
  }
  let data = {};
  try { data = await r.json(); } catch (e) { /* a sign-in page, not JSON */ }
  if (!r.ok) {
    toast(data.error || (r.status === 403 ? "Please sign in again." : "Something went wrong."), true);
    throw new Error(data.error || r.status);
  }
  return data;
}
const save = (path, body) => api(path, Object.assign({ date: S.date }, body));

async function loadDay() { S.day = await api("/api/day?date=" + S.date); }
async function loadTasks() { S.tasks = (await api("/api/tasks?q=" + encodeURIComponent(S.search))).tasks; }

// ---- shared bits -------------------------------------------------------------------------------------
const ICON = {
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15.1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6V4.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

function header(eyebrow, title) {
  const isToday = S.date === localDate(new Date());
  return `<div class="top">
    <div class="datebar">
      <button class="icon-btn" data-act="day" data-n="-1" aria-label="Previous day">${ICON.prev}</button>
      <div><div class="eyebrow">${esc(eyebrow || (isToday ? "Today · " : "") + niceDate(S.date))}</div><h1>${esc(title)}</h1></div>
    </div>
    <div class="row">
      ${isToday ? "" : `<button class="icon-btn" data-act="today" aria-label="Back to today">${ICON.next}</button>`}
      <a class="icon-btn" href="#settings" aria-label="Settings">${ICON.gear}</a>
    </div>
  </div>`;
}
const check = (on, label, act, attrs = "") =>
  `<button type="button" class="check" aria-pressed="${on ? "true" : "false"}" data-act="${act}" ${attrs}><span class="box"></span><span class="grow">${esc(label)}</span></button>`;
const byslot = slot => (S.day?.tasks || []).filter(t => t.slot === slot);

// ---- Morning -----------------------------------------------------------------------------------------
function viewMorning() {
  const d = S.day;
  const done = d.routine.filter(r => r.done).length;
  const grat = n => (d.gratitude.find(g => g.position === n) || {}).statement || "";
  return `${header(null, "Good morning")}
  <section class="card">
    <div class="card-head"><h2>Morning routine</h2><span class="muted">${done} of ${d.routine.length}</span></div>
    ${d.routine.map(r => check(r.done, r.name, "routine", `data-id="${r.id}"`)).join("") || '<div class="empty">Add routine items in Settings.</div>'}
  </section>
  <section class="card">
    <h2>Journal</h2>
    <label class="lbl" for="journal">What would make today great? Tap the microphone on your keyboard to speak.</label>
    <textarea id="journal" placeholder="Write or speak here"></textarea>
    <button class="btn green" data-act="journal">Save entry</button>
    ${d.journal.map(j => `<div class="row" style="align-items:flex-start"><div class="grow" style="white-space:pre-wrap">${esc(j.transcript)}</div>
      <button class="icon-btn" data-act="journal-del" data-id="${j.id}" aria-label="Delete entry">${ICON.x}</button></div>`).join("")}
  </section>
  <section class="card">
    <div class="card-head"><h2>Grateful for</h2><span class="muted">Photos from OneDrive come next</span></div>
    ${[1, 2, 3, 4].map(n => `<label class="lbl" for="g${n}">${n}.</label>
      <input type="text" id="g${n}" data-act="gratitude" data-n="${n}" value="${esc(grat(n))}" placeholder="I'm grateful for…">`).join("")}
  </section>
  <a class="btn primary" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="#tasks">Next: choose today's tasks</a>`;
}

// ---- Tasks -------------------------------------------------------------------------------------------
function counter(slot) {
  const n = byslot(slot).length, max = S.day.limits[slot];
  return `<div class="counter ${slot.toLowerCase()}">
    <div class="card-head"><strong style="font-family:Outfit">${slot}</strong><strong>${n} / ${max}</strong></div>
    <div class="bars" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<span class="${i < n ? "on" : ""}"></span>`).join("")}</div>
    <div class="small">${slot === "MIT" ? "Most Important" : "Less Important"}${n >= max ? " · full, swap one to add" : ""}</div>
  </div>`;
}
function pickedRow(t) {
  const other = t.slot === "MIT" ? "LIT" : "MIT";
  return `<div class="task"><span class="tag ${t.slot.toLowerCase()}">${t.slot === "ALSO" ? "Also" : t.slot}</span>
    <div class="grow">${esc(t.title_snapshot)}${t.carried_from_id ? '<div class="meta carried">Carried over</div>' : ""}</div>
    ${t.slot !== "ALSO" ? `<button class="btn small" data-act="move" data-id="${t.id}" data-slot="${other}">To ${other}</button>` : ""}
    <button class="icon-btn" data-act="unpick" data-id="${t.id}" aria-label="Remove from today">${ICON.x}</button></div>`;
}
function viewTasks() {
  const d = S.day;
  const picked = new Set(d.tasks.map(t => t.task_id).filter(Boolean));
  const full = s => byslot(s).length >= d.limits[s];
  return `${header(null, "Choose today's tasks")}
  <div class="counters">${counter("MIT")}${counter("LIT")}</div>
  ${d.tasks.length ? `<section class="card"><h2>Today</h2>${["MIT", "LIT", "ALSO"].flatMap(byslot).map(pickedRow).join("")}</section>` : ""}
  ${d.carry.length ? `<section class="card"><div class="card-head"><h2>Carried over</h2><span class="muted">Not finished last time</span></div>
    ${d.carry.map(c => `<div class="task"><div class="grow">${esc(c.title_snapshot)}<div class="meta carried">Was ${c.slot}${c.status === "partly" ? ", partly done" : ""}</div></div>
      <button class="pill mit" data-act="carry" data-id="${c.id}" data-slot="MIT" ${full("MIT") ? "disabled" : ""}>MIT</button>
      <button class="pill lit" data-act="carry" data-id="${c.id}" data-slot="LIT" ${full("LIT") ? "disabled" : ""}>LIT</button></div>`).join("")}</section>` : ""}
  <section class="card">
    <div class="card-head"><h2>Task list</h2><span class="muted">Local for now</span></div>
    <label class="sr" for="q">Search tasks</label>
    <input type="search" id="q" placeholder="Search tasks" value="${esc(S.search)}" data-act="search">
    <form class="row" data-act="add-task"><label class="sr" for="newtask">New task</label>
      <input type="text" id="newtask" class="grow" placeholder="Add a task" autocomplete="off"><button class="btn">Add</button></form>
    ${S.tasks.filter(t => !picked.has(t.id)).map(t => `<div class="task" style="padding-left:2px">
      <div class="grow">${esc(t.title)}<div class="meta">${esc([t.project, t.due_date && "due " + t.due_date].filter(Boolean).join(" · "))}</div></div>
      <button class="pill mit" data-act="pick" data-id="${t.id}" data-slot="MIT" ${full("MIT") ? "disabled" : ""}>MIT</button>
      <button class="pill lit" data-act="pick" data-id="${t.id}" data-slot="LIT" ${full("LIT") ? "disabled" : ""}>LIT</button>
      <button class="pill also" data-act="pick" data-id="${t.id}" data-slot="ALSO" aria-label="Also on today">+</button></div>`).join("") || '<div class="empty">No open tasks. Add one above.</div>'}
  </section>
  <a class="btn primary" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="#plan">Next: plan my MITs</a>`;
}

// ---- Plan --------------------------------------------------------------------------------------------
function viewPlan() {
  const mits = byslot("MIT");
  const plan = S.day.plan || {};
  return `${header(null, "Plan the output")}
  ${mits.map((t, i) => `<section class="card" data-task="${t.id}">
    <div class="row"><span class="tag">MIT ${i + 1}</span><strong class="grow">${esc(t.title_snapshot)}</strong></div>
    <label class="lbl" for="goal${t.id}">What will this produce?</label>
    <input type="text" id="goal${t.id}" data-act="goal" data-id="${t.id}" value="${esc(t.output_goal)}" placeholder="e.g. quote sent to supplier">
    <label class="lbl" for="steps${t.id}">Steps, one per line</label>
    <textarea id="steps${t.id}" data-act="steps" data-id="${t.id}" style="min-height:80px">${esc(t.steps.map(s => s.text).join("\n"))}</textarea>
    <div class="row">
      <div class="grow"><label class="lbl" for="s${t.id}">Start</label><input type="time" id="s${t.id}" data-act="block" data-id="${t.id}" value="${hhmm(t.starts_at)}"></div>
      <div class="grow"><label class="lbl" for="e${t.id}">End</label><input type="time" id="e${t.id}" data-act="block" data-id="${t.id}" value="${hhmm(t.ends_at)}"></div>
    </div>
  </section>`).join("") || '<section class="card"><div class="empty">No MITs yet. Pick up to 3 on the Tasks screen.</div><a href="#tasks">Choose tasks</a></section>'}
  <p class="muted" style="margin:0">Time blocks are kept here for now. Adding them to your Outlook calendar comes with the Microsoft connection.</p>
  <button class="btn primary" data-act="confirm">${plan.confirmed_at ? "Plan confirmed · confirm again" : "Confirm today's plan"}</button>
  <a class="btn" style="display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none" href="/report.html?date=${S.date}" target="_blank" rel="noopener">${ICON.print}<span>Print day report</span></a>`;
}

// ---- Evening -----------------------------------------------------------------------------------------
function viewEvening() {
  const d = S.day, p = d.plan || {};
  const kept = d.habits.filter(h => h.met).length;
  const habitRow = h => h.kind === "number"
    ? `<div class="row" style="min-height:48px"><span class="box${h.met ? " on" : ""}" aria-hidden="true"></span>
        <label class="grow" for="h${h.id}">${esc(h.name)}${h.target != null ? ` <span class="muted">(target ${esc(h.target)} ${esc(h.unit || "")})</span>` : ""}</label>
        <input type="number" inputmode="decimal" id="h${h.id}" style="width:110px" data-act="habit-num" data-id="${h.id}" value="${h.value ?? ""}" placeholder="${esc(h.unit || "")}"></div>`
    : check(h.met, h.name, "habit", `data-id="${h.id}"`);
  const status = (t, s, label) => `<button type="button" class="${s}" aria-pressed="${t.status === s}" data-act="status" data-id="${t.id}" data-status="${s}">${label}</button>`;
  const rate = k => `<div class="row"><span style="width:64px" class="muted" id="r${k}">${k[0].toUpperCase() + k.slice(1)}</span>
    <div class="rate grow" role="group" aria-labelledby="r${k}">${[1, 2, 3, 4, 5].map(n => `<button type="button" aria-pressed="${p[k] === n}" data-act="rate" data-k="${k}" data-n="${n}">${n}</button>`).join("")}</div></div>`;
  return `${header(null, "How did today go?")}
  <section class="card">
    <div class="card-head"><h2>Habits honoured</h2><span class="muted">${kept} of ${d.habits.length}</span></div>
    ${d.habits.map(habitRow).join("") || '<div class="empty">Add habits in Settings.</div>'}
  </section>
  <section class="card"><h2>MITs</h2>
    ${byslot("MIT").map(t => `<div style="display:flex;flex-direction:column;gap:6px"><span>${esc(t.title_snapshot)}</span>
      <div class="seg">${status(t, "done", "Done")}${status(t, "partly", "Partly")}${status(t, "not_done", "Not done")}</div></div>`).join("") || '<div class="empty">No MITs today.</div>'}
  </section>
  ${byslot("LIT").length ? `<section class="card"><h2>LITs</h2>${byslot("LIT").map(t => check(t.status === "done", t.title_snapshot, "lit", `data-id="${t.id}"`)).join("")}</section>` : ""}
  <section class="card"><h2>Rate the day</h2>${["energy", "focus", "mood", "sleep"].map(rate).join("")}
    <label class="lbl" for="note">Best thing today, or what you'd change</label>
    <textarea id="note" style="min-height:72px">${esc(p.review_note)}</textarea>
  </section>
  <button class="btn primary" data-act="review">${p.reviewed_at ? "Review saved · save again" : "Save review"}</button>`;
}

// ---- Stats -------------------------------------------------------------------------------------------
function viewStats() {
  const st = S.stats;
  if (!st) return header("Last 30 days", "Stats") + '<div class="empty">Loading…</div>';
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "–");
  const days = st.daily.filter(r => r.mits_planned);
  const planned = days.reduce((a, r) => a + r.mits_planned, 0), doneM = days.reduce((a, r) => a + r.mits_done, 0);
  return `${header("Last " + st.days + " days", "Stats")}
  <section class="card"><h2>Habits</h2><div class="scroll"><table class="stats">
    <thead><tr><th>Habit</th><th>Kept</th><th>Days logged</th><th>Streak</th></tr></thead>
    <tbody>${st.habits.map(h => `<tr><td>${esc(h.name)}</td><td>${pct(h.kept, h.logged)}</td><td>${h.logged}</td><td>${h.streak}</td></tr>`).join("")}</tbody>
  </table></div></section>
  <section class="card"><h2>MITs</h2><div>${doneM} of ${planned} MITs done (${pct(doneM, planned)}) across ${days.length} planned days.</div></section>
  <section class="card"><h2>Day by day</h2><div class="scroll"><table class="stats">
    <thead><tr><th>Date</th><th>MITs done</th><th>LITs done</th><th>Habits kept</th><th>Energy</th><th>Focus</th></tr></thead>
    <tbody>${st.daily.slice().reverse().map(r => `<tr><td>${esc(r.plan_date)}</td><td>${r.mits_done} / ${r.mits_planned}</td><td>${r.lits_done} / ${r.lits_planned}</td>
      <td>${r.habits_kept} / ${r.habits_logged}</td><td>${r.energy ?? "–"}</td><td>${r.focus ?? "–"}</td></tr>`).join("") || '<tr><td colspan="6" class="empty">Nothing recorded yet.</td></tr>'}</tbody>
  </table></div></section>`;
}

// ---- Settings ----------------------------------------------------------------------------------------
function viewSettings() {
  const st = S.settings;
  if (!st) return header("Set up once", "Settings") + '<div class="empty">Loading…</div>';
  const dayNames = ["M", "T", "W", "T", "F", "S", "S"];
  const habit = h => `<form class="card" data-act="save-habit" data-id="${h.id || ""}" style="gap:8px">
    <label class="lbl" for="hn${h.id || "new"}">${h.id ? "Habit" : "New habit"}</label>
    <input type="text" id="hn${h.id || "new"}" name="name" value="${esc(h.name)}" placeholder="e.g. No sugar" required>
    <div class="row">
      <select name="kind" aria-label="Kind" class="grow"><option value="yes_no" ${h.kind !== "number" ? "selected" : ""}>Tick</option><option value="number" ${h.kind === "number" ? "selected" : ""}>Number</option></select>
      <input type="number" name="target" aria-label="Target" step="any" style="width:100px" value="${h.target ?? ""}" placeholder="Target">
      <input type="text" name="unit" aria-label="Unit" style="width:80px" value="${esc(h.unit)}" placeholder="Unit">
    </div>
    <div class="row" role="group" aria-label="Days it applies">${dayNames.map((n, i) => `<label class="small" style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <input type="checkbox" name="d${i + 1}" ${(h.days_of_week || "1234567").includes(String(i + 1)) ? "checked" : ""}>${n}</label>`).join("")}
      <span class="grow"></span>
      <input type="number" name="sort_order" aria-label="Order" style="width:70px" value="${h.sort_order ?? 0}">
    </div>
    <div class="row">${h.id ? `<label class="small row"><input type="checkbox" name="archived" ${h.archived_at ? "checked" : ""}> Archived</label>` : ""}<span class="grow"></span><button class="btn">${h.id ? "Save" : "Add habit"}</button></div>
  </form>`;
  const routine = r => `<form class="row" data-act="save-routine" data-id="${r.id || ""}">
    <label class="sr" for="rn${r.id || "new"}">Routine item</label>
    <input type="text" id="rn${r.id || "new"}" name="name" class="grow" value="${esc(r.name)}" placeholder="New routine item" required>
    <input type="number" name="sort_order" aria-label="Order" style="width:56px;padding:8px" value="${r.sort_order ?? 0}">
    ${r.id ? `<label class="small" style="display:flex;align-items:center;gap:4px"><input type="checkbox" name="archived" ${r.archived_at ? "checked" : ""}>Off</label>` : ""}
    <button class="btn">${r.id ? "Save" : "Add"}</button></form>`;
  return `${header("Set up once", "Settings")}
  <section class="card"><h2>Morning routine</h2>${st.routine.map(routine).join("")}${routine({})}</section>
  <h2 style="margin-top:8px">Habits</h2>
  <p class="muted" style="margin:0">Archived habits keep their history but stop showing each evening.</p>
  ${st.habits.map(habit).join("")}${habit({})}`;
}

// ---- rendering and events ----------------------------------------------------------------------------
const VIEWS = { morning: viewMorning, tasks: viewTasks, plan: viewPlan, evening: viewEvening, stats: viewStats, settings: viewSettings };

function render() {
  document.body.classList.toggle("evening", S.tab === "evening");
  document.querySelectorAll(".tabs a").forEach(a => { if (a.dataset.tab === S.tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const focus = document.activeElement?.id;
  app.innerHTML = S.day || S.tab === "stats" || S.tab === "settings" ? VIEWS[S.tab]() : '<div class="empty">Loading…</div>';
  if (focus && document.getElementById(focus)) {
    const el = document.getElementById(focus);
    el.focus();
    if (el.type === "search" || el.type === "text") el.setSelectionRange(el.value.length, el.value.length);
  }
}

async function refresh(what = "day") {
  if (what === "day" || what === "all") await loadDay();
  if (S.tab === "tasks" && (what === "tasks" || what === "all" || what === "day")) await loadTasks();
  if (S.tab === "stats") S.stats = await api("/api/stats?days=30");
  if (S.tab === "settings") S.settings = await api("/api/settings");
  render();
}

async function go() {
  S.tab = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : "morning";
  render();
  await refresh("all");
}
window.addEventListener("hashchange", go);
window.addEventListener("focus", () => { if (S.date !== localDate(new Date()) && !S.manualDate) { S.date = localDate(new Date()); refresh("all"); } });

function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    o[el.name] = el.type === "checkbox" ? el.checked : el.value;
  }
  return o;
}

app.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b || b.tagName === "INPUT" || b.tagName === "TEXTAREA" || b.tagName === "FORM" || b.disabled) return;
  const id = Number(b.dataset.id);
  const act = b.dataset.act;
  try {
    if (act === "day") { S.date = addDays(S.date, Number(b.dataset.n)); S.manualDate = true; return refresh("all"); }
    if (act === "today") { S.date = localDate(new Date()); S.manualDate = false; return refresh("all"); }
    if (act === "routine") { await save("/api/routine/toggle", { item_id: id, done: b.getAttribute("aria-pressed") !== "true" }); return refresh(); }
    if (act === "journal") {
      const t = document.getElementById("journal");
      await save("/api/journal", { kind: "morning", text: t.value });
      t.value = ""; toast("Saved"); return refresh();
    }
    if (act === "journal-del") { if (!confirm("Delete this journal entry?")) return; await api("/api/journal/delete", { id }); return refresh(); }
    if (act === "pick") { await save("/api/day/pick", { task_id: id, slot: b.dataset.slot }); return refresh(); }
    if (act === "carry") { await save("/api/day/pick", { carried_from_id: id, slot: b.dataset.slot }); return refresh(); }
    if (act === "move") { await api("/api/day/move", { id, slot: b.dataset.slot }); return refresh(); }
    if (act === "unpick") { await api("/api/day/unpick", { id }); return refresh(); }
    if (act === "confirm") { await save("/api/day/confirm", {}); toast("Plan confirmed"); return refresh(); }
    if (act === "habit") { await save("/api/habit/log", { habit_id: id, met: b.getAttribute("aria-pressed") !== "true" }); return refresh(); }
    if (act === "status") { await api("/api/day/task", { id, status: b.getAttribute("aria-pressed") === "true" ? "open" : b.dataset.status }); return refresh(); }
    if (act === "lit") { await api("/api/day/task", { id, status: b.getAttribute("aria-pressed") === "true" ? "open" : "done" }); return refresh(); }
    if (act === "rate") {
      const p = S.day.plan || {};
      const k = b.dataset.k, n = Number(b.dataset.n);
      const vals = { energy: p.energy, focus: p.focus, mood: p.mood, sleep: p.sleep, note: document.getElementById("note")?.value ?? p.review_note };
      vals[k] = p[k] === n ? null : n;
      await save("/api/review", vals); return refresh();
    }
    if (act === "review") {
      const p = S.day.plan || {};
      await save("/api/review", { energy: p.energy, focus: p.focus, mood: p.mood, sleep: p.sleep, note: document.getElementById("note").value, done: true });
      toast("Review saved"); return refresh();
    }
  } catch (err) { /* the toast already said what went wrong */ }
});

// Text fields save when you leave them, so nothing is lost if the phone locks.
app.addEventListener("change", async e => {
  const el = e.target, id = Number(el.dataset.id);
  try {
    if (el.dataset.act === "gratitude") { await save("/api/gratitude", { position: Number(el.dataset.n), statement: el.value }); toast("Saved"); }
    if (el.dataset.act === "goal") { await api("/api/day/task", { id, output_goal: el.value }); toast("Saved"); }
    if (el.dataset.act === "steps") {
      const old = (S.day.tasks.find(t => t.id === id)?.steps || []);
      const steps = el.value.split("\n").map(s => s.trim()).filter(Boolean).map(text => ({ text, done: !!old.find(o => o.text === text && o.done) }));
      await api("/api/day/task", { id, steps }); toast("Saved");
    }
    if (el.dataset.act === "block") {
      const s = document.getElementById("s" + id).value, en = document.getElementById("e" + id).value;
      if ((s && en) || (!s && !en)) { await api("/api/day/task", { id, starts_at: s, ends_at: en }); toast("Saved"); }
    }
    if (el.dataset.act === "habit-num") { await save("/api/habit/log", { habit_id: id, value: el.value }); }
    if (["habit-num", "block", "goal", "steps", "gratitude"].includes(el.dataset.act)) await refresh();
  } catch (err) { /* toast shown */ }
});

let searchTimer;
app.addEventListener("input", e => {
  if (e.target.dataset.act !== "search") return;
  S.search = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refresh("tasks").catch(() => {}), 250);
});

app.addEventListener("submit", async e => {
  const f = e.target.closest("form[data-act]");
  if (!f) return;
  e.preventDefault();
  try {
    if (f.dataset.act === "add-task") {
      const input = f.querySelector("input");
      await api("/api/tasks", { title: input.value });
      input.value = ""; return refresh("tasks");
    }
    const o = formData(f);
    if (f.dataset.id) o.id = Number(f.dataset.id);
    if (f.dataset.act === "save-habit") {
      o.days_of_week = [1, 2, 3, 4, 5, 6, 7].filter(n => o["d" + n]).join("");
      await api("/api/settings/habit", o);
    }
    if (f.dataset.act === "save-routine") await api("/api/settings/routine", o);
    toast("Saved");
    await refresh("all");
  } catch (err) { /* toast shown */ }
});

go();
