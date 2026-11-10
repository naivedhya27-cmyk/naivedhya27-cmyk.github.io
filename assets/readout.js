/* readout.js: the rollout readout. Reads a team's daily usage export from the Cursor (SpaceXSI) Admin API
   (POST /teams/daily-usage-data, documented at cursor.com/docs/account/teams/admin-api) in the browser and writes the
   adoption readout. The file is read with FileReader and never leaves this page: there is no network call here.
   Emails are never shown; seats are numbered. */
(function () {
  'use strict';
  var NUMF = ['totalLinesAdded', 'totalLinesDeleted', 'acceptedLinesAdded', 'acceptedLinesDeleted', 'totalApplies', 'totalAccepts',
    'totalRejects', 'totalTabsShown', 'totalTabsAccepted', 'composerRequests', 'chatRequests', 'agentRequests', 'cmdkUsages',
    'subscriptionIncludedReqs', 'apiKeyReqs', 'usageBasedReqs', 'bugbotUsages'];
  var STRF = ['mostUsedModel', 'applyMostUsedExtension', 'tabMostUsedExtension', 'clientVersion'];
  // field names as the API writes them, plus the spellings a CSV header may use (compared lower-case, letters and digits only)
  var ALIAS = {
    userId: ['userid', 'user', 'memberid'], day: ['day', 'date', 'datestring'], email: ['email', 'useremail'],
    isActive: ['isactive', 'active'],
    totalLinesAdded: ['totallinesadded', 'linesadded'], totalLinesDeleted: ['totallinesdeleted', 'linesdeleted'],
    acceptedLinesAdded: ['acceptedlinesadded'], acceptedLinesDeleted: ['acceptedlinesdeleted'],
    totalApplies: ['totalapplies', 'applies'], totalAccepts: ['totalaccepts', 'accepts'], totalRejects: ['totalrejects', 'rejects'],
    totalTabsShown: ['totaltabsshown', 'tabsshown'], totalTabsAccepted: ['totaltabsaccepted', 'tabsaccepted'],
    composerRequests: ['composerrequests'], chatRequests: ['chatrequests'], agentRequests: ['agentrequests'], cmdkUsages: ['cmdkusages', 'cmdk'],
    subscriptionIncludedReqs: ['subscriptionincludedreqs'], apiKeyReqs: ['apikeyreqs'], usageBasedReqs: ['usagebasedreqs'], bugbotUsages: ['bugbotusages'],
    mostUsedModel: ['mostusedmodel'], applyMostUsedExtension: ['applymostusedextension'], tabMostUsedExtension: ['tabmostusedextension'],
    clientVersion: ['clientversion']
  };
  // the paginated example response printed in Cursor's Admin API docs (two seats, one day)
  var DOCS_EXAMPLE = { data: [
    { userId: 12345, day: '2024-03-18', date: 1710720000000, isActive: true, totalLinesAdded: 1543, totalLinesDeleted: 892, acceptedLinesAdded: 1102,
      acceptedLinesDeleted: 645, totalApplies: 87, totalAccepts: 73, totalRejects: 14, totalTabsShown: 342, totalTabsAccepted: 289, composerRequests: 45,
      chatRequests: 128, agentRequests: 12, cmdkUsages: 67, subscriptionIncludedReqs: 180, apiKeyReqs: 0, usageBasedReqs: 5, bugbotUsages: 3,
      mostUsedModel: 'gpt-5', applyMostUsedExtension: '.tsx', tabMostUsedExtension: '.ts', clientVersion: '0.25.1', email: 'developer@company.com' },
    { userId: 12346, day: '2024-03-18', date: 1710720000000, isActive: false, totalLinesAdded: 0, totalLinesDeleted: 0, acceptedLinesAdded: 0,
      acceptedLinesDeleted: 0, totalApplies: 0, totalAccepts: 0, totalRejects: 0, totalTabsShown: 0, totalTabsAccepted: 0, composerRequests: 0,
      chatRequests: 0, agentRequests: 0, cmdkUsages: 0, subscriptionIncludedReqs: 0, apiKeyReqs: 0, usageBasedReqs: 0, bugbotUsages: 0,
      mostUsedModel: null, applyMostUsedExtension: null, tabMostUsedExtension: null, clientVersion: null, email: 'inactive-user@company.com' }
  ], pagination: { page: 1, pageSize: 1000, totalUsers: 2, totalPages: 1, hasNextPage: false } };

  // ---------- small helpers ----------
  function norm(h) { return String(h).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pct(x, d) { return x == null || !isFinite(x) ? 'not measurable' : (100 * x).toFixed(d == null ? 0 : d) + '%'; }
  function n0(x) { return Math.round(x).toLocaleString('en-US'); }
  function median(v) { if (!v.length) return null; var s = v.slice().sort(function (a, b) { return a - b; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function utc(d) { var p = d.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDay(d, k) { return new Date(utc(d) + k * 864e5).toISOString().slice(0, 10); }
  function dow(d) { return new Date(utc(d)).getUTCDay(); }
  function isWeekday(d) { var w = dow(d); return w > 0 && w < 6; }
  function weekStart(d) { var w = (dow(d) + 6) % 7; return addDay(d, -w); }
  function nice(d) { var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], p = d.split('-'); return (+p[2]) + ' ' + m[+p[1] - 1] + ' ' + p[0]; }
  function cmpVer(a, b) { var x = String(a).split(/[.\-]/), y = String(b).split(/[.\-]/); for (var i = 0; i < Math.max(x.length, y.length); i++) { var p = parseInt(x[i] || '0', 10), q = parseInt(y[i] || '0', 10); if (isNaN(p) || isNaN(q)) { if ((x[i] || '') !== (y[i] || '')) return (x[i] || '') < (y[i] || '') ? -1 : 1; continue; } if (p !== q) return p - q; } return 0; }
  function topBy(v, k) { var c = {}; v.forEach(function (x) { c[x] = (c[x] || 0) + 1; }); return Object.keys(c).map(function (x) { return [x, c[x]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, k); }

  // ---------- reading ----------
  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false, c, i;
    text = text.replace(/^﻿/, '');
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    rows = rows.filter(function (r) { return r.length > 1 || (r[0] || '').trim() !== ''; });
    if (rows.length < 2) return [];
    var head = rows[0];
    return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, k) { o[h] = r[k]; }); return o; });
  }
  function parseJSON(text) {
    var j = JSON.parse(text), out = [];
    (function walk(x) {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') {
        if (Array.isArray(x.data)) x.data.forEach(function (r) { out.push(r); });
        else if ('userId' in x || 'email' in x) out.push(x);
      }
    })(j);
    return out;
  }
  function toDay(v) {
    if (v == null || v === '') return null;
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^\d{11,14}$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10);
    var t = Date.parse(s); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
  }
  function clean(raw) {
    var byNorm = {}, o = {}, k, fld, a;
    for (k in raw) byNorm[norm(k)] = raw[k];
    for (fld in ALIAS) {
      if (raw[fld] !== undefined) { o[fld] = raw[fld]; continue; }
      for (a = 0; a < ALIAS[fld].length; a++) if (ALIAS[fld][a] in byNorm) { o[fld] = byNorm[ALIAS[fld][a]]; break; }
    }
    var id = (o.userId != null && o.userId !== '') ? o.userId : (o.email || '');
    var r = { seat: String(id).trim(), day: toDay(o.day != null && o.day !== '' ? o.day : raw.date) };
    r.hasActive = o.isActive !== undefined && o.isActive !== null && o.isActive !== '';
    r.isActive = r.hasActive ? /^(true|1|yes)$/i.test(String(o.isActive)) : undefined;
    NUMF.forEach(function (f) { var v = Number(o[f]); r[f] = isFinite(v) ? v : 0; });
    r.hasLines = o.totalLinesAdded !== undefined && o.totalLinesAdded !== '';
    STRF.forEach(function (f) { var v = o[f]; r[f] = (v == null || v === '' || v === 'null') ? null : String(v); });
    return r;
  }

  // ---------- the analysis ----------
  function analyse(raw) {
    var A = { rowsRead: raw.length }, R = [], seen = {};
    var rows = raw.map(clean).filter(function (r) { return r.seat && r.day; });
    A.rowsUsable = rows.length; A.dup = 0;
    if (!rows.length) return A;
    rows.forEach(function (r) {
      var k = r.seat + '|' + r.day;
      if (seen[k]) { A.dup++; NUMF.forEach(function (f) { seen[k][f] += r[f]; }); if (r.isActive) seen[k].isActive = true; }
      else { seen[k] = r; R.push(r); }
    });
    R.forEach(function (r) { r.active = r.isActive === true || (r.agentRequests + r.chatRequests + r.composerRequests + r.cmdkUsages + r.totalTabsAccepted + r.totalApplies) > 0; });
    A.hasActiveField = R.some(function (r) { return r.hasActive; });
    var days = R.map(function (r) { return r.day; }).sort();
    A.first = days[0]; A.last = days[days.length - 1];
    var cal = []; for (var d = A.first; d <= A.last && cal.length < 400; d = addDay(d, 1)) cal.push(d);
    A.span = cal.length; A.weekdays = cal.filter(isWeekday);
    var have = {}; R.forEach(function (r) { have[r.day] = 1; });
    A.missing = A.weekdays.filter(function (x) { return !have[x]; });
    // seats
    var S = {};
    R.forEach(function (r) {
      var s = S[r.seat] || (S[r.seat] = { days: {}, ver: null, verDay: '' });
      if (r.active) s.days[r.day] = 1;
      if (r.clientVersion && r.day >= s.verDay) { s.ver = r.clientVersion; s.verDay = r.day; }
    });
    var seats = Object.keys(S).map(function (k) { return S[k]; }), wd = Math.max(1, A.weekdays.length);
    seats.forEach(function (s) {
      var all = Object.keys(s.days), w = all.filter(isWeekday).length; s.n = all.length; s.share = w / wd;
      s.tier = s.n === 0 ? 'not started' : s.share >= 0.6 ? 'most working days' : s.share >= 0.2 ? 'every week or so' : 'now and then';
    });
    A.seats = seats.length; A.activeSeats = seats.filter(function (s) { return s.n > 0; }).length;
    A.tiers = { 'most working days': 0, 'every week or so': 0, 'now and then': 0, 'not started': 0 };
    seats.forEach(function (s) { A.tiers[s.tier]++; });
    // weeks
    var W = {};
    R.forEach(function (r) {
      var k = weekStart(r.day), x = W[k] || (W[k] = { seats: {}, agent: 0, other: 0, days: {} });
      x.days[r.day] = 1; if (r.active) x.seats[r.seat] = 1;
      x.agent += r.agentRequests; x.other += r.chatRequests + r.composerRequests + r.cmdkUsages;
    });
    A.weeks = Object.keys(W).sort().map(function (k) {
      var x = W[k], req = x.agent + x.other;
      return { week: k, activeSeats: Object.keys(x.seats).length, agentShare: req ? x.agent / req : null, nDays: Object.keys(x.days).length };
    });
    // totals and rates
    var T = {}; NUMF.forEach(function (f) { T[f] = 0; }); R.forEach(function (r) { NUMF.forEach(function (f) { T[f] += r[f]; }); });
    A.T = T;
    var req = T.agentRequests + T.chatRequests + T.composerRequests + T.cmdkUsages;
    A.requests = req; A.agentShare = req ? T.agentRequests / req : null;
    A.tabAccept = T.totalTabsShown ? T.totalTabsAccepted / T.totalTabsShown : null;
    A.sugAccept = (T.totalAccepts + T.totalRejects) ? T.totalAccepts / (T.totalAccepts + T.totalRejects) : null;
    var ad = R.filter(function (r) { return r.active; });
    A.activeSeatDays = ad.length;
    A.medReq = median(ad.map(function (r) { return r.agentRequests + r.chatRequests + r.composerRequests + r.cmdkUsages; }));
    A.medTabs = median(ad.map(function (r) { return r.totalTabsAccepted; }));
    A.hasLines = R.some(function (r) { return r.hasLines; });
    A.linesAllZero = A.hasLines && ad.length > 0 && T.totalLinesAdded === 0 && T.acceptedLinesAdded === 0 && T.totalLinesDeleted === 0;
    A.linesOver = R.filter(function (r) { return r.acceptedLinesAdded > r.totalLinesAdded; }).length;
    A.lineShare = (A.hasLines && !A.linesAllZero && A.linesOver === 0 && T.totalLinesAdded > 0) ? T.acceptedLinesAdded / T.totalLinesAdded : null;
    var vers = seats.filter(function (s) { return s.n > 0 && s.ver; }).map(function (s) { return s.ver; });
    A.newest = vers.length ? vers.slice().sort(cmpVer)[vers.length - 1] : null;
    A.behind = vers.filter(function (v) { return v !== A.newest; }).length;
    A.onNewest = vers.length ? (vers.length - A.behind) / vers.length : null;
    A.versions = topBy(vers, 4);
    A.models = topBy(ad.filter(function (r) { return r.mostUsedModel; }).map(function (r) { return r.mostUsedModel; }), 5);
    A.tabExt = topBy(ad.filter(function (r) { return r.tabMostUsedExtension; }).map(function (r) { return r.tabMostUsedExtension; }), 5);
    A.applyExt = topBy(ad.filter(function (r) { return r.applyMostUsedExtension; }).map(function (r) { return r.applyMostUsedExtension; }), 5);
    return A;
  }

  // ---------- the readout ----------
  var LIM = { activation: 0.6, habit: 0.4, agent: 0.25, tab: 0.25, version: 0.7 };
  function checks(A) {
    var C = [];
    C.push(['ok', n0(A.rowsUsable) + ' seat-days read for ' + n0(A.seats) + (A.seats === 1 ? ' seat' : ' seats') + ', ' + nice(A.first) + ' to ' + nice(A.last) + ' (' + A.span + (A.span === 1 ? ' day' : ' days') + ').' + (A.rowsRead > A.rowsUsable ? ' ' + n0(A.rowsRead - A.rowsUsable) + ' rows had no seat or date and were left out.' : '')]);
    if (A.hasActiveField) C.push(['ok', 'Seats with no activity are in the file (isActive is present), so seat activation can be measured.']);
    else C.push(['look', 'This file has active users only: the API leaves out the seats that never started unless the request sends page and pageSize. Seat activation is not measured here; export again with pagination to see every seat.']);
    if (A.span > 31) C.push(['ok', 'The period is longer than one request returns (30 days), so the file was put together from several requests.']);
    if (A.missing.length) C.push(['look', 'No rows at all on ' + A.missing.length + ' working ' + (A.missing.length === 1 ? 'day' : 'days') + ' (' + A.missing.slice(0, 4).map(nice).join(', ') + (A.missing.length > 4 ? ' and more' : '') + '). Either nobody worked or a request is missing from the file.']);
    if (A.dup) C.push(['look', n0(A.dup) + ' seat-days appear more than once; they were added together. Check that no request was saved twice.']);
    if (!A.hasLines) C.push(['look', 'The file has no line counts, so the share of accepted AI lines is not measured.']);
    else if (A.linesAllZero) C.push(['look', 'Every line count is zero although seats were active: a reporting fault other teams have also seen in this export. Line-based measures are left out.']);
    else if (A.linesOver) C.push(['look', n0(A.linesOver) + ' seat-days report more accepted AI lines than lines added in total, a known reporting fault. Line-based measures are left out.']);
    else C.push(['ok', 'Line counts are present and consistent.']);
    C.push(['ok', 'subscriptionIncludedReqs, usageBasedReqs and apiKeyReqs count raw usage events, not billable units, so this readout does not turn them into cost.']);
    return C;
  }
  function findings(A) {
    var F = [], N = [];
    if (A.hasActiveField && A.seats) {
      var p = A.activeSeats / A.seats;
      F.push(n0(A.activeSeats) + ' of ' + n0(A.seats) + ' seats used it at least once in the period (' + pct(p) + ').');
      if (p < LIM.activation) N.push('Activation before anything else: a 30-minute start session for the ' + n0(A.seats - A.activeSeats) + ' seats that have not started, run by each team\'s champion, before any new use case.');
    } else F.push(n0(A.activeSeats) + ' seats used it in the period. The seats that never started are not in this file.');
    if (A.activeSeats) {
      var h = A.tiers['most working days'];
      F.push(n0(h) + ' of ' + n0(A.activeSeats) + ' active seats used it on most working days (' + pct(h / A.activeSeats) + ').');
      if (h / A.activeSeats < LIM.habit) N.push('Build two daily habits per team, such as tests with every change and a pull-request review loop, and count the seats that use it on most working days every week.');
    }
    if (A.agentShare != null) {
      var w = A.weeks.filter(function (x) { return x.agentShare != null; });
      var tr = w.length > 1 ? ' (' + pct(w[0].agentShare) + ' in the first week, ' + pct(w[w.length - 1].agentShare) + ' in the last)' : '';
      F.push('Agent was ' + pct(A.agentShare) + ' of Agent, chat, Composer and Cmd+K requests' + tr + '.');
      if (A.agentShare < LIM.agent) N.push('Move each team from chat to Agent with one working session on a real backlog item; write the repository rules first so the agent\'s runs land.');
    }
    if (A.tabAccept != null) {
      F.push('Tab completions were accepted ' + pct(A.tabAccept) + ' of the time' + (A.sugAccept != null ? ', and AI suggestions ' + pct(A.sugAccept) + ' of the time' : '') + '.');
      if (A.tabAccept < LIM.tab) N.push('Review the repository rules and docs for the main file types' + (A.tabExt.length ? ' (' + A.tabExt.slice(0, 3).map(function (x) { return x[0]; }).join(', ') + ')' : '') + ' with the team: a low acceptance rate is the first place to look.');
    }
    if (A.lineShare != null) F.push(pct(A.lineShare) + ' of the lines added were accepted AI lines.');
    if (A.onNewest != null && A.onNewest < LIM.version) {
      F.push(n0(A.behind) + ' active ' + (A.behind === 1 ? 'seat is' : 'seats are') + ' behind the newest client version in the file (' + esc(A.newest) + ').');
      N.push('Push the client update through device management so every seat gets the same features and fixes.');
    }
    if (!N.length) N.push('Hold the gains: keep this readout weekly and take the recipes that worked to the next teams.');
    return { F: F, N: N };
  }

  // ---------- charts (inline SVG, the site's palette) ----------
  function barChart(weeks) {
    var W = 520, H = 210, l = 40, r = 12, t = 16, b = 34, max = Math.max(1, Math.max.apply(null, weeks.map(function (w) { return w.activeSeats; })));
    var bw = (W - l - r) / Math.max(1, weeks.length), s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Active seats by week" class="rc">';
    [0, 0.5, 1].forEach(function (g) { var y = t + (H - t - b) * (1 - g); s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + y + '" y2="' + y + '" stroke="#e6e2d8" stroke-width="1"/><text x="' + (l - 6) + '" y="' + (y + 4) + '" text-anchor="end" class="ax">' + Math.round(max * g) + '</text>'; });
    weeks.forEach(function (w, i) {
      var h = (H - t - b) * w.activeSeats / max, x = l + i * bw + bw * 0.14;
      s += '<rect x="' + x.toFixed(1) + '" y="' + (H - b - h).toFixed(1) + '" width="' + (bw * 0.72).toFixed(1) + '" height="' + h.toFixed(1) + '" fill="#6c8eb2"/>';
      if (weeks.length <= 10 || i % 2 === 0) s += '<text x="' + (x + bw * 0.36).toFixed(1) + '" y="' + (H - b + 16) + '" text-anchor="middle" class="ax">' + esc(nice(w.week).replace(/ \d{4}$/, '')) + '</text>';
    });
    return s + '</svg>';
  }
  function lineChart(weeks) {
    var pts = weeks.filter(function (w) { return w.agentShare != null; });
    if (pts.length < 2) return '';
    var W = 520, H = 210, l = 40, r = 12, t = 16, b = 34, max = Math.max(0.3, Math.max.apply(null, pts.map(function (w) { return w.agentShare; })) * 1.15);
    var pad = 22, X = function (i) { return l + pad + (W - l - r - 2 * pad) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)); }, Y = function (v) { return t + (H - t - b) * (1 - v / max); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Agent share of requests by week" class="rc">';
    [0, max / 2, max].forEach(function (g) { s += '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + Y(g) + '" y2="' + Y(g) + '" stroke="#e6e2d8" stroke-width="1"/><text x="' + (l - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end" class="ax">' + Math.round(100 * g) + '%</text>'; });
    s += '<polyline fill="none" stroke="#1f2a44" stroke-width="2" points="' + pts.map(function (w, i) { return X(i).toFixed(1) + ',' + Y(w.agentShare).toFixed(1); }).join(' ') + '"/>';
    pts.forEach(function (w, i) { s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(w.agentShare).toFixed(1) + '" r="3.2" fill="#1f2a44"/>'; if (pts.length <= 10 || i % 2 === 0) s += '<text x="' + X(i).toFixed(1) + '" y="' + (H - b + 16) + '" text-anchor="middle" class="ax">' + esc(nice(w.week).replace(/ \d{4}$/, '')) + '</text>'; });
    return s + '</svg>';
  }

  // ---------- writing it out ----------
  var lastText = '';
  function render(A, source) {
    var out = document.getElementById('out');
    if (!A.rowsUsable) { out.hidden = false; out.innerHTML = '<h2>Nothing to read</h2><p>No row in this file had both a seat (userId or email) and a date. The page expects the JSON that <code>/teams/daily-usage-data</code> returns, or a CSV with the same columns.</p>'; return; }
    var C = checks(A), FN = findings(A), h = '';
    h += '<p class="kicker">' + esc(source) + '</p>';
    h += '<div class="spread"><div class="txt"><h2>Checks on the file</h2><p>What the file can and cannot tell you, before any number is trusted.</p></div><ul class="checks">' +
      C.map(function (c) { return '<li class="' + c[0] + '"><span class="tick">' + (c[0] === 'ok' ? 'fine' : 'look') + '</span>' + c[1] + '</li>'; }).join('') + '</ul></div>';
    h += '<div class="spread flip"><div class="txt"><h2>What I would tell the CTO</h2><ol class="say">' + FN.F.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol></div>' +
      '<figure class="chart rchart"><p class="rc-title">Active seats by week</p>' + barChart(A.weeks) + (lineChart(A.weeks) ? '<p class="rc-title">Agent share of requests by week</p>' + lineChart(A.weeks) : '') + '<figcaption>Weeks start on Monday; a week at either end of the file may be partial.</figcaption></figure></div>';
    h += '<div class="spread"><div class="txt"><h2>What I would do next</h2><ol class="say">' + FN.N.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol><p class="note">each one gets a number to move, agreed with the team</p></div>';
    var B = [
      ['Seats in the file', n0(A.seats)],
      ['Seats that used it at least once', A.hasActiveField ? n0(A.activeSeats) + ' (' + pct(A.activeSeats / A.seats) + ')' : n0(A.activeSeats) + ' (activation not measurable: active users only)'],
      ['Seats on most working days', n0(A.tiers['most working days']) + ' of ' + n0(A.activeSeats) + ' active'],
      ['Every week or so / now and then', n0(A.tiers['every week or so']) + ' / ' + n0(A.tiers['now and then'])],
      ['Agent share of requests', pct(A.agentShare)],
      ['Requests per active seat-day (median)', A.medReq == null ? 'not measurable' : String(A.medReq)],
      ['Tab acceptance', pct(A.tabAccept)],
      ['AI suggestion acceptance', pct(A.sugAccept)],
      ['Accepted AI lines, share of lines added', A.lineShare == null ? 'left out (see the checks)' : pct(A.lineShare)],
      ['Active seats on the newest client', A.onNewest == null ? 'not in the file' : pct(A.onNewest) + ' (newest: ' + esc(A.newest) + ')']
    ];
    h += '<div><h2 class="h-quiet">Baseline for the 90-day plan</h2><table class="facts"><tbody>' + B.map(function (b) { return '<tr><th scope="row">' + b[0] + '</th><td>' + b[1] + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    var list = function (t, v) { return v.length ? '<li><h3>' + t + '</h3><p>' + v.map(function (x) { return esc(x[0]) + ' <span class="small">(' + n0(x[1]) + ')</span>'; }).join(', ') + '</p></li>' : ''; };
    var more = list('Most used models, by active seat-days', A.models) + list('Tab completions, by file type', A.tabExt) + list('Applied edits, by file type', A.applyExt) + list('Client versions, by seat', A.versions);
    if (more) h += '<ol class="grid2 small-grid">' + more + '</ol>';
    h += '<p class="actions-row"><button type="button" id="copy" class="btn">Copy the readout as text</button> <span id="copied" class="small" aria-live="polite"></span></p>';
    out.innerHTML = h; out.hidden = false;
    out.querySelectorAll('.note, mark').forEach(function (e) { e.classList.add('in'); });   // site.js reveals only what was on the page at load
    lastText = ['Rollout readout: ' + nice(A.first) + ' to ' + nice(A.last), '', 'Checks on the file:'].concat(C.map(function (c) { return '- ' + (c[0] === 'ok' ? '' : '[look] ') + c[1]; }))
      .concat(['', 'What I would tell the CTO:']).concat(FN.F.map(function (x, i) { return (i + 1) + '. ' + x.replace(/<[^>]+>/g, ''); }))
      .concat(['', 'What I would do next:']).concat(FN.N.map(function (x, i) { return (i + 1) + '. ' + x; }))
      .concat(['', 'Baseline for the 90-day plan:']).concat(B.map(function (b) { return '- ' + b[0] + ': ' + b[1].replace(/<[^>]+>/g, ''); })).join('\n');
    document.getElementById('copy').addEventListener('click', function () {
      var done = function () { document.getElementById('copied').textContent = 'copied'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastText).then(done, function () { fallback(); });
      else fallback();
      function fallback() { var ta = document.createElement('textarea'); ta.value = lastText; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} ta.remove(); }
    });
    out.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }
  function readText(text, name) {
    var rows, src;
    try {
      var t = text.trim();
      if (t[0] === '{' || t[0] === '[') { rows = parseJSON(t); src = 'Read from ' + name + ' (JSON)'; }
      else { rows = parseCSV(text); src = 'Read from ' + name + ' (CSV)'; }
    } catch (e) {
      var out = document.getElementById('out'); out.hidden = false;
      out.innerHTML = '<h2>This file could not be read</h2><p>' + esc(e.message) + '. The page expects the JSON that <code>/teams/daily-usage-data</code> returns, or a CSV with the same columns.</p>';
      return;
    }
    render(analyse(rows), src);
  }
  function readFile(f) { if (!f) return; var fr = new FileReader(); fr.onload = function () { readText(String(fr.result), f.name); }; fr.readAsText(f); }

  document.addEventListener('DOMContentLoaded', function () {
    var drop = document.getElementById('drop'), input = document.getElementById('file'), ex = document.getElementById('example');
    if (!drop) return;
    input.addEventListener('change', function () { readFile(input.files[0]); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
    drop.addEventListener('drop', function (e) { readFile(e.dataTransfer.files[0]); });
    ex.addEventListener('click', function () { render(analyse(DOCS_EXAMPLE.data), 'The two example rows printed in Cursor\'s Admin API docs (one active seat, one inactive, one day)'); });
  });
})();
