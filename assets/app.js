/* Game Night Rulebook — shared page behavior.
   Every feature is guarded by the elements it needs, so one script serves all pages. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ROOT = document.documentElement.dataset.root || './';
  const PAGE = document.body.dataset.page || 'home';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- in-page section links ---------- */
  document.querySelectorAll('.subnav a').forEach((a) => a.addEventListener('click', (e) => {
    const el = document.querySelector(a.getAttribute('href'));
    if (el) { e.preventDefault(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', a.getAttribute('href')); }
  }));

  /* ---------- checklists (remembered on this device) ---------- */
  document.querySelectorAll('.checklist').forEach((list) => {
    const card = list.closest('.card');
    const key = 'rb-' + list.dataset.list;
    const saved = store.get(key) || {};
    const boxes = [...list.querySelectorAll('input')];
    function upd() {
      const done = boxes.filter((b) => b.checked).length;
      card.querySelector('.progress i').style.width = (done / boxes.length) * 100 + '%';
      card.querySelector('.prog-text').textContent = done === boxes.length ? "All set. Let's play! 🎉" : done + ' of ' + boxes.length + ' done';
      const s = {}; boxes.forEach((b) => (s[b.id] = b.checked)); store.set(key, s);
    }
    boxes.forEach((b) => { b.checked = !!saved[b.id]; b.addEventListener('change', upd); });
    card.querySelector('.reset').addEventListener('click', () => { boxes.forEach((b) => (b.checked = false)); upd(); });
    upd();
  });

  /* ---------- turn steppers ---------- */
  document.querySelectorAll('[data-stepper]').forEach((st) => {
    const items = [...st.querySelector('template').content.children];
    const steps = st.querySelector('.steps');
    const panel = st.querySelector('.steppanel');
    let i = 0;
    items.forEach((it, idx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<span class="n">' + (idx + 1) + '</span>' + esc(it.dataset.title);
      b.addEventListener('click', () => go(idx));
      steps.append(b);
    });
    function go(n) {
      i = Math.max(0, Math.min(items.length - 1, n));
      panel.innerHTML = '';
      panel.append(items[i].cloneNode(true));
      [...steps.children].forEach((b, k) => b.setAttribute('aria-current', k === i));
      st.querySelector('.prev').style.visibility = i ? 'visible' : 'hidden';
      st.querySelector('.next').textContent = i === items.length - 1 ? 'Start over ↺' : 'Next →';
    }
    st._go = go;
    st.querySelector('.prev').addEventListener('click', () => go(i - 1));
    st.querySelector('.next').addEventListener('click', () => go(i === items.length - 1 ? 0 : i + 1));
    go(0);
  });

  /* ---------- deep links: #rule-id opens that rule; #section--2 opens step 2 ---------- */
  function openFromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (!h || /^room-/.test(h)) return;
    const [id, step] = h.split('--');
    const el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'DETAILS') el.open = true;
    const st = el.querySelector('[data-stepper]');
    if (st && step && st._go) st._go(parseInt(step, 10) - 1);
    setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
    }, 60);
  }
  window.addEventListener('hashchange', openFromHash);
  window.addEventListener('load', openFromHash);

  /* ---------- search: this page's rules + every game ---------- */
  const q = $('q');
  if (q) {
    const hint = $('qhint');
    const box = $('qresults');
    const article = document.querySelector('article.page');
    const SYN = {
      score: ['points', 'scoring', 'pts', 'vp'], points: ['score', 'scoring', 'pts', 'vp'], scoring: ['score', 'points'],
      tie: ['tiebreak', 'tie-breaker', 'tied'], end: ['ends', 'finish', 'over', 'trigger'], win: ['winner', 'victory', 'winning', 'won'],
      lose: ['loss', 'losing', 'lost', 'defeat'], setup: ['set', 'prepare', 'start'], hp: ['health'], health: ['hp'],
      mana: ['focus'], focus: ['mana'], fight: ['attack', 'combat'], attack: ['fight', 'combat'], combat: ['attack', 'counter-attack'],
      tree: ['trees', 'green', 'brown'], mountain: ['mountains', 'gray', 'grey'], grey: ['gray'], water: ['river', 'blue', 'islands'],
      gem: ['crystal', 'crystals'], gems: ['crystals'], crystal: ['crystals'], golem: ['golems', 'point'], coin: ['coins', 'gold', 'silver'],
      card: ['cards'], limit: ['max', 'maximum'], max: ['limit', 'maximum'], dead: ['unconscious'], ko: ['unconscious'],
      turn: ['turns', 'action', 'actions'], egg: ['eggs'], eggs: ['egg'], bird: ['birds'], food: ['feeder', 'birdfeeder'], feeder: ['birdfeeder'], goal: ['goals'], round: ['rounds'], stack: ['stacking', 'stacks', 'stacked'], animal: ['animals', 'habitat', 'cubes'], dice: ['die']
    };
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const IDX = (window.SEARCH_INDEX || []).map((d) => ({ ...d, _t: norm(d.t), _x: norm(d.s + ' ' + d.x) }));
    const GAME = { wingspan: '🐦 Wingspan', harmonies: '🌿 Harmonies', ted: '🗡️ Tiny Epic Dungeons', century: '💎 Century', night: '🎉 Game Night' };
    let results = [], sel = -1;

    function variants(tok) {
      const v = new Set([tok]);
      (SYN[tok] || []).forEach((x) => v.add(x));
      if (tok.length > 3 && tok.endsWith('s')) v.add(tok.slice(0, -1));
      return [...v];
    }
    function search(query) {
      const toks = norm(query).split(/[^a-z0-9-]+/).filter((t) => t.length > 1);
      if (!toks.length) return [];
      const out = [];
      IDX.forEach((d) => {
        let score = 0;
        for (const tok of toks) {
          let best = 0;
          for (const v of variants(tok)) {
            const word = new RegExp('(^|[^a-z0-9])' + v.replace(/[-]/g, '\\-'));
            const exact = v === tok ? 1 : 0.75;
            if (word.test(d._t)) best = Math.max(best, 6 * exact);
            else if (v.length >= 4 && d._t.includes(v)) best = Math.max(best, 2.5 * exact);
            else if (word.test(d._x)) best = Math.max(best, 2 * exact);
            else if (v.length >= 4 && d._x.includes(v)) best = Math.max(best, 1 * exact);
          }
          if (!best) return; // every word must match somewhere
          score += best;
        }
        if (d.k === 'rule') score += 1;
        if (d.g === PAGE) score += 1.5;
        out.push({ d, score, toks });
      });
      return out.sort((a, b) => b.score - a.score).slice(0, 8);
    }
    function snippet(text, toks) {
      const low = norm(text);
      let at = -1;
      for (const t of toks) for (const v of variants(t)) { const j = low.indexOf(v); if (j > -1 && (at < 0 || j < at)) at = j; }
      let s = at > 40 ? '…' + text.slice(at - 30, at + 110) : text.slice(0, 140);
      if (text.length > 140) s += '…';
      let html = esc(s);
      toks.forEach((t) => variants(t).forEach((v) => {
        if (v.length < 2) return;
        html = html.replace(new RegExp('(' + v.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
      }));
      return html;
    }
    function render() {
      if (!results.length) {
        box.innerHTML = q.value.trim().length > 1 ? '<div class="qr-empty">No rules found. Try another word, like “score” or “turn”.</div>' : '';
        box.hidden = !box.innerHTML; q.setAttribute('aria-expanded', !box.hidden); return;
      }
      box.innerHTML = results.map((r, i) =>
        '<a role="option" id="qr-' + i + '" class="qr-item' + (i === sel ? ' sel' : '') + '" href="' + ROOT + r.d.u + '#' + r.d.a + '" aria-selected="' + (i === sel) + '">' +
        '<span class="qr-game">' + GAME[r.d.g] + ' · ' + esc(r.d.s) + '</span>' +
        '<span class="qr-title">' + esc(r.d.t) + '</span>' +
        '<span class="qr-snip">' + snippet(r.d.x, r.toks) + '</span></a>').join('');
      box.hidden = false; q.setAttribute('aria-expanded', 'true');
    }
    function clearMarks(root) { root.querySelectorAll('mark').forEach((m) => m.replaceWith(document.createTextNode(m.textContent))); root.normalize(); }
    function markText(node, term) {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const hits = []; let n;
      while ((n = walker.nextNode())) {
        const p = n.parentNode && n.parentNode.nodeName;
        if (['OPTION', 'SELECT', 'SCRIPT', 'STYLE', 'OUTPUT', 'BUTTON'].includes(p)) continue;
        if (n.nodeValue.toLowerCase().includes(term)) hits.push(n);
      }
      hits.forEach((t) => {
        const frag = document.createDocumentFragment();
        const s = t.nodeValue, low = s.toLowerCase(); let i = 0, j;
        while ((j = low.indexOf(term, i)) > -1) { frag.append(s.slice(i, j)); const m = document.createElement('mark'); m.textContent = s.slice(j, j + term.length); frag.append(m); i = j + term.length; }
        frag.append(s.slice(i)); t.replaceWith(frag);
      });
    }
    function filterPage(v) {
      if (!article) return;
      const term = v.trim().toLowerCase();
      clearMarks(article);
      const det = article.querySelectorAll('.acc details');
      let count = 0;
      det.forEach((d) => {
        if (!term) { d.classList.remove('hidden'); return; }
        const hit = d.textContent.toLowerCase().includes(term);
        d.classList.toggle('hidden', !hit); d.open = hit;
        if (hit) { count++; markText(d, term); }
      });
      if (hint) hint.textContent = term && det.length ? (count ? count + ' rule' + (count > 1 ? 's' : '') + ' on this page' : '') : '';
    }
    let tmr;
    q.addEventListener('input', () => {
      clearTimeout(tmr);
      tmr = setTimeout(() => { results = search(q.value); sel = -1; render(); filterPage(q.value); }, 120);
    });
    q.addEventListener('keydown', (e) => {
      if (box.hidden || !results.length) return;
      if (e.key === 'ArrowDown') { sel = (sel + 1) % results.length; render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = (sel - 1 + results.length) % results.length; render(); e.preventDefault(); }
      else if (e.key === 'Enter') { const a = box.querySelectorAll('a')[sel < 0 ? 0 : sel]; if (a) { location.href = a.href; box.hidden = true; } }
      else if (e.key === 'Escape') { box.hidden = true; }
    });
    box.addEventListener('click', () => setTimeout(() => (box.hidden = true), 50));
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.hidden = true; });
    q.addEventListener('focus', () => { if (results.length) box.hidden = false; });
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); q.focus(); }
    });
  }

  /* ---------- small helpers for tools ---------- */
  function bump(id, v) {
    const el = $(id);
    if (el.textContent !== String(v)) { el.textContent = v; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }
  function pills(el, cb) {
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true'); cb(b.dataset.v);
    }));
  }

  /* ---------- Harmonies: stacking checker ---------- */
  if ($('stk-top')) {
    const colors = { G: ['Gray', '#8f949b'], B: ['Brown', '#8a5a3b'], g: ['Green', '#4f9a4a'], R: ['Red', '#c94a3c'], W: ['Blue', '#3f88c5'], Y: ['Yellow', '#e5c443'] };
    const topEl = $('stk-top');
    Object.entries(colors).forEach(([k, [n, c]], i) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = k; b.setAttribute('aria-pressed', i === 0);
      b.innerHTML = '<span class="swatch" style="background:' + c + '"></span>' + n; topEl.append(b);
    });
    let stkTop = 'G';
    const baseSel = $('stk-base');
    function checkStack() {
      const base = baseSel.value, t = stkTop; let ok = false, why = '';
      if (base === 'cube') why = 'A token with an Animal cube is locked. Nothing can be placed on it.';
      else if (base === 'empty') { ok = true; why = 'Any token can go on an empty space.' + (t === 'R' ? " A lone red doesn't score as a building; it needs to be on top of another token." : ''); }
      else {
        const len = base.length, topTok = base[len - 1];
        if (len >= 3) why = 'This stack is already at the maximum height of 3.';
        else if (['g', 'R', 'W', 'Y'].includes(topTok)) why = colors[topTok][0] + ' tokens can never have anything placed on them.';
        else if (t === 'G') { ok = base.split('').every((c) => c === 'G'); why = ok ? 'Gray stacks on gray, making a mountain up to 3 high.' : 'Gray only goes on an empty space or on other gray.'; }
        else if (t === 'B') { ok = base === 'B'; why = ok ? 'Two brown makes the tallest trunk.' : 'Brown only goes on an empty space or on 1 brown.'; }
        else if (t === 'g') { ok = base === 'B' || base === 'BB'; why = ok ? 'Green on brown makes a tree of height ' + (len + 1) + ' (' + (len === 1 ? 3 : 7) + ' pts).' : 'Green only goes on an empty space or on 1–2 brown.'; }
        else if (t === 'R') { ok = len === 1 && ['G', 'B', 'R'].includes(base); why = ok ? 'That makes a building (2 high). It scores 5 if surrounded by 3+ colors.' : 'Red goes on an empty space or on exactly one gray, brown or red token.'; }
        else why = colors[t][0] + ' tokens can only be placed on empty spaces.';
      }
      $('stk-out').innerHTML = '<div class="' + (ok ? 'ok' : 'warn') + '">' + (ok ? '✓ Allowed.' : '✗ Not allowed.') + '</div><p class="hint" style="margin:8px 2px 0">' + why + '</p>';
    }
    pills(topEl, (v) => { stkTop = v; checkStack(); });
    baseSel.addEventListener('change', checkStack);
    checkStack();
  }

  /* ---------- Harmonies: score calculator ---------- */
  if ($('hcalc')) {
    let side = 'A';
    const hc = $('hcalc');
    const riverPts = (n) => (n <= 1 ? 0 : [0, 0, 2, 5, 8, 11, 15][n] ?? 15 + (n - 6) * 4);
    function calc() {
      const v = {};
      hc.querySelectorAll('input[data-k]').forEach((i) => (v[i.dataset.k] = Math.max(0, parseInt(i.value, 10) || 0)));
      const trees = v.t1 + v.t2 * 3 + v.t3 * 7, mtn = v.m1 + v.m2 * 3 + v.m3 * 7, fields = v.f * 5, bld = v.b * 5;
      const water = side === 'A' ? riverPts(v.river) : v.isl * 5;
      bump('htotal', trees + mtn + fields + bld + water + v.ani + v.spi);
      $('hbreak').textContent = 'Trees ' + trees + ' · Mountains ' + mtn + ' · Fields ' + fields + ' · Buildings ' + bld + ' · ' + (side === 'A' ? 'River ' : 'Islands ') + water + ' · Animals ' + v.ani + ' · Spirit ' + v.spi;
    }
    pills($('hside'), (v) => { side = v; hc.querySelectorAll('[data-side]').forEach((f) => f.classList.toggle('hidden', f.dataset.side !== v)); calc(); });
    hc.addEventListener('input', calc);
    hc.querySelector('.reset-calc').addEventListener('click', () => { hc.querySelectorAll('input[data-k]').forEach((i) => (i.value = 0)); calc(); });
    calc();
  }

  /* ---------- Tiny Epic Dungeons: combat helper ---------- */
  if ($('ta-total')) {
    const ta = () => {
      const t = +$('ta-total').value || 0, d = +$('ta-def').value || 0, sp = $('ta-spell').checked;
      bump('ta-out', Math.max(0, sp ? t : t - d));
    };
    ['ta-total', 'ta-def', 'ta-spell'].forEach((id) => $(id).addEventListener('input', ta));
    ta();
    let die = '3';
    function te() {
      const m = +$('te-mod').value || 0, d = +$('te-def').value || 0; let raw, note;
      if (die === 'torch') { raw = 0; note = 'Miss! But move the torch down 1 space.'; }
      else if (die === 'shield') { raw = m; note = 'Shield: damage equals the enemy modifier (' + m + ') minus your Defense.'; }
      else { raw = +die + m; note = die + ' + modifier ' + m + ' = ' + raw + ', minus your Defense ' + d + '.'; }
      bump('te-out', die === 'torch' ? 0 : Math.max(0, raw - d)); $('te-note').textContent = note;
    }
    pills($('te-die'), (v) => { die = v; te(); });
    ['te-mod', 'te-def'].forEach((id) => $(id).addEventListener('input', te));
    te();
  }

  /* ---------- Tiny Epic Dungeons: danger tracker ---------- */
  if ($('gob-dots')) {
    let gob = 0, trn = 0;
    const gd = $('gob-dots');
    for (let k = 1; k <= 4; k++) { const s = document.createElement('span'); s.textContent = k; gd.append(s); }
    function rg() {
      $('gob').textContent = gob;
      [...gd.children].forEach((s, k) => { s.classList.toggle('on', k < gob); s.textContent = k < gob ? '👺' : k + 1; });
      $('gob-msg').innerHTML = gob >= 5 ? '<div class="warn">A 5th Goblin means the heroes lose!</div>' : gob === 4 ? '<div class="warn">All 4 Goblins are out. The next one loses the game.</div>' : '';
      $('trn').textContent = trn;
    }
    $('gob-inc').onclick = () => { gob = Math.min(5, gob + 1); rg(); };
    $('gob-dec').onclick = () => { gob = Math.max(0, gob - 1); rg(); };
    $('trn-inc').onclick = () => { trn++; rg(); };
    $('trn-dec').onclick = () => { trn = Math.max(0, trn - 1); rg(); };
    $('trk-reset').onclick = () => { gob = 0; trn = 0; rg(); };
    rg();
  }


  /* ---------- Wingspan: green goal helper ---------- */
  if ($('wgoal')) {
    const PTS = [[4, 1, 0], [5, 2, 1], [6, 3, 2], [7, 4, 3]];
    function wg() {
      const r = +$('wg-round').value, place = +$('wg-place').value;
      const tied = Math.max(1, Math.min(5, parseInt($('wg-tied').value, 10) || 1));
      let pts = 0, note;
      if (place > 2) { note = 'Only 1st to 3rd place score. You also need at least 1 of the item.'; }
      else {
        const shared = PTS[r].slice(place, place + tied);
        const sum = shared.reduce((a, b) => a + b, 0);
        pts = Math.floor(sum / tied);
        note = tied > 1 ? 'Tied places (' + shared.join(' + ') + ' = ' + sum + ') split ' + tied + ' ways, rounded down.' : 'Needs at least 1 of the target item to score.';
      }
      bump('wg-out', pts); $('wg-note').textContent = note;
    }
    ['wg-round', 'wg-place', 'wg-tied'].forEach((id) => $(id).addEventListener('input', wg));
    wg();
  }

  /* ---------- Wingspan: score calculator ---------- */
  if ($('wcalc')) {
    const wc = $('wcalc');
    function calcW() {
      const v = {};
      wc.querySelectorAll('input[data-k]').forEach((i) => (v[i.dataset.k] = Math.max(0, parseInt(i.value, 10) || 0)));
      const goals = v.g1 + v.g2 + v.g3 + v.g4;
      bump('wtotal', v.birds + v.bonus + goals + v.eggs + v.cache + v.tuck);
      $('wbreak').textContent = 'Birds ' + v.birds + ' · Bonus ' + v.bonus + ' · Goals ' + goals + ' · Eggs ' + v.eggs + ' · Cached ' + v.cache + ' · Tucked ' + v.tuck + ' · Tie-break food ' + v.food;
    }
    wc.addEventListener('input', calcW);
    wc.querySelector('.reset-calc').addEventListener('click', () => { wc.querySelectorAll('input[data-k]').forEach((i) => (i.value = 0)); calcW(); });
    calcW();
  }


  /* ---------- Wingspan: bird appendix (lazy-loaded data) ---------- */
  if ($('birdapp')) {
    const FOOD = { inv: '🐛', seed: '🌰', fish: '🐟', fruit: '🍒', rod: '🐭', nec: '🌸', wild: '✳️' };
    const HAB = { F: ['🌲', 'Forest'], G: ['🌾', 'Grassland'], W: ['💧', 'Wetland'] };
    const NEST = { bowl: ['🥣', 'Bowl'], cavity: ['🕳️', 'Cavity'], ground: ['🪨', 'Ground'], platform: ['🪵', 'Platform'], wild: ['⭐', 'Star (any)'], none: ['—', 'No nest'] };
    const COL = { white: 'When played', brown: 'When activated', pink: 'Once between turns', teal: 'Round end', yellow: 'Game end', none: 'No power' };
    const SETS = { core: 'Base game', european: 'European', oceania: 'Oceania', asia: 'Asia', americas: 'Americas', promo: 'Promo' };
    const PAGE_SIZE = 30;
    let birds = [], shown = PAGE_SIZE;
    const tags = new Set();
    const ids = ['b-q', 'b-set', 'b-hab', 'b-food', 'b-col', 'b-nest', 'b-bonus', 'b-sort'];
    const numv = (x) => (typeof x === 'number' ? x : -1);
    function food(b) {
      const parts = [];
      Object.entries(b.f).forEach(([k, n]) => { for (let i = 0; i < n; i++) parts.push(FOOD[k]); });
      if (!parts.length) return '<span class="b-free">Free</span>';
      return '<span class="b-food" title="Food cost">' + parts.join(b.or ? '<span class="b-or">/</span>' : '') + '</span>';
    }
    function card(b) {
      return '<article class="bird"><div class="b-top"><div><h3>' + esc(b.n) + '</h3><i class="b-sci">' + esc(b.s) + '</i></div><span class="b-pts" title="Points">' + (b.p ?? 0) + '<small>pts</small></span></div>' +
        '<div class="b-row"><span class="b-hab" title="Habitats">' + b.h.split('').map((h) => '<span title="' + HAB[h][1] + '">' + HAB[h][0] + '</span>').join('') + '</span>' + food(b) + '</div>' +
        '<div class="b-meta"><span class="b-pc pc-' + b.c + '">' + COL[b.c] + '</span><span title="Nest">' + NEST[b.nest][0] + ' ' + NEST[b.nest][1] + '</span><span title="Egg limit">🥚 ' + (b.e ?? 0) + '</span><span title="Wingspan">↔ ' + (typeof b.w === 'number' ? b.w + ' cm' : '★ any') + '</span></div>' +
        ((b.pr || b.fl || b.bo || b.bc.length) ? '<div class="b-tags2">' + (b.pr ? '<span>🦅 Predator</span>' : '') + (b.fl ? '<span>🐦‍⬛ Flocking</span>' : '') + (b.bo ? '<span>🎯 Bonus cards</span>' : '') +
          (b.bc.length ? '<span class="b-bc" title="Counts toward these bonus cards">Counts for: ' + b.bc.map(esc).join(', ') + '</span>' : '') + '</div>' : '') +
        '<div class="b-set">' + SETS[b.set] + '</div></article>';
    }
    function apply(resetShown) {
      if (resetShown) shown = PAGE_SIZE;
      const q = $('b-q').value.trim().toLowerCase(), set = $('b-set').value, hab = $('b-hab').value, fd = $('b-food').value;
      const col = $('b-col').value, nest = $('b-nest').value, bonus = $('b-bonus').value, sort = $('b-sort').value;
      let list = birds.filter((b) =>
        (set === 'all' || b.set === set) && (!q || new RegExp('(^|[^a-z])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(b.n.toLowerCase()) || b.s.toLowerCase().includes(q)) &&
        (!hab || b.h.includes(hab)) && (!fd || (fd === 'free' ? !Object.keys(b.f).length : b.f[fd])) &&
        (!col || b.c === col) && (!nest || b.nest === nest) && (!bonus || b.bc.includes(bonus)) &&
        [...tags].every((t) => b[t]));
      const by = { n: (a, b) => a.n.localeCompare(b.n), p: (a, b) => (b.p ?? 0) - (a.p ?? 0) || a.n.localeCompare(b.n), t: (a, b) => (a.t ?? 0) - (b.t ?? 0) || a.n.localeCompare(b.n),
        e: (a, b) => (b.e ?? 0) - (a.e ?? 0) || a.n.localeCompare(b.n), w: (a, b) => numv(b.w) - numv(a.w), w2: (a, b) => (numv(a.w) < 0 ? 1e9 : a.w) - (numv(b.w) < 0 ? 1e9 : b.w) };
      list.sort(by[sort]);
      $('b-count').textContent = list.length + ' bird' + (list.length === 1 ? '' : 's') + ' found';
      $('b-list').innerHTML = list.length ? list.slice(0, shown).map(card).join('') : '<div class="empty">No birds match. Try fewer filters.</div>';
      $('b-more').classList.toggle('hidden', list.length <= shown);
      $('b-more').textContent = 'Show more (' + (list.length - shown) + ' left)';
    }
    let t;
    ids.forEach((id) => $(id).addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => apply(true), 120); }));
    $('b-tags').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on);
      on ? tags.add(b.dataset.v) : tags.delete(b.dataset.v); apply(true);
    }));
    $('b-more').addEventListener('click', () => { shown += PAGE_SIZE; apply(false); });
    $('b-reset').addEventListener('click', () => {
      ids.forEach((id) => { const el = $(id); el.value = id === 'b-set' ? 'core' : id === 'b-sort' ? 'n' : ''; });
      tags.clear(); $('b-tags').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false')); apply(true);
    });
    fetch(ROOT + 'assets/birds.json').then((r) => r.json()).then((d) => { birds = d.birds; apply(true); })
      .catch(() => { $('b-count').textContent = "Couldn't load the bird list. Check your connection and refresh."; });
  }

  /* ---------- Century: score sheet ---------- */
  if ($('cplayers')) {
    const cp = $('cplayers');
    function addPlayer() {
      const n = cp.querySelectorAll('.prow:not(.head)').length;
      if (n >= 5) return;
      const r = document.createElement('div'); r.className = 'prow';
      r.innerHTML = '<input value="Player ' + (n + 1) + '" aria-label="Player ' + (n + 1) + ' name">' +
        [['golem', 'Golem points'], ['gold', 'Gold coins'], ['silver', 'Silver coins'], ['cry', 'Non-yellow crystals']]
          .map(([k, l]) => '<input type="number" min="0" inputmode="numeric" value="0" data-k="' + k + '" aria-label="' + l + '">').join('') +
        '<span class="sum">0</span>';
      cp.append(r); calc();
    }
    function calc() {
      const rows = [...cp.querySelectorAll('.prow:not(.head)')]; let best = -1, bi = -1;
      rows.forEach((r, i) => {
        const g = (k) => Math.max(0, +r.querySelector('[data-k=' + k + ']').value || 0);
        const s = g('golem') + g('gold') * 3 + g('silver') + g('cry');
        r.querySelector('.sum').textContent = s; r.dataset.s = s;
        if (s >= best) { best = s; bi = i; } // ">=" so the later seat wins ties
      });
      rows.forEach((r, i) => r.classList.toggle('win', i === bi && best > 0));
      const tied = rows.filter((r) => +r.dataset.s === best).length;
      $('cwinner').textContent = best > 0 ? 'Leader: ' + rows[bi].querySelector('input').value + ' with ' + best + ' points' + (tied > 1 ? ' (tie goes to the player later in turn order)' : '') : 'Enter scores to see the winner.';
    }
    cp.addEventListener('input', calc);
    $('cadd').onclick = addPlayer;
    $('crem').onclick = () => { const rows = cp.querySelectorAll('.prow:not(.head)'); if (rows.length > 2) { rows[rows.length - 1].remove(); calc(); } };
    $('cclear').onclick = () => { cp.querySelectorAll('[data-k]').forEach((i) => (i.value = 0)); calc(); };
    addPlayer(); addPlayer(); addPlayer();
  }
})();
