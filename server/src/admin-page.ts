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
  .games { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 12px; }
  .game { text-align: left; background: var(--ink); border: 1px solid var(--panel2); border-radius: 12px; padding: 12px 14px; }
  .game.chosen { border-color: var(--yellow); box-shadow: 0 0 0 1px var(--yellow) inset; }
  .game strong { display: block; font-size: 17px; }
  code { font: 15px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--ink0); border: 1px solid var(--panel2); border-radius: 6px; padding: 2px 6px; color: var(--yellow); }
  h2.game-title { font-size: 22px; color: var(--text); margin-top: 36px; padding-top: 18px; border-top: 1px solid var(--panel2); }
  .pending { color: var(--yellow); font-size: 13px; margin-left: 6px; }
  select { font: inherit; background: var(--ink0); color: var(--text); border: 1px solid var(--panel2); border-radius: 10px; padding: 8px 10px; }
  label.check { display: inline-flex; gap: 6px; align-items: center; margin-right: 14px; }
  ul.history { list-style: none; padding: 0; margin: 12px 0 0; }
  ul.history li { padding: 6px 0; border-bottom: 1px solid var(--panel2); }
  ul.history li:last-child { border-bottom: 0; }
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
    <h2>Spil</h2>
    <div id="games" class="games"></div>
    <section class="card" style="margin-top:12px">
      <form id="newGame" class="row">
        <strong>Nyt spil</strong>
        <input id="newName" placeholder="Navn, fx Klassen" maxlength="30" required>
        <input id="newKey" placeholder="Spilnøgle" minlength="6" maxlength="40" required>
        <button type="button" id="newKeyMake" class="quiet">Lav en nøgle</button>
        <button type="submit">Opret</button>
      </form>
      <p class="note">Hvert spil er sin egen verden med egne spillere, monstre, pointtavle og drage. Giv spilnøglen til dem, der skal være med — de trykker ＋ <em>Nyt spil</em> i spillet og skriver den.</p>
    </section>

    <div id="gameView" hidden>
    <h2 class="game-title" id="gameTitle"></h2>
    <section class="card">
      <div class="row"><span class="muted">Spilnøgle:</span> <code id="gameKey"></code></div>
      <div class="row" style="margin-top:12px">
        <input id="renameGame" maxlength="30" aria-label="Spillets navn"><button id="renameGameBtn" class="quiet">Omdøb spillet</button>
      </div>
      <div class="row" style="margin-top:12px">
        <input id="changeKey" minlength="6" maxlength="40" placeholder="Ny spilnøgle" aria-label="Ny spilnøgle"><button type="button" id="changeKeyMake" class="quiet">Lav en nøgle</button><button id="changeKeyBtn">Skift nøgle</button>
      </div>
      <div class="row" style="margin-top:12px"><button id="deleteGame" class="danger">Slet spillet</button></div>
      <p class="note">Skifter du nøglen, bliver alle der spiller lige nu sendt ud og skal skrive den nye nøgle. Sletter du spillet, forsvinder dets spillere, point, drage og backups fra serveren (spillet på den enkelte iPad/iPhone bliver liggende).</p>
    </section>

    <h2>Spillere</h2>
    <section class="card">
      <table>
        <thead><tr><th>Spiller</th><th class="hide-sm">Sidst set</th><th>Backup</th><th class="hide-sm">Point</th><th></th></tr></thead>
        <tbody id="players"></tbody>
      </table>
      <p class="note">Et nyt navn slår igennem på deres iPad/iPhone, næste gang de er online. At slette en spiller fjerner deres point, backup og uafhentede belønninger på serveren. Selve spillet på deres iPad/iPhone røres ikke — spiller de videre, dukker de op igen.</p>
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

    <h2>Naturkatastrofer</h2>
    <section class="card">
      <div class="row"><strong id="disasterStatus"></strong><span id="disasterNext" class="muted"></span></div>
      <div class="row" style="margin-top:12px">
        <button id="disasterToggle"></button>
      </div>
      <div class="row" style="margin-top:12px">
        <label>Hvor ofte, i gennemsnit <select id="disasterMean">
          <option value="15">hvert kvarter</option><option value="30">hver halve time</option><option value="60">hver time</option>
          <option value="120">hver 2. time</option><option value="240">hver 4. time</option><option value="480">hver 8. time</option>
          <option value="720">hver 12. time</option><option value="1440">en gang i døgnet</option><option value="2880">hvert 2. døgn</option>
          <option value="10080">en gang om ugen</option>
        </select></label>
        <label>Tilfældighed <select id="disasterRandom">
          <option value="0">ingen (præcis)</option><option value="0.25">lidt</option><option value="0.5">noget</option><option value="0.75">meget</option><option value="1">helt vildt</option>
        </select></label>
      </div>
      <div class="row" id="disasterKinds" style="margin-top:12px"></div>
      <div class="row" style="margin-top:12px"><button id="disasterSave">Gem indstillinger</button></div>
      <div class="row" style="margin-top:18px">
        <select id="disasterKind"></select><button id="disasterTrigger">Udløs nu</button>
        <button id="disasterHeal" class="quiet">Hel kortet</button>
        <button id="disasterReset" class="danger">Nulstil kortet</button>
      </div>
      <p class="note" id="disasterChanges"></p>
      <ul class="history" id="disasterHistory"></ul>
      <p class="note">Katastrofer advarer først (et par sekunder til at løbe væk); den der står i farezonen, besvimer. Brændt græs, vand og væltede træer heler af sig selv; kratere, nye bjerge og ufo-vraget bliver. <em>Hel kortet</em> heler alt det bløde med det samme, <em>Nulstil kortet</em> fjerner alle ændringer. Ufoen er meget sjælden.</p>
    </section>

    <h2>Pointtavle</h2>
    <section class="card">
      <div class="row"><span id="scoreInfo" class="muted"></span><button id="clearScores" class="danger">Nulstil ugens point</button></div>
    </section>

    <h2>Backups</h2>
    <section class="card">
      <div class="row"><a class="button" id="allBackups" href="#">Hent alle backups</a><span class="muted">En fil med alle spilleres gemte spil i dette spil, til at gemme et andet sted.</span></div>
    </section>
    </div>
    <p class="error" id="appError"></p>
  </div>
