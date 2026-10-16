// Morning App: every screen of the app and web page. Plain JavaScript, no build step. Layout follows Design Spec v2.
// Today (home), then the five steps: 1 Routine and journal, 2 Gratitude, 3 Pick MITs and LITs, 4 Plan the MITs,
// 5 Evening review. Plus Reports (stats) and Settings. Everything is saved straight away through /api/.
"use strict";

const app = document.getElementById("app");
const bar = document.getElementById("bar");
const sheet = document.getElementById("sheet");
const SPRINT_MIN = 45, PEAK = [8, 11], CAL = [7, 15];
const S = { tab: "today", date: localDate(new Date()), day: null, tasks: [], search: "", filter: "all", settings: null, stats: null,
  planIdx: 0, sprints: {}, extraSteps: {}, swap: null, tomorrowed: new Set() };

// ---- small helpers -------------------------------------------------------------------------------------
function localDate(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function addDays(iso, n) { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return localDate(d); }
function niceDate(iso) { return new Date(iso + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" }); }
function esc(v) { return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
const mins = t => { if (!t) return null; const [h, m] = String(t).split(":"); return Number(h) * 60 + Number(m); };
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const clock = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const nowMins = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const isToday = () => S.date === localDate(new Date());
const num = v => Number(v).toLocaleString("en-AU", { maximumFractionDigits: 2 });

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

const ICON = {
  reports: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16v-7"/></svg>',
  gear: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7v.2a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  prev: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  print: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};

// Step header: source line, "Step N of 5 · Skip", the 5-part progress bar, the title.
function stepHead(source, step, title, skipTo) {
  return `<header class="head">
    <div class="head-line"><span class="source">${esc(source)}</span>
      <span class="step">Step ${step} of 5${skipTo ? ` · <a href="${skipTo}">Skip</a>` : ""}</span></div>
    <div class="progress" aria-hidden="true">${[1, 2, 3, 4, 5].map(n => `<span class="${n <= step ? "on" : ""}"></span>`).join("")}</div>
    <h1>${esc(title)}</h1>
  </header>`;
}
function plainHead(source, title, back) {
  return `<header class="head"><div class="head-line"><span class="source">${esc(source)}</span>
    <span class="icons">${back ? `<a class="icon-btn" href="#today" aria-label="Back to Today">${ICON.x}</a>` : ""}</span></div><h1>${esc(title)}</h1></header>`;
}
function actions(html) { bar.innerHTML = html ? `<div>${html}</div>` : ""; bar.hidden = !html; }
const nextBtn = (href, label) => `<a class="btn primary" href="${href}">${esc(label)}</a>`;
const check = (on, label, act, attrs = "", meta = "") =>
  `<button type="button" class="check fade" aria-pressed="${on ? "true" : "false"}" data-act="${act}" ${attrs}><span class="box"></span>
    <span class="grow"><span class="label">${esc(label)}</span>${meta ? `<span class="meta" style="display:block">${esc(meta)}</span>` : ""}</span></button>`;
const byslot = slot => (S.day?.tasks || []).filter(t => t.slot === slot);

// A MIT's block: the saved one, or a proposal in the first free gap from the peak window on (MITs in order).
function blockFor(t) {
  const len = m => (S.sprints[m.id] || savedSprints(m) || 2) * SPRINT_MIN;
  const taken = [];
  for (const m of byslot("MIT")) {
    if (m.starts_at) taken.push([mins(m.starts_at), S.sprints[m.id] ? mins(m.starts_at) + len(m) : mins(m.ends_at)]);
  }
  for (const m of byslot("MIT")) {
    if (m.starts_at) {
      if (m.id === t.id) return { s: mins(m.starts_at), e: S.sprints[m.id] ? mins(m.starts_at) + len(m) : mins(m.ends_at), saved: true };
      continue;
    }
    let s = PEAK[0] * 60;
    for (let guard = 0; guard < 40; guard++) {
      const clash = taken.find(([a, b]) => s < b && s + len(m) > a);
      if (!clash) break;
      s = clash[1];
    }
    taken.push([s, s + len(m)]);
    if (m.id === t.id) return { s, e: s + len(m), saved: false };
  }
  return { s: PEAK[0] * 60, e: PEAK[0] * 60 + len(t), saved: false };
}
function savedSprints(t) { return t.starts_at ? Math.max(1, Math.min(4, Math.round((mins(t.ends_at) - mins(t.starts_at)) / SPRINT_MIN))) : null; }
const sprintText = n => `${n} sprint${n === 1 ? "" : "s"} · ${n * SPRINT_MIN} min`;

// ---- 1a Today --------------------------------------------------------------------------------------------
function viewToday() {
  const d = S.day, mits = byslot("MIT"), lits = byslot("LIT"), also = byslot("ALSO");
  const now = nowMins();
  const head = `<header class="head"><div class="head-line">
      <span class="row" style="gap:0"><button class="icon-btn" data-act="day" data-n="-1" aria-label="Previous day">${ICON.prev}</button>
        <span class="source">${esc(niceDate(S.date))}</span>
        <button class="icon-btn" data-act="day" data-n="1" aria-label="Next day">${ICON.next}</button></span>
      <span class="icons"><a class="icon-btn" href="#stats" aria-label="Reports">${ICON.reports}</a><a class="icon-btn" href="#settings" aria-label="Settings">${ICON.gear}</a></span></div>
    <h1>${isToday() ? "Today" : esc(niceDate(S.date).split(" ")[0])}</h1></header>`;
  const habitRow = h => h.kind === "number"
    ? `<div class="row" style="min-height:48px"><span class="box${h.met ? " on" : ""}" aria-hidden="true"></span>
        <label class="grow" for="th${h.id}">${esc(h.name)}<span class="meta" style="display:block">${h.value != null ? `${num(h.value)} ${h.target != null && h.unit === "L" ? `of ${num(h.target)} L` : "so far"}` : `Target ${num(h.target)} ${esc(h.unit || "")}`}</span></label>
        <input type="number" inputmode="decimal" step="any" id="th${h.id}" style="width:104px" data-act="habit-num" data-id="${h.id}" value="${h.value ?? ""}" placeholder="${esc(h.unit || "")}"></div>`
    : check(h.met, h.name, "habit", `data-id="${h.id}"`);
  actions(`<a class="btn primary" href="/report.html?date=${S.date}" target="_blank" rel="noopener">${ICON.print}Print day</a>`);
  const evening = isToday() && now >= 20 * 60 + 30 && !(d.plan && d.plan.reviewed_at);
  if (!mits.length && !(d.plan && d.plan.confirmed_at)) {
    return `${head}<section class="card"><h2>Start my morning</h2><p class="note">Routine, journal, gratitude, then pick and plan today's tasks.</p>
      <a class="btn primary" href="#morning">Start my morning</a></section>
      ${evening ? `<section class="card"><h2>Evening review</h2><a class="btn" href="#evening">Start evening review</a></section>` : ""}`;
  }
  return `${head}
  ${evening ? `<section class="card"><h2>Time to wind down</h2><a class="btn primary" href="#evening">Start evening review</a></section>` : ""}
  <h6>Most important</h6>
  ${mits.map((t, i) => {
    const b = t.starts_at ? { s: mins(t.starts_at), e: mins(t.ends_at) } : null;
    const live = b && isToday() && now >= b.s && now < b.e;
    return `<section class="card"><div class="row" style="align-items:flex-start"><span class="badge">${i + 1}</span>
      <div class="grow"><h2>${esc(t.title_snapshot)}</h2>${t.output_goal ? `<div class="meta">Output: ${esc(t.output_goal)}</div>` : ""}</div>
      ${live ? '<span class="tag">Now</span>' : t.status === "done" ? '<span class="tag lit">Done</span>' : ""}</div>
      ${b ? `<span class="timeblock">${clock(b.s)} – ${clock(b.e)} · ${savedSprints(t)} sprint${savedSprints(t) === 1 ? "" : "s"}</span>` : `<a href="#plan" class="meta">No time blocked yet</a>`}
    </section>`;
  }).join("") || `<section class="card"><div class="empty">No MITs picked.</div><a href="#tasks">Choose tasks</a></section>`}
  <div class="stats2">
    <a class="stat" href="#evening" style="text-decoration:none;color:inherit"><h6>Less important</h6><strong>${lits.filter(t => t.status === "done").length} of ${lits.length}</strong><span class="meta">done</span></a>
    <a class="stat" href="#tasks" style="text-decoration:none;color:inherit"><h6>Also on today</h6><strong>${also.length}</strong><span class="meta">item${also.length === 1 ? "" : "s"}</span></a>
  </div>
  <h6>Habits to honour</h6>
  <section class="card divided" style="padding-top:4px;padding-bottom:4px;gap:0">${d.habits.filter(h => h.applies).map(habitRow).join("") || '<div class="empty">Add habits in Settings.</div>'}</section>`;
}

// ---- 1b Routine and journal --------------------------------------------------------------------------------
function viewMorning() {
  const d = S.day;
  actions(nextBtn("#gratitude", "Next: gratitude"));
  return `${stepHead(niceDate(S.date), 1, "Good morning", "#gratitude")}
  <section class="card">
    <div class="card-head"><h2>Morning routine</h2><span class="meta">${d.routine.filter(r => r.done).length} of ${d.routine.length}</span></div>
    <div class="divided">${d.routine.map(r => check(r.done, r.name, "routine", `data-id="${r.id}"`)).join("") || '<div class="empty">Add routine items in Settings.</div>'}</div>
  </section>
  <section class="card">
    <h6>Journal</h6>
    <h2><label for="journal">What would make today great?</label></h2>
    <textarea id="journal" placeholder="Type here, or use the microphone on your keyboard"></textarea>
    <p class="note">Voice with Whisper comes with phase 2.</p>
    <button class="btn" data-act="journal">Save entry</button>
    ${d.journal.map(j => `<div class="row" style="align-items:flex-start;border-top:1px solid var(--color-divider);padding-top:8px">
      <div class="grow" style="white-space:pre-wrap">${esc(j.transcript)}</div>
      <button class="icon-btn" data-act="journal-del" data-id="${j.id}" aria-label="Delete entry">${ICON.x}</button></div>`).join("")}
  </section>`;
}

// ---- 1c Gratitude ------------------------------------------------------------------------------------------
function viewGratitude() {
  const d = S.day;
  const grat = n => (d.gratitude.find(g => g.position === n) || {}).statement || "";
  const done = [1, 2, 3, 4].filter(n => grat(n)).length;
  actions(nextBtn("#tasks", "Next: pick today's tasks"));
  return `${stepHead("Grateful for", 2, "Four things you're grateful for", "#tasks")}
  <div class="banner">Photos from OneDrive on this date come with phase 2. For now, write four lines.</div>
  <section class="card">
    <div class="card-head"><h2>Grateful for</h2><span class="meta">${done} of 4</span></div>
    ${[1, 2, 3, 4].map(n => `<div class="row"><span class="badge" style="background:var(--color-accent);color:var(--on-accent)">${n}</span>
      <label class="sr" for="g${n}">Gratitude ${n}</label>
      <input type="text" id="g${n}" class="grow" data-act="gratitude" data-n="${n}" value="${esc(grat(n))}" placeholder="I'm grateful for…"></div>`).join("")}
  </section>`;
}

// ---- 1d Pick MITs and LITs ---------------------------------------------------------------------------------
function meter(slot) {
  const n = byslot(slot).length, max = S.day.limits[slot];
  const note = n >= max ? "Full · swap one to add" : slot === "MIT" ? "Fewer is fine" : `${max - n} left`;
  return `<div class="meter ${slot.toLowerCase()}">
    <div class="card-head"><strong style="font-family:Outfit">${slot}</strong><strong>${n} / ${max}</strong></div>
    <div class="bars" aria-hidden="true">${Array.from({ length: max }, (_, i) => `<span class="${i < n ? "on" : ""}"></span>`).join("")}</div>
    <div style="font-size:12px">${note}</div></div>`;
}
function inFilter(due) {
  if (S.filter === "all") return true;
  if (!due) return false;
  if (S.filter === "today") return due <= S.date;
  return due <= addDays(S.date, 7);
}
function taskRow({ key, title, meta, carried, dt, kind, id }) {
  const slot = dt ? dt.slot : null;
  const tg = (s, cls, label, aria) => `<button type="button" class="toggle ${cls}" aria-pressed="${slot === s}" data-act="toggle" data-kind="${kind}" data-id="${id}" data-slot="${s}" ${aria ? `aria-label="${aria}"` : ""}>${label}</button>`;
  return `<div class="task" data-key="${key}">
    <div class="row"><div class="grow"><div>${esc(title)}</div>${meta ? `<div class="tmeta${carried ? " carried" : ""}">${esc(meta)}</div>` : ""}</div>
      ${tg("MIT", "mit", "MIT")}${tg("LIT", "lit", "LIT")}${kind === "task" ? tg("ALSO", "also", "+", "Also on today") : ""}</div>
    ${slot === "MIT" ? `<div class="mitask"><label class="lbl" for="goal${dt.id}" style="color:var(--mit-text)">What will this produce?</label>
      <input type="text" class="mitfield" id="goal${dt.id}" data-act="goal" data-id="${dt.id}" value="${esc(dt.output_goal)}" placeholder="e.g. quote sent to supplier">
      <p>Will future you thank you for this?</p></div>` : ""}
  </div>`;
}
function viewTasks() {
  const d = S.day;
  const picked = d.tasks.filter(t => t.slot !== "ALSO");
  const pickedIds = new Set(d.tasks.map(t => t.task_id).filter(Boolean));
  const carryIds = new Set(d.carry.map(c => c.task_id).filter(Boolean));
  const q = S.search.trim().toLowerCase();
  const match = s => !q || String(s).toLowerCase().includes(q);
  const rows = [
    ...d.carry.filter(c => match(c.title_snapshot)).map(c => ({ key: "c" + c.id, kind: "carry", id: c.id, title: c.title_snapshot, carried: true,
      meta: `Carried over from yesterday${c.status === "partly" ? " · partly done" : ""}` })),
    ...picked.filter(t => match(t.title_snapshot)).map(t => ({ key: "d" + t.id, kind: "day", id: t.id, dt: t, title: t.title_snapshot, carried: !!t.carried_from_id,
      meta: t.carried_from_id ? "Carried over from yesterday" : [t.project].filter(Boolean).join("") })),
    ...S.tasks.filter(t => !pickedIds.has(t.id) && !carryIds.has(t.id) && inFilter(t.due_date)).map(t => ({ key: "t" + t.id, kind: "task", id: t.id, title: t.title,
      meta: [t.project || null, t.due_date ? "due " + new Date(t.due_date + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : null].filter(Boolean).join(" · ") })),
  ];
  const chip = (f, label) => `<button type="button" class="chip" aria-pressed="${S.filter === f}" data-act="filter" data-f="${f}">${label}</button>`;
  actions(nextBtn("#plan", "Next: plan my MITs"));
  return `${stepHead(S.mc && S.mc.connected ? (S.mc.ok === false ? "Mission Control unreachable · showing last copy" : "From Mission Control") : "Local task list", 3, "Choose today's tasks", "#plan")}
  <div class="meters">${meter("MIT")}${meter("LIT")}</div>
  <form data-act="add-task" class="row"><label class="sr" for="q">Search or add a task</label>
    <input type="search" id="q" class="grow" placeholder="Search or add a task" value="${esc(S.search)}" data-act="search" autocomplete="off"></form>
  <div class="chips">${chip("all", "All")}${chip("today", "Due today")}${chip("week", "This week")}</div>
  <section class="card" style="padding-top:6px;padding-bottom:6px;gap:0"><div class="divided">
    ${rows.map(taskRow).join("") || `<div class="empty" style="padding:12px 0">${q ? `Nothing matches. Press Enter to add “${esc(S.search)}”.` : "No open tasks. Type one above and press Enter."}</div>`}
  </div></section>
  <section class="card">
    <div class="card-head"><h2>Also on today</h2><span class="meta">Prints, doesn't count</span></div>
    <div class="divided">${byslot("ALSO").map(t => `<div class="row" style="min-height:48px"><span class="grow">${esc(t.title_snapshot)}</span><span class="tag soft">Task</span>
      <button class="icon-btn" data-act="unpick" data-id="${t.id}" aria-label="Remove from Also on today">${ICON.x}</button></div>`).join("") || '<div class="empty">Pin a task with + to print it without counting it.</div>'}</div>
  </section>`;
}
function swapSheet() {
  if (!S.swap) { sheet.innerHTML = ""; return; }
  const { slot, title } = S.swap;
  sheet.innerHTML = `<div class="scrim" data-act="swap-close"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="swap-title">
    <span class="grab"></span>
    <h2 id="swap-title">${slot === "MIT" ? "Three MITs is the limit" : "Ten LITs is the limit"}</h2>
    <p class="note">To add ${esc(title)}, pick one to move out. It stays in your task list.</p>
    <div class="divided">${byslot(slot).map(t => `<div class="row" style="min-height:52px"><span class="grow">${esc(t.title_snapshot)}</span>
      <button class="btn small" data-act="swap-out" data-id="${t.id}">Swap out</button></div>`).join("")}</div>
    <button class="btn" data-act="swap-close">Keep my list as it is</button>
  </div></div>`;
  sheet.querySelector("[data-act=swap-out]")?.focus();
}

// ---- 1e Plan the MITs --------------------------------------------------------------------------------------
function viewPlan() {
  const mits = byslot("MIT");
  if (!mits.length) {
    actions(nextBtn("#tasks", "Choose tasks"));
    return `${stepHead("No MITs yet", 4, "Plan the output", "#today")}<section class="card"><div class="empty">Pick up to 3 MITs first.</div></section>`;
  }
  S.planIdx = Math.min(S.planIdx, mits.length - 1);
  const t = mits[S.planIdx], b = blockFor(t);
  const sprints = S.sprints[t.id] || savedSprints(t) || 2;
  const steps = t.steps.map(s => s.text).concat(Array(S.extraSteps[t.id] || 0).fill(""));
  const confirmed = !!(S.day.plan && S.day.plan.confirmed_at);
  const top = CAL[0] * 60, px = m => ((m - top) / 60) * 44;
  const blocks = mits.map((m, i) => ({ m, i, b: blockFor(m) }));
  actions(`${S.planIdx < mits.length - 1 ? `<button class="btn" data-act="next-mit">Next MIT</button>` : ""}
    <button class="btn primary" data-act="confirm">${confirmed ? "Confirmed · confirm again" : "Confirm and block"}</button>`);
  return `${stepHead(`MIT ${S.planIdx + 1} of ${mits.length}`, 4, "Plan the output", "#today")}
  <section class="card">
    <div class="row"><span class="tag">MIT ${S.planIdx + 1}</span><h2 class="grow">${esc(t.title_snapshot)}</h2></div>
    <label class="lbl" for="goal${t.id}">What will this produce?</label>
    <input type="text" id="goal${t.id}" data-act="goal" data-id="${t.id}" value="${esc(t.output_goal)}" placeholder="e.g. quote sent to supplier">
    <span class="lbl">Steps</span>
    <ol class="steps">${steps.map((s, i) => `<li><span class="num">${i + 1}</span><label class="sr" for="st${t.id}_${i}">Step ${i + 1}</label>
      <input type="text" id="st${t.id}_${i}" data-act="step" data-id="${t.id}" value="${esc(s)}" placeholder="Step ${i + 1}"></li>`).join("")}</ol>
    ${steps.length < 5 ? `<button class="link-btn" data-act="add-step" data-id="${t.id}">+ Add step</button>` : ""}
    <div class="row" style="border-top:1px solid var(--color-divider);padding-top:10px">
      <div class="grow"><span class="lbl">Estimate</span><div><strong>${sprintText(sprints)}</strong></div></div>
      <div class="stepper"><button data-act="sprint" data-id="${t.id}" data-n="-1" aria-label="One sprint less" ${sprints <= 1 ? "disabled" : ""}>−</button>
        <button data-act="sprint" data-id="${t.id}" data-n="1" aria-label="One sprint more" ${sprints >= 4 ? "disabled" : ""}>+</button></div>
    </div>
    <div class="row"><label class="lbl grow" for="start${t.id}">Starts at</label>
      <input type="time" id="start${t.id}" style="width:140px" data-act="start" data-id="${t.id}" value="${hhmm(b.s)}"></div>
  </section>
  <section class="card">
    <div class="card-head"><h2>Today's calendar</h2><span class="meta">${clock(CAL[0] * 60)} – ${clock(CAL[1] * 60)}</span></div>
    <div class="cal" style="height:${(CAL[1] - CAL[0]) * 44}px">
      <div class="peak" style="top:${px(PEAK[0] * 60)}px;height:${(PEAK[1] - PEAK[0]) * 44}px"></div>
      <div class="peak-label" style="top:${px(PEAK[0] * 60) + 14}px">Peak focus</div>
      ${Array.from({ length: CAL[1] - CAL[0] }, (_, i) => `<div class="hour"><span>${CAL[0] + i}:00</span></div>`).join("")}
      ${blocks.map(x => `<div class="blk${x.b.saved && confirmed ? " confirmed" : ""}${x.m.id === t.id ? " current" : ""}" style="top:${px(Math.max(x.b.s, top))}px;height:${Math.max(22, px(x.b.e) - px(Math.max(x.b.s, top)) - 2)}px">
        MIT ${x.i + 1} · ${clock(x.b.s)} – ${clock(x.b.e)}</div>`).join("")}
    </div>
    <p class="note">Dashed blocks are proposed. Confirming saves them to today's plan and the printed report; adding them to your Outlook calendar comes with phase 2.</p>
  </section>`;
}

// ---- 1f Evening review ---------------------------------------------------------------------------------------
function viewEvening() {
  const d = S.day, p = d.plan || {};
  const applicable = d.habits.filter(h => h.applies);
  const kept = applicable.filter(h => h.met).length;
  const stepSize = h => (h.target >= 1000 ? 1000 : h.target >= 10 ? 1 : 0.25);
  const dayName = new Date(S.date + "T12:00:00").toLocaleDateString("en-AU", { weekday: "long" });
  const habitRow = h => !h.applies
    ? `<div class="row muted-row" style="min-height:48px"><span class="box" aria-hidden="true"></span><span>${esc(h.name)} · not on ${dayName}s</span></div>`
    : h.kind === "number"
      ? `<div class="row" style="min-height:52px"><span class="box${h.met ? " on" : ""}" aria-hidden="true"></span>
          <span class="grow">${esc(h.name)}<span class="meta" style="display:block">Target ${num(h.target)} ${esc(h.unit || "")}</span></span>
          <div class="stepper"><button data-act="habit-step" data-id="${h.id}" data-n="${-stepSize(h)}" aria-label="Less">−</button>
            <label class="sr" for="h${h.id}">${esc(h.name)}</label><input type="number" inputmode="decimal" step="any" id="h${h.id}" data-act="habit-num" data-id="${h.id}" value="${h.value ?? ""}" placeholder="0">
            <button data-act="habit-step" data-id="${h.id}" data-n="${stepSize(h)}" aria-label="More">+</button></div></div>`
      : check(h.met, h.name, "habit", `data-id="${h.id}"`);
  const status = (t, s, label) => `<button type="button" class="${s}" aria-pressed="${t.status === s}" data-act="status" data-id="${t.id}" data-status="${s}">${label}</button>`;
  const lits = byslot("LIT"), litDone = lits.filter(t => t.status === "done").length;
  const unfinished = lits.filter(t => t.status !== "done" && !S.tomorrowed.has(t.id));
  const rate = k => `<div class="row"><span style="width:64px" class="meta" id="r${k}">${k[0].toUpperCase() + k.slice(1)}</span>
    <div class="rate grow" role="group" aria-labelledby="r${k}">${[1, 2, 3, 4, 5].map(n => `<button type="button" aria-pressed="${p[k] === n}" data-act="rate" data-k="${k}" data-n="${n}">${n}</button>`).join("")}</div></div>`;
  const when = isToday() ? new Date().toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).replace(" ", " ") : "review";
  actions(`<button class="btn primary" data-act="review">${p.reviewed_at ? "Saved · sleep well" : "Save review"}</button>`);
  return `${stepHead(`${niceDate(S.date)} · ${when}`, 5, "How did today go?")}
  <section class="card">
    <div class="card-head"><h2>Habits honoured</h2><span class="meta">${kept} of ${applicable.length}</span></div>
    <div class="divided">${d.habits.map(habitRow).join("") || '<div class="empty">Add habits in Settings.</div>'}</div>
  </section>
  ${byslot("MIT").length ? `<h6>MITs</h6>` : ""}
  ${byslot("MIT").map((t, i) => `<section class="card"><div class="row"><span class="badge">${i + 1}</span><span class="grow">${esc(t.title_snapshot)}</span></div>
    <div class="seg">${status(t, "done", "Done")}${status(t, "partly", "Partly")}${status(t, "not_done", "Not done")}</div></section>`).join("")}
  ${lits.length ? `<section class="card"><div class="card-head"><h2>Less important</h2><span class="meta">${litDone} of ${lits.length}</span></div>
    <div class="divided">${lits.map(t => `<div class="row">${check(t.status === "done", t.title_snapshot, "lit", `data-id="${t.id}"`)}
      ${t.status !== "done" ? (S.tomorrowed.has(t.id) ? '<span class="meta" style="white-space:nowrap">On tomorrow</span>' : `<button class="btn small" data-act="tomorrow" data-id="${t.id}">→ Tomorrow</button>`) : ""}</div>`).join("")}</div>
    ${unfinished.length > 1 ? `<button class="link-btn" data-act="tomorrow-all">Carry all ${unfinished.length} unfinished to tomorrow</button>` : ""}</section>` : ""}
  <section class="card"><h2>Rate the day</h2>${["energy", "focus", "mood", "sleep"].map(rate).join("")}</section>
  <section class="card"><label for="note"><h2>Best thing today</h2></label>
    <input type="text" id="note" value="${esc(p.review_note)}" placeholder="One line"></section>`;
}

// ---- Reports and Settings (not yet designed: kept simple) ------------------------------------------------------
function viewStats() {
  actions("");
  const st = S.stats;
  if (!st) return plainHead("Last 30 days", "Reports", true) + '<div class="empty">Loading…</div>';
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "–");
  const days = st.daily.filter(r => r.mits_planned);
  const planned = days.reduce((a, r) => a + r.mits_planned, 0), doneM = days.reduce((a, r) => a + r.mits_done, 0);
  return `${plainHead("Last " + st.days + " days", "Reports", true)}
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

function viewSettings() {
  actions("");
  const st = S.settings;
  if (!st) return plainHead("Set up once", "Settings", true) + '<div class="empty">Loading…</div>';
  const dayNames = ["M", "T", "W", "T", "F", "S", "S"];
  const habit = h => `<form class="card" data-act="save-habit" data-id="${h.id || ""}" style="gap:8px">
    <label class="lbl" for="hn${h.id || "new"}">${h.id ? "Habit" : "New habit"}</label>
    <input type="text" id="hn${h.id || "new"}" name="name" value="${esc(h.name)}" placeholder="e.g. No sugar" required>
    <div class="row">
      <select name="kind" aria-label="Kind" class="grow"><option value="yes_no" ${h.kind !== "number" ? "selected" : ""}>Tick</option><option value="number" ${h.kind === "number" ? "selected" : ""}>Number</option></select>
      <input type="number" name="target" aria-label="Target" step="any" style="width:100px" value="${h.target ?? ""}" placeholder="Target">
      <input type="text" name="unit" aria-label="Unit" style="width:80px" value="${esc(h.unit)}" placeholder="Unit">
    </div>
    <div class="row" role="group" aria-label="Days it applies">${dayNames.map((n, i) => `<label class="meta" style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <input type="checkbox" name="d${i + 1}" ${(h.days_of_week || "1234567").includes(String(i + 1)) ? "checked" : ""}>${n}</label>`).join("")}
      <span class="grow"></span>
      <input type="number" name="sort_order" aria-label="Order" style="width:64px" value="${h.sort_order ?? 0}">
    </div>
    <div class="row">${h.id ? `<label class="meta row" style="gap:6px"><input type="checkbox" name="archived" ${h.archived_at ? "checked" : ""}> Archived</label>` : ""}<span class="grow"></span><button class="btn">${h.id ? "Save" : "Add habit"}</button></div>
  </form>`;
  const routine = r => `<form class="row" data-act="save-routine" data-id="${r.id || ""}">
    <label class="sr" for="rn${r.id || "new"}">Routine item</label>
    <input type="text" id="rn${r.id || "new"}" name="name" class="grow" value="${esc(r.name)}" placeholder="New routine item" required>
    <input type="number" name="sort_order" aria-label="Order" style="width:56px;padding:8px" value="${r.sort_order ?? 0}">
    ${r.id ? `<label class="meta" style="display:flex;align-items:center;gap:4px"><input type="checkbox" name="archived" ${r.archived_at ? "checked" : ""}>Off</label>` : ""}
    <button class="btn">${r.id ? "Save" : "Add"}</button></form>`;
  return `${plainHead("Set up once", "Settings", true)}
  <section class="card"><h2>Morning routine</h2>${st.routine.map(routine).join("")}${routine({})}</section>
  <h6>Habits</h6>
  <p class="note">Archived habits keep their history but stop showing each evening.</p>
  ${st.habits.map(habit).join("")}${habit({})}`;
}

// ---- rendering and events --------------------------------------------------------------------------------
const VIEWS = { today: viewToday, morning: viewMorning, gratitude: viewGratitude, tasks: viewTasks, plan: viewPlan, evening: viewEvening, stats: viewStats, settings: viewSettings };
const TAB_OF = { gratitude: "morning", stats: "today", settings: "today" };

function render() {
  document.body.classList.toggle("evening", S.tab === "evening");
  const tab = TAB_OF[S.tab] || S.tab;
  document.querySelectorAll(".tabs a").forEach(a => { if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const focus = document.activeElement?.id;
  app.innerHTML = S.day || S.tab === "stats" || S.tab === "settings" ? VIEWS[S.tab]() : '<div class="empty">Loading…</div>';
  swapSheet();
  if (focus && document.getElementById(focus)) {
    const el = document.getElementById(focus);
    el.focus();
    if (el.type === "search" || el.type === "text") el.setSelectionRange(el.value.length, el.value.length);
  }
}

async function refresh(what = "day") {
  if (what === "day" || what === "all") S.day = await api("/api/day?date=" + S.date);
  if (S.tab === "tasks") { const r = await api("/api/tasks?q="); S.tasks = r.tasks; S.mc = r.mc; }
  if (S.tab === "stats") S.stats = await api("/api/stats?days=30");
  if (S.tab === "settings") S.settings = await api("/api/settings");
  render();
}

async function go() {
  const t = location.hash.slice(1);
  S.tab = VIEWS[t] ? t : "today";
  S.swap = null;
  window.scrollTo(0, 0);
  render();
  await refresh("all").catch(() => {});
}
window.addEventListener("hashchange", go);
window.addEventListener("focus", () => { if (S.date !== localDate(new Date()) && !S.manualDate) { S.date = localDate(new Date()); refresh("all").catch(() => {}); } });

function formData(form) {
  const o = {};
  for (const el of form.elements) if (el.name) o[el.name] = el.type === "checkbox" ? el.checked : el.value;
  return o;
}

// Pick into a slot; when it's full, open the swap sheet instead.
async function place(slot, title, run) {
  if (slot !== "ALSO" && byslot(slot).length >= S.day.limits[slot]) {
    S.swap = { slot, title, run };
    return swapSheet();
  }
  await run();
  await refresh();
}

async function onAct(b) {
  const id = Number(b.dataset.id), act = b.dataset.act;
  if (act === "day") { S.date = addDays(S.date, Number(b.dataset.n)); S.manualDate = S.date !== localDate(new Date()); return refresh("all"); }
  if (act === "routine") { await save("/api/routine/toggle", { item_id: id, done: b.getAttribute("aria-pressed") !== "true" }); return refresh(); }
  if (act === "journal") {
    const t = document.getElementById("journal");
    await save("/api/journal", { kind: "morning", text: t.value });
    t.value = ""; toast("Saved"); return refresh();
  }
  if (act === "journal-del") { if (!confirm("Delete this journal entry?")) return; await api("/api/journal/delete", { id }); return refresh(); }
  if (act === "filter") { S.filter = b.dataset.f; return render(); }
  if (act === "toggle") {
    const slot = b.dataset.slot, kind = b.dataset.kind, on = b.getAttribute("aria-pressed") === "true";
    const title = b.closest(".task").querySelector(".grow > div").textContent;
    if (kind === "day") {
      if (on) { await api("/api/day/unpick", { id }); return refresh(); }
      return place(slot, title, () => api("/api/day/move", { id, slot }));
    }
    if (kind === "carry") return place(slot, title, () => save("/api/day/pick", { carried_from_id: id, slot }));
    return place(slot, title, () => save("/api/day/pick", { task_id: id, slot }));
  }
  if (act === "swap-close") { if (b === b.closest(".scrim") || b.tagName === "BUTTON") { S.swap = null; return swapSheet(); } return; }
  if (act === "swap-out") {
    const run = S.swap.run;
    S.swap = null;
    await api("/api/day/unpick", { id });
    try { await run(); } finally { await refresh(); }
    return;
  }
  if (act === "unpick") { await api("/api/day/unpick", { id }); return refresh(); }
  if (act === "add-step") { S.extraSteps[id] = (S.extraSteps[id] || 0) + 1; render(); return document.querySelector(`[data-act=step][data-id="${id}"]:last-of-type`)?.focus(); }
  if (act === "sprint") {
    const t = S.day.tasks.find(x => x.id === id);
    const n = Math.max(1, Math.min(4, (S.sprints[id] || savedSprints(t) || 2) + Number(b.dataset.n)));
    S.sprints[id] = n;
    if (t.starts_at) { const s = mins(t.starts_at); await api("/api/day/task", { id, starts_at: hhmm(s), ends_at: hhmm(s + n * SPRINT_MIN) }); return refresh(); }
    return render();
  }
  if (act === "next-mit") { S.planIdx++; window.scrollTo(0, 0); return render(); }
  if (act === "confirm") {
    for (const t of byslot("MIT")) {
      const bl = blockFor(t);
      if (!t.starts_at || S.sprints[t.id]) await api("/api/day/task", { id: t.id, starts_at: hhmm(bl.s), ends_at: hhmm(bl.e) });
    }
    await save("/api/day/confirm", {});
    toast("Plan confirmed"); return refresh();
  }
  if (act === "habit") { await save("/api/habit/log", { habit_id: id, met: b.getAttribute("aria-pressed") !== "true" }); return refresh(); }
  if (act === "habit-step") {
    const h = S.day.habits.find(x => x.id === id);
    const v = Math.max(0, Math.round(((Number(h.value) || 0) + Number(b.dataset.n)) * 100) / 100);
    await save("/api/habit/log", { habit_id: id, value: v }); return refresh();
  }
  if (act === "status") { await api("/api/day/task", { id, status: b.getAttribute("aria-pressed") === "true" ? "open" : b.dataset.status }); return refresh(); }
  if (act === "lit") { await api("/api/day/task", { id, status: b.getAttribute("aria-pressed") === "true" ? "open" : "done" }); return refresh(); }
  if (act === "tomorrow") { await api("/api/day/tomorrow", { id }); S.tomorrowed.add(id); toast("On tomorrow's list"); return render(); }
  if (act === "tomorrow-all") {
    for (const t of byslot("LIT").filter(t => t.status !== "done" && !S.tomorrowed.has(t.id))) {
      await api("/api/day/tomorrow", { id: t.id }); S.tomorrowed.add(t.id);
    }
    toast("On tomorrow's list"); return render();
  }
  if (act === "rate") {
    const p = S.day.plan || {}, k = b.dataset.k, n = Number(b.dataset.n);
    const vals = { energy: p.energy, focus: p.focus, mood: p.mood, sleep: p.sleep, note: document.getElementById("note")?.value ?? p.review_note };
    vals[k] = p[k] === n ? null : n;
    await save("/api/review", vals); return refresh();
  }
  if (act === "review") {
    const p = S.day.plan || {};
    await save("/api/review", { energy: p.energy, focus: p.focus, mood: p.mood, sleep: p.sleep, note: document.getElementById("note").value, done: true });
    toast("Saved · sleep well"); return refresh();
  }
}

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]");
  if (!b || ["INPUT", "TEXTAREA", "FORM"].includes(b.tagName) || b.disabled) return;
  if (b.classList.contains("scrim") && e.target !== b) return;  // clicks inside the sheet don't close it
  try { await onAct(b); } catch (err) { /* the toast already said what went wrong */ }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && S.swap) { S.swap = null; swapSheet(); } });

// Text fields save when you leave them, so nothing is lost if the phone locks.
app.addEventListener("change", async e => {
  const el = e.target, id = Number(el.dataset.id), act = el.dataset.act;
  try {
    if (act === "gratitude") { await save("/api/gratitude", { position: Number(el.dataset.n), statement: el.value }); toast("Saved"); }
    if (act === "goal") { await api("/api/day/task", { id, output_goal: el.value }); toast("Saved"); }
    if (act === "step") {
      const t = S.day.tasks.find(x => x.id === id);
      const steps = [...app.querySelectorAll(`[data-act=step][data-id="${id}"]`)].map(i => i.value.trim()).filter(Boolean)
        .map(text => ({ text, done: !!t.steps.find(o => o.text === text && o.done) }));
      await api("/api/day/task", { id, steps }); S.extraSteps[id] = 0; toast("Saved");
    }
    if (act === "start" && el.value) {
      const t = S.day.tasks.find(x => x.id === id), n = S.sprints[id] || savedSprints(t) || 2, s = mins(el.value);
      await api("/api/day/task", { id, starts_at: hhmm(s), ends_at: hhmm(Math.min(s + n * SPRINT_MIN, 23 * 60 + 59)) }); toast("Saved");
    }
    if (act === "habit-num") await save("/api/habit/log", { habit_id: id, value: el.value });
    if (["habit-num", "start", "goal", "step", "gratitude"].includes(act)) await refresh();
  } catch (err) { /* toast shown */ }
});

app.addEventListener("input", e => {
  if (e.target.dataset.act !== "search") return;
  S.search = e.target.value;
  render();
});

app.addEventListener("submit", async e => {
  const f = e.target.closest("form[data-act]");
  if (!f) return;
  e.preventDefault();
  try {
    if (f.dataset.act === "add-task") {
      const title = S.search.trim();
      if (!title) return;
      await api("/api/tasks", { title });
      S.search = ""; toast("Added"); return refresh();
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
