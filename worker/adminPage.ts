// The dashboard page itself. No backticks or dollar-brace sequences inside: it is one template literal.

export const ADMIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Naija City Dashboard</title>
<style>
:root{--bg:#f6f5f1;--card:#fff;--ink:#16181d;--mute:#6b7280;--line:#e5e3dc;--accent:#0a7d4f;--accent2:#c9a227;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#171a21;--ink:#eceae4;--mute:#9aa0aa;--line:#272b35;--accent:#34c38f;--accent2:#e3be4a;--bad:#f97066}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:20px 16px 60px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
h1{font-size:20px;margin:0}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin:26px 0 10px}
button,input,select{font:inherit;color:inherit}
button{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:7px 12px;cursor:pointer}
button:hover{border-color:var(--accent)}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
input,select{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.tile .n{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
.tile .l{color:var(--mute);font-size:12px;margin-top:2px}
.tile.hero .n{color:var(--accent)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:10px}
.bars{display:flex;align-items:flex-end;gap:3px;height:110px;margin-top:10px}
.bars div{flex:1;background:var(--accent);border-radius:3px 3px 0 0;min-height:2px;opacity:.85}
.bars.b div{background:var(--accent2)}
.axis{display:flex;justify-content:space-between;color:var(--mute);font-size:11px;margin-top:4px}
.tools{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.tools input{flex:1;min-width:200px}
.tablewrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;white-space:nowrap}
th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line)}
th{color:var(--mute);font-weight:600;font-size:12px;cursor:pointer;user-select:none}
tr:last-child td{border-bottom:0}
tbody tr{cursor:pointer}
tbody tr:hover{background:color-mix(in srgb,var(--accent) 7%,transparent)}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.pill{display:inline-block;font-size:11px;padding:1px 7px;border-radius:99px;background:var(--line);color:var(--mute)}
.pill.bad{background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad)}
.pager{display:flex;align-items:center;justify-content:space-between;margin-top:10px;color:var(--mute)}
.login{max-width:360px;margin:18vh auto;text-align:center}
.login input{width:100%;margin:14px 0 10px}
.err{color:var(--bad);min-height:20px}
dialog{border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--ink);width:min(560px,calc(100vw - 24px));padding:18px}
dialog::backdrop{background:rgba(0,0,0,.5)}
dl{display:grid;grid-template-columns:130px 1fr;gap:6px 12px;margin:12px 0}
dt{color:var(--mute)}dd{margin:0;word-break:break-all}
.hidden{display:none}
.mute{color:var(--mute)}
</style>
</head>
<body>
<div id="login" class="login hidden">
  <h1>Naija City Dashboard</h1>
  <input id="key" type="password" placeholder="Admin key" autocomplete="current-password">
  <button class="primary" id="go" style="width:100%">Open</button>
  <div class="err" id="loginErr"></div>
</div>

<div id="app" class="wrap hidden">
  <header>
    <h1>Naija City Dashboard</h1>
    <div><span class="mute" id="stamp"></span> <button id="refresh">Refresh</button> <button id="out">Sign out</button></div>
  </header>

  <h2>Online now <span id="onlineN"></span></h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Player</th><th>Where</th><th>Online for</th><th class="num">Room</th></tr></thead>
    <tbody id="online"></tbody>
  </table></div>

  <h2>Accounts</h2>
  <div class="grid" id="accounts"></div>
  <h2>Activity</h2>
  <div class="grid" id="activity"></div>
  <h2>Economy and content</h2>
  <div class="grid" id="econ"></div>

  <h2>Last 30 days</h2>
  <div class="charts">
    <div class="card"><b>New accounts per day</b><div class="bars" id="cSignups"></div><div class="axis" id="aSignups"></div></div>
    <div class="card"><b>Active players per day</b><div class="bars b" id="cActive"></div><div class="axis" id="aActive"></div></div>
  </div>

  <h2>Players</h2>
  <div class="tools">
    <input id="q" type="search" placeholder="Search username, name, email or uid">
    <select id="sort">
      <option value="joined">Newest</option><option value="seen">Last seen</option>
      <option value="balance">Wallet</option><option value="savings">Savings</option><option value="name">Name</option>
    </select>
    <button id="dir">Desc</button>
  </div>
  <div class="tablewrap"><table>
    <thead><tr><th>Player</th><th>Email</th><th>Joined</th><th>Last seen</th><th class="num">Wallet</th><th class="num">Savings</th></tr></thead>
    <tbody id="rows"></tbody>
  </table></div>
  <div class="pager"><span id="count"></span><span><button id="prev">Prev</button> <button id="next">Next</button></span></div>
</div>

<dialog id="dlg"><div id="dlgBody"></div><div style="text-align:right"><button id="close">Close</button></div></dialog>

