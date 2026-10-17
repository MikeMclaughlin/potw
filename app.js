(function () {
  'use strict';

  var DATA = null;           // last good data; kept on screen if a refresh fails
  var sortKey = 'week';
  var sortDir = 'desc';      // default: newest week first
  var CONF_RANK = { High: 3, Medium: 2, Low: 1 };

  var rowsEl = document.getElementById('rows');
  var summaryEl = document.getElementById('summary');
  var dialog = document.getElementById('detail');
  var dBody = document.getElementById('d-body');
  var heads = document.querySelectorAll('#list thead th');

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
  function tintClass(w) {
    if (w.status !== 'scored' || w.score == null) return 't-gap';
    if (w.score <= 3) return 't-low';
    if (w.score <= 5) return 't-mid';
    if (w.score <= 7) return 't-high';
    return 't-severe';
  }
  function heroClass(w) { return 'h-' + tintClass(w).slice(2); }
  function sortValue(w, key) {
    if (key === 'week') return w.year * 100 + w.week;
    if (w.status !== 'scored') return null;
    if (key === 'headline') return (w.headline || '').toLowerCase();
    if (key === 'outlet') return (w.outlet || '').toLowerCase();
    if (key === 'score') return w.score;
    if (key === 'audience') return (w.target_audience && w.target_audience.text || '').toLowerCase();
    if (key === 'confidence') return CONF_RANK[w.confidence && w.confidence.level] || 0;
    return null;
  }
  function audienceShort(w) {
    var t = w.target_audience && w.target_audience.text;
    return t || '';
  }

  /* ---------- list ---------- */
  function sorted() {
    var arr = DATA.weeks.slice();
    var dir = sortDir === 'asc' ? 1 : -1;
    arr.sort(function (a, b) {
      var va = sortValue(a, sortKey), vb = sortValue(b, sortKey);
      if (va == null && vb == null) return (b.year * 100 + b.week) - (a.year * 100 + a.week);
      if (va == null) return 1;      // rows without data always sink to the bottom
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return (b.year * 100 + b.week) - (a.year * 100 + a.week);
    });
    return arr;
  }

  function cell(tr, cls, label, text) {
    var td = el('td', cls, text);
    td.setAttribute('data-label', label);
    tr.appendChild(td);
    return td;
  }

  function renderList() {
    if (!DATA) return;
    var frag = document.createDocumentFragment();
    sorted().forEach(function (w) {
      var tr = el('tr', tintClass(w));
      tr.tabIndex = 0;
      tr.setAttribute('data-id', w.year + '-' + w.week);
      tr.setAttribute('role', 'button');
      var scored = w.status === 'scored';

      var wk = cell(tr, 'week', 'Week');
      wk.appendChild(el('b', null, 'Week ' + w.week));
      wk.appendChild(el('small', null, String(w.year)));

      if (scored) {
        cell(tr, 'headline', 'Headline', w.headline);
        cell(tr, 'outlet', 'Outlet', w.outlet);
        var sc = cell(tr, 'score', 'Score', String(w.score));
        sc.appendChild(el('small', null, ' / 10'));
        cell(tr, 'audience', 'Audience', audienceShort(w));
        cell(tr, 'conf', 'Confidence', w.confidence.level);
      } else {
        cell(tr, 'headline dim', 'Headline', w.status === 'in_progress' ? 'Week in progress' : 'Not yet scanned');
        cell(tr, 'outlet dim', 'Outlet', '\u2014');
        cell(tr, 'score dim', 'Score', '\u2014');
        cell(tr, 'audience dim', 'Audience', '\u2014');
        cell(tr, 'conf dim', 'Confidence', '\u2014');
      }
      frag.appendChild(tr);
    });
    rowsEl.replaceChildren(frag);   // swap in one step; old rows stay until new ones are ready

    Array.prototype.forEach.call(heads, function (th) {
      if (th.getAttribute('data-key') === sortKey) th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
  }

  function renderSummary() {
    var weeks = DATA.weeks;
    var scored = weeks.filter(function (w) { return w.status === 'scored'; });
    var gaps = weeks.filter(function (w) { return w.status !== 'scored'; });
    var top = scored.reduce(function (m, w) { return !m || w.score > m.score ? w : m; }, null);
    function stat(big, small) {
      var d = el('div', 'stat');
      d.appendChild(el('b', null, big));
      d.appendChild(el('span', null, small));
      return d;
    }
    var frag = document.createDocumentFragment();
    frag.appendChild(stat(String(weeks.length), 'weeks in the scan window'));
    frag.appendChild(stat(String(scored.length), 'weeks scored'));
    frag.appendChild(stat(String(gaps.length), 'gap weeks (no data yet)'));
    frag.appendChild(stat(top ? top.score + ' / 10' : '\u2014', top ? 'highest score so far (Week ' + top.week + ', ' + top.year + ')' : 'highest score so far'));
    summaryEl.replaceChildren(frag);

    document.getElementById('ver').textContent = DATA.app_version || '1.0';
    document.getElementById('updated').textContent = 'Data updated ' + fmtEST(DATA.updated);
  }

  /* ---------- detail ---------- */
  function h3(t) { return el('h3', null, t); }

  function renderDetail(w) {
    var frag = document.createDocumentFragment();
    var scored = w.status === 'scored';

    frag.appendChild(el('p', 'd-kicker', 'Week ' + w.week + ' \u00b7 ' + w.year));
    var title = el('h2', 'd-title');
    title.id = 'd-title';
    if (scored && w.url) {
      var a = el('a', null, w.headline);
      a.href = w.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.title = 'Open the headline at the outlet';
      title.appendChild(a);
    } else {
      title.textContent = scored ? w.headline : (w.status === 'in_progress' ? 'Week in progress' : 'Not yet scanned');
    }
    frag.appendChild(title);
    var meta = (scored ? w.outlet + (w.published ? ' \u00b7 ' + fmtEST(w.published) : '') + ' \u00b7 ' : '') + weekRange(w);
    frag.appendChild(el('p', 'd-meta', meta));

    if (scored) {
      var hero = el('div', 'hero');
      var s = el('div', heroClass(w));
      s.appendChild(el('span', 'big', w.score + ' / 10'));
      s.appendChild(el('small', null, 'Psyop score'));
      hero.appendChild(s);
      var t = el('div', heroClass(w));
      t.appendChild(el('span', 'big', w.factor_total + ' / 14'));
      t.appendChild(el('small', null, 'Factor total'));
      hero.appendChild(t);
      var c = el('div');
      c.appendChild(el('span', 'big', w.confidence.level));
      c.appendChild(el('small', null, 'Confidence'));
      hero.appendChild(c);
      var au = el('div', 'wide');
      au.appendChild(el('span', 'txt', w.target_audience.text));
      au.appendChild(el('small', null, 'Target audience (' + w.target_audience.basis + ')'));
      hero.appendChild(au);
      frag.appendChild(hero);

      frag.appendChild(h3('Claim scored'));
      frag.appendChild(el('p', null, w.scored_claim));
      frag.appendChild(h3('What happened'));
      frag.appendChild(el('p', null, w.summary));
      frag.appendChild(h3('Why this story was chosen'));
      frag.appendChild(el('p', null, w.selection_reason));

      frag.appendChild(h3('Seven factor scores (0 clean, 1 some concern, 2 serious concern)'));
      var tbl = el('table', 'factors');
      DATA.factors.forEach(function (f) {
        var fv = w.factors[f.key];
        var tr = el('tr', 'f' + fv.score);
        var n = el('td', null, f.label);
        n.title = f.description;
        n.appendChild(el('span', 'lab', fv.label));
        tr.appendChild(n);
        tr.appendChild(el('td', 'fs', String(fv.score)));
        tr.appendChild(el('td', null, fv.note));
        tbl.appendChild(tr);
      });
      frag.appendChild(tbl);
      frag.appendChild(el('p', 'total', 'Total ' + w.factor_total + ' of 14 maps to a score of ' + w.score + ' on the 1 to 10 scale.'));
      if (w.mechanism) {
        frag.appendChild(h3('Named manipulation mechanism (required at 8 or above)'));
        frag.appendChild(el('p', null, w.mechanism));
      }

      frag.appendChild(h3('Strongest counter-argument'));
      frag.appendChild(el('p', null, w.counter_argument));
      frag.appendChild(h3('Confidence'));
      frag.appendChild(el('p', null, w.confidence.reason));
      frag.appendChild(h3('Hindsight note'));
      frag.appendChild(el('p', null, w.hindsight_note || 'None.'));
    }

    frag.appendChild(h3('Gaps'));
    var ul = el('ul', 'plain');
    (w.gaps || []).forEach(function (g) { ul.appendChild(el('li', null, g)); });
    frag.appendChild(ul);

    if (w.sources && w.sources.length) {
      frag.appendChild(h3('Sources'));
      var sl = el('ul', 'src');
      var roleText = { in_window: 'Published in the window', hindsight: 'Published after the window (hindsight)', primary: 'Primary document' };
      w.sources.forEach(function (s) {
        var li = el('li');
        var b = el('b');
        var a = el('a', null, s.title);
        a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        b.appendChild(a);
        li.appendChild(b);
        var pub = s.published ? ' \u00b7 ' + fmtEST(s.published) : '';
        li.appendChild(el('span', 'm', s.outlet + ' \u00b7 ' + s.type + pub));
        var chk = s.link_check ? ' \u00b7 link checked ' + fmtDateOnly(s.link_check.checked) + ': ' + s.link_check.note : '';
        li.appendChild(el('span', 'm', (roleText[s.role] || '') + chk));
        sl.appendChild(li);
      });
      frag.appendChild(sl);
    }

    if (w.candidates_reviewed && w.candidates_reviewed.length) {
      frag.appendChild(h3('Other top stories screened (not scored)'));
      var cl = el('ul', 'plain cand');
      w.candidates_reviewed.forEach(function (c) {
        var li = el('li');
        var a = el('a', null, c.headline);
        a.href = c.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        li.appendChild(a);
        li.appendChild(document.createTextNode(' \u2014 ' + c.via + '. ' + c.note));
        cl.appendChild(li);
      });
      frag.appendChild(cl);
    }

    frag.appendChild(el('p', 'disc', DATA.disclaimer));
    dBody.replaceChildren(frag);
  }

  function openDetail(id) {
    if (!DATA) return;
    var w = DATA.weeks.filter(function (x) { return (x.year + '-' + x.week) === id; })[0];
    if (!w) return;
    renderDetail(w);
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('.sheet').scrollTop = 0;
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  }
  function closeDetail() {
    if (dialog.open) dialog.close();
  }
  dialog.addEventListener('close', function () {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  });
  dialog.addEventListener('click', function (e) {
    if (e.target === dialog) closeDetail();
  });
  document.getElementById('d-close').addEventListener('click', closeDetail);

  rowsEl.addEventListener('click', function (e) {
    var tr = e.target.closest('tr');
    if (tr) openDetail(tr.getAttribute('data-id'));
  });
  rowsEl.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var tr = e.target.closest('tr');
    if (tr) { e.preventDefault(); openDetail(tr.getAttribute('data-id')); }
  });

  /* ---------- sorting ---------- */
  function setSort(key) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = (key === 'week' || key === 'score' || key === 'confidence') ? 'desc' : 'asc'; }
    renderList();
  }
  Array.prototype.forEach.call(heads, function (th) {
    th.addEventListener('click', function () { setSort(th.getAttribute('data-key')); });
    th.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSort(th.getAttribute('data-key')); }
    });
  });

  /* ---------- load (previous values stay on screen if a refresh fails) ---------- */
  function load(first) {
    return fetch('weeks.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (json) {
        if (!json || !Array.isArray(json.weeks)) throw new Error('bad data');
        DATA = json;
        renderSummary();
        renderList();
        var id = location.hash.slice(1);
        if (first && id) openDetail(id);
      })
      .catch(function () {
        if (!DATA && first) {
          rowsEl.replaceChildren();
          var tr = el('tr'); var td = el('td', 'err', 'Data could not be loaded. Reload the page to try again.');
          td.colSpan = 6; tr.appendChild(td); rowsEl.appendChild(tr);
        }
      });
  }
  load(true);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && DATA) load(false);
  });
})();
