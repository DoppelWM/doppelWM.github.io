// Long horizon: chained rollouts of the eight-dataset model.
// The player shows the recording, the render given to the model and Doppel's prediction, kept in sync with the prediction.
(() => {
  const { reducedMotion, DATASETS, bindGroup, watch, videoBar } = window.Doppel;
  const MEDIA = window.DOPPEL_EMB8;
  const tryPlay = v => v.play().catch(() => {});

  // Three videos that follow one leader; returns load(entry) and the leader.
  function player(stage, options, onTime) {
    const vids = Object.fromEntries([...stage.querySelectorAll('video')].map(v => [v.dataset.role, v]));
    const lead = vids.pred, rest = [vids.gt, vids.render];
    let visible = false, userPaused = reducedMotion.matches;
    const follow = () => rest.forEach(v => { if (Math.abs(v.currentTime - lead.currentTime) > 0.08) v.currentTime = lead.currentTime; });
    lead.addEventListener('play', () => rest.forEach(tryPlay));
    lead.addEventListener('pause', () => rest.forEach(v => v.pause()));
    lead.addEventListener('seeking', () => rest.forEach(v => { v.currentTime = lead.currentTime; }));
    lead.addEventListener('timeupdate', () => { follow(); if (onTime) onTime(lead); });
    const bar = videoBar(lead, options, {
      toggle: () => { if (lead.paused) { userPaused = false; tryPlay(lead); } else { userPaused = true; lead.pause(); } },
      seek: (t, seekTo) => { userPaused = true; lead.pause(); seekTo(t); },
    });
    stage.after(bar.el);
    const load = entry => {
      stage.dataset.aspect = entry.aspect;
      Object.entries(vids).forEach(([role, v]) => { v.poster = entry.poster; v.src = entry[role]; v.load(); });
      if (visible && !userPaused) tryPlay(lead);
    };
    watch(stage, v => { visible = v; if (v && !userPaused && lead.getAttribute('src')) tryPlay(lead); else if (!v) lead.pause(); }, { threshold: 0.3 });
    return { load, lead };
  }

  function tabs(host, attr, items) {
    host.innerHTML = items.map((it, i) => `<button class="chip" role="tab" type="button" aria-selected="${i === 0}" data-${attr}="${it.key}">${it.label}</button>`).join('');
  }

  function bindLong() {
    const root = document.querySelector('[data-long]');
    if (!root || !MEDIA) return;
    const meta = root.querySelector('[data-long-meta]');
    let entry = null;
    const windowOf = v => {
      if (!entry) return;
      const frame = Math.min(entry.frames - 1, Math.floor(v.currentTime * 5 + 1e-3));  // 5 fps
      const w = Math.min(8, Math.max(1, Math.ceil(frame / 16)));
      meta.textContent = frame === 0 ? `${DATASETS[entry.dataset].robot} · ${DATASETS[entry.dataset].name} · first frame`
        : `${DATASETS[entry.dataset].robot} · ${DATASETS[entry.dataset].name} · window ${w} of 8`;
    };
    const p = player(root.querySelector('[data-long-stage]'), { label: 'Rollout' }, windowOf);
    const tabHost = root.querySelector('[data-long-tabs]');
    const seen = {};
    tabs(tabHost, 'roll', MEDIA.long.map(l => { seen[l.dataset] = (seen[l.dataset] || 0) + 1; return { key: String(l.n), label: `${DATASETS[l.dataset].robot} · ${DATASETS[l.dataset].name}${seen[l.dataset] > 1 ? `, clip ${seen[l.dataset]}` : ''}` }; }));
    const select = n => { entry = MEDIA.long.find(l => String(l.n) === n); p.load(entry); windowOf(p.lead); };
    select(bindGroup(tabHost, 'roll', select));
  }

  document.addEventListener('DOMContentLoaded', bindLong);
})();
