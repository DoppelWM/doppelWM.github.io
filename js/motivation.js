// Actions alone, or the rendered robot: one held-out clip per dataset. For the three robot datasets the action-only
// expert is set against Doppel trained on the three robots; the five added datasets have no action-only model, so only
// the render-conditioned row is shown (Doppel trained on all eight). Every panel is a 17-frame sprite driven by one
// frame index, so the panels can never drift apart.
(() => {
  const { reducedMotion, watch, DATASETS, bindGroup } = window.Doppel;
  const EX = window.DOPPEL_MEDIA.examples;
  const ORDER = ['droid', 'bridge', 'robomind', 'abc', 'trex', 'egoexo4d', 'gigahands', 'oakink2'];
  const ROBOTS = ['droid', 'bridge', 'robomind'];
  const LAST = 16, FPS = 6, HOLD = 1100; // ms on the last frame before looping
  const NS = 'http://www.w3.org/2000/svg';
  const NOTE = {
    droid: 'A Franka in a lab held out from training, 17 frames spread over the whole episode. The expert loses the cup on the way and the bowl ends nearly empty; Doppel carries the cup into the bowl, as in the recording.',
    bridge: 'A WidowX in the held-out toy kitchen. By the last frame the expert has moved the arm but the green fruit stays on the stove; Doppel\'s prediction lifts it, as in the recording.',
    robomind: 'A UR5e with objects held out from training. By the last frame the expert has raised the gripper but left the vegetable on the table; Doppel\'s prediction lifts it, as in the recording.',
  };
  const COMMON = 'Same first frame, same actions, same pretrained video backbone.';
  const SHAPE = ' 4:3 footage is shown at its recorded shape.';
  const NEW_NOTE = 'There is no action-only baseline for this dataset, so only the render-conditioned row is shown: Doppel trained on all eight datasets, on a held-out test clip. The actions panel plots the 8 values that change most in this clip.';
  const BODY = { abc: 'robot', trex: 'robot', egoexo4d: 'body', gigahands: 'hands', oakink2: 'body' };

  function spriteFrame(node, sheet, k) {
    const col = k % sheet.cols, row = Math.floor(k / sheet.cols);
    node.style.backgroundPosition = `${sheet.cols > 1 ? col / (sheet.cols - 1) * 100 : 0}% ${sheet.rows > 1 ? row / (sheet.rows - 1) * 100 : 0}%`;
  }
  function setupSprite(node, url, sheet) {
    node.style.backgroundImage = `url("${url}")`;
    node.style.backgroundSize = `${sheet.cols * 100}% ${sheet.rows * 100}%`;
  }

  // One row per action value: a sparkline over the 17 frames and the current value.
  function buildActions(host, state, names) {
    host.replaceChildren();
    const rows = names.map((name, d) => {
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
      row.className = `act-row${name === 'pad' ? ' pad' : ''}`;
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
    if (!root || !EX) return;
    const q = s => root.querySelector(s);
    const spriteNodes = [...root.querySelectorAll('[data-sprite]')];
    const actionRow = q('.mv-row.action'), acts2 = q('.mv-acts2');
    const play = q('[data-mv-play]'), scrub = q('[data-mv-scrub]'), count = q('[data-mv-count]'), ticks = q('[data-mv-ticks]');
    ticks.innerHTML = Array.from({ length: LAST + 1 }, () => '<span></span>').join('');
    const tickEls = [...ticks.children];
    let k = 0, playing = false, visible = false, userPaused = reducedMotion.matches, timer = 0, sprites = [], showActions = () => {};

    const show = frame => {
      k = frame;
      sprites.forEach(s => spriteFrame(s.node, s.sheet, s.fixed ?? k));
      showActions(k);
      scrub.value = k;
      scrub.setAttribute('aria-valuetext', `Frame ${k} of ${LAST}`);
      count.textContent = `Frame ${String(k).padStart(2, '0')} / ${LAST}`;
      tickEls.forEach((t, i) => { t.classList.toggle('past', i < k); t.classList.toggle('now', i === k); });
    };
    const load = ds => {
      const ex = EX[ds], d = DATASETS[ds], robot = ROBOTS.includes(ds);
      root.dataset.aspect = ex.aspect;
      root.classList.toggle('emb8', !robot);
      actionRow.hidden = !robot; acts2.hidden = robot;
      sprites = spriteNodes.filter(n => ex.sprites[n.dataset.sprite]).map(node => {
        const name = node.dataset.sprite, sheet = ex.sprites[name];
        setupSprite(node, `${ex.dir}/${name}.jpg`, sheet);
        return { node, sheet, fixed: node.dataset.fixed != null ? Number(node.dataset.fixed) : null };
      });
      const label = `${ex.shown < ex.dims ? `Actions, ${ex.shown} of ${ex.dims}` : `Actions, ${ex.dims} per frame`}`;
      if (robot) {
        q('[data-mv-acts-label]').textContent = label;
        showActions = buildActions(q('[data-actions]'), ex.state, ex.names);
        q('[data-mv-expert]').textContent = `Action-only expert, trained on ${d.robot} data only`;
        q('[data-mv-doppel]').textContent = 'Doppel';
        q('[data-mv-render-label]').textContent = 'Rendered robot + actions';
      } else {
        q('[data-mv-acts2-label]').textContent = label;
        showActions = buildActions(q('[data-actions2]'), ex.state, ex.names);
        q('[data-mv-doppel]').textContent = 'Doppel';
        q('[data-mv-render-label]').textContent = `Rendered ${BODY[ds]} (input)`;
      }
      const span = ex.clip === 'fullspan' ? 'whole episode, 17 frames spread across it' : '3.2 s window';
      q('[data-mv-meta]').textContent = `${d.robot} · ${d.name} · held-out test clip · ${span}`;
      q('[data-mv-note]').textContent = (robot ? `${NOTE[ds]} ${COMMON}` : NEW_NOTE) + (ex.aspect === '4:3' ? SHAPE : '');
      show(reducedMotion.matches ? LAST : 0);
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
      if (e.target.closest('input, [role="tab"]')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); root.querySelector(`[data-mv-step="${e.key === 'ArrowRight' ? 1 : -1}"]`).click(); }
    });

    const tabs = q('[data-mv-tabs]');
    tabs.innerHTML = ORDER.filter(ds => EX[ds]).map((ds, i) => `<button class="chip" role="tab" type="button" aria-selected="${ds === 'robomind'}" data-mvds="${ds}">${DATASETS[ds].robot} · ${DATASETS[ds].name}</button>`).join('');
    const switchTo = ds => { load(ds); if (playing) start(); };
    load(bindGroup(tabs, 'mvds', switchTo));

    watch(root, v => { visible = v; if (v && !userPaused) start(); else if (!v) stop(); }, { threshold: 0.3 });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (visible && !userPaused) start(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
