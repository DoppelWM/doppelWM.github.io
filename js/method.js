// The calibration player (Camera extrinsics), the recovered-camera clip of method step 1 and the two conditioning
// diagrams (steps 3 and 4). The render/recording divider (step 2) lives in media.js.
(() => {
  const { reducedMotion, watch, timebar } = window.Doppel;
  const MEDIA = window.DOPPEL_MEDIA;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, text) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text != null) node.textContent = text;
    return node;
  };
  const sprite = (node, url, sheet) => {
    node.style.backgroundImage = `url("${url}")`;
    node.style.backgroundSize = `${sheet.cols * 100}% ${sheet.rows * 100}%`;
  };
  const frame = (node, sheet, k) => {
    const col = k % sheet.cols, row = Math.floor(k / sheet.cols);
    node.style.backgroundPosition = `${col / (sheet.cols - 1) * 100}% ${row / (sheet.rows - 1) * 100}%`;
  };

  /* Step 1: a real camera optimisation, step by step, then the clip at the recovered pose. */
  function bindCalibration() {
    const root = document.querySelector('[data-calib]');
    if (!root) return;
    const C = MEDIA.calibration, last = C.steps.length - 1;
    const stepsNode = root.querySelector('[data-calib-sprite]');
    const clipNode = stepsNode.cloneNode();
    clipNode.removeAttribute('data-calib-sprite');
    clipNode.setAttribute('aria-label', 'The WidowX clip playing with the robot rendered over it at the recovered camera pose');
    clipNode.hidden = true;
    stepsNode.after(clipNode);
    sprite(stepsNode, 'assets/calibration/steps.jpg', C.sprites.steps);
    sprite(clipNode, 'assets/calibration/aligned.jpg', C.sprites.aligned);
    const range = root.querySelector('[data-calib-range]');
    const readout = root.querySelector('[data-calib-readout]');
    const play = root.querySelector('[data-calib-play]');
    const moved = i => `${C.moved[i][0].toFixed(1)}° and ${C.moved[i][1].toFixed(1)} cm`;
    // Timeline: hold the initial guess, run through the traced steps, hold, then play the clip at the final pose.
    const seq = [];
    C.steps.forEach((_, i) => seq.push({ step: i, ms: i === 0 ? 1100 : i === last ? 800 : 140 }));
    for (let f = 0; f <= 16; f++) seq.push({ clip: f, ms: f === 16 ? 1200 : 170 });
    let pos = 0, playing = false, userPaused = reducedMotion.matches, timer = 0;

    const show = p => {
      pos = p;
      const s = seq[p];
      if (s.clip != null) {
        stepsNode.hidden = true; clipNode.hidden = false;
        frame(clipNode, C.sprites.aligned, s.clip);
        range.value = last;
        readout.innerHTML = `<b>Step ${C.n_steps}.</b> The clip plays with the camera at the recovered pose, ${moved(last)} from the initial guess.`;
      } else {
        stepsNode.hidden = false; clipNode.hidden = true;
        frame(stepsNode, C.sprites.steps, s.step);
        range.value = s.step;
        readout.innerHTML = s.step === 0
          ? '<b>Initial guess.</b> The rendered robot does not line up with the arm in the recording.'
          : `<b>Adam step ${C.steps[s.step]} / ${C.n_steps}.</b> Camera moved ${moved(s.step)} from the initial guess.`;
      }
      range.setAttribute('aria-valuetext', `Step ${C.steps[Number(range.value)]} of ${C.n_steps}`);
    };
    const setPlaying = on => {
      playing = on;
      play.dataset.playing = String(on);
      play.setAttribute('aria-label', on ? 'Pause' : 'Play');
      play.title = on ? 'Pause' : 'Play';
    };
    const stop = () => { clearTimeout(timer); setPlaying(false); };
    const tick = () => { if (!playing) return; show((pos + 1) % seq.length); timer = setTimeout(tick, seq[pos].ms); };
    const start = () => { clearTimeout(timer); setPlaying(true); timer = setTimeout(tick, seq[pos].ms); };
    play.addEventListener('click', () => { if (playing) { userPaused = true; stop(); } else { userPaused = false; if (pos === seq.length - 1) show(0); start(); } });
    range.addEventListener('input', () => { userPaused = true; stop(); show(Number(range.value)); });
    watch(root, v => { if (v && !userPaused) start(); else if (!v) stop(); }, { threshold: 0.3 });
    show(reducedMotion.matches ? last : 0);
  }

  /* Method step 1: the calibrated clip, looping while it is on screen. */
  function bindAligned() {
    const node = document.querySelector('[data-calib-aligned]');
    if (!node) return;
    const sheet = MEDIA.calibration.sprites.aligned;
    sprite(node, 'assets/calibration/aligned.jpg', sheet);
    let k = reducedMotion.matches ? 8 : 0, timer = 0, playing = false, userPaused = reducedMotion.matches;
    const show = i => { k = i; frame(node, sheet, k); bar.refresh(); };
    const tick = () => { show((k + 1) % sheet.n); timer = setTimeout(tick, k === sheet.n - 1 ? 900 : 170); };
    const run = on => { clearTimeout(timer); playing = on; if (on) timer = setTimeout(tick, 170); bar.refresh(); };
    const bar = timebar({
      duration: () => sheet.n, time: () => k, playing: () => playing,
      toggle: () => { userPaused = playing; run(!playing); },
      seek: i => { userPaused = true; run(false); show(i); },
    }, { frames: sheet.n, label: 'Calibrated clip' });
    node.parentElement.after(bar.el);
    show(k);
    watch(node, v => run(v && !userPaused), { threshold: 0.3 });
  }

  /* Shared pieces for the diagrams */
  const box = (g, x, y, w, h, lines, cls = '') => {
    g.appendChild(el('rect', { x, y, width: w, height: h, rx: 8, class: `d-box ${cls}` }));
    lines.forEach((t, i) => g.appendChild(el('text', { x: x + w / 2, y: y + h / 2 + 4.5 + (i - (lines.length - 1) / 2) * 15, 'text-anchor': 'middle', class: i ? 'd-small' : 'd-text' }, t)));
  };
  const arrow = (g, x1, y1, x2, y2) => {
    g.appendChild(el('line', { x1, y1, x2, y2, class: 'd-arrow' }));
    const a = Math.atan2(y2 - y1, x2 - x1), s = 6;
    g.appendChild(el('path', { d: `M${x2},${y2} L${x2 - s * Math.cos(a - 0.45)},${y2 - s * Math.sin(a - 0.45)} L${x2 - s * Math.cos(a + 0.45)},${y2 - s * Math.sin(a + 0.45)} z`, class: 'd-head' }));
  };
  // A schematic token volume: five time slices of a small grid (the real grid is 5 x 15 x 27).
  const volume = (g, x0, y0, rows, cols, size, gap, onPick) => {
    const cells = [];
    for (let t = 0; t < 5; t++) {
      const ox = x0 + t * 16, oy = y0 + t * 13, front = t === 4;
      g.appendChild(el('rect', { x: ox - 3, y: oy - 3, width: cols * (size + gap) - gap + 6, height: rows * (size + gap) - gap + 6, rx: 3, class: 'd-slice' }));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cell = el('rect', { x: ox + c * (size + gap), y: oy + r * (size + gap), width: size, height: size, rx: 1.5, class: front ? 'd-token pick' : 'd-token' });
        if (front) {
          cell.addEventListener('click', () => onPick(cell));
          cell.addEventListener('pointerenter', () => { if (matchMedia('(hover: hover)').matches) onPick(cell); });
          cells.push(cell);
        }
        g.appendChild(cell);
      }
    }
    return cells;
  };
  const center = (node, dy = 0) => ({ x: +node.getAttribute('x') + +node.getAttribute('width') / 2, y: +node.getAttribute('y') + +node.getAttribute('height') / 2 + dy });
  // Cycle the highlighted token until the viewer picks one.
  const autoPick = (svg, cells, pick) => {
    let timer = 0, touched = false, visible = false;
    const order = [21, 10, 27, 4, 17];
    let i = 0;
    const run = () => {
      clearTimeout(timer);
      if (touched || reducedMotion.matches || !visible) return;
      pick(cells[order[i++ % order.length]], true);
      timer = setTimeout(run, 1600);
    };
    svg.addEventListener('pointerdown', () => { touched = true; });
    watch(svg, v => { visible = v; run(); }, { threshold: 0.3 });
  };

  /* Step 3: render tokens attend to the framewise action tokens. */
  function drawFuse(svg) {
    svg.setAttribute('viewBox', '0 0 560 380');
    const g = el('g'); svg.appendChild(g);
    // Renderings: three real frames of the UR5e clip's render (sprite cells), stacked.
    const sheet = MEDIA.motivation.sprites.render;
    g.appendChild(el('text', { x: 10, y: 20, class: 'd-label' }, 'Rendered robot'));
    [0, 8, 16].forEach((k, i) => {
      const col = k % sheet.cols, row = Math.floor(k / sheet.cols);
      const thumb = el('svg', { x: 10 + i * 11, y: 30 + i * 9, width: 76, height: 57, viewBox: `${col * 400} ${row * 300} 400 300` });
      thumb.appendChild(el('image', { href: 'assets/motivation/render.jpg', width: sheet.cols * 400, height: sheet.rows * 300 }));
      g.appendChild(thumb);
      g.appendChild(el('rect', { x: 10 + i * 11, y: 30 + i * 9, width: 76, height: 57, rx: 3, class: 'd-frame' }));
    });
    g.appendChild(el('text', { x: 10, y: 122, class: 'd-small' }, '17 frames'));
    box(g, 138, 30, 108, 34, ['Video VAE', 'frozen']);
    box(g, 138, 80, 108, 34, ['3D conv', '+ self-attention']);
    arrow(g, 110, 47, 134, 47); arrow(g, 192, 64, 192, 77); arrow(g, 246, 97, 270, 97);
    // Actions: the UR5e clip's 17 x 8 values, each row scaled to its own range.
    const state = MEDIA.motivation.state;
    g.appendChild(el('text', { x: 10, y: 240, class: 'd-label' }, 'Actions'));
    for (let d = 0; d < 8; d++) {
      const vals = state.map(s => s[d]), lo = Math.min(...vals), hi = Math.max(...vals);
      vals.forEach((v, t) => g.appendChild(el('rect', { x: 10 + t * 6, y: 250 + d * 9, width: 5, height: 8, rx: 1, class: 'd-cell', opacity: hi - lo < 1e-6 ? 0.12 : (0.18 + 0.8 * (v - lo) / (hi - lo)).toFixed(2) })));
    }
    g.appendChild(el('text', { x: 10, y: 342, class: 'd-small' }, '17 frames × 8 numbers'));
    box(g, 138, 270, 108, 34, ['MLP', 'per frame']);
    arrow(g, 114, 287, 134, 287);
    const acts = [];
    for (let t = 0; t < 17; t++) {
      const a = el('rect', { x: 272 + t * 11, y: 282, width: 9, height: 9, rx: 1.5, class: 'd-token act' });
      acts.push(a); g.appendChild(a);
    }
    arrow(g, 246, 287, 268, 287);
    g.appendChild(el('text', { x: 272, y: 312, class: 'd-small' }, '17 action tokens'));
    // Render tokens and the attention lines.
    const lines = el('g', { class: 'd-attn' });
    g.appendChild(lines);
    let picked = null;
    const pick = cell => {
      if (picked) picked.classList.remove('on');
      picked = cell; cell.classList.add('on');
      lines.replaceChildren();
      const q = center(cell);
      acts.forEach(a => { const k = center(a, -4.5); lines.appendChild(el('line', { x1: q.x, y1: q.y, x2: k.x, y2: k.y, class: 'd-flow' })); });
    };
    const cells = volume(g, 280, 30, 4, 8, 8, 3, pick);
    g.appendChild(el('text', { x: 280, y: 20, class: 'd-label' }, 'Render tokens'));
    g.appendChild(el('text', { x: 377, y: 20, class: 'd-small' }, '5 × 15 × 27 = 2,025'));
    g.appendChild(el('text', { x: 138, y: 186, class: 'd-label' }, 'Cross-attention'));
    g.appendChild(el('text', { x: 138, y: 202, class: 'd-small' }, 'queries: render tokens'));
    g.appendChild(el('text', { x: 138, y: 217, class: 'd-small' }, 'keys, values: action tokens'));
    // Output: one conditioning vector per token, on the same grid.
    arrow(g, 436, 72, 466, 72);
    for (let i = 0; i < 6; i++) g.appendChild(el('rect', { x: 474 + i * 12, y: 44, width: 8, height: 58, rx: 2, class: 'd-vec' }));
    g.appendChild(el('text', { x: 470, y: 122, class: 'd-label' }, 'Conditioning'));
    g.appendChild(el('text', { x: 470, y: 137, class: 'd-label' }, 'vectors'));
    g.appendChild(el('text', { x: 470, y: 152, class: 'd-small' }, '2,025 × 5,120'));
    pick(cells[21]);
    autoPick(svg, cells, pick);
  }

  /* Step 4: a video token's conditioning vector joins the timestep embedding and modulates every block. */
  function drawModulate(svg) {
    svg.setAttribute('viewBox', '0 0 560 380');
    const g = el('g'); svg.appendChild(g);
    const paths = el('g', { class: 'd-attn' });
    g.appendChild(paths);
    g.appendChild(el('text', { x: 10, y: 20, class: 'd-label' }, 'Video tokens'));
    g.appendChild(el('text', { x: 10, y: 166, class: 'd-small' }, '5 × 15 × 27, one vector each'));
    // Embeddings, sum, projection and the six modulation vectors.
    g.appendChild(el('text', { x: 180, y: 52, class: 'd-label' }, 'Conditioning vector'));
    g.appendChild(el('rect', { x: 180, y: 60, width: 118, height: 10, rx: 3, class: 'd-vec' }));
    g.appendChild(el('text', { x: 180, y: 108, class: 'd-label' }, 'Timestep embedding'));
    g.appendChild(el('rect', { x: 180, y: 116, width: 118, height: 10, rx: 3, class: 'd-emb' }));
    g.appendChild(el('circle', { cx: 340, cy: 93, r: 11, class: 'd-box' }));
    g.appendChild(el('text', { x: 340, y: 98, 'text-anchor': 'middle', class: 'd-text' }, '+'));
    arrow(g, 300, 65, 331, 86); arrow(g, 300, 121, 331, 100);
    box(g, 300, 150, 80, 40, ['time_proj', 'pretrained']);
    arrow(g, 340, 104, 340, 146);
    const mods = [['Attention', 214], ['Feed-forward', 286]];
    const bars = [];
    mods.forEach(([name, y0]) => {
      g.appendChild(el('text', { x: 300, y: y0, class: 'd-small' }, name));
      ['shift', 'scale', 'gate'].forEach((m, i) => {
        const y = y0 + 9 + i * 16;
        g.appendChild(el('rect', { x: 300, y, width: 46, height: 9, rx: 2, class: 'd-mod' }));
        g.appendChild(el('text', { x: 352, y: y + 8, class: 'd-small' }, m));
        bars.push({ x: 346, y: y + 4.5 });
      });
    });
    arrow(g, 340, 190, 340, 205);
    // 40 blocks, each receiving the same six vectors for this token.
    const blocks = [];
    for (let b = 0; b < 40; b++) {
      const y = 22 + b * 8.4;
      g.appendChild(el('rect', { x: 470, y, width: 80, height: 6, rx: 1.5, class: 'd-block' }));
      blocks.push(y + 3);
    }
    g.appendChild(el('text', { x: 550, y: 14, 'text-anchor': 'end', class: 'd-label' }, '40 transformer blocks'));
    g.appendChild(el('text', { x: 180, y: 86, class: 'd-small' }, 'per token, from step 3'));
    g.appendChild(el('text', { x: 180, y: 142, class: 'd-small' }, 'flow timestep, shared'));
    const fan = el('g', { class: 'd-fan' });
    g.appendChild(fan);
    blocks.forEach(y => fan.appendChild(el('path', { d: `M400,278 C432,278 438,${y} 468,${y}`, class: 'd-flow thin' })));
    g.appendChild(el('path', { d: 'M386,226 L400,226 L400,330 L386,330', class: 'd-brace' }));
    let picked = null;
    const pick = cell => {
      if (picked) picked.classList.remove('on');
      picked = cell; cell.classList.add('on');
      paths.replaceChildren();
      const q = center(cell);
      paths.appendChild(el('path', { d: `M${q.x},${q.y} C${q.x + 30},${q.y} 150,65 178,65`, class: 'd-flow' }));
    };
    const cells = volume(g, 10, 32, 5, 6, 9, 3, pick);
    pick(cells[14]);
    autoPick(svg, cells, pick);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindCalibration();
    bindAligned();
    const fuse = document.querySelector('[data-diagram="fuse"]');
    const mod = document.querySelector('[data-diagram="modulate"]');
    if (fuse) drawFuse(fuse);
    if (mod) drawModulate(mod);
  });
})();
