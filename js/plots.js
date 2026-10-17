// Results: scoreboard, training-curve explorer, region chart and the full table, all drawn from DOPPEL_DATA.
// Doppel is a solid blue line with round markers, action-only a dashed slate line with square markers. Series are labelled
// at their line ends, in their own colour, instead of a legend.
(() => {
  const data = window.DOPPEL_DATA;
  const { DATASETS, METHODS, bindGroup, watch, reducedMotion } = window.Doppel;
  const NS = 'http://www.w3.org/2000/svg';
  const ORDER = ['droid', 'bridge', 'robomind'];
  const SPLIT = { val: 'unseen trajectories', ood: 'out-of-distribution test' };
  const el = (tag, attrs = {}, text) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text != null) node.textContent = text;
    return node;
  };
  const row = (dataset, method) => data.overall.find(r => r.dataset === dataset && r.method === method);
  const signed = (v, d) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;

  /* Tooltip */
  const tip = document.createElement('div');
  tip.className = 'plot-tip';
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  const show = (target, text) => {
    tip.textContent = text;
    tip.hidden = false;
    const box = target.getBoundingClientRect();
    tip.style.left = `${Math.min(innerWidth - tip.offsetWidth - 8, Math.max(8, box.left + box.width / 2 - tip.offsetWidth / 2))}px`;
    tip.style.top = `${Math.max(8, box.top - tip.offsetHeight - 10)}px`;
  };
  const hide = () => { tip.hidden = true; };
  const point = (node, text) => {
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'img');
    node.setAttribute('aria-label', text);
    node.style.cursor = 'pointer';
    node.addEventListener('pointerenter', () => show(node, text));
    node.addEventListener('pointerleave', hide);
    node.addEventListener('focus', () => show(node, text));
    node.addEventListener('blur', hide);
  };
  addEventListener('scroll', hide, { passive: true });

  function ticks(lo, hi, count = 4) {
    const span = hi - lo;
    const step = [0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5].find(s => span / s <= count) || 5;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(4));
    const digits = (String(step).split('.')[1] || '').length;
    return { values: out, label: v => v.toFixed(digits) };
  }

  // Curves are revealed left to right by an animated clip rectangle.
  function trace(svg, rect, width, duration = 1300) {
    cancelAnimationFrame(svg._trace || 0);
    if (reducedMotion.matches) { rect.setAttribute('width', width); return; }
    const start = performance.now();
    const step = now => {
      const p = Math.max(0, Math.min(1, (now - start) / duration));
      rect.setAttribute('width', width * (1 - (1 - p) ** 2.4));
      if (p < 1) svg._trace = requestAnimationFrame(step);
    };
    rect.setAttribute('width', 0);
    svg._trace = requestAnimationFrame(step);
  }

  /* Line chart with optional bands; returns a replay function. */
  function lineChart(svg, { series, xMax, yLabel, xLabel, height = 320, bands = true, annotate }) {
    svg.replaceChildren();
    const W = Math.max(300, Math.round(svg.clientWidth || svg.parentElement.clientWidth || 600));
    const H = height, l = 50, r = 112, t = 24, b = 46;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const all = series.flatMap(s => s.points.flatMap(p => bands && p.lo != null ? [p.lo, p.hi] : [p.y]));
    const lo0 = Math.min(...all), hi0 = Math.max(...all), pad = (hi0 - lo0) * 0.14 || 0.5;
    const ty = ticks(lo0 - pad, hi0 + pad, 4);
    const yLo = Math.min(ty.values[0], lo0 - pad), yHi = Math.max(ty.values.at(-1), hi0 + pad);
    const X = v => l + v / xMax * (W - l - r);
    const Y = v => t + (1 - (v - yLo) / (yHi - yLo)) * (H - t - b);
    ty.values.forEach((v, i) => {
      svg.appendChild(el('line', { x1: l, x2: W - r, y1: Y(v), y2: Y(v), stroke: 'var(--grid)', 'stroke-width': 1, 'stroke-dasharray': i ? '3 5' : 'none' }));
      svg.appendChild(el('text', { x: l - 10, y: Y(v) + 4, 'text-anchor': 'end', class: 'axis-text' }, ty.label(v)));
    });
    [0, 1, 2, 3].forEach(v => svg.appendChild(el('text', { x: X(v), y: H - b + 20, 'text-anchor': 'middle', class: 'axis-text' }, `${v}M`)));
    svg.appendChild(el('text', { x: l + (W - l - r) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-title' }, xLabel));
    svg.appendChild(el('text', { x: l, y: 12, class: 'axis-title' }, yLabel));
    const clipId = `clip-${Math.random().toString(36).slice(2)}`;
    const defs = el('defs');
    const clip = el('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
    const rect = el('rect', { x: l - 10, y: 0, width: W, height: H });
    clip.appendChild(rect); defs.appendChild(clip); svg.appendChild(defs);
    const group = el('g', { 'clip-path': `url(#${clipId})` });
    svg.appendChild(group);
    if (annotate) annotate({ g: group, X, Y });
    series.forEach(s => {
      if (bands && s.points[0].lo != null) {
        const poly = s.points.map(p => `${X(p.x)},${Y(p.hi)}`).concat([...s.points].reverse().map(p => `${X(p.x)},${Y(p.lo)}`)).join(' ');
        group.appendChild(el('polygon', { points: poly, fill: s.color, opacity: s.key === 'doppel' ? 0.16 : 0.2 }));
      }
      group.appendChild(el('polyline', { points: s.points.map(p => `${X(p.x)},${Y(p.y)}`).join(' '), fill: 'none', stroke: s.color, 'stroke-width': s.key === 'doppel' ? 2.8 : 2.2, 'stroke-dasharray': s.dash ? '6 5' : 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      s.points.forEach(p => {
        const shape = s.key === 'doppel'
          ? el('circle', { cx: X(p.x), cy: Y(p.y), r: 5.5, fill: s.color, stroke: 'var(--surface-solid)', 'stroke-width': 2 })
          : el('rect', { x: X(p.x) - 5, y: Y(p.y) - 5, width: 10, height: 10, rx: 2, fill: s.color, stroke: 'var(--surface-solid)', 'stroke-width': 2 });
        point(shape, s.tip(p));
        group.appendChild(shape);
      });
    });
    // Direct labels at the line ends, nudged apart when the ends are close.
    const ends = series.map(s => ({ s, y: Y(s.points.at(-1).y), x: X(s.points.at(-1).x) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;
    ends.forEach(e => group.appendChild(el('text', { x: e.x + 12, y: e.y + 4, class: 'series-label', fill: e.s.ink || e.s.color }, e.s.label)));
    return () => trace(svg, rect, W);
  }

  /* Scoreboard: Doppel's whole-frame PSNR and the gain over each robot's action-only expert. */
  let selectCell = () => {};
  function renderScoreboard() {
    const host = document.querySelector('[data-scoreboard]');
    host.innerHTML = ORDER.map(ds => {
      const d = DATASETS[ds];
      const cells = ['val', 'ood'].map(split => {
        const ours = row(ds, 'doppel')[split].psnr, base = row(ds, 'action')[split].psnr;
        return `<button class="score-cell" type="button" aria-pressed="false" data-cell="${ds}.${split}" aria-label="${d.name}, ${SPLIT[split]}: Doppel ${ours.toFixed(2)} dB PSNR, ${signed(ours - base, 2)} dB over the action-only expert. Show its training curve.">
          <span class="split">${split === 'val' ? 'Unseen trajectories' : d.shift}</span>
          <b>${ours.toFixed(2)}<small>dB</small></b>
          <span class="gain">${signed(ours - base, 2)} dB</span></button>`;
      }).join('');
      return `<div class="score"><div class="score-head">${d.name} · ${d.robot}<small>PSNR, vs. action-only</small></div>${cells}</div>`;
    }).join('');
    host.querySelectorAll('[data-cell]').forEach(b => b.addEventListener('click', () => {
      const [ds, split] = b.dataset.cell.split('.');
      selectCell(ds, split);
    }));
  }

  /* Training-curve explorer */
  function bindExplorer() {
    const svg = document.querySelector('[data-ex-svg]');
    const groups = {
      mode: document.querySelector('[data-ex-mode]'), metric: document.querySelector('[data-ex-metric]'),
      dataset: document.querySelector('[data-ex-dataset]'), split: document.querySelector('[data-ex-split]'),
    };
    const meanButton = groups.dataset.querySelector('[data-dataset="mean"]');
    const bandsBox = document.querySelector('[data-ex-bands]');
    const out = {
      big: document.querySelector('[data-ex-big]'), label: document.querySelector('[data-ex-label]'), gain: document.querySelector('[data-ex-gain]'),
      text: document.querySelector('[data-ex-text]'), note: document.querySelector('[data-ex-note]'),
    };
    const state = {
      mode: bindGroup(groups.mode, 'mode', v => { state.mode = v; draw(true); }),
      metric: bindGroup(groups.metric, 'metric', v => { state.metric = v; draw(true); }),
      dataset: bindGroup(groups.dataset, 'dataset', v => { state.dataset = v; draw(true); }),
      split: bindGroup(groups.split, 'split', v => { state.split = v; draw(true); }),
    };
    let replay = () => {}, seen = false;
    bandsBox.addEventListener('change', () => draw(true));

    function draw(animate) {
      if (state.mode === 'expert' && state.dataset === 'mean') { state.dataset = 'droid'; groups.dataset.setValue('droid'); }
      meanButton.hidden = state.mode !== 'shared';
      const { mode, metric, dataset, split } = state;
      const psnr = metric === 'psnr';
      const fmt = v => psnr ? v.toFixed(2) : v.toFixed(3);
      const unit = psnr ? ' dB' : '';
      const mean = dataset === 'mean';
      const s = mode === 'expert' ? data.expert[`${dataset}.${split}.${metric}`]
        : mean ? data.shared_avg[`${split}.${metric}`] : data.shared[`${dataset}.${split}.${metric}`];
      const name = mean ? 'the three datasets' : DATASETS[dataset].name;
      const labels = mode === 'expert'
        ? { action: `Action-only expert (${DATASETS[dataset].name} only)`, doppel: 'Doppel (multi)' }
        : { action: 'Shared action-only model', doppel: 'Doppel, same batch and schedule' };
      const short = mode === 'expert' ? { action: 'Action-only expert', doppel: 'Doppel' } : { action: 'Shared action-only', doppel: 'Doppel' };
      const ci = p => p.lo != null ? ` (95% CI ${fmt(p.lo)}–${fmt(p.hi)})` : '';
      const d0 = s.doppel[0], aN = s.action.at(-1), dN = s.doppel.at(-1);
      const showSaving = mode === 'shared' && mean && d0.y > aN.y;
      bandsBox.parentElement.hidden = mean;
      replay = lineChart(svg, {
        xMax: 3.6, bands: bandsBox.checked && !mean,
        yLabel: `${mean ? 'Mean ' : ''}${psnr ? 'PSNR (dB)' : 'SCS'} ↑`,
        xLabel: mode === 'expert' ? 'Training draws per dataset (millions)' : 'Total training draws across the three datasets (millions)',
        series: [
          { key: 'action', label: short.action, color: METHODS.action.color, ink: METHODS.action.ink, dash: true, points: s.action, tip: p => `${labels.action} · ${p.x.toFixed(2)}M draws · ${fmt(p.y)}${unit}${ci(p)}` },
          { key: 'doppel', label: short.doppel, color: METHODS.doppel.color, points: s.doppel, tip: p => `${labels.doppel} · ${p.x.toFixed(2)}M draws · ${fmt(p.y)}${unit}${ci(p)}` },
        ],
        annotate: showSaving ? ({ g, X, Y }) => {
          g.appendChild(el('line', { x1: X(d0.x) + 7, x2: X(aN.x), y1: Y(aN.y), y2: Y(aN.y), stroke: 'var(--ink)', 'stroke-width': 1.5, 'stroke-dasharray': '4 4', opacity: 0.85 }));
          g.appendChild(el('path', { d: `M${X(d0.x) + 1},${Y(aN.y)} l8,-4.5 v9 z`, fill: 'var(--ink)', opacity: 0.85 }));
          g.appendChild(el('line', { x1: X(d0.x), x2: X(d0.x), y1: Y(d0.y) + 7, y2: Y(aN.y), stroke: 'var(--ink-dimmer)', 'stroke-width': 1.2 }));
          g.appendChild(el('text', { x: (X(d0.x) + X(aN.x)) / 2, y: Y(aN.y) + 17, 'text-anchor': 'middle', class: 'svg-label', fill: 'var(--ink)' }, '63.8% fewer draws'));
        } : null,
      });
      const ahead = s.doppel.every((p, i) => p.y > s.action[i].y);
      if (showSaving) {
        out.big.innerHTML = `${fmt(d0.y)}${psnr ? '<small>dB</small>' : ''}`;
        out.label.textContent = `Doppel's mean ${psnr ? 'PSNR' : 'SCS'} after ${d0.x.toFixed(3)}M draws, ${SPLIT[split]}`;
        out.gain.textContent = `${signed(d0.y - aN.y, psnr ? 2 : 3)}${unit} over action-only at ${aN.x.toFixed(3)}M`;
        out.text.innerHTML = `Averaged over the three datasets, Doppel's first checkpoint at <b>${d0.x.toFixed(3)}M</b> draws is above the shared action-only model's last at <b>${aN.x.toFixed(3)}M</b>, 63.8% fewer draws.`;
      } else {
        out.big.innerHTML = `${fmt(dN.y)}${psnr ? '<small>dB</small>' : ''}`;
        out.label.textContent = `Doppel · ${name} · ${SPLIT[split]} · last checkpoint`;
        out.gain.textContent = `${signed(dN.y - aN.y, psnr ? 2 : 3)}${unit} over ${mode === 'expert' ? 'the expert' : 'shared action-only'}`;
        out.text.innerHTML = ahead
          ? `Doppel is ahead at every checkpoint on ${name}, ${SPLIT[split]}: <b>${fmt(dN.y)}${unit}</b> against <b>${fmt(aN.y)}${unit}</b> at the end.`
          : `At the last checkpoint Doppel reaches <b>${fmt(dN.y)}${unit}</b> against <b>${fmt(aN.y)}${unit}</b> on ${name}, ${SPLIT[split]}.`;
      }
      out.note.textContent = mode === 'expert'
        ? `Dashed: the action-only expert trained on ${DATASETS[dataset].name} only. Solid: Doppel (multi), one model for all three datasets, so its per-dataset draws are expectations under the uniform sampler. Bands are 95% bootstrap intervals over source episodes.`
        : 'Dashed: the shared action-only model. Solid: Doppel. Both train jointly on all three datasets with global batch 64 and the same optimization schedule; draws are counted in total across datasets.';
      document.querySelectorAll('[data-cell]').forEach(b => b.setAttribute('aria-pressed', String(mode === 'expert' && b.dataset.cell === `${dataset}.${split}` && metric === 'psnr')));
      if (animate || seen) replay();
    }
    selectCell = (ds, split) => {
      Object.assign(state, { mode: 'expert', metric: 'psnr', dataset: ds, split });
      groups.mode.setValue('expert'); groups.metric.setValue('psnr'); groups.dataset.setValue(ds); groups.split.setValue(split);
      draw(true);
      const card = svg.closest('.explorer');
      if (card.getBoundingClientRect().top > innerHeight - 160) card.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'center' });
    };
    draw(false);
    watch(svg, visible => { if (visible && !seen) { seen = true; replay(); } }, { threshold: 0.3 });
    let w = 0;
    new ResizeObserver(() => { const nw = Math.round(svg.clientWidth); if (nw && nw !== w) { w = nw; draw(false); } }).observe(svg);
  }

  /* Region chart: one row per method, labelled in the method's colour */
  const REGION = { psnr_obj: 'Moving-object PSNR (dB)', scs_obj: 'Moving-object SCS', psnr_arm: 'Robot PSNR (dB)', scs_arm: 'Robot SCS' };
  function bindRegion() {
    const host = document.querySelector('[data-region-chart]');
    let metric = bindGroup(document.querySelector('[data-region-metric]'), 'metric', v => { metric = v; render(); });
    let split = bindGroup(document.querySelector('[data-region-split]'), 'split', v => { split = v; render(); });
    function render() {
      host.replaceChildren();
      const psnr = metric.startsWith('psnr');
      const vals = data.region.map(r => r[split][metric]);
      const pad = psnr ? 1 : 0.02;
      const tx = ticks(Math.min(...vals) - pad, Math.max(...vals) + pad, 4);
      const lo = Math.min(tx.values[0], Math.min(...vals) - pad), hi = Math.max(tx.values.at(-1), Math.max(...vals) + pad);
      ORDER.forEach(dataset => {
        const rows = data.region.filter(r => r.dataset === dataset);
        const panel = document.createElement('div');
        panel.className = 'panel';
        const W = 340, rowH = 34, top = 30, left = 104, right = 16, H = top + rows.length * rowH + 28;
        const X = v => left + (v - lo) / (hi - lo) * (W - left - right);
        const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': `${DATASETS[dataset].name}: ${REGION[metric]}` });
        svg.appendChild(el('text', { x: 0, y: 14, class: 'svg-label', fill: 'var(--ink)' }, `${DATASETS[dataset].name} · ${DATASETS[dataset].robot}`));
        tx.values.forEach(v => {
          if (v < lo || v > hi) return;
          svg.appendChild(el('line', { x1: X(v), x2: X(v), y1: top - 6, y2: H - 24, stroke: 'var(--line-strong)', 'stroke-width': 1, opacity: 0.6 }));
          svg.appendChild(el('text', { x: X(v), y: H - 8, 'text-anchor': 'middle', class: 'axis-text' }, tx.label(v)));
        });
        const base = rows.find(r => r.method === 'action')[split][metric];
        rows.forEach((r, i) => {
          const y = top + i * rowH + rowH / 2;
          const m = METHODS[r.method];
          const v = r[split][metric];
          svg.appendChild(el('text', { x: 0, y: y + 4, class: 'row-label', fill: m.ink || m.color }, m.short));
          if (r.method !== 'action') svg.appendChild(el('line', { x1: X(base), x2: X(v), y1: y, y2: y, stroke: m.color, 'stroke-width': 2.6, opacity: 0.5, 'stroke-linecap': 'round' }));
          const shape = r.method === 'action'
            ? el('rect', { x: X(v) - 6, y: y - 6, width: 12, height: 12, rx: 2.5, fill: m.color })
            : el('circle', { cx: X(v), cy: y, r: r.method === 'doppel' ? 7.5 : 6, fill: r.method === 'doppel_single' ? 'var(--surface-solid)' : m.color, stroke: m.color, 'stroke-width': 2.5 });
          point(shape, `${DATASETS[dataset].name} · ${m.label} · ${REGION[metric]} ${v.toFixed(3)}`);
          svg.appendChild(shape);
          if (r.method === 'doppel') svg.appendChild(el('text', { x: X(v), y: y - 12, 'text-anchor': 'middle', class: 'axis-text', fill: 'var(--accent)', 'font-weight': 700 }, psnr ? v.toFixed(2) : v.toFixed(3)));
        });
        panel.appendChild(svg);
        host.appendChild(panel);
      });
    }
    render();
  }

  /* Full table */
  function bindTable() {
    const body = document.querySelector('[data-table-body]');
    const render = split => {
      body.replaceChildren();
      ORDER.forEach(dataset => {
        const rows = data.overall.filter(r => r.dataset === dataset);
        const best = {
          psnr: Math.max(...rows.map(r => r[split].psnr)), ssim: Math.max(...rows.map(r => r[split].ssim)),
          lpips: Math.min(...rows.map(r => r[split].lpips)), scs: Math.max(...rows.map(r => r[split].scs)),
        };
        const base = rows.find(r => r.method === 'action')[split].psnr;
        rows.forEach((r, i) => {
          const tr = document.createElement('tr');
          if (r.method === 'doppel') tr.className = 'ours';
          if (i === 0) {
            const td = document.createElement('td');
            td.className = 'ds'; td.rowSpan = rows.length; td.textContent = DATASETS[dataset].name;
            tr.appendChild(td);
          }
          const m = document.createElement('td');
          m.className = 'method';
          m.textContent = METHODS[r.method].short;
          tr.appendChild(m);
          ['psnr', 'ssim', 'lpips', 'scs'].forEach(k => {
            const td = document.createElement('td');
            td.textContent = r[split][k].toFixed(3);
            if (r[split][k] === best[k]) td.classList.add('best');
            tr.appendChild(td);
          });
          const d = document.createElement('td');
          if (r.method === 'action') d.textContent = '—';
          else {
            const g = r[split].psnr - base;
            d.textContent = `${signed(g, 2)} dB`;
            d.className = g >= 0 ? 'delta' : 'delta neg';
          }
          tr.appendChild(d);
          body.appendChild(tr);
        });
      });
    };
    render(bindGroup(document.querySelector('[data-table-split]'), 'split', render));
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.body.appendChild(tip);
    renderScoreboard();
    bindExplorer();
    bindRegion();
    bindTable();
  });
})();
