// Actions alone, or the rendered robot: one held-out UR5e clip, the action-only expert against Doppel.
// Every panel is a 17-frame sprite driven by one frame index, so the panels can never drift apart.
(() => {
  const { reducedMotion, watch } = window.Doppel;
  const DATA = window.DOPPEL_MEDIA.motivation;
  const LAST = 16, FPS = 6, HOLD = 1100; // ms on the last frame before looping
  const NAMES = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6', 'pad', 'grip'];
  const NS = 'http://www.w3.org/2000/svg';

  // Place frame k of a cols x rows sprite sheet in an element whose background is that sheet.
  function spriteFrame(node, sheet, k) {
    const col = k % sheet.cols, row = Math.floor(k / sheet.cols);
    node.style.backgroundPosition = `${sheet.cols > 1 ? col / (sheet.cols - 1) * 100 : 0}% ${sheet.rows > 1 ? row / (sheet.rows - 1) * 100 : 0}%`;
  }
  function setupSprite(node, url, sheet) {
    node.style.backgroundImage = `url("${url}")`;
    node.style.backgroundSize = `${sheet.cols * 100}% ${sheet.rows * 100}%`;
  }

  // The 8 numbers per frame: one row per dimension, a sparkline over the 17 frames and the current value.
  function buildActions(host, state) {
    const rows = NAMES.map((name, d) => {
      const vals = state.map(s => s[d]);
      const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo;
      const y = v => span < 1e-6 ? 10 : 17 - (v - lo) / span * 14;
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 100 20');
      svg.setAttribute('preserveAspectRatio', 'none');
      const line = document.createElementNS(NS, 'polyline');
      line.setAttribute('points', vals.map((v, i) => `${i / LAST * 100},${y(v)}`).join(' '));
      const head = document.createElementNS(NS, 'line');
      head.setAttribute('y1', 0); head.setAttribute('y2', 20); head.setAttribute('class', 'head');
      svg.append(line, head);
      const row = document.createElement('div');
      row.className = `act-row${d === 6 ? ' pad' : ''}`;
      const label = document.createElement('span'); label.className = 'name'; label.textContent = name;
      const value = document.createElement('span'); value.className = 'val';
      row.append(label, svg, value);
      host.appendChild(row);
      return { head, value, vals };
    });
    return k => rows.forEach(r => {
      const x = k / LAST * 100;
      r.head.setAttribute('x1', x); r.head.setAttribute('x2', x);
      r.value.textContent = r.vals[k].toFixed(2).replace('-', '−');
    });
  }

  function init() {
    const root = document.querySelector('[data-motivation]');
    if (!root) return;
    const sprites = [...root.querySelectorAll('[data-sprite]')].map(node => {
      const name = node.dataset.sprite, sheet = DATA.sprites[name];
      setupSprite(node, `assets/motivation/${name}.jpg`, sheet);
      return { node, sheet, fixed: node.dataset.fixed != null ? Number(node.dataset.fixed) : null };
    });
    const showActions = buildActions(root.querySelector('[data-actions]'), DATA.state);
    const play = root.querySelector('[data-mv-play]');
    const scrub = root.querySelector('[data-mv-scrub]');
    const count = root.querySelector('[data-mv-count]');
    const ticks = root.querySelector('[data-mv-ticks]');
    ticks.innerHTML = Array.from({ length: LAST + 1 }, () => '<span></span>').join('');
    const tickEls = [...ticks.children];
    let k = 0, playing = false, visible = false, userPaused = reducedMotion.matches, timer = 0;

    const show = frame => {
      k = frame;
      sprites.forEach(s => spriteFrame(s.node, s.sheet, s.fixed ?? k));
      showActions(k);
      scrub.value = k;
      scrub.setAttribute('aria-valuetext', `Frame ${k} of ${LAST}`);
      count.textContent = `Frame ${String(k).padStart(2, '0')} / ${LAST}`;
      tickEls.forEach((t, i) => { t.classList.toggle('past', i < k); t.classList.toggle('now', i === k); });
    };
    const setPlaying = on => {
      playing = on;
      play.dataset.playing = String(on);
      play.setAttribute('aria-label', on ? 'Pause' : 'Play');
      play.title = on ? 'Pause' : 'Play';
    };
    const stop = () => { clearTimeout(timer); setPlaying(false); };
    const tick = () => {
      if (!playing) return;
      if (k >= LAST) { show(0); timer = setTimeout(tick, 500); return; }
      show(k + 1);
      timer = setTimeout(tick, k >= LAST ? HOLD : 1000 / FPS);
    };
    const start = () => { clearTimeout(timer); setPlaying(true); timer = setTimeout(tick, k >= LAST ? 300 : 1000 / FPS); };

    play.addEventListener('click', () => { if (playing) { userPaused = true; stop(); } else { userPaused = false; start(); } });
    root.querySelectorAll('[data-mv-step]').forEach(b => b.addEventListener('click', () => {
      userPaused = true; stop(); show(Math.max(0, Math.min(LAST, k + Number(b.dataset.mvStep))));
    }));
    scrub.addEventListener('input', () => { userPaused = true; stop(); show(Number(scrub.value)); });
    root.addEventListener('keydown', e => {
      if (e.target.closest('input')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); root.querySelector(`[data-mv-step="${e.key === 'ArrowRight' ? 1 : -1}"]`).click(); }
    });
    watch(root, v => { visible = v; if (v && !userPaused) start(); else if (!v) stop(); }, { threshold: 0.3 });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (visible && !userPaused) start(); });
    // Reduced motion: start on the last frame, where the two predictions differ.
    show(reducedMotion.matches ? LAST : 0);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
