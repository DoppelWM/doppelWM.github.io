// Footage: the film backdrop, the hero film and claim clips, the render/recording divider (method step 2), robot cards,
// the method-step panes and BibTeX copy.
(() => {
  const { reducedMotion, DATASETS, bindGroup, watch, videoBar } = window.Doppel;
  const small = matchMedia('(max-width: 650px)');
  const tryPlay = v => v.play().catch(() => {});

  /* Data: drag between the rendered robot and the recording. */
  function bindDouble() {
    const root = document.querySelector('[data-double]');
    const stage = root.querySelector('[data-stage]');
    const real = stage.querySelector('.layer-real');
    const render = stage.querySelector('.layer-render');
    const range = stage.querySelector('[data-split]');
    let visible = false, touched = false, userPaused = false;
    const setSplit = v => {
      const x = Math.max(0, Math.min(100, v));
      stage.style.setProperty('--split', `${x}%`);
      range.value = Math.round(x);
      range.setAttribute('aria-valuetext', `${Math.round(x)}% rendered`);
    };
    const select = robot => {
      stage.dataset.view = robot; // DROID footage is 16:9, Bridge and RoboMIND 4:3; the stage follows it
      real.poster = `assets/images/${robot}-ood-ground-truth.jpg`;
      render.poster = `assets/images/${robot}-ood-render-display.jpg`;
      real.src = `assets/videos/${robot}-ood-ground-truth.mp4`;
      render.src = `assets/videos/${robot}-ood-render-display.mp4`;
      if (visible && !reducedMotion.matches && !userPaused) tryPlay(real);
    };
    select(bindGroup(root.querySelector('[role="tablist"]'), 'robot', select));
    real.addEventListener('timeupdate', () => { if (Math.abs(render.currentTime - real.currentTime) > 0.08) render.currentTime = real.currentTime; });
    real.addEventListener('seeking', () => { render.currentTime = real.currentTime; });
    real.addEventListener('play', () => tryPlay(render));
    real.addEventListener('pause', () => render.pause());
    let dragging = false;
    const move = e => { const b = stage.getBoundingClientRect(); setSplit((e.clientX - b.left) / b.width * 100); };
    stage.addEventListener('pointerdown', e => { touched = true; dragging = true; stage.setPointerCapture(e.pointerId); move(e); });
    stage.addEventListener('pointermove', e => { if (dragging) move(e); });
    ['pointerup', 'pointercancel'].forEach(t => stage.addEventListener(t, () => { dragging = false; }));
    range.addEventListener('input', () => { touched = true; setSplit(Number(range.value)); });
    // One gentle sweep the first time the stage is seen, as a hint that it can be dragged.
    const sweep = () => {
      if (reducedMotion.matches) return;
      const start = performance.now(), keys = [50, 18, 82, 50];
      const step = now => {
        if (touched) return;
        const p = Math.min(1, (now - start) / 2600), seg = Math.min(2, Math.floor(p * 3)), f = p * 3 - seg;
        const ease = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
        setSplit(keys[seg] + (keys[seg + 1] - keys[seg]) * ease);
        if (p < 1) requestAnimationFrame(step);
      };
      setTimeout(() => requestAnimationFrame(step), 700);
    };
    let swept = false;
    watch(stage, v => {
      visible = v;
      if (v && !reducedMotion.matches && !userPaused) tryPlay(real); else if (!v) real.pause();
      if (v && !swept) { swept = true; sweep(); }
    });
    const timeline = videoBar(real, { label: 'Rendering and recording' }, {
      toggle: () => { if (real.paused) { userPaused = false; tryPlay(real); } else { userPaused = true; real.pause(); } },
    });
    stage.after(timeline.el);
    setSplit(50);
  }

  /* The film's blurred video wall, fixed behind the page. Reduced motion keeps the still poster. */
  function bindBackdrop() {
    const video = document.querySelector('.backdrop video');
    if (!video) return;
    const apply = () => {
      if (reducedMotion.matches || document.hidden) { video.pause(); return; }
      if (!video.getAttribute('src')) video.src = video.dataset.src;
      tryPlay(video);
    };
    apply();
    if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', apply);
    document.addEventListener('visibilitychange', apply);
  }

  /* Films and claim clips: muted loops that play while on screen, with play/pause and full-screen buttons.
     A pause by the viewer sticks; reduced motion starts paused on the poster. */
  function bindFilms() {
    document.querySelectorAll('[data-autoplay-film]').forEach(fig => {
      const video = fig.querySelector('video');
      let loaded = false, userPaused = reducedMotion.matches;
      const load = () => { if (!loaded) { loaded = true; video.src = small.matches && video.dataset.srcSmall ? video.dataset.srcSmall : video.dataset.src; } };
      const flip = () => {
        if (document.fullscreenElement === video) return; // full screen has the native controls, which handle clicks
        load();
        if (video.paused) { userPaused = false; tryPlay(video); } else { userPaused = true; video.pause(); }
      };
      video.addEventListener('click', flip);
      // Play/pause, a time slider and full screen under the footage. Dragging the slider loads the clip if needed.
      const canFull = video.requestFullscreen || video.webkitEnterFullscreen;
      const timeline = videoBar(video, {
        label: video.getAttribute('aria-label')?.split(':')[0] || 'Video',
        fullscreen: canFull ? () => {
          load();
          if (video.requestFullscreen) video.requestFullscreen().catch(() => {});
          else video.webkitEnterFullscreen();
        } : null,
      }, { toggle: flip, seek: (t, seekTo) => { load(); seekTo(t); } });
      video.closest('.film-frame').after(timeline.el);
      // Native controls only while full screen, so the viewer can scrub and leave.
      video.addEventListener('fullscreenchange', () => { video.controls = document.fullscreenElement === video; });
      watch(video, v => {
        if (v) { load(); if (!userPaused) tryPlay(video); } else video.pause();
      }, { threshold: 0.35 });
    });
  }

  /* Robot cards */
  function renderRobots() {
    const host = document.querySelector('[data-robots]');
    const n = v => v.toLocaleString('en-US');
    host.innerHTML = window.DOPPEL_DATA.corpus.map(row => `
      <article class="card robot" tabindex="0" aria-label="${DATASETS[row.dataset].name}: ${row.robot}">
        <div class="thumb"><img src="assets/images/${row.dataset}-ood-ground-truth.jpg" alt="" loading="lazy"><img class="render" src="assets/images/${row.dataset}-ood-render-display.jpg" alt="" loading="lazy"><span>Hover for the render</span></div>
        <div class="body">
          <p class="ds">${DATASETS[row.dataset].name}</p>
          <h3>${row.robot}</h3>
          <dl>
            <div><dt>Training episodes</dt><dd>${n(row.episodes)}</dd></div>
            <div><dt>Training clips</dt><dd>${n(row.clips)}</dd></div>
            <div><dt>Arm</dt><dd>${row.dof}</dd></div>
            <div><dt>Eval clips</dt><dd>${row.val} + ${row.test}</dd></div>
            <div class="full"><dt>Out-of-distribution test</dt><dd>${row.shift}</dd></div>
          </dl>
        </div>
      </article>`).join('');
  }

  /* Method steps: each step shows its own pane (recovered-camera clip, render divider, two diagrams) beside the list. */
  const CAPTION = {
    calibrate: 'A WidowX clip with the robot rendered in blue from its recovered camera. How the poses are recovered, and all 105 of them, are in Camera extrinsics above.',
    render: 'Drag across the frame: the robot rendered from the recovered camera (left of the divider) and the recording (right), on held-out clips.',
    fuse: 'Render tokens (top) attend to the 17 framewise action tokens (bottom); the action grid shows the UR5e clip from above. Click a render token.',
    modulate: "One video token's path: its conditioning vector plus the timestep embedding gives that token's shift, scale and gate in every block. Click a token.",
  };
  function bindMethod() {
    const fig = document.querySelector('[data-step-media]');
    const panes = [...fig.querySelectorAll('[data-pane]')];
    const caption = fig.querySelector('[data-media-caption]');
    bindGroup(document.querySelector('.steps'), 'step-id', key => {
      panes.forEach(p => { p.hidden = p.dataset.pane !== key; });
      caption.textContent = CAPTION[key];
      fig.dispatchEvent(new CustomEvent('pane', { detail: key }));
    });
    caption.textContent = CAPTION.calibrate;
  }

  function bindCopy() {
    const button = document.querySelector('[data-copy]');
    const text = document.querySelector('[data-bibtex]').textContent;
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); button.textContent = 'Copied'; }
      catch {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector('[data-bibtex]'));
        getSelection().removeAllRanges(); getSelection().addRange(range);
        button.textContent = 'Selected, press Ctrl+C';
      }
      setTimeout(() => { button.textContent = 'Copy'; }, 1800);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindBackdrop();
    bindDouble();
    bindFilms();
    renderRobots();
    bindMethod();
    bindCopy();
  });
})();
