// The comparison studio: three synchronized 17-frame clips with frame stepping, a wipe view and a clip browser.
// Robot datasets: recording | action-only expert | Doppel (three-robot model), 8 fps.
// The five added datasets: recording | render given to the model | Doppel (eight-dataset model), 5 fps; they have no
// action-only baseline, so the middle panel shows the render and the wipe view is off.
(() => {
  const { reducedMotion, DATASETS, bindGroup, watch } = window.Doppel;
  const LAST = 16;
  const NEW = ['abc', 'trex', 'egoexo4d', 'gigahands', 'oakink2'];
  const KIND = { short: '3.2 s window', whole: 'whole episode, 17 frames spread across it' };
  // Bridge and RoboMIND footage is 4:3 that the evaluation stored stretched to 432 x 240; it is shown back at 4:3.
  const robotClips = window.DOPPEL_CLIPS.map(c => ({ ...c, fps: 8, aspect: c.dataset === 'droid' ? '16:9' : '4:3',
    src: { gt: `${c.dir}/gt.mp4`, action: `${c.dir}/action.mp4`, doppel: `${c.dir}/doppel.mp4` },
    poster: { gt: `${c.dir}/gt.jpg`, action: `${c.dir}/action.jpg`, doppel: `${c.dir}/doppel.jpg` }, thumb: `${c.dir}/doppel.jpg` }));
  const counts = {};
  const newClips = (window.DOPPEL_EMB8 ? window.DOPPEL_EMB8.clips : []).map(c => {
    counts[c.dataset] = (counts[c.dataset] || 0) + 1;
    return { dataset: c.dataset, split: 'test', n: counts[c.dataset], emb8: true, fps: 5, aspect: c.aspect,
      title: `Held-out test clip ${counts[c.dataset]}`, kind: c.kind,
      src: { gt: c.gt, action: c.render, doppel: c.pred }, poster: { gt: c.poster, action: c.poster, doppel: c.poster }, thumb: c.poster };
  });
  const ALL = robotClips.concat(newClips);
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
    const fps = () => (clip ? clip.fps : 8);

    const frameAt = t => Math.max(0, Math.min(LAST, Math.floor(t * fps() + 1e-3)));
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
    const seekFrame = k => { pause(); const t = (k + 0.5) / fps(); videos.forEach(v => { v.currentTime = t; }); showFrame(k); };
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
    const labels = MODELS.map(m => root.querySelector(`.panel.${m} .panel-label`));
    const modeGroup = root.querySelector('[data-studio-mode]');
    function load(next) {
      clip = next;
      pause();
      videos.forEach((v, i) => { v.poster = clip.poster[MODELS[i]]; v.src = clip.src[MODELS[i]]; });
      head.title.textContent = clip.title;
      const ds = DATASETS[clip.dataset];
      stage.dataset.aspect = clip.aspect;
      stage.classList.toggle('emb8', !!clip.emb8);
      labels[0].textContent = 'Ground truth';
      labels[1].textContent = clip.emb8 ? 'Render (input)' : 'Action-only expert';
      labels[2].textContent = 'Doppel';
      videos[1].setAttribute('aria-label', clip.emb8 ? 'The body rendered along the planned motion, given to the model' : 'Action-only expert prediction');
      if (clip.emb8 && stage.dataset.mode === 'wipe') { stage.dataset.mode = 'side'; modeGroup.setValue('side'); }
      modeGroup.hidden = !!clip.emb8;
      head.tag.textContent = clip.emb8 ? `${ds.name} · ${ds.robot} · ${ds.shift} · ${KIND[clip.kind]}`
        : `${ds.name} · ${ds.robot} · ${clip.split === 'ood' ? ds.shift : 'Unseen trajectory'}`;
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
    const splitGroup = document.querySelector('[data-browse-split]');
    let dataset = bindGroup(document.querySelector('[data-browse-dataset]'), 'dataset', v => { dataset = v; renderGrid(true); });
    let split = bindGroup(splitGroup, 'split', v => { split = v; renderGrid(true); });
    function renderGrid(loadFirst) {
      const isNew = NEW.includes(dataset);
      splitGroup.hidden = isNew;
      const clips = ALL.filter(c => c.dataset === dataset && (isNew || c.split === split));
      const ds = DATASETS[dataset];
      context.innerHTML = isNew
        ? `<b>${ds.name} · ${ds.shift}.</b> Held-out test clips of Doppel trained on all eight datasets. This dataset has no action-only baseline, so the middle panel shows the render the model is given. ${clips.length} examples.`
        : `<b>${ds.name} · ${split === 'ood' ? ds.shift : 'Unseen trajectories'}.</b> ${split === 'ood' ? CONTEXT.ood[dataset] : CONTEXT.val} ${clips.length} examples.`;
      grid.innerHTML = clips.map((c, i) => `
        <button class="clip" type="button" data-clip-id="${id(c)}" aria-current="false">
          <div class="thumb${c.aspect === '4:3' ? ' tall' : ''}"><img src="${c.thumb}" alt="" loading="lazy"><span>${String(i + 1).padStart(2, '0')}</span></div>
          <p>${c.emb8 ? KIND[c.kind].replace(/^./, m => m.toUpperCase()) : c.title}</p>
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
    load(ALL.find(c => id(c) === 'droid/ood/01') || ALL[0]);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
