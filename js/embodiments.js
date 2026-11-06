// Eight embodiments: held-out test clips of the five added datasets, and the chained long-horizon rollouts.
// Each player shows the recording, the render given to the model and Doppel's prediction, kept in sync with the prediction.
(() => {
  const { reducedMotion, DATASETS, bindGroup, watch, videoBar } = window.Doppel;
  const MEDIA = window.DOPPEL_EMB8;
  const ORDER = ['abc', 'trex', 'egoexo4d', 'gigahands', 'oakink2'];
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

  function bindClips() {
    const root = document.querySelector('[data-emb]');
    if (!root || !MEDIA) return;
    const meta = root.querySelector('[data-emb-meta]'), strip = root.querySelector('[data-emb-strip]');
    const p = player(root.querySelector('[data-emb-stage]'), { frames: 17, label: 'Clip' });
    let current = null;
    const describe = (c, i, n) => {
      const d = DATASETS[c.dataset];
      const span = c.kind === 'whole' ? 'whole episode, 17 frames spread across it' : '3.2 s window';
      meta.textContent = `${d.robot} · ${d.name} · held-out test clip ${i + 1} of ${n} · ${span}`;
    };
    const pick = (clips, i) => {
      current = clips[i];
      p.load(current);
      describe(current, i, clips.length);
      strip.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    };
    const select = ds => {
      const clips = MEDIA.clips.filter(c => c.dataset === ds);
      strip.innerHTML = clips.map((c, i) => `<button type="button" class="emb-thumb" aria-pressed="false" aria-label="Clip ${i + 1}" data-aspect="${c.aspect}"><img src="${c.poster}" alt="" loading="lazy"></button>`).join('');
      strip.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => pick(clips, i)));
      pick(clips, 0);
    };
    const tabHost = root.querySelector('[data-emb-tabs]');
    tabs(tabHost, 'dataset', ORDER.map(ds => ({ key: ds, label: `${DATASETS[ds].robot} · ${DATASETS[ds].name}` })));
    select(bindGroup(tabHost, 'dataset', select));
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
      meta.textContent = frame === 0 ? `${DATASETS[entry.dataset].robot} · ${DATASETS[entry.dataset].name} · first recorded frame`
        : `${DATASETS[entry.dataset].robot} · ${DATASETS[entry.dataset].name} · window ${w} of 8 · ${(frame / 5).toFixed(1)} s`;
    };
    const p = player(root.querySelector('[data-long-stage]'), { label: 'Rollout' }, windowOf);
    const tabHost = root.querySelector('[data-long-tabs]');
    const seen = {};
    tabs(tabHost, 'roll', MEDIA.long.map(l => { seen[l.dataset] = (seen[l.dataset] || 0) + 1; return { key: String(l.n), label: `${DATASETS[l.dataset].robot} · ${DATASETS[l.dataset].name}${seen[l.dataset] > 1 ? ` ${seen[l.dataset]}` : ''}` }; }));
    const select = n => { entry = MEDIA.long.find(l => String(l.n) === n); p.load(entry); windowOf(p.lead); };
    select(bindGroup(tabHost, 'roll', select));
  }

  document.addEventListener('DOMContentLoaded', () => { bindClips(); bindLong(); });
})();
