// Camera extrinsics: the calibration-loop diagram and the gallery of all 105 recovered camera poses.
(() => {
  const { reducedMotion, bindGroup, watch, videoBar } = window.Doppel;
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, text) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text != null) node.textContent = text;
    return node;
  };
  const arrow = (g, x1, y1, x2, y2, cls = '') => {
    g.appendChild(el('line', { x1, y1, x2, y2, class: `d-arrow ${cls}` }));
    const a = Math.atan2(y2 - y1, x2 - x1), s = 6;
    g.appendChild(el('path', { d: `M${x2},${y2} L${x2 - s * Math.cos(a - 0.45)},${y2 - s * Math.sin(a - 0.45)} L${x2 - s * Math.cos(a + 0.45)},${y2 - s * Math.sin(a + 0.45)} z`, class: 'd-head' }));
  };

  /* The calibration loop. A pulse runs pose -> render -> compare -> update -> pose; each lap shows the next
     traced step of the real WidowX run in the middle. Click a box for what it does. */
  const EXPLAIN = {
    joints: '<b>Logged joint angles.</b> The joint positions recorded with the video pose the robot model frame by frame, by forward kinematics.',
    intr: '<b>Camera intrinsics.</b> The RealSense D435i values for RoboMIND and MoGe-estimated focal lengths for Bridge. Only the extrinsics are optimised.',
    init: '<b>Initial guesses.</b> Several starting poses are optimised in parallel: the dataset\'s own pose when one is provided, otherwise a coarse search over viewpoints.',
    pose: '<b>Camera pose.</b> A 6-DoF camera-to-robot transform. It is the only thing being optimised.',
    render: '<b>Render the robot.</b> The robot\'s articulated 3D Gaussian model (Dr. Robot) is posed at the logged joint angles and rendered from the current camera, together with the 2D motion of its Gaussians between frames. The model itself stays frozen.',
    video: '<b>Recorded video.</b> The session\'s footage: what the rendering has to line up with.',
    compare: '<b>Compare with the video.</b> The rendering is scored against the recording on colour (RGB), motion (optical flow from RAFT) and DINOv2 features.',
    update: '<b>Update the camera.</b> The renderer is differentiable, so the alignment loss has a gradient with respect to the camera pose. Adam takes a step and the loop repeats.',
    out: '<b>Best pose.</b> Of the parallel runs, the pose with the lowest alignment loss is kept, and reused for every demonstration recorded in that session.',
  };
  function drawLoop(svg) {
    const C = window.DOPPEL_MEDIA.calibration;
    const caption = document.querySelector('[data-xt-explain]');
    svg.setAttribute('viewBox', '0 0 780 316');
    const g = el('g'); svg.appendChild(g);
    const nodes = {};
    const node = (key, x, y, w, h, title, sub) => {
      const n = el('g', { class: 'x-node', tabindex: 0, role: 'button', 'aria-label': title });
      n.appendChild(el('rect', { x, y, width: w, height: h, rx: 9, class: 'd-box' }));
      n.appendChild(el('text', { x: x + w / 2, y: y + h / 2 - 2, 'text-anchor': 'middle', class: 'd-text' }, title));
      n.appendChild(el('text', { x: x + w / 2, y: y + h / 2 + 14, 'text-anchor': 'middle', class: 'd-small' }, sub));
      nodes[key] = n;
      return n;
    };
    // Edges first, so the pulse and the boxes sit on top of them.
    const edges = el('g'); g.appendChild(edges);
    arrow(edges, 150, 51, 186, 51);
    arrow(edges, 150, 121, 186, 74);
    arrow(edges, 150, 261, 186, 261);
    arrow(edges, 350, 58, 466, 58);
    arrow(edges, 550, 86, 550, 226);
    arrow(edges, 470, 258, 354, 258);
    arrow(edges, 270, 230, 270, 90);
    arrow(edges, 662, 58, 634, 58);
    arrow(edges, 630, 258, 658, 258, 'x-dash');
    edges.appendChild(el('text', { x: 408, y: 50, 'text-anchor': 'middle', class: 'd-small' }, 'image + 2D motion'));
    edges.appendChild(el('text', { x: 558, y: 160, class: 'd-small' }, 'alignment'));
    edges.appendChild(el('text', { x: 558, y: 175, class: 'd-small' }, 'loss'));
    edges.appendChild(el('text', { x: 412, y: 276, 'text-anchor': 'middle', class: 'd-small' }, 'new pose'));
    edges.appendChild(el('text', { x: 716, y: 306, 'text-anchor': 'middle', class: 'd-small' }, 'after the last step'));
    // The real run in the middle of the loop.
    const sheet = C.sprites.steps;
    const thumb = el('svg', { x: 354, y: 104, width: 112, height: 84, viewBox: '0 0 400 300' });
    thumb.appendChild(el('image', { href: 'assets/calibration/steps.jpg', width: sheet.cols * 400, height: sheet.rows * 300 }));
    g.appendChild(thumb);
    g.appendChild(el('rect', { x: 354, y: 104, width: 112, height: 84, rx: 4, class: 'd-frame' }));
    const counter = el('text', { x: 410, y: 206, 'text-anchor': 'middle', class: 'd-text' });
    g.appendChild(counter);
    g.appendChild(el('text', { x: 410, y: 221, 'text-anchor': 'middle', class: 'd-small' }, 'one real run, WidowX'));
    const showStep = i => {
      const col = i % sheet.cols, row = Math.floor(i / sheet.cols);
      thumb.setAttribute('viewBox', `${col * 400} ${row * 300} 400 300`);
      counter.textContent = i ? `Adam step ${C.steps[i]} / ${C.n_steps}` : 'Initial guess';
    };
    const pulse = el('circle', { r: 5, class: 'x-pulse' });
    g.appendChild(pulse);
    node('joints', 10, 26, 140, 50, 'Logged joint angles', 'from the recording');
    node('intr', 10, 96, 140, 50, 'Camera intrinsics', 'held fixed');
    node('init', 10, 236, 140, 50, 'Initial guesses', 'run in parallel');
    node('render', 190, 30, 160, 56, 'Render the robot', 'Gaussian model, frozen');
    node('compare', 470, 30, 160, 56, 'Compare with the video', 'RGB, flow, DINOv2');
    node('update', 470, 230, 160, 56, 'Update the camera', 'gradient step, Adam');
    node('pose', 190, 230, 160, 56, 'Camera pose', '6-DoF');
    node('video', 666, 30, 106, 56, 'Recorded video', 'the target');
    node('out', 662, 230, 110, 56, 'Best pose', 'one per session');
    Object.values(nodes).forEach(n => g.appendChild(n));

    let pinned = null, active = null;
    const light = key => {
      Object.entries(nodes).forEach(([k, n]) => n.classList.toggle('on', k === key));
      caption.innerHTML = EXPLAIN[key];
    };
    const setActive = key => { active = key; if (!pinned) light(key); };
    Object.entries(nodes).forEach(([key, n]) => {
      const choose = () => { pinned = pinned === key ? null : key; light(pinned || active || key); };
      n.addEventListener('click', choose);
      n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
    });

    // One lap: pose -> render -> compare -> update -> pose; corners are the box centres.
    const lap = [['pose', 270, 258], ['render', 270, 58], ['compare', 550, 58], ['update', 550, 258], ['pose', 270, 258]];
    const LAP = 2400, HOLD = 2600, last = C.steps.length - 1;
    let step = 0, t0 = 0, raf = 0, visible = false;
    const frameAt = now => {
      const t = now - t0, laps = Math.floor(t / LAP);
      if (laps > last) {                                   // converged: show the kept pose, then start over
        if (t > (last + 1) * LAP + HOLD) { t0 = now; step = 0; showStep(0); }
        else { pulse.setAttribute('cx', 716); pulse.setAttribute('cy', 258); if (active !== 'out') setActive('out'); }
        raf = requestAnimationFrame(frameAt); return;
      }
      if (laps !== step) { step = laps; showStep(step); }
      const f = (t % LAP) / LAP * 4, seg = Math.min(3, Math.floor(f)), u = f - seg;
      const [, x0, y0] = lap[seg], [key1, x1, y1] = lap[seg + 1];
      pulse.setAttribute('cx', x0 + (x1 - x0) * u);
      pulse.setAttribute('cy', y0 + (y1 - y0) * u);
      const key = u > 0.5 ? key1 : lap[seg][0];
      if (key !== active) setActive(key);
      raf = requestAnimationFrame(frameAt);
    };
    const run = () => {
      cancelAnimationFrame(raf);
      if (!visible || reducedMotion.matches) return;
      t0 = performance.now() - step * LAP;
      raf = requestAnimationFrame(frameAt);
    };
    showStep(reducedMotion.matches ? last : 0);
    pulse.setAttribute('cx', 270); pulse.setAttribute('cy', 258);
    setActive(reducedMotion.matches ? 'out' : 'pose');
    watch(svg, v => { visible = v; run(); }, { threshold: 0.3 });
  }

  /* All recovered poses: one 17-frame video holds every tile twice (top half with the rendering, bottom half
     without); two canvases draw the UR5e and WidowX blocks from it, and a third enlarges the chosen tile. */
  function bindGallery() {
    const root = document.querySelector('[data-xt-gallery]');
    if (!root) return;
    const X = window.DOPPEL_EXTRINSICS;
    const [TW, TH] = X.tile, ROWS = X.grid[1], HALF = ROWS * TH;
    const video = root.querySelector('[data-xt-video]');
    const blocks = [...root.querySelectorAll('[data-block]')].map(node => {
      const ds = node.dataset.block, [c0, bw] = X.blocks[ds], count = X.counts[ds];
      const canvas = node.querySelector('canvas');
      canvas.style.aspectRatio = `${bw * TW} / ${HALF}`;
      node.querySelector('[data-xt-label]').innerHTML = `${count.robot}<span>${count.poses} sessions · ${count.demos.toLocaleString('en-US')} demos</span>`;
      return { ds, c0, bw, canvas, tiles: X.tiles.filter(t => t.ds === ds) };
    });
    const zoom = root.querySelector('[data-xt-zoom]');
    const zoomCanvas = zoom.querySelector('canvas');
    const range = zoom.querySelector('[data-split]');
    const which = root.querySelector('[data-xt-which]');
    const GAP = 2;
    let mode = 'over', split = 50, visible = false, loaded = false;
    let sel = X.tiles[X.featured];

    const fit = canvas => {
      const d = window.devicePixelRatio || 1, w = Math.round(canvas.clientWidth * d), h = Math.round(canvas.clientHeight * d);
      if (w && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
      return d;
    };
    const geometry = b => {
      const W = b.canvas.width, H = b.canvas.height, g = GAP * (window.devicePixelRatio || 1);
      return { g, tw: (W - (b.bw - 1) * g) / b.bw, th: (H - (ROWS - 1) * g) / ROWS };
    };
    const ready = () => video.readyState >= 2;
    const drawBlock = b => {
      const d = fit(b.canvas), ctx = b.canvas.getContext('2d');
      ctx.clearRect(0, 0, b.canvas.width, b.canvas.height);
      if (!ready()) return;
      const { g, tw, th } = geometry(b), sy0 = mode === 'over' ? 0 : HALF;
      b.tiles.forEach(t => {
        const dx = (t.col - b.c0) * (tw + g), dy = t.row * (th + g);
        ctx.drawImage(video, t.col * TW, sy0 + t.row * TH, TW, TH, dx, dy, tw, th);
        if (t === sel) {
          ctx.strokeStyle = '#f4f5f2'; ctx.lineWidth = 2 * d;
          ctx.strokeRect(dx + d, dy + d, tw - 2 * d, th - 2 * d);
        }
      });
    };
    const drawZoom = () => {
      fit(zoomCanvas);
      const ctx = zoomCanvas.getContext('2d'), W = zoomCanvas.width, H = zoomCanvas.height;
      ctx.clearRect(0, 0, W, H);
      if (!ready()) return;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, sel.col * TW, sel.row * TH, TW, TH, 0, 0, W, H);
      ctx.save(); ctx.beginPath(); ctx.rect(W * split / 100, 0, W, H); ctx.clip();
      ctx.drawImage(video, sel.col * TW, HALF + sel.row * TH, TW, TH, 0, 0, W, H);
      ctx.restore();
    };
    const draw = () => { blocks.forEach(drawBlock); drawZoom(); };
    const describe = () => {
      which.textContent = `${sel.robot}, session ${sel.i} of ${sel.n}: ${sel.demos.toLocaleString('en-US')} demonstration${sel.demos === 1 ? '' : 's'} recorded with this camera pose`;
    };

    // Pick a tile.
    blocks.forEach(b => b.canvas.addEventListener('click', e => {
      const r = b.canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      const { g, tw, th } = geometry(b);
      const col = Math.min(b.bw - 1, Math.floor((e.clientX - r.left) * d / (tw + g)));
      const row = Math.min(ROWS - 1, Math.floor((e.clientY - r.top) * d / (th + g)));
      const t = b.tiles.find(x => x.col - b.c0 === col && x.row === row);
      if (t) { sel = t; describe(); draw(); }
    }));
    bindGroup(root.querySelector('[data-xt-mode]'), 'mode', m => { mode = m; draw(); });

    // Divider on the enlarged view.
    const setSplit = v => {
      split = Math.max(0, Math.min(100, v));
      zoom.style.setProperty('--split', `${split}%`);
      range.value = Math.round(split);
      range.setAttribute('aria-valuetext', `${Math.round(split)}% rendering`);
      drawZoom();
    };
    let dragging = false;
    const move = e => { const b = zoom.getBoundingClientRect(); setSplit((e.clientX - b.left) / b.width * 100); };
    zoom.addEventListener('pointerdown', e => { dragging = true; zoom.setPointerCapture(e.pointerId); move(e); });
    zoom.addEventListener('pointermove', e => { if (dragging) move(e); });
    ['pointerup', 'pointercancel'].forEach(t => zoom.addEventListener(t, () => { dragging = false; }));
    range.addEventListener('input', () => setSplit(Number(range.value)));

    // Redraw on every new video frame while playing; once when paused, seeked or resized.
    const loop = () => {
      if (video.paused) return;
      draw();
      if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(loop);
      else requestAnimationFrame(loop);
    };
    video.addEventListener('loadeddata', draw);
    video.addEventListener('seeked', draw);
    video.addEventListener('play', loop);
    if ('ResizeObserver' in window) new ResizeObserver(draw).observe(root);
    const load = () => {
      if (loaded) return;
      loaded = true;
      video.src = video.dataset.src;
      video.load();
    };
    let userPaused = false;
    const sync = () => {
      if (visible && !reducedMotion.matches && !userPaused) video.play().catch(() => {});
      else video.pause();
    };
    // Play/pause and a frame slider for all tiles at once (they are one video).
    const timeline = videoBar(video, { frames: 17, label: 'Gallery' }, {
      toggle: () => { load(); if (video.paused) { userPaused = false; video.play().catch(() => {}); } else { userPaused = true; video.pause(); } },
      seek: (t, seekTo) => { load(); userPaused = true; video.pause(); seekTo(t); },
    });
    root.querySelector('.xt-blocks').after(timeline.el);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { if (e.isIntersecting) load(); }, { rootMargin: '400px 0px' }).observe(root);
    } else load();
    watch(root, v => { visible = v; if (v) load(); sync(); }, { threshold: 0.15 });
    reducedMotion.addEventListener?.('change', sync);
    describe();
    setSplit(50);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const svg = document.querySelector('[data-diagram="extrinsics"]');
    if (svg) drawLoop(svg);
    bindGallery();
  });
})();