<script>
(function () {
  var KEY = 'dash-key';
  var $ = function (id) { return document.getElementById(id); };
  var state = { page: 0, dir: 'desc', timer: 0 };
  var key = '';
  try { key = localStorage.getItem(KEY) || ''; } catch (e) {}

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function num(n) { return Number(n || 0).toLocaleString(); }
  function money(n) { return '\\u20A6' + num(n); }
  function ago(ms, now) {
    if (!ms) return 'never';
    var s = Math.max(0, Math.round(((now || Date.now()) - ms) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function date(ms) { return ms ? new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '-'; }

  function api(path) {
    return fetch('/api/admin/' + path, { headers: { 'x-admin-key': key } }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (b) {
        if (!r.ok) { var e = new Error(b.error || 'Request failed'); e.status = r.status; throw e; }
        return b;
      });
    });
  }

  function show(app) {
    $('login').classList.toggle('hidden', app);
    $('app').classList.toggle('hidden', !app);
  }

  function tiles(el, items) {
    el.innerHTML = items.map(function (t) {
      return '<div class="tile' + (t[3] ? ' hero' : '') + '"><div class="n">' + esc(t[1]) + '</div><div class="l">' + esc(t[0]) + '</div></div>';
    }).join('');
  }

  function bars(chart, axis, rows) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.n; }).concat([1]));
    chart.innerHTML = rows.map(function (r) {
      return '<div title="' + esc(r.day) + ': ' + r.n + '" style="height:' + Math.max(2, Math.round(r.n / max * 100)) + '%"></div>';
    }).join('');
    axis.innerHTML = '<span>' + esc(rows[0].day.slice(5)) + '</span><span>peak ' + num(max) + '</span><span>' + esc(rows[rows.length - 1].day.slice(5)) + '</span>';
  }

  function overview() {
    return api('overview').then(function (o) {
      $('stamp').textContent = 'Updated ' + new Date(o.now).toLocaleTimeString();
      tiles($('accounts'), [
        ['Total accounts', num(o.accounts.total), 0, 1],
        ['New in 24h', num(o.accounts.new24h)], ['New in 7 days', num(o.accounts.new7d)], ['New in 30 days', num(o.accounts.new30d)],
        ['Picked a username', num(o.accounts.withUsername)], ['With an email', num(o.accounts.withEmail)]
      ]);
      tiles($('activity'), [
        ['Online now (room)', o.live ? num(o.live.online) : '-', 0, 1],
        ['Seen in 15 min', num(o.activity.online15m)], ['Active 24h', num(o.activity.active24h)],
        ['Active 7 days', num(o.activity.active7d)], ['Active 30 days', num(o.activity.active30d)],
        ['Page views today', o.live ? num(o.live.visitsToday) : '-'], ['Page views all time', o.live ? num(o.live.visitsTotal) : '-']
      ]);
      tiles($('econ'), [
        ['Cash in wallets', money(o.money.inWallets)], ['Savings in banks', money(o.money.inBanks)],
        ['In jail now', num(o.jailed)], ['Snaps', num(o.content.snaps)], ['Businesses', num(o.content.businesses)],
        ['Crews', num(o.content.crews)], ['Game matches', num(o.content.matches)], ['Push devices', num(o.content.pushSubscribers)]
      ]);
      bars($('cSignups'), $('aSignups'), o.signups);
      bars($('cActive'), $('aActive'), o.activeByDay);
    });
  }

  // 'city:kaduna', 'place:kaduna:secretariat', 'estate:kaduna:12', 'home:<uid>' in words.
  function where(area) {
    if (!area) return 'Loading in';
    var p = area.split(':');
    var cap = function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : ''; };
    if (p[0] === 'city') return cap(p[1]) + ', outdoors';
    if (p[0] === 'place') return cap(p[2]) + ', ' + cap(p[1]);
    if (p[0] === 'estate') return 'Estate plot ' + p[2] + ', ' + cap(p[1]);
    if (p[0] === 'home') return 'In a house';
    return area;
  }
  function since(ms, now) {
    if (!ms) return '-';
    var m = Math.max(0, Math.round((now - ms) / 60000));
    return m < 1 ? 'just joined' : m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
  }

  function online() {
    return api('online').then(function (r) {
      $('onlineN').textContent = '(' + r.players.length + ')';
      $('online').innerHTML = r.players.map(function (u) {
        return '<tr data-uid="' + esc(u.uid) + '"><td>@' + esc(u.username) + '</td><td>' + esc(where(u.area)) + '</td>' +
          '<td>' + esc(since(u.since, r.now)) + '</td><td class="num">' + esc(u.shard) + '</td></tr>';
      }).join('') || '<tr><td colspan="4" class="mute">Nobody is in the game right now.</td></tr>';
    });
  }

  function players() {
    var p = new URLSearchParams({ q: $('q').value, sort: $('sort').value, dir: state.dir, page: state.page });
    return api('players?' + p).then(function (r) {
      var now = Date.now();
      $('rows').innerHTML = r.players.map(function (u) {
        var who = u.username ? '@' + esc(u.username) : '<span class="mute">no username</span>';
        var jail = u.jailed_until && u.jailed_until > now ? ' <span class="pill bad">jailed</span>' : '';
        return '<tr data-uid="' + esc(u.uid) + '"><td>' + who + (u.name ? ' <span class="mute">' + esc(u.name) + '</span>' : '') + jail + '</td>' +
          '<td>' + esc(u.email || '-') + '</td><td title="' + esc(date(u.created_at)) + '">' + esc(ago(u.created_at, now)) + '</td>' +
          '<td>' + esc(ago(u.last_seen, now)) + '</td><td class="num">' + money(u.balance) + '</td><td class="num">' + money(u.savings) + '</td></tr>';
      }).join('') || '<tr><td colspan="6" class="mute">No players found.</td></tr>';
      var from = r.total ? r.page * r.pageSize + 1 : 0;
      $('count').textContent = from + '-' + Math.min(r.total, (r.page + 1) * r.pageSize) + ' of ' + num(r.total);
      $('prev').disabled = r.page === 0;
      $('next').disabled = (r.page + 1) * r.pageSize >= r.total;
    });
  }

  function detail(uid) {
    api('player?uid=' + encodeURIComponent(uid)).then(function (d) {
      var p = d.player;
      var rows = [
        ['Username', p.username ? '@' + p.username : '-'], ['Name', p.name || '-'], ['Email', p.email || '-'], ['Birthdate', p.birthdate || '-'],
        ['Joined', date(p.created_at)], ['Last seen', date(p.last_seen) + ' (' + ago(p.last_seen, d.now) + ')'],
        ['Wallet', d.wallet ? money(d.wallet.balance) : '-'], ['Savings', d.bank ? money(d.bank.savings) : '-'],
        ['Jailed until', p.jailed_until && p.jailed_until > d.now ? date(p.jailed_until) : 'no'],
        ['Civic ban', p.civic_banned_at ? date(p.civic_banned_at) : 'no'],
        ['Snaps / businesses', d.counts.snaps + ' / ' + d.counts.businesses], ['Push devices', d.counts.pushDevices], ['UID', p.uid]
      ];
      var recent = d.recent.map(function (r) {
        return '<tr><td>' + esc(r.kind) + '</td><td>' + esc(r.ref || '') + '</td><td class="num">' + money(r.amount) + '</td><td>' + esc(ago(r.created_at, d.now)) + '</td></tr>';
      }).join('');
      $('dlgBody').innerHTML = '<h2 style="margin:0;color:var(--ink);font-size:17px;text-transform:none;letter-spacing:0">' + esc(p.username ? '@' + p.username : (p.name || 'Player')) + '</h2>' +
        '<dl>' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>' +
        '<b>Recent money moves</b> <span class="mute">(' + num(d.counts.ledger) + ' total)</span>' +
        '<div class="tablewrap" style="margin:8px 0 14px"><table><tbody>' + (recent || '<tr><td class="mute">None yet.</td></tr>') + '</tbody></table></div>';
      $('dlg').showModal();
    }).catch(function (e) { alert(e.message); });
  }

  function load() {
    return Promise.all([overview(), online(), players()]).then(function () { show(true); }).catch(function (e) {
      if (e.status === 401 || e.status === 429) {
        try { localStorage.removeItem(KEY); } catch (x) {}
        key = '';
        show(false);
        $('loginErr').textContent = e.message;
      } else { $('stamp').textContent = 'Error: ' + e.message; show(true); }
    });
  }

  $('go').onclick = function () {
    key = $('key').value.trim();
    if (!key) return;
    try { localStorage.setItem(KEY, key); } catch (e) {}
    $('loginErr').textContent = '';
    load();
  };
  $('key').onkeydown = function (e) { if (e.key === 'Enter') $('go').click(); };
  $('refresh').onclick = load;
  $('out').onclick = function () { try { localStorage.removeItem(KEY); } catch (e) {} key = ''; show(false); };
  $('q').oninput = function () { clearTimeout(state.timer); state.timer = setTimeout(function () { state.page = 0; players(); }, 300); };
  $('sort').onchange = function () { state.page = 0; players(); };
  $('dir').onclick = function () { state.dir = state.dir === 'desc' ? 'asc' : 'desc'; $('dir').textContent = state.dir === 'desc' ? 'Desc' : 'Asc'; state.page = 0; players(); };
  $('prev').onclick = function () { state.page = Math.max(0, state.page - 1); players(); };
  $('next').onclick = function () { state.page++; players(); };
  $('rows').onclick = $('online').onclick = function (e) { var tr = e.target.closest('tr[data-uid]'); if (tr) detail(tr.getAttribute('data-uid')); };
  $('close').onclick = function () { $('dlg').close(); };
  setInterval(function () { if (!document.hidden && key && !$('dlg').open) overview().catch(function () {}); }, 60000);
  setInterval(function () { if (!document.hidden && key && !$('dlg').open) online().catch(function () {}); }, 15000);

  if (key) load(); else show(false);
})();
</script>
</body>
</html>`;
