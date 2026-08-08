/**
 * The Price of Robustness — interactive demo.
 *
 * A fixed $50M renewable budget, split between solar and wind. Cost is constant
 * by construction across every plan, so cost cannot rank them. Three robustness
 * measures then proceed to disagree about which one to buy — and simulation
 * settles the argument.
 *
 * Everything here computes live in the visitor's browser from the same closed
 * form as the published method. Nothing is a recording; test/hardness.test.mjs
 * holds the port to the Python reference.
 */

import {
  hardness, brittleness, nvdic, simulate, histogram, constraintHardness,
} from './lib/hardness.mjs'
import { Plot, slider, legend, tableView, fmt } from './lib/chart.mjs'

/* ------------------------------------------------------------------- model */

/** Microgrid resource adequacy, in "≤ 0" form: demand minus what the fleet can
 *  deliver. Capacity factors are intervals — the weather is the uncertainty. */
const CONSTRAINTS = [
  { aLo: [-0.35, -0.4, -1, -1], aHi: [-0.1, -0.1, -1, -1], bLo: -14, bHi: -14 },
  { aLo: [-0.08, -0.6, -1, -1], aHi: [-0.0, -0.25, -1, -1], bLo: -12, bHi: -12 },
]
const PERIODS = ['Summer afternoon peak', 'Winter evening peak']
const COST = [1.0, 1.1, 1.3, 1.6]        // $M per MW: solar, wind, diesel, battery
const BACKBONE = { diesel: 3, battery: 1 }
const BUDGET = 50.0
const FREE_BUDGET = BUDGET - (BACKBONE.diesel * COST[2] + BACKBONE.battery * COST[3])

/** The plan at a given solar share of the free budget. Cost stays at BUDGET. */
function planAt(share) {
  const solarSpend = FREE_BUDGET * share
  const solar = solarSpend / COST[0]
  const wind = (FREE_BUDGET - solarSpend) / COST[1]
  return [solar, wind, BACKBONE.diesel, BACKBONE.battery]
}

const cost = x => x.reduce((a, v, i) => a + v * COST[i], 0)

/** Sample the whole decision range once; every panel reads from this. */
function sweep(steps = 101) {
  const rows = []
  for (let i = 0; i < steps; i++) {
    const share = i / (steps - 1)
    const x = planAt(share)
    rows.push({
      share,
      x,
      eta: hardness(CONSTRAINTS, x, { mode: 'weighted' }).eta,
      brittle: brittleness(CONSTRAINTS, x),
      nvd: nvdic(CONSTRAINTS, x),
    })
  }
  return rows
}

const argmax = (rows, key) => rows.reduce((b, r) => (r[key] > b[key] ? r : b), rows[0])
const argmin = (rows, key) => rows.reduce((b, r) => (r[key] < b[key] ? r : b), rows[0])

const pct = v => `${(v * 100).toFixed(0)}%`

/* -------------------------------------------------------------------- view */

