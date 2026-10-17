(function () {
  'use strict';

  var DATA = null;               // last good data; kept on screen if a refresh fails
  var panelDir = 'desc';         // Week header: newest week first
  var innerKey = 'score';        // other headers sort the psyops inside every panel
  var innerDir = 'desc';
  var expanded = null;           // Set of open week ids; null until first render
  var CONF_RANK = { 'High': 4, 'Medium-High': 3, 'Medium': 2, 'Low': 1 };

  var panelsEl = document.getElementById('panels');
  var summaryEl = document.getElementById('summary');
  var dialog = document.getElementById('detail');
  var dBody = document.getElementById('d-body');
  var heads = document.querySelectorAll('#heads thead th');

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // All displayed times use mm/dd/yyyy hh:mm EST (fixed UTC-5).
  function fmtDateOnly(ymd) {
    var p = ymd.split('-');
    return p[1] + '/' + p[2] + '/' + p[0];
  }
  function fmtEST(iso) {
    if (!iso) return '';
    if (iso.length <= 10) return fmtDateOnly(iso);
    var t = new Date(iso);
    if (isNaN(t.getTime())) return '';
    var s = new Date(t.getTime() - 5 * 3600 * 1000);
    return pad(s.getUTCMonth() + 1) + '/' + pad(s.getUTCDate()) + '/' + s.getUTCFullYear() +
      ' ' + pad(s.getUTCHours()) + ':' + pad(s.getUTCMinutes()) + ' EST';
  }
  function weekRange(w) {
    return fmtDateOnly(w.week_start) + ' 00:00 EST to ' + fmtDateOnly(w.week_end) + ' 23:59 EST';
  }
  function tintForScore(score) {
    if (score <= 3) return 't-low';
    if (score <= 5) return 't-mid';
    if (score <= 7) return 't-high';
    return 't-severe';
  }
  function weekId(w) { return w.year + '-' + w.week; }
  function weekKey(w) { return w.year * 100 + w.week; }

  // Item 10: weeks that are not scanned yet or still in progress stay in the JSON but are never rendered.
  function visibleWeeks() {
    return DATA.weeks.filter(function (w) {
      return (w.status === 'scanned' || w.status === 'partial') && w.psyops && w.psyops.length;
    });
  }
  function maxScore(w) {
    return w.psyops.reduce(function (m, p) { return p.score > m ? p.score : m; }, 0);
  }
  function sortValue(p, key) {
    if (key === 'headline') return (p.headline || '').toLowerCase();
    if (key === 'outlet') return (p.outlet || '').toLowerCase();
    if (key === 'score') return p.score;
    if (key === 'audience') return ((p.target_audience && p.target_audience.text) || '').toLowerCase();
    if (key === 'confidence') return CONF_RANK[p.confidence && p.confidence.level] || 0;
    return 0;
  }
  function sortedPsyops(list) {
    var dir = innerDir === 'asc' ? 1 : -1;
    return list.slice().sort(function (a, b) {
      var va = sortValue(a, innerKey), vb = sortValue(b, innerKey);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return b.score - a.score || (a.id < b.id ? -1 : 1);
    });
  }

  /* ---------- list ---------- */
  function cell(tr, cls, label, text) {
    var td = el('td', cls, text);
    td.setAttribute('data-label', label);
    tr.appendChild(td);
    return td;
  }

  function buildRow(w, p) {
    var tr = el('tr', tintForScore(p.score));
    tr.tabIndex = 0;
    tr.setAttribute('data-id', p.id);
    tr.setAttribute('role', 'button');
    var wk = cell(tr, 'week', 'Week');
    wk.appendChild(el('b', null, 'Week ' + w.week));
    wk.appendChild(el('small', null, String(w.year)));
    cell(tr, 'headline', 'Headline', p.headline);
    cell(tr, 'outlet', 'Outlet', p.outlet);
    var sc = cell(tr, 'score', 'Score', String(p.score));
    sc.appendChild(el('small', null, ' / 10'));
    cell(tr, 'audience', 'Audience', (p.target_audience && p.target_audience.text) || '');
    cell(tr, 'conf', 'Confidence', p.confidence.level);
    return tr;
  }

  function buildPanel(w) {
    var id = weekId(w);
    var open = expanded.has(id);
    var sec = el('section', 'panel');
    sec.setAttribute('data-week', id);

    var h = el('h2', 'ph');
    var btn = el('button', 'pt ' + tintForScore(maxScore(w)));
    btn.type = 'button';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-controls', 'pb-' + id);
    btn.title = 'Expand or collapse the psyops of this week';
    btn.appendChild(el('span', 'chev'));
    btn.appendChild(el('span', 'pw', 'Week ' + w.week + ' \u00b7 ' + w.year));
    btn.appendChild(el('span', 'pd', fmtDateOnly(w.week_start) + ' to ' + fmtDateOnly(w.week_end)));
    btn.appendChild(el('span', 'pc', w.psyops.length + (w.psyops.length === 1 ? ' psyop' : ' psyops')));
    btn.appendChild(el('span', 'pm', 'Highest ' + maxScore(w)));
    h.appendChild(btn);
    sec.appendChild(h);

    var body = el('div', 'pb');
    body.id = 'pb-' + id;
    if (!open) body.hidden = true;
    var tbl = el('table', 'cols');
    var cg = el('colgroup');
    ['c-week', 'c-headline', 'c-outlet', 'c-score', 'c-audience', 'c-conf'].forEach(function (c) { cg.appendChild(el('col', c)); });
    tbl.appendChild(cg);
    var tb = el('tbody');
    sortedPsyops(w.psyops).forEach(function (p) { tb.appendChild(buildRow(w, p)); });
    tbl.appendChild(tb);
    body.appendChild(tbl);
    sec.appendChild(body);
    return sec;
  }

  function renderList() {
    if (!DATA) return;
    var weeks = visibleWeeks().sort(function (a, b) {
      return panelDir === 'asc' ? weekKey(a) - weekKey(b) : weekKey(b) - weekKey(a);
    });
    if (expanded === null) {
      // first render: only the newest week is open
      var newest = visibleWeeks().sort(function (a, b) { return weekKey(b) - weekKey(a); })[0];
      expanded = new Set(newest ? [weekId(newest)] : []);
    }
    var frag = document.createDocumentFragment();
    weeks.forEach(function (w) { frag.appendChild(buildPanel(w)); });
    panelsEl.replaceChildren(frag);   // swap in one step; old panels stay until new ones are ready

    Array.prototype.forEach.call(heads, function (th) {
      var k = th.getAttribute('data-key');
      if (k === 'week') th.setAttribute('aria-sort', panelDir === 'asc' ? 'ascending' : 'descending');
      else if (k === innerKey) th.setAttribute('aria-sort', innerDir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
  }

  function renderSummary() {
    var all = DATA.weeks;
    var shown = visibleWeeks();
    var count = 0, top = null, topWeek = null;
    shown.forEach(function (w) {
      w.psyops.forEach(function (p) {
        count++;
        if (!top || p.score >= top.score) { top = p; topWeek = w; }
      });
    });
    function stat(big, small) {
      var d = el('div', 'stat');
      d.appendChild(el('b', null, big));
      d.appendChild(el('span', null, small));
      return d;
    }
    var frag = document.createDocumentFragment();
    frag.appendChild(stat(String(all.length), 'weeks in the scan window'));
    frag.appendChild(stat(String(shown.length), 'weeks scanned'));
    frag.appendChild(stat(String(count), 'psyops scored'));
    frag.appendChild(stat(top ? top.score + ' / 10' : '\u2014', top ? 'highest score (Week ' + topWeek.week + ', ' + topWeek.year + ')' : 'highest score'));
    summaryEl.replaceChildren(frag);

    document.getElementById('ver').textContent = DATA.app_version || '1.1';
    document.getElementById('updated').textContent = 'Data updated ' + fmtEST(DATA.updated);
    document.getElementById('method').textContent = DATA.method_note || '';
  }

  /* ---------- detail ---------- */
  function h3(t) { return el('h3', null, t); }
  function link(text, url, title) {
    var a = el('a', null, text);
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    if (title) a.title = title;
    return a;
  }

  function renderDetail(w, p) {
    var frag = document.createDocumentFragment();

    frag.appendChild(el('p', 'd-kicker', 'Week ' + w.week + ' \u00b7 ' + w.year));
    var title = el('h2', 'd-title');
    title.id = 'd-title';
    if (p.url) title.appendChild(link(p.headline, p.url, 'Open the headline at the outlet'));
    else title.textContent = p.headline;
    frag.appendChild(title);
    frag.appendChild(el('p', 'd-meta', p.outlet + (p.published ? ' \u00b7 ' + fmtEST(p.published) : '') + ' \u00b7 ' + weekRange(w)));

    var tint = 'h-' + tintForScore(p.score).slice(2);
    var hero = el('div', 'hero');
    var s = el('div', tint);
    s.appendChild(el('span', 'big', p.score + ' / 10'));
    s.appendChild(el('small', null, 'Psyop score'));
    hero.appendChild(s);
    var t = el('div', tint);
    t.appendChild(el('span', 'big', p.factor_total + ' / 14'));
    t.appendChild(el('small', null, 'Factor total'));
    hero.appendChild(t);
    var c = el('div');
    c.appendChild(el('span', 'big', p.confidence.level));
    c.appendChild(el('small', null, 'Confidence'));
    hero.appendChild(c);
    var au = el('div', 'wide');
    au.appendChild(el('span', 'txt', p.target_audience.text));
    au.appendChild(el('small', null, 'Target audience (' + p.target_audience.basis + ')'));
    hero.appendChild(au);
    frag.appendChild(hero);

    frag.appendChild(h3('Claim scored'));
    frag.appendChild(el('p', null, p.scored_claim));
    frag.appendChild(h3('What happened'));
    frag.appendChild(el('p', null, p.summary));
    if (p.selection_reason) {
      frag.appendChild(h3('Why this story was chosen'));
      frag.appendChild(el('p', null, p.selection_reason));
    }

    frag.appendChild(h3('Seven factor scores (0 clean, 1 some concern, 2 serious concern)'));
    var tbl = el('table', 'factors');
    var tb = el('tbody');
    DATA.factors.forEach(function (f) {
      var fv = p.factors[f.key];
      var tr = el('tr', 'f' + fv.score);
      var n = el('td', null, f.label);
      n.title = f.description;
      n.appendChild(el('span', 'lab', fv.label));
      tr.appendChild(n);
      tr.appendChild(el('td', 'fs', String(fv.score)));
      tr.appendChild(el('td', null, fv.note));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    frag.appendChild(tbl);
    frag.appendChild(el('p', 'total', 'Total ' + p.factor_total + ' of 14 maps to a score of ' + p.score + ' on the 1 to 10 scale.'));
    if (p.mechanism) {
      frag.appendChild(h3('Named manipulation mechanism (required at 8 or above)'));
      frag.appendChild(el('p', null, p.mechanism));
    }

    frag.appendChild(h3('Strongest counter-argument'));
    frag.appendChild(el('p', null, p.counter_argument));
    frag.appendChild(h3('Confidence'));
    frag.appendChild(el('p', null, p.confidence.reason));
    frag.appendChild(h3('Hindsight note'));
    frag.appendChild(el('p', null, p.hindsight_note || 'None.'));

    frag.appendChild(h3('Gaps'));
    var ul = el('ul', 'plain');
    (p.gaps || []).forEach(function (g) { ul.appendChild(el('li', null, g)); });
    frag.appendChild(ul);
    if (w.gaps && w.gaps.length) {
      frag.appendChild(h3('Week-level gaps'));
      var wl = el('ul', 'plain');
      w.gaps.forEach(function (g) { wl.appendChild(el('li', null, g)); });
      frag.appendChild(wl);
    }

    if (p.sources && p.sources.length) {
      frag.appendChild(h3('Sources'));
      var sl = el('ul', 'src');
      var roleText = {
        in_window: 'Published in the window',
        hindsight: 'Published after the window (hindsight)',
        after_window: 'Published after the window (hindsight)',
        before_window: 'Published before the window',
        primary: 'Primary source'
      };
      p.sources.forEach(function (src) {
        var li = el('li');
        var b = el('b');
        b.appendChild(link(src.title, src.url));
        li.appendChild(b);
        li.appendChild(el('span', 'm', src.outlet + (src.type ? ' \u00b7 ' + src.type : '') + (src.published ? ' \u00b7 ' + fmtEST(src.published) : '')));
        var chk = src.link_check ? ' \u00b7 link checked ' + fmtDateOnly(src.link_check.checked) + ': HTTP ' + src.link_check.http + (src.link_check.note ? ', ' + src.link_check.note : '') : '';
        li.appendChild(el('span', 'm', (roleText[src.role] || '') + chk));
        sl.appendChild(li);
      });
      frag.appendChild(sl);
    }

    if (w.screened_not_scored && w.screened_not_scored.length) {
      frag.appendChild(h3('Other top stories screened this week (not scored)'));
      var cl = el('ul', 'plain cand');
      w.screened_not_scored.forEach(function (x) {
        var li = el('li');
        if (x.url) li.appendChild(link(x.headline, x.url)); else li.appendChild(document.createTextNode(x.headline));
        li.appendChild(document.createTextNode(' \u2014 ' + (x.outlet || '') + '. ' + (x.reason || 'Screened only; reason not recorded')));
        cl.appendChild(li);
      });
      frag.appendChild(cl);
    }

    frag.appendChild(el('p', 'disc', DATA.disclaimer));
    dBody.replaceChildren(frag);
  }

  function findPsyop(id) {
    var ws = DATA.weeks;
    for (var i = 0; i < ws.length; i++) {
      var ps = ws[i].psyops || [];
      for (var j = 0; j < ps.length; j++) if (ps[j].id === id) return { w: ws[i], p: ps[j] };
    }
    return null;
  }
  function openDetail(id) {
    if (!DATA) return;
    var f = findPsyop(id);
    if (!f) return;
    renderDetail(f.w, f.p);
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('.sheet').scrollTop = 0;
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  }
  function closeDetail() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', function () {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  });
  dialog.addEventListener('click', function (e) { if (e.target === dialog) closeDetail(); });
  document.getElementById('d-close').addEventListener('click', closeDetail);

  panelsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button.pt');
    if (btn) { togglePanel(btn); return; }
    var tr = e.target.closest('tr');
    if (tr) openDetail(tr.getAttribute('data-id'));
  });
  panelsEl.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('button.pt')) return;     // the button handles its own keys
    var tr = e.target.closest('tr');
    if (tr) { e.preventDefault(); openDetail(tr.getAttribute('data-id')); }
  });

  function togglePanel(btn) {
    var sec = btn.closest('.panel');
    var id = sec.getAttribute('data-week');
    var body = sec.querySelector('.pb');
    var open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    body.hidden = !open;
    if (open) expanded.add(id); else expanded.delete(id);
  }

  /* ---------- sorting ---------- */
  function setSort(key) {
    if (key === 'week') {
      panelDir = panelDir === 'asc' ? 'desc' : 'asc';
    } else if (innerKey === key) {
      innerDir = innerDir === 'asc' ? 'desc' : 'asc';
    } else {
      innerKey = key;
      innerDir = (key === 'score' || key === 'confidence') ? 'desc' : 'asc';
    }
    renderList();
  }
  Array.prototype.forEach.call(heads, function (th) {
    th.addEventListener('click', function () { setSort(th.getAttribute('data-key')); });
    th.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSort(th.getAttribute('data-key')); }
    });
  });

  /* ---------- load (previous values stay on screen if a refresh fails) ---------- */
  function openFromHash() {
    var id = location.hash.slice(1);
    if (!id) return;
    if (findPsyop(id)) {
      var f = findPsyop(id);
      expanded.add(weekId(f.w));
      renderList();
      openDetail(id);
    } else if (/^\d{4}-\d{1,2}$/.test(id)) {      // week-only link: open that panel and scroll to it
      expanded.add(id);
      renderList();
      var sec = panelsEl.querySelector('[data-week="' + id + '"]');
      if (sec) sec.scrollIntoView();
    }
  }
  function load(first) {
    return fetch('weeks.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (json) {
        if (!json || !Array.isArray(json.weeks)) throw new Error('bad data');
        DATA = json;
        renderSummary();
        renderList();
        if (first) openFromHash();
      })
      .catch(function () {
        if (!DATA && first) {
          var p = el('p', 'err', 'Data could not be loaded. Reload the page to try again.');
          panelsEl.replaceChildren(p);
        }
      });
  }
  load(true);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && DATA) load(false);
  });
})();
