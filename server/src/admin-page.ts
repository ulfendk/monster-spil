/**
 * The admin portal's page: one self-contained HTML document (inline CSS and script, no
 * external files), in Danish and the game's Kanagawa colours. It talks to /admin/api/*.
 * Player names come from devices, so they are only ever inserted as text (textContent),
 * never as HTML.
 */
export const ADMIN_PAGE = /* html */ `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Monsterjagt · forældre</title>
<style>
  :root { --ink:#1f1f28; --ink0:#16161d; --panel:#2a2a37; --panel2:#363646; --text:#dcd7ba; --soft:#c8c093; --muted:#727169;
          --red:#c34043; --green:#76946a; --blue:#2d4f67; --yellow:#e6c384; --wave:#7e9cd8; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  td a { color: var(--yellow); text-decoration: none; border-bottom: 1px dotted var(--yellow); }
  body { margin: 0; background: var(--ink0); color: var(--text); font: 16px/1.45 "Hiragino Maru Gothic ProN", "Hiragino Sans", "M PLUS Rounded 1c", "Noto Sans", system-ui, sans-serif; }
  header { display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: var(--ink); border-bottom: 1px solid var(--panel2); }
  header h1 { margin: 0; font-size: 22px; font-weight: 600; }
  .seal { display: inline-grid; place-items: center; width: 30px; height: 30px; margin-left: 6px; background: var(--red); color: #f0e6d2; border-radius: 4px; transform: rotate(-4deg); font-size: 18px; }
  header .who { color: var(--muted); }
  header button { margin-left: auto; white-space: nowrap; }
  main { max-width: 980px; margin: 0 auto; padding: 16px 20px 60px; }
  h2 { font-size: 18px; margin: 28px 0 10px; color: var(--soft); font-weight: 600; }
  section.card { background: var(--ink); border: 1px solid var(--panel2); border-radius: 12px; padding: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--panel2); vertical-align: middle; }
  th { color: var(--muted); font-weight: 500; font-size: 14px; }
  tr:last-child td { border-bottom: 0; }
  .dot { display: inline-block; width: 14px; height: 14px; border-radius: 50%; margin-right: 8px; vertical-align: -2px; border: 1px solid #0006; }
  .online { color: var(--green); font-size: 13px; margin-left: 6px; }
  .muted { color: var(--muted); font-size: 14px; }
  button, a.button { font: inherit; color: var(--text); background: var(--blue); border: 1px solid #dcd7ba99; border-radius: 10px; padding: 8px 14px; cursor: pointer; text-decoration: none; display: inline-block; }
  button:hover, a.button:hover { filter: brightness(1.12); }
  button.danger { background: var(--red); }
  button.quiet, a.quiet { background: var(--panel2); }
  input { font: inherit; background: var(--ink0); color: var(--text); border: 1px solid var(--panel2); border-radius: 10px; padding: 8px 12px; }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .bar { flex: 1 1 240px; height: 18px; background: var(--panel); border-radius: 9px; overflow: hidden; border: 1px solid var(--panel2); }
  .bar > div { height: 100%; background: var(--red); }
  .error { color: #e46876; min-height: 1.4em; }
  .note { color: var(--muted); font-size: 14px; margin: 10px 0 0; }
  #login { max-width: 380px; margin: 60px auto; }
  #login input { width: 100%; margin: 12px 0; }
  @media (max-width: 700px) { .hide-sm { display: none; } }
</style>
</head>
<body>
<header><h1>Monsterjagt<span class="seal">狩</span></h1><span class="who">forældre</span><button id="logout" class="quiet" hidden>Log ud</button></header>
<main>
  <section id="login" class="card" hidden>
    <h2 style="margin-top:0">Log ind</h2>
    <form id="loginForm">
      <input type="password" id="pw" autocomplete="current-password" placeholder="Admin-adgangskode" required>
      <button type="submit">Log ind</button>
      <p class="error" id="loginError"></p>
    </form>
  </section>

  <div id="app" hidden>
    <h2>Spillere</h2>
    <section class="card">
      <table>
        <thead><tr><th>Spiller</th><th class="hide-sm">Sidst set</th><th>Backup</th><th class="hide-sm">Point</th><th></th></tr></thead>
        <tbody id="players"></tbody>
      </table>
      <p class="note">At slette en spiller fjerner deres point, backup og uafhentede belønninger på serveren. Selve spillet på deres iPad/iPhone røres ikke — spiller de videre, dukker de op igen.</p>
    </section>

    <h2>Dragen</h2>
    <section class="card">
      <div class="row"><strong id="dragonName"></strong><span id="dragonHp" class="muted"></span></div>
      <div class="row" style="margin:12px 0"><div class="bar"><div id="dragonBar"></div></div></div>
      <div class="row">
        <button id="dragonReset">Væk dragen (fuld HP)</button>
        <input id="dragonHpInput" type="number" min="0" step="1" style="width:110px" aria-label="HP">
        <button id="dragonSetHp" class="quiet">Sæt HP</button>
        <button id="dragonSleep" class="quiet">Læg den til at sove</button>
      </div>
      <p class="note">At sætte HP giver ingen belønninger. En ny drage vågner af sig selv hver mandag.</p>
    </section>

    <h2>Pointtavle</h2>
    <section class="card">
      <div class="row"><span id="scoreInfo" class="muted"></span><button id="clearScores" class="danger">Nulstil ugens point</button></div>
    </section>

    <h2>Backups</h2>
    <section class="card">
      <div class="row"><a class="button" href="/admin/api/backups">Hent alle backups</a><span class="muted">En fil med alle spilleres gemte spil, til at gemme et andet sted.</span></div>
    </section>
    <p class="error" id="appError"></p>
  </div>
</main>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const FIGURES = { figur1: "ræv", figur2: "frø", figur3: "panda", figur4: "kat", figur5: "kanin", figur6: "bjørn" };
  const when = (iso) => iso ? new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  const el = (tag, props = {}, children = []) => { const e = Object.assign(document.createElement(tag), props); for (const c of children) e.append(c); return e; };

  async function api(path, options = {}) {
    const res = await fetch(path, { ...options, headers: { "content-type": "application/json", "x-admin": "1", ...(options.headers || {}) }, credentials: "same-origin" });
    if (res.status === 401) { show("login"); throw new Error("login"); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    return body;
  }
  function show(which) {
    $("login").hidden = which !== "login";
    $("app").hidden = which !== "app";
    $("logout").hidden = which !== "app";
  }
  function fail(e) { if (e.message !== "login") $("appError").textContent = "Noget gik galt: " + e.message; }

  async function load() {
    const s = await api("/admin/api/state");
    show("app");
    $("appError").textContent = "";
    const tbody = $("players");
    tbody.replaceChildren();
    if (s.players.length === 0) tbody.append(el("tr", {}, [el("td", { colSpan: 5, className: "muted", textContent: "Ingen spillere endnu." })]));
    for (const p of s.players) {
      const name = el("td", {}, [el("span", { className: "dot" }), document.createTextNode(p.navn)]);
      name.firstChild.style.background = p.farve;
      name.append(el("span", { className: "muted", textContent: " · " + (FIGURES[p.avatarId] || "figur") }));
      if (p.online) name.append(el("span", { className: "online", textContent: "● online" }));
      const backup = el("td");
      if (p.backup) {
        backup.append(el("a", { href: "/admin/api/backups/" + encodeURIComponent(p.playerId), textContent: p.backup.creatures + " monstre", title: "Hent backup" }));
        backup.append(el("div", { className: "muted", textContent: when(p.backup.savedAt) }));
      } else backup.append(el("span", { className: "muted", textContent: "ingen" }));
      const del = el("button", { className: "danger", textContent: "Slet" });
      del.onclick = async () => {
        if (!confirm("Slet " + p.navn + "? Deres point, backup og belønninger på serveren forsvinder.")) return;
        try { await api("/admin/api/players/" + encodeURIComponent(p.playerId) + "/delete", { method: "POST" }); await load(); } catch (e) { fail(e); }
      };
      tbody.append(el("tr", {}, [
        name,
        el("td", { className: "hide-sm muted", textContent: when(p.lastSeen) }),
        backup,
        el("td", { className: "hide-sm", textContent: String(p.points) }),
        el("td", {}, [del]),
      ]));
    }
    const d = s.dragon;
    $("dragonName").textContent = d.navn + (d.defeated ? " sover" : "");
    $("dragonHp").textContent = d.hp + " / " + d.maxHp + " HP · " + d.contributors + " har kæmpet mod den i denne uge";
    $("dragonBar").style.width = (100 * d.hp / d.maxHp) + "%";
    $("dragonHpInput").max = d.maxHp;
    $("dragonHpInput").value = d.hp;
    $("scoreInfo").textContent = s.scoreEvents + " pointhændelser gemt";
  }

  $("loginForm").onsubmit = async (ev) => {
    ev.preventDefault();
    $("loginError").textContent = "";
    const res = await fetch("/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("pw").value }), credentials: "same-origin" });
    if (!res.ok) { $("loginError").textContent = res.status === 401 ? "Forkert adgangskode (eller for mange forsøg — vent 10 minutter)." : "Serveren svarer ikke."; return; }
    $("pw").value = "";
    load().catch(fail);
  };
  $("logout").onclick = async () => { await fetch("/admin/logout", { method: "POST", credentials: "same-origin" }); show("login"); };
  const dragon = (body) => api("/admin/api/dragon", { method: "POST", body: JSON.stringify(body) }).then(load).catch(fail);
  $("dragonReset").onclick = () => confirm("Væk dragen med fuld HP? Ugens skade på den nulstilles.") && dragon({ action: "reset" });
  $("dragonSetHp").onclick = () => dragon({ action: "hp", hp: Number($("dragonHpInput").value) });
  $("dragonSleep").onclick = () => confirm("Læg dragen til at sove til mandag (uden belønninger)?") && dragon({ action: "hp", hp: 0 });
  $("clearScores").onclick = async () => {
    if (!confirm("Nulstil alle point for denne uge?")) return;
    try { await api("/admin/api/scores/clear", { method: "POST" }); await load(); } catch (e) { fail(e); }
  };
  load().catch(() => show("login"));
})();
</script>
</body>
</html>
`;