export function mount(root) {
  root.innerHTML = ''
  root.classList.add('viz')

  const rows = sweep()
  const etaPick = argmax(rows, 'eta')
  const brittlePick = argmin(rows, 'brittle')

  let share = etaPick.share

  /* --- Panel 1: the disagreement ------------------------------------- */

  const p1 = document.createElement('section')
  p1.className = 'demo-panel'
  p1.innerHTML = `
    <h3>Same $50M. Three measures. Three different answers.</h3>
    <p class="panel-note">Move the slider to shift the budget between solar and wind. The
      cost readout never changes — that is the point. Watch where each measure puts its
      optimum, and notice that one of them cannot answer at all.</p>`

  const grid1 = document.createElement('div')
  grid1.className = 'panel-grid'

  const controls = document.createElement('div')
  controls.className = 'controls'

  const readout = document.createElement('div')
  readout.className = 'stat-row'

  const s = slider({
    label: 'Solar share of budget',
    min: 0, max: 1, step: 0.01, value: share,
    format: pct,
    hint: 'The rest goes to wind. Diesel and battery are a fixed firm backbone.',
    onInput: v => { share = v; render() },
  })
  controls.append(s.node, readout)

  const charts = document.createElement('div')

  // Three measures on three scales. Overlaying them would be a dual-axis chart
  // wearing a disguise — the worst thing you can do to a reader. Small
  // multiples let each keep its own scale, and turn the disagreement into
  // something you see rather than something you compute: three peaks, three
  // different places on the same x-axis.
  const SERIES = [
    {
      key: 'eta', name: 'Hardness η', color: 'var(--series-1)', better: 'max',
      note: 'Higher is more robust. Integrates the whole violation distribution, not just its worst point.',
      format: v => v.toFixed(4),
    },
    {
      key: 'brittle', name: 'Brittleness', color: 'var(--series-2)', better: 'min',
      note: 'Lower is more robust. Worst-case total violation — it sees the edge of the distribution and nothing inside it.',
      format: v => `${v.toFixed(2)} MW`,
    },
    {
      key: 'nvd', name: 'NVDIC', color: 'var(--series-3)', better: 'min',
      note: 'Lower is more robust. Scored against interval centres, so it registers nothing until the nominal plan itself fails.',
      format: v => v.toFixed(4),
    },
  ]

  const plots = SERIES.map(sp => {
    const vals = rows.map(r => r[sp.key])
    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const padY = (hi - lo) * 0.18 || 0.1

    const holder = document.createElement('figure')
    holder.className = 'measure-panel'
    holder.innerHTML = `<figcaption><b>${sp.name}</b> — ${sp.note}</figcaption>`

    const plot = new Plot({
      width: 620, height: 132,
      pad: { top: 18, right: 66, bottom: 24, left: 52 },
      xDomain: [0, 1],
      yDomain: [lo - padY, hi + padY],
      title: `${sp.name} against solar share`,
      xLabel: sp.key === 'nvd' ? 'Solar share of the $50M budget' : null,
    })
    plot.axes({
      xTicks: [0, 0.25, 0.5, 0.75, 1],
      xFormat: pct,
      yFormat: v => (Math.abs(v) < 1e-9 ? '0' : fmt(v, 2)),
    })

    const pts = rows.map(r => [r.share, r[sp.key]])
    plot.area(pts, { color: sp.color }).line(pts, { color: sp.color })

    // The optimum, direct-labelled. This is also the relief the palette check
    // requires for the light-mode aqua, which sits below 3:1 on the surface.
    const best = sp.better === 'max' ? argmax(rows, sp.key) : argmin(rows, sp.key)
    const flat = Math.abs(Math.max(...vals) - Math.min(...vals)) < 1e-12
    if (!flat) {
      plot.dot(best.share, best[sp.key], { color: sp.color })
      plot.label(best.share, best[sp.key], `${sp.better === 'max' ? 'best' : 'best'} ${pct(best.share)}`,
        { dy: sp.better === 'max' ? -12 : 20 })
    }

    // NVDIC is exactly zero over the left half; say so rather than leaving a
    // flat line the reader has to interpret.
    const deadTo = rows.filter(r => r[sp.key] === 0).length
    if (sp.key === 'nvd' && deadTo > 2) {
      const edge = rows[deadTo - 1].share
      plot.rule(edge, null, { axis: 'x' })
      plot.label(edge / 2, lo, 'no opinion here', { dy: -8 })
    }

    plot.hover({ series: [{ name: sp.name, color: sp.color, points: pts, format: sp.format }], xFormat: pct })

    const marker = plot.layers.mark.appendChild(
      document.createElementNS('http://www.w3.org/2000/svg', 'line'))
    marker.setAttribute('stroke', 'var(--accent)')
    marker.setAttribute('stroke-width', 1.5)
    marker.setAttribute('y1', plot.pad.top)
    marker.setAttribute('y2', plot.h - plot.pad.bottom)

    plot.mount(holder)
    charts.appendChild(holder)
    return { sp, plot, marker }
  })

  grid1.append(controls, charts)
  p1.appendChild(grid1)

  p1.appendChild(tableView(
    'Every plan on the $50M isocost line, with all three measures',
    ['Solar share', 'Solar MW', 'Wind MW', 'Cost $M', 'η', 'Brittleness MW', 'NVDIC'],
    rows.filter((_, i) => i % 10 === 0).map(r => [
      pct(r.share), r.x[0].toFixed(1), r.x[1].toFixed(1), cost(r.x).toFixed(2),
      r.eta.toFixed(4), r.brittle.toFixed(3), r.nvd.toFixed(4),
    ])))

  /* --- Panel 2: what actually happens -------------------------------- */

  const p2 = document.createElement('section')
  p2.className = 'demo-panel'
  p2.innerHTML = `
    <h3>So which one was right?</h3>
    <p class="panel-note">Draw scenarios from the same uncertainty the measures were
      reasoning about, and record what the plan actually delivers. The closed form
      predicted this without sampling anything.</p>`

  const grid2 = document.createElement('div')
  grid2.className = 'panel-grid'
  const c2 = document.createElement('div')
  c2.className = 'controls'
  const simOut = document.createElement('div')
  simOut.className = 'stat-row'
  const actions = document.createElement('div')
  actions.className = 'demo-actions'
  const rollBtn = document.createElement('button')
  rollBtn.textContent = 'Roll 20,000 scenarios'
  actions.appendChild(rollBtn)
  c2.append(actions, simOut)

  const histHolder = document.createElement('div')
  grid2.append(c2, histHolder)
  p2.appendChild(grid2)

  const scoreboard = document.createElement('div')
  scoreboard.className = 'stat-row'
  p2.appendChild(scoreboard)

  /* --- render ---------------------------------------------------------- */

  function render() {
    const x = planAt(share)
    const h = hardness(CONSTRAINTS, x, { mode: 'weighted' })
    const per = CONSTRAINTS.map(c => constraintHardness(c, x))

    readout.innerHTML = `
      <div class="stat"><div class="stat-label">Cost</div>
        <div class="stat-value">$${cost(x).toFixed(1)}M</div></div>
      <div class="stat"><div class="stat-label">Solar / wind</div>
        <div class="stat-value">${x[0].toFixed(0)}<small> / ${x[1].toFixed(0)} MW</small></div></div>
      <div class="stat is-pick"><div class="stat-label">Hardness η</div>
        <div class="stat-value">${h.eta.toFixed(4)}</div></div>
      ${per.map((p, j) => `<div class="stat"><div class="stat-label">${PERIODS[j]}<br>chance of covering demand</div>
        <div class="stat-value">${(p.pFeasible * 100).toFixed(1)}<small>%</small></div></div>`).join('')}`

    for (const { plot, marker } of plots) {
      const px = plot.x(share)
      marker.setAttribute('x1', px)
      marker.setAttribute('x2', px)
    }
  }

  function roll() {
    rollBtn.disabled = true
    rollBtn.textContent = 'Rolling…'
    // Yield to the event loop so the disabled state paints before the sampling
    // loop blocks. Deliberately NOT requestAnimationFrame: that never fires in
    // a background tab, so a visitor who opens this page in a new tab and
    // switches to it later would find the demo stuck on "Rolling…".
    setTimeout(() => {
      const started = performance.now()
      const picks = [
        { name: 'η’s pick', share: etaPick.share, accent: true },
        { name: 'Brittleness’ pick', share: brittlePick.share, accent: false },
        { name: 'All solar', share: 1, accent: false },
      ].map(p => {
        const r = simulate(CONSTRAINTS, planAt(p.share), { scenarios: 20000, seed: 99991 })
        return { ...p, ...r }
      })
      const here = simulate(CONSTRAINTS, planAt(share), { scenarios: 20000, seed: 99991 })
      const ms = performance.now() - started

      simOut.innerHTML = `
        <div class="stat is-pick"><div class="stat-label">Expected shortfall<br>at your setting</div>
          <div class="stat-value">${here.expectedShortfall.toFixed(3)}<small> MW</small></div></div>
        <div class="stat"><div class="stat-label">Scenarios that fall short</div>
          <div class="stat-value">${(here.violationRate * 100).toFixed(1)}<small>%</small></div></div>
        <div class="stat"><div class="stat-label">Computed in</div>
          <div class="stat-value">${ms.toFixed(0)}<small> ms</small></div></div>`

      scoreboard.innerHTML = picks.map(p => `
        <div class="stat${p.accent ? ' is-pick' : ''}">
          <div class="stat-label">${p.name} — ${pct(p.share)} solar<br>at $${BUDGET.toFixed(1)}M</div>
          <div class="stat-value">${p.expectedShortfall.toFixed(3)}<small> MW short</small></div>
        </div>`).join('')

      drawHistogram(here)
      rollBtn.disabled = false
      rollBtn.textContent = 'Roll again'
    }, 0)
  }

  function drawHistogram(result) {
    histHolder.innerHTML = ''
    const h = histogram(Array.from(result.shortfalls), 34)
    if (!h.bins.length) {
      histHolder.innerHTML = '<p class="plot-caption">Every scenario met demand — nothing to plot.</p>'
      return
    }
    const maxD = Math.max(...h.bins.map(b => b[1]))
    const plot = new Plot({
      width: 620, height: 190,
      pad: { top: 16, right: 18, bottom: 34, left: 52 },
      xDomain: [h.lo, h.hi], yDomain: [0, maxD * 1.12],
      title: 'Distribution of realized shortfall',
      xLabel: 'Shortfall in a single scenario (MW)',
    })
    plot.axes({ yFormat: v => fmt(v, 2) })
    plot.bars(h.bins, { color: 'var(--series-1)', maxWidth: 14, opacity: 0.9 })
    plot.rule(0, null, { axis: 'y' })

    const meanX = result.expectedShortfall
    plot.rule(meanX, null, { axis: 'x' })
    plot.label(meanX, maxD * 1.02, `mean ${meanX.toFixed(3)} MW`, { dy: 0 })

    plot.mount(histHolder)
    const cap = document.createElement('p')
    cap.className = 'plot-caption'
    cap.textContent = `${result.scenarios.toLocaleString('en-US')} scenarios drawn from the same interval uncertainty the measures reason about. `
      + `The closed form predicted this shape without drawing a single one.`
    histHolder.appendChild(cap)
  }

  root.append(p1, p2)
  render()
  roll()
}

/* ------------------------------------------------------------------ boot */

const root = document.getElementById('demo-root')
if (root) {
  try {
    mount(root)
  } catch (err) {
    root.innerHTML = `<p class="note">The demo failed to start: ${err.message}. `
      + `Everything it would show is written out below and in the markdown version of this page.</p>`
    console.error(err)
  }
}
