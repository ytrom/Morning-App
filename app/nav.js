// Morning Routine / Work / Evening Routine buttons in place of the title, This week cards, and tabs that swap.
// Work shows the day's MITs from Mission Control; the + button drops a note into the Mission Control Inbox.
(function () {
  window.addEventListener("pageshow", e => { if (e.persisted) location.reload(); });
  const SETS = {
    morning: [["routine.html", "Disciplines"], ["./", "Workout"], ["soon.html#reading", "Reading"], ["performance.html", "Performance"]],
    work: [["work.html", "Today"], ["soon.html#calendar", "Calendar"], ["performance.html", "Performance"]],
    evening: [["routine.html", "Disciplines"], ["soon.html#review", "Daily Review"], ["soon.html#mit", "MIT &amp; Plan"], ["performance.html", "Performance"]]
  };
  const file = (location.pathname.split("/").pop() || "index.html");
  const norm = h => h === "./" ? "index.html" : h;
  const here = file === "soon.html" ? "soon.html" + location.hash : file;
  const only = { "index.html": "morning", "soon.html#reading": "morning", "soon.html#review": "evening", "soon.html#mit": "evening", "work.html": "work", "soon.html#calendar": "work" };
  let r = null; try { r = sessionStorage.getItem("routine"); } catch {}
  if (only[here]) r = only[here];
  if (!SETS[r]) r = new Date().getHours() >= 14 ? "evening" : "morning";

  const css = document.createElement("style");
  css.textContent = `
.switch { display: grid; grid-template-columns: 1fr .8fr 1fr; gap: 8px; }
.switch button { position: relative; }
.switch button { font: 700 1.35rem/1.05 var(--display); letter-spacing: .01em; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 14px; padding: 12px 8px; cursor: pointer; }
.switch button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.mweek h3 { font: 600 .8rem var(--body); text-transform: uppercase; letter-spacing: .1em; color: var(--muted); margin: 0 0 8px; }
.week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.wk { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 6px 0; text-align: center; display: flex; flex-direction: column; gap: 2px; font: inherit; color: var(--ink); }
.wk b { font: 600 .8rem var(--display); letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.wk span { font: 600 .95rem var(--display); font-variant-numeric: tabular-nums; min-height: 1.2em; }
.wk i { font: 400 .7rem var(--body); font-style: normal; color: var(--muted); min-height: 1em; }
.wk.sel { border-color: var(--accent); }
button.wk { cursor: pointer; } button.wk:disabled { cursor: default; opacity: .5; }
.mweek + .tabs, .tabs { margin-top: 0; }
.nbadge { position: absolute; top: -7px; right: -4px; background: #a8650a; color: #fff; border-radius: 99px; font: 700 .7rem/1 var(--body); padding: 3px 6px; }
body { padding-bottom: 96px; }
.capfab { position: fixed; right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(18px + env(safe-area-inset-bottom, 0px)); width: 54px; height: 54px; border-radius: 50%; border: 0; background: #a8650a; color: #fff; font: 400 2rem/1 var(--body); cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.22); z-index: 20; }
.capdim { position: fixed; inset: 0; background: rgba(15,24,29,.45); z-index: 30; }
.capsheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 31; background: var(--surface); color: var(--ink); border-radius: 20px 20px 0 0; padding: 16px max(16px, env(safe-area-inset-left, 0px)) calc(18px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 10px; max-width: 620px; margin: 0 auto; }
.capsheet h2 { font: 700 1.5rem var(--display); margin: 0; }
.capsheet p { margin: 0; color: var(--muted); font-size: .9rem; }
.capsheet input { font: 500 1.05rem var(--body); padding: 11px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); width: 100%; }
.capkind { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.capkind button, .capbtns button { font: 600 .95rem var(--body); padding: 9px; border-radius: 99px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; }
.capkind button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.capbtns { display: grid; grid-template-columns: 1fr 2fr; gap: 8px; }
.capbtns button.go { font: 700 1.1rem var(--display); letter-spacing: .02em; border: 0; border-radius: 12px; background: var(--accent); color: var(--surface); }
.capbtns button.no { border-radius: 12px; }
.capmsg { min-height: 1.2em; font-size: .9rem; color: var(--done); }`;
  document.head.appendChild(css);

  const header = document.querySelector("header");
  const h1 = header.querySelector("h1");
  const sw = document.createElement("div"); sw.className = "switch"; sw.setAttribute("role", "group"); sw.setAttribute("aria-label", "Choose a routine");
  sw.innerHTML = '<button type="button" data-r="morning">Morning Routine</button><button type="button" data-r="work">Work</button><button type="button" data-r="evening">Evening Routine</button>';
  h1.replaceWith(sw);

  const tabs = document.querySelector("nav.tabs");
  function drawTabs() {
    sw.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.r === r)));
    tabs.style.gridTemplateColumns = "repeat(" + SETS[r].length + ", 1fr)";
    tabs.innerHTML = SETS[r].map(([h, n]) => `<a href="${h}"${norm(h) === here ? ' aria-current="page"' : ""}>${n}</a>`).join("");
  }
  sw.onclick = e => {
    const b = e.target.closest("button"); if (!b) return; r = b.dataset.r;
    try { sessionStorage.setItem("routine", r); } catch {}
    // Stay put if this page is in the chosen routine too (Disciplines, Performance), otherwise open its first tab
    if (!SETS[r].some(([h]) => norm(h) === here)) { location.href = SETS[r][0][0]; return; }
    drawTabs();
  };
  tabs.addEventListener("click", e => { const a = e.target.closest("a"); if (a && a.getAttribute("href").startsWith("soon.html") && file === "soon.html") setTimeout(() => location.reload(), 0); });
  drawTabs();

  // Work button: how many of today's MITs are still open
  const z0 = n => String(n).padStart(2, "0"), d0 = new Date(), k0 = d0.getFullYear() + "-" + z0(d0.getMonth() + 1) + "-" + z0(d0.getDate());
  fetch("api/mc/day-plan?from=" + k0 + "&to=" + k0).then(x => x.ok ? x.json() : { items: [] }).then(d => {
    const n = (d.items || []).filter(m => m.kind === "mit" && !(m.steps.length ? m.steps.every(s => s.done) : m.done)).length;
    if (!n) return;
    const b = document.createElement("span"); b.className = "nbadge"; b.textContent = n; b.setAttribute("aria-label", n + " open");
    sw.querySelector('button[data-r="work"]').appendChild(b);
  }).catch(() => {});

  // Quick capture: the + button on every page drops a note into the Mission Control Inbox
  const fab = document.createElement("button"); fab.type = "button"; fab.className = "capfab"; fab.textContent = "+"; fab.setAttribute("aria-label", "Add to the Inbox");
  document.body.appendChild(fab);
  fab.onclick = () => {
    const dim = document.createElement("div"); dim.className = "capdim";
    const sh = document.createElement("form"); sh.className = "capsheet"; sh.setAttribute("aria-label", "Add to the Inbox");
    sh.innerHTML = '<h2>Offload it</h2><p>Goes to the Mission Control Inbox. Sort it later.</p>' +
      '<input type="text" maxlength="300" autocomplete="off" aria-label="What\'s on your mind" placeholder="Idea or task">' +
      '<div class="capkind" role="group" aria-label="What is it?"><button type="button" data-k="task" aria-pressed="true">Task</button><button type="button" data-k="idea" aria-pressed="false">Idea</button></div>' +
      '<div class="capbtns"><button type="button" class="no">Close</button><button type="submit" class="go">Save to Inbox</button></div><div class="capmsg" aria-live="polite"></div>';
    document.body.append(dim, sh);
    const inp = sh.querySelector("input"), msg = sh.querySelector(".capmsg"), kinds = sh.querySelector(".capkind");
    let kind = "task";
    kinds.onclick = e => { const b = e.target.closest("button"); if (!b) return; kind = b.dataset.k; kinds.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); };
    const close = () => { dim.remove(); sh.remove(); fab.focus(); };
    dim.onclick = close; sh.querySelector(".no").onclick = close;
    sh.onkeydown = e => { if (e.key === "Escape") close(); };
    sh.onsubmit = async e => {
      e.preventDefault();
      const text = inp.value.trim(); if (!text) { inp.focus(); return; }
      msg.textContent = "Saving…";
      try {
        const res = await fetch("api/mc/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, kind }) });
        if (!res.ok) throw 0;
        inp.value = ""; msg.textContent = "Saved. Add another, or close."; inp.focus();
      } catch { msg.textContent = "Couldn't reach Mission Control. Nothing was saved."; }
    };
    inp.focus();
  };

  // This week, between the routine buttons and the tabs
  let sec;
  const own = document.getElementById("week");
  if (own) { sec = own.closest("section"); }
  else { sec = document.createElement("section"); sec.innerHTML = '<h3>This week</h3><div class="week" id="mweek"></div>'; }
  sec.classList.add("mweek");
  tabs.parentNode.insertBefore(sec, tabs);
  if (own) return; // the Habits page fills its own cards

  const z = n => String(n).padStart(2, "0");
  const iso = d => d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  const nice = t => typeof t === "string" ? (+t.slice(0, 2) % 12 || 12) + ":" + t.slice(3) + (+t.slice(0, 2) < 12 ? "am" : "pm") : "";
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const mon = new Date(now); mon.setDate(now.getDate() - (now.getDay() + 6) % 7);
  const days = [...Array(7)].map((_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
  const workoutDays = document.getElementById("days");
  if (workoutDays) workoutDays.hidden = true;
  async function draw() {
    const box = document.getElementById("mweek"); const out = [];
    const pressed = workoutDays ? [...workoutDays.children].findIndex(b => b.getAttribute("aria-pressed") === "true") : (now.getDay() + 6) % 7;
    for (const [i, d] of days.entries()) {
      const k = iso(d), future = d > now;
      let v = {}, t = {};
      if (!future) { v = await (await fetch("api/routine/" + k)).json(); t = await (await fetch("api/ticks/" + k)).json(); }
      let n = 0;
      if (!future && typeof ALL !== "undefined") {
        const ids = idsOf(["sun", "mon", "tue", "wed", "thu", "fri", "sat"][d.getDay()], lenOf(t));
        const prog = ids.every(id => t[id]);
        n = ALL.filter(it => isDone(it, v) || (it.id === "program" && prog)).length;
      }
      const tag = workoutDays ? "button" : "div";
      out.push(`<${tag} class="wk${i === pressed ? " sel" : ""}" data-i="${i}"${workoutDays ? ' type="button"' : ""}><b>${d.toLocaleDateString(undefined, { weekday: "short" })}</b><span>${future ? "" : nice(v.wake)}</span><i>${future || typeof ALL === "undefined" ? "" : n + "/" + ALL.length}</i></${tag}>`);
    }
    box.innerHTML = out.join("");
  }
  if (workoutDays) {
    document.getElementById("mweek").addEventListener("click", e => { const c = e.target.closest(".wk"); if (!c) return; workoutDays.children[+c.dataset.i].click(); draw(); });
    document.getElementById("list").addEventListener("click", () => setTimeout(draw, 50));
  }
  draw();
})();
