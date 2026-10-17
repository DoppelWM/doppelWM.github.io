// Navigation, header state and shared helpers.
window.Doppel = (() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const DATASETS = {
    droid: { name: 'DROID', robot: 'Franka', shift: 'A new lab' },
    bridge: { name: 'Bridge', robot: 'WidowX', shift: 'A new kitchen' },
    robomind: { name: 'RoboMIND', robot: 'UR5e', shift: 'New objects' },
  };
  const METHODS = {
    action: { label: 'Action-only expert', short: 'Action-only', color: 'var(--action)', ink: 'var(--action-ink)' },
    oscar: { label: 'OSCAR (fine-tuned)', short: 'OSCAR', color: 'var(--oscar)' },
    doppel_single: { label: 'Doppel (single)', short: 'Doppel (single)', color: 'var(--single)' },
    doppel: { label: 'Doppel (multi)', short: 'Doppel (multi)', color: 'var(--doppel)' },
  };
  const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

  // One pressed button per group (aria-pressed or aria-selected). Returns the initial value and a setter.
  function bindGroup(group, attribute, onChange) {
    const buttons = [...group.querySelectorAll(`[data-${attribute}]`)];
    const state = buttons[0].hasAttribute('aria-selected') ? 'aria-selected' : 'aria-pressed';
    const value = b => b.dataset[camel(attribute)];
    const mark = button => buttons.forEach(other => other.setAttribute(state, String(other === button)));
    const select = button => { mark(button); onChange(value(button)); };
    buttons.forEach((button, i) => {
      button.addEventListener('click', () => select(button));
      if (state === 'aria-selected') button.addEventListener('keydown', event => {
        const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        if (!(event.key in keys)) return;
        event.preventDefault();
        const visible = buttons.filter(b => !b.hidden);
        const next = visible[(visible.indexOf(button) + keys[event.key] + visible.length) % visible.length];
        next.focus();
        select(next);
      });
    });
    const current = buttons.find(b => b.getAttribute(state) === 'true') || buttons[0];
    group.setValue = v => { const b = buttons.find(x => value(x) === v); if (b) mark(b); };
    return value(current);
  }

  // Call back when an element enters or leaves the viewport.
  function watch(el, onChange, options = { threshold: 0.25 }) {
    if (!('IntersectionObserver' in window)) { onChange(true); return; }
    new IntersectionObserver(entries => entries.forEach(e => onChange(e.isIntersecting)), options).observe(el);
  }

  // Playback bar under a video or a frame sequence: play/pause, a position slider and a readout.
  // `media` supplies duration(), time(), playing(), toggle() and seek(t); with `frames` the slider steps whole frames.
  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M6.5 5h4v14h-4zm7 0h4v14h-4z"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="stroke" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  };
  const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function timebar(media, { frames = 0, fullscreen = null, label = 'Video' } = {}) {
    const bar = document.createElement('div');
    bar.className = 'timebar';
    bar.innerHTML = `<button type="button" class="tb-play"></button><input type="range" class="tb-range" min="0" value="0" step="${frames ? 1 : 0.01}" aria-label="${label} position"><span class="tb-time" aria-hidden="true"></span>${fullscreen ? `<button type="button" class="tb-full" aria-label="Full screen" title="Full screen">${ICON.full}</button>` : ''}`;
    const [button, range, readout] = bar.children;
    let dragging = false, raf = 0;
    const refresh = () => {
      const on = media.playing(), d = media.duration() || 0;
      button.innerHTML = on ? ICON.pause : ICON.play;
      button.setAttribute('aria-label', on ? 'Pause' : 'Play');
      button.title = on ? 'Pause' : 'Play';
      const max = frames ? frames - 1 : d || 1, t = dragging ? Number(range.value) : Math.min(media.time(), max);
      range.max = max;
      if (!dragging) range.value = t;
      readout.textContent = frames ? `Frame ${Math.round(t)} / ${frames - 1}` : `${clock(t)} / ${d ? clock(d) : '–:––'}`;
      range.setAttribute('aria-valuetext', readout.textContent);
      range.style.setProperty('--p', `${(t / max) * 100}%`);
    };
    const loop = () => { refresh(); raf = media.playing() ? requestAnimationFrame(loop) : 0; };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    button.addEventListener('click', () => { media.toggle(); kick(); refresh(); });
    range.addEventListener('pointerdown', () => { dragging = true; });
    ['pointerup', 'pointercancel', 'change'].forEach(t => range.addEventListener(t, () => { dragging = false; refresh(); }));
    range.addEventListener('input', () => { media.seek(Number(range.value)); refresh(); });
    if (fullscreen) bar.querySelector('.tb-full').addEventListener('click', fullscreen);
    refresh();
    return { el: bar, refresh, kick };
  }
  // The same bar wired to a <video>; `toggle` and `seek` may be overridden (lazy loading, sticky pauses).
  function videoBar(video, options = {}, overrides = {}) {
    const frames = options.frames || 0;
    const fps = () => frames / (video.duration || 1);
    const seekTo = t => {
      const to = frames ? (t + 0.5) / fps() : t;
      if (video.readyState >= 1) video.currentTime = to;
      else video.addEventListener('loadedmetadata', () => { video.currentTime = frames ? (t + 0.5) / fps() : t; }, { once: true });
    };
    const bar = timebar({
      duration: () => video.duration,
      time: () => frames ? Math.min(frames - 1, Math.floor(video.currentTime * fps())) : video.currentTime,
      playing: () => !video.paused,
      toggle: overrides.toggle || (() => (video.paused ? video.play().catch(() => {}) : video.pause())),
      seek: overrides.seek ? t => overrides.seek(t, seekTo) : seekTo,
    }, options);
    ['play', 'pause', 'seeked', 'loadedmetadata', 'durationchange', 'timeupdate'].forEach(t => video.addEventListener(t, () => { bar.refresh(); if (t === 'play') bar.kick(); }));
    return bar;
  }

  function bindNavigation() {
    const header = document.querySelector('.site-header');
    const menu = document.querySelector('.menu-toggle');
    const nav = document.getElementById('site-nav');
    const links = [...nav.querySelectorAll('a')];
    const sections = links.map(link => document.querySelector(link.hash)).filter(Boolean);
    const close = () => { menu.setAttribute('aria-expanded', 'false'); nav.classList.remove('open'); };
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('open', open);
    });
    links.forEach(link => link.addEventListener('click', close));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    let queued = false;
    const update = () => {
      queued = false;
      header.classList.toggle('scrolled', scrollY > 8);
      const y = scrollY + 140;
      let current = null;
      sections.forEach(section => { if (section.offsetTop <= y) current = section.id; });
      // At the very bottom the last section (Citation) is too short to reach the threshold.
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4 && sections.length) current = sections.at(-1).id;
      links.forEach(link => {
        const active = link.hash === `#${current}`;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
      });
    };
    const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule, { passive: true });
    update();
  }

  document.addEventListener('DOMContentLoaded', bindNavigation);
  return { reducedMotion, DATASETS, METHODS, bindGroup, watch, timebar, videoBar };
})();
