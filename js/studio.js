// The comparison studio: three synchronized 17-frame clips with frame stepping, a wipe view and a clip browser.
(() => {
  const { reducedMotion, DATASETS, bindGroup, watch } = window.Doppel;
  const FPS = 8, LAST = 16;
  const MODELS = ['gt', 'action', 'doppel'];
  const CONTEXT = {
    ood: {
      droid: 'An entire lab is held out: no scene, camera, operator or task from it appears in training.',
      bridge: 'One complete toy-kitchen environment is held out from training.',
      robomind: 'Held-out object-centric tasks with object instances absent from training.',
    },
    val: 'Held-out demonstrations from environments that are represented in training.',
  };
  const id = c => `${c.dataset}/${c.split}/${String(c.n).padStart(2, '0')}`;

  function init() {
    const root = document.querySelector('[data-studio]');
    const stage = root.querySelector('.studio-stage');
    const videos = MODELS.map(m => root.querySelector(`.panel.${m} video`));
    const [leader] = videos;
    const playButton = root.querySelector('[data-play]');
    const scrub = root.querySelector('[data-scrub]');
    const count = root.querySelector('[data-count]');
    const speed = root.querySelector('[data-speed]');
    const ticks = root.querySelector('[data-ticks]');
    ticks.innerHTML = Array.from({ length: LAST + 1 }, () => '<span></span>').join('');
    const tickEls = [...ticks.children];
    let clip = null, playing = false, visible = false, userPaused = reducedMotion.matches, raf = 0, rate = 1;

    const frameAt = t => Math.max(0, Math.min(LAST, Math.floor(t * FPS + 1e-3)));
    const showFrame = k => {
      scrub.value = k;
      scrub.setAttribute('aria-valuetext', `Frame ${k} of ${LAST}`);
      count.textContent = `Frame ${String(k).padStart(2, '0')} / ${LAST}`;
      tickEls.forEach((t, i) => { t.classList.toggle('past', i < k); t.classList.toggle('now', i === k); });
    };
    const setPlaying = on => {
      playing = on;
      playButton.dataset.playing = String(on);
      const label = on ? 'Pause' : 'Play';
      playButton.setAttribute('aria-label', label);
      playButton.title = label;
    };
    // Looping only while playing: a paused seek into the last frame must not wrap to frame 0.
    const pause = () => { cancelAnimationFrame(raf); videos.forEach(v => { v.pause(); v.loop = false; }); setPlaying(false); };
    const seekFrame = k => { pause(); const t = (k + 0.5) / FPS; videos.forEach(v => { v.currentTime = t; }); showFrame(k); };
    const loop = () => {
      if (!playing) return;
      videos.slice(1).forEach(v => { if (!v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - leader.currentTime) > 0.06) v.currentTime = leader.currentTime; });
      showFrame(frameAt(leader.currentTime));
      raf = requestAnimationFrame(loop);
    };
    const play = async () => {
      if (leader.ended || frameAt(leader.currentTime) >= LAST) videos.forEach(v => { v.currentTime = 0; });
      setPlaying(true);
      videos.forEach(v => { v.playbackRate = rate; v.loop = true; });
      const results = await Promise.allSettled(videos.map(v => v.play()));
      if (results.some(r => r.status === 'rejected')) { pause(); return; }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };

    const head = {
      title: root.querySelector('[data-studio-title]'),
      tag: root.querySelector('[data-studio-tag]'),
      look: root.querySelector('[data-studio-look]'),
    };
    function load(next) {
      clip = next;
      pause();
      const dir = clip.dir;
      videos.forEach((v, i) => { v.poster = `${dir}/${MODELS[i]}.jpg`; v.src = `${dir}/${MODELS[i]}.mp4`; });
      head.title.textContent = clip.title;
      const ds = DATASETS[clip.dataset];
      head.tag.textContent = `${ds.name} · ${ds.robot} · ${clip.split === 'ood' ? ds.shift : 'Unseen trajectory'}`;
      head.look.textContent = '';
      showFrame(0);
      document.querySelectorAll('[data-clip-id]').forEach(b => b.setAttribute('aria-current', String(b.dataset.clipId === id(clip))));
      if (visible && !userPaused) play();
    }

    playButton.addEventListener('click', () => { if (playing) { userPaused = true; pause(); } else { userPaused = false; play(); } });
    root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
      userPaused = true;
      seekFrame(Math.max(0, Math.min(LAST, frameAt(leader.currentTime) + Number(b.dataset.step))));
    }));
    scrub.addEventListener('input', () => { userPaused = true; seekFrame(Number(scrub.value)); });
    speed.addEventListener('click', () => {
      rate = rate === 1 ? 0.5 : rate === 0.5 ? 0.25 : 1;
      speed.textContent = rate === 1 ? '1×' : rate === 0.5 ? '½×' : '¼×';
      speed.setAttribute('aria-label', `Playback speed ${speed.textContent}`);
      videos.forEach(v => { v.playbackRate = rate; });
    });
    leader.addEventListener('seeked', () => { if (!playing) showFrame(frameAt(leader.currentTime)); });
    videos.forEach(v => v.addEventListener('click', () => playButton.click()));
    root.addEventListener('keydown', event => {
      if (event.target.closest('input, [role="tab"]')) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        root.querySelector(`[data-step="${event.key === 'ArrowRight' ? 1 : -1}"]`).click();
      }
    });

    // View mode and the wipe divider.
    bindGroup(root.querySelector('[data-studio-mode]'), 'mode', mode => { stage.dataset.mode = mode; });
    const handle = root.querySelector('[data-wipe]');
    let dragging = false;
    const move = e => { const b = handle.getBoundingClientRect(); stage.style.setProperty('--wipe', `${Math.max(0, Math.min(100, (e.clientX - b.left) / b.width * 100))}%`); };
    handle.addEventListener('pointerdown', e => { dragging = true; handle.setPointerCapture(e.pointerId); move(e); });
    handle.addEventListener('pointermove', e => { if (dragging) move(e); });
    ['pointerup', 'pointercancel'].forEach(t => handle.addEventListener(t, () => { dragging = false; }));

    watch(root, v => {
      visible = v;
      if (v && !userPaused && clip) play(); else if (!v) pause();
    }, { threshold: 0.35 });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

    // Clip browser.
    const grid = document.querySelector('[data-clips]');
    const context = document.querySelector('[data-browse-context]');
    let dataset = bindGroup(document.querySelector('[data-browse-dataset]'), 'dataset', v => { dataset = v; renderGrid(true); });
    let split = bindGroup(document.querySelector('[data-browse-split]'), 'split', v => { split = v; renderGrid(true); });
    function renderGrid(loadFirst) {
      const clips = window.DOPPEL_CLIPS.filter(c => c.dataset === dataset && c.split === split);
      const ds = DATASETS[dataset];
      context.innerHTML = `<b>${ds.name} · ${split === 'ood' ? ds.shift : 'Unseen trajectories'}.</b> ${split === 'ood' ? CONTEXT.ood[dataset] : CONTEXT.val} ${clips.length} examples.`;
      grid.innerHTML = clips.map((c, i) => `
        <button class="clip" type="button" data-clip-id="${id(c)}" aria-current="false">
          <div class="thumb"><img src="${c.dir}/doppel.jpg" alt="" loading="lazy"><span>${String(i + 1).padStart(2, '0')}</span></div>
          <p>${c.title}</p>
        </button>`).join('');
      grid.querySelectorAll('[data-clip-id]').forEach((b, i) => b.addEventListener('click', () => {
        userPaused = false;
        load(clips[i]);
        if (root.getBoundingClientRect().top < 0) root.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      }));
      if (loadFirst) load(clips[0]);
      else if (clip) grid.querySelectorAll('[data-clip-id]').forEach(b => b.setAttribute('aria-current', String(b.dataset.clipId === id(clip))));
    }
    renderGrid(false);
    load(window.DOPPEL_CLIPS.find(c => id(c) === 'robomind/ood/02') || window.DOPPEL_CLIPS[0]);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