</main>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const FIGURES = { figur1: "ræv", figur2: "frø", figur3: "panda", figur4: "kat", figur5: "kanin", figur6: "bjørn" };
  const when = (iso) => iso ? new Date(iso).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  const el = (tag, props = {}, children = []) => { const e = Object.assign(document.createElement(tag), props); for (const c of children) e.append(c); return e; };
  const LAST = "mj-admin-game";
  let chosen = (() => { try { return localStorage.getItem(LAST) || ""; } catch { return ""; } })();
  const g = (path) => "/admin/api/games/" + encodeURIComponent(chosen) + path;

  // Easy to read aloud and type on an iPad: "modig-ugle-472".
  const WORDS1 = ["glad", "modig", "stille", "hurtig", "vild", "klog", "lille", "stor", "rød", "blå", "grøn", "gul", "sjov", "blød", "stærk", "søvnig"];
  const WORDS2 = ["ræv", "frø", "panda", "kat", "kanin", "bjørn", "drage", "ugle", "hval", "tiger", "odder", "ørn", "mus", "hest", "gris", "sæl"];
  function makeKey() {
    const r = crypto.getRandomValues(new Uint32Array(3));
    return WORDS1[r[0] % WORDS1.length] + "-" + WORDS2[r[1] % WORDS2.length] + "-" + (100 + (r[2] % 900));
  }

  async function api(path, options = {}) {
    const res = await fetch(path, { ...options, headers: { "content-type": "application/json", "x-admin": "1", ...(options.headers || {}) }, credentials: "same-origin" });
    if (res.status === 401) { show("login"); throw new Error("login"); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || res.statusText);
    return body;
  }
  const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body || {}) });
  function show(which) {
    $("login").hidden = which !== "login";
    $("app").hidden = which !== "app";
    $("logout").hidden = which !== "app";
  }
  function fail(e) { if (e.message !== "login") $("appError").textContent = "Noget gik galt: " + e.message; }
  function choose(id) {
    chosen = id;
    try { localStorage.setItem(LAST, id); } catch {}
  }

  async function load() {
    const { games } = await api("/admin/api/games");
    show("app");
    $("appError").textContent = "";
    if (!games.some((x) => x.id === chosen)) choose(games[0] ? games[0].id : "");
    const list = $("games");
    list.replaceChildren();
    if (games.length === 0) list.append(el("p", { className: "muted", textContent: "Ingen spil endnu — opret det første herunder." }));
    for (const game of games) {
      const card = el("button", { className: "game" + (game.id === chosen ? " chosen" : "") }, [
        el("strong", { textContent: game.navn }),
        el("span", { className: "muted", textContent: game.players + (game.players === 1 ? " spiller" : " spillere") + (game.online ? " · " : "") }),
      ]);
      if (game.online) card.append(el("span", { className: "online", textContent: "● " + game.online + " online" }));
      card.append(el("div", {}, [el("code", { textContent: game.key })]));
      card.onclick = () => { choose(game.id); load().catch(fail); };
      list.append(card);
    }
    const game = games.find((x) => x.id === chosen);
    $("gameView").hidden = !game;
    if (!game) return;
    $("gameTitle").textContent = game.navn;
    $("gameKey").textContent = game.key;
    if (document.activeElement !== $("renameGame")) $("renameGame").value = game.navn;
    $("allBackups").href = g("/backups");
    await loadGame();
  }

  async function loadGame() {
    const s = await api(g("/state"));
    const tbody = $("players");
    tbody.replaceChildren();
    if (s.players.length === 0) tbody.append(el("tr", {}, [el("td", { colSpan: 5, className: "muted", textContent: "Ingen spillere endnu." })]));
    for (const p of s.players) {
      const name = el("td", {}, [el("span", { className: "dot" }), document.createTextNode(p.navn)]);
      name.firstChild.style.background = p.farve;
      name.append(el("span", { className: "muted", textContent: " · " + (FIGURES[p.avatarId] || "figur") }));
      if (p.online) name.append(el("span", { className: "online", textContent: "● online" }));
      if (p.renamePending) name.append(el("span", { className: "pending", title: "Deres iPad/iPhone får det nye navn, næste gang de er online", textContent: "nyt navn på vej" }));
      const backup = el("td");
      if (p.backup) {
        backup.append(el("a", { href: g("/backups/" + encodeURIComponent(p.playerId)), textContent: p.backup.creatures + (p.backup.creatures === 1 ? " monster" : " monstre"), title: "Hent backup" }));
        backup.append(el("div", { className: "muted", textContent: when(p.backup.savedAt) }));
      } else backup.append(el("span", { className: "muted", textContent: "ingen" }));
      const ren = el("button", { className: "quiet", textContent: "Omdøb" });
      ren.onclick = async () => {
        const navn = prompt("Nyt navn til " + p.navn + " (højst 12 tegn):", p.navn);
        if (!navn || navn.trim() === p.navn) return;
        try { await post(g("/players/" + encodeURIComponent(p.playerId) + "/rename"), { navn }); await loadGame(); } catch (e) { fail(e); }
      };
      const del = el("button", { className: "danger", textContent: "Slet" });
      del.onclick = async () => {
        if (!confirm("Slet " + p.navn + "? Deres point, backup og belønninger på serveren forsvinder.")) return;
        try { await post(g("/players/" + encodeURIComponent(p.playerId) + "/delete")); await loadGame(); } catch (e) { fail(e); }
      };
      tbody.append(el("tr", {}, [
        name,
        el("td", { className: "hide-sm muted", textContent: when(p.lastSeen) }),
        backup,
        el("td", { className: "hide-sm", textContent: String(p.points) }),
        el("td", {}, [el("div", { className: "row" }, [ren, del])]),
      ]));
    }
    const d = s.dragon;
    $("dragonName").textContent = d.navn + (d.defeated ? " sover" : "");
    $("dragonHp").textContent = d.hp + " / " + d.maxHp + " HP · " + d.contributors + " har kæmpet mod den i denne uge";
    $("dragonBar").style.width = (100 * d.hp / d.maxHp) + "%";
    $("dragonHpInput").max = d.maxHp;
    $("dragonHpInput").value = d.hp;
    $("scoreInfo").textContent = s.scoreEvents + " pointhændelser gemt";
    showDisasters(s.disasters);
  }

  let disasterSettings = null;
  const kindName = {};
  function showDisasters(d) {
    disasterSettings = d.settings;
    for (const k of d.kinds) kindName[k.kind] = k.navn;
    $("disasterStatus").textContent = d.active ? kindName[d.active.kind] + " er på vej!" : d.settings.enabled ? "Slået til" : "Stoppet";
    $("disasterNext").textContent = d.active ? "rammer kl. " + new Date(d.active.strikeAt).toLocaleTimeString("da-DK") : d.nextAt ? "· næste omkring " + when(d.nextAt) : "";
    $("disasterToggle").textContent = d.settings.enabled ? "Stop katastrofer" : "Start katastrofer";
    $("disasterToggle").className = d.settings.enabled ? "danger" : "";
    const mean = $("disasterMean");
    if (![...mean.options].some((o) => Number(o.value) === d.settings.meanMinutes)) mean.append(el("option", { value: String(d.settings.meanMinutes), textContent: "hvert " + d.settings.meanMinutes + ". minut" }));
    mean.value = String(d.settings.meanMinutes);
    const rnd = $("disasterRandom");
    const nearest = [...rnd.options].reduce((best, o) => Math.abs(Number(o.value) - d.settings.randomness) < Math.abs(Number(best.value) - d.settings.randomness) ? o : best);
    rnd.value = nearest.value;
    const kinds = $("disasterKinds");
    kinds.replaceChildren();
    for (const k of d.kinds) {
      const box = el("input", { type: "checkbox", checked: d.settings.kinds[k.kind] });
      box.dataset.kind = k.kind;
      kinds.append(el("label", { className: "check" }, [box, document.createTextNode(k.navn)]));
    }
    const pick = $("disasterKind");
    const chosen = pick.value;
    pick.replaceChildren(el("option", { value: "", textContent: "Tilfældig" }), ...d.kinds.map((k) => el("option", { value: k.kind, textContent: k.navn })));
    pick.value = chosen;
    const c = d.changes;
    $("disasterChanges").textContent = "På kortet nu: " + c.soft + " felter der heler, " + c.hard + " varige ændringer, " + c.zones + " steder med sjældne monstre" + (c.spawns ? ", " + c.spawns + " ufo-væsen" : "") + ".";
    const list = $("disasterHistory");
    list.replaceChildren();
    for (const h of d.history.slice(0, 8)) {
      list.append(el("li", { textContent: when(h.at) + " — " + (kindName[h.kind] || h.kind) + " ved (" + h.x + ", " + h.y + ")" + (h.struck ? " · " + h.struck + " besvimede" : "") }));
    }
  }
  const disasterPost = (path, body) => post(g("/disasters/" + path), body).then(loadGame).catch(fail);
  $("disasterToggle").onclick = () => disasterSettings && disasterPost("settings", { enabled: !disasterSettings.enabled });
  $("disasterSave").onclick = () => {
    const kinds = {};
    for (const box of $("disasterKinds").querySelectorAll("input")) kinds[box.dataset.kind] = box.checked;
    disasterPost("settings", { meanMinutes: Number($("disasterMean").value), randomness: Number($("disasterRandom").value), kinds });
  };
  $("disasterTrigger").onclick = () => disasterPost("trigger", $("disasterKind").value ? { kind: $("disasterKind").value } : {});
  $("disasterHeal").onclick = () => confirm("Hel alt brændt græs, vand, væltede træer og revner med det samme?") && disasterPost("heal");
  $("disasterReset").onclick = () => confirm("Nulstil kortet? Alle ændringer fra katastrofer forsvinder — også kratere og nye bjerge.") && disasterPost("reset");

  $("loginForm").onsubmit = async (ev) => {
    ev.preventDefault();
    $("loginError").textContent = "";
    const res = await fetch("/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("pw").value }), credentials: "same-origin" });
    if (!res.ok) { $("loginError").textContent = res.status === 401 ? "Forkert adgangskode (eller for mange forsøg — vent 10 minutter)." : "Serveren svarer ikke."; return; }
    $("pw").value = "";
    load().catch(fail);
  };
  $("logout").onclick = async () => { await fetch("/admin/logout", { method: "POST", credentials: "same-origin" }); show("login"); };

  $("newKeyMake").onclick = () => { $("newKey").value = makeKey(); };
  $("changeKeyMake").onclick = () => { $("changeKey").value = makeKey(); };
  $("newGame").onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const made = await post("/admin/api/games", { navn: $("newName").value, key: $("newKey").value });
      $("newName").value = ""; $("newKey").value = "";
      choose(made.gameId);
      await load();
    } catch (e) { fail(e); }
  };
  $("renameGameBtn").onclick = async () => {
    try { await post(g("/rename"), { navn: $("renameGame").value }); await load(); } catch (e) { fail(e); }
  };
  $("changeKeyBtn").onclick = async () => {
    const key = $("changeKey").value.trim();
    if (!key) return;
    if (!confirm("Skift spilnøglen til \u201d" + key + "\u201d? Alle der spiller lige nu bliver sendt ud og skal skrive den nye nøgle.")) return;
    try { await post(g("/key"), { key }); $("changeKey").value = ""; await load(); } catch (e) { fail(e); }
  };
  $("deleteGame").onclick = async () => {
    const navn = $("gameTitle").textContent;
    const typed = prompt("Slet spillet \u201d" + navn + "\u201d med alle dets spillere, point, drage og backups? Det kan ikke fortrydes.\\n\\nSkriv spillets navn for at slette det:");
    if (typed === null) return;
    if (typed.trim() !== navn) { $("appError").textContent = "Navnet passede ikke — intet blev slettet."; return; }
    try { await post(g("/delete")); await load(); } catch (e) { fail(e); }
  };
  const dragon = (body) => post(g("/dragon"), body).then(loadGame).catch(fail);
  $("dragonReset").onclick = () => confirm("Væk dragen med fuld HP? Ugens skade på den nulstilles.") && dragon({ action: "reset" });
  $("dragonSetHp").onclick = () => dragon({ action: "hp", hp: Number($("dragonHpInput").value) });
  $("dragonSleep").onclick = () => confirm("Læg dragen til at sove til mandag (uden belønninger)?") && dragon({ action: "hp", hp: 0 });
  $("clearScores").onclick = async () => {
    if (!confirm("Nulstil alle point for denne uge i dette spil?")) return;
    try { await post(g("/scores/clear")); await loadGame(); } catch (e) { fail(e); }
  };
  load().catch(() => show("login"));
})();
</script>
</body>
</html>
`;
