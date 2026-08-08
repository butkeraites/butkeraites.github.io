/**
 * Anatomy of a Failed Anneal.
 *
 * A repository of mine contains 201 committed runs of a simulated annealer.
 * All 201 are infeasible, and they cost 8.94 hours of compute to produce. This
 * demo reproduces that failure in the visitor's browser, isolates its three
 * causes with three switches, and ends inside a few percent of the proven
 * optimum in milliseconds.
 *
 * Owning a published failure with measurement is a better argument than another
 * green benchmark, so the page leads with the failure rather than burying it.
 */

import { makeInstance, exactOptimum, anneal } from './lib/annealing.mjs'
import { Plot, slider, tableView, legend, fmt } from './lib/chart.mjs'

const PUBLISHED = { T0: 1.0201e9, cooling: 0.999999, penalty: 'constant', returnMode: 'current' }
const FIXED = { T0: 120, cooling: 0.99985, penalty: 'proportional', returnMode: 'best' }

const pct = v => `${(v * 100).toFixed(1)}%`

export function mount(root, published) {
  root.innerHTML = ''
  root.classList.add('viz')

  const inst = makeInstance({ items: 50 })
  const optimum = exactOptimum(inst)

  const state = { ...PUBLISHED, iterations: 60000, flips: 1 }

  /* --- panel 1: the published record ---------------------------------- */

  const p1 = document.createElement('section')
  p1.className = 'demo-panel'
  const runs = (published && published.runs) || []
  const hours = runs.reduce((a, r) => a + r.seconds, 0) / 3600
  const infeasible = runs.filter(r => r.status !== 'feasible').length

  p1.innerHTML = `
    <h3>${runs.length} runs. ${hours.toFixed(2)} hours of compute. ${infeasible} infeasible.</h3>
    <p class="panel-note">Those are the numbers committed in the repository, unedited.
      Not one run produced a solution that fits in the knapsack. The interesting
      question is not that it failed — it is that the failure is completely
      diagnosable from three lines of the source.</p>`

  const runHost = document.createElement('div')
  p1.appendChild(runHost)

  if (runs.length) {
    const temps = runs.map(r => Math.log10(r.initial_temperature))
    const objs = runs.map(r => r.final_objective)
    const plot = new Plot({
      width: 620, height: 210,
      pad: { top: 16, right: 20, bottom: 40, left: 62 },
      xDomain: [Math.min(...temps) - 0.2, Math.max(...temps) + 0.2],
      yDomain: [Math.min(...objs) * 0.95, Math.max(...objs) * 1.05],
      title: 'Published runs: final objective against starting temperature',
      xLabel: 'Starting temperature (log₁₀)',
    })
    plot.axes({ yFormat: v => fmt(v, 0), xFormat: v => `10^${v.toFixed(0)}` })
    runs.forEach(r => {
      plot.dot(Math.log10(r.initial_temperature), r.final_objective,
        { color: 'var(--series-2)', r: 3.5 })
    })
    plot.mount(runHost)
    const cap = document.createElement('p')
    cap.className = 'plot-caption'
    cap.textContent = 'Every point is a run that ended over capacity. There is no '
      + 'feasible point on this chart because there is no feasible run in the file.'
    runHost.appendChild(cap)
    runHost.appendChild(tableView('The committed runs',
      ['Cooling factor', 'Start temperature', 'Final objective', 'Status', 'Seconds'],
      runs.slice(0, 40).map(r => [
        r.cooling_factor.toString(), r.initial_temperature.toExponential(2),
        r.final_objective.toFixed(0), r.status, r.seconds.toFixed(2),
      ])))
  }

  /* --- panel 2: reproduce it, then fix it ----------------------------- */

  const p2 = document.createElement('section')
  p2.className = 'demo-panel'
  p2.innerHTML = `
    <h3>Three switches, three causes</h3>
    <p class="panel-note">Start on the published settings and the acceptance gauge sits
      at 100% — every uphill move is taken, so the temperature schedule is decoration
      and this is a random walk. Flip the switches one at a time.</p>`

  const grid = document.createElement('div')
  grid.className = 'panel-grid'
  const controls = document.createElement('div')
  controls.className = 'controls'
  const main = document.createElement('div')

  const sT0 = slider({
    label: 'Starting temperature', min: 1, max: 9.1, step: 0.1,
    value: Math.log10(state.T0), format: v => `10^${v.toFixed(1)}`,
    hint: 'The published runs used 10^5.6 to 10^9 against an objective in the hundreds. exp(Δ/T) is then indistinguishable from 1.',
    onInput: v => { state.T0 = 10 ** v; run() },
  })
  const sCool = slider({
    label: 'Cooling factor', min: 0.999, max: 0.999999, step: 0.0000005,
    value: state.cooling, format: v => v.toFixed(6),
    onInput: v => { state.cooling = v; run() },
  })

  const toggles = document.createElement('div')
  toggles.className = 'controls'
  toggles.innerHTML = `
    <div class="control">
      <div class="control-head"><label for="pen">Infeasibility penalty</label></div>
      <select id="pen" class="demo-select">
        <option value="constant">Constant Big-M (as published)</option>
        <option value="proportional">Proportional to the overflow</option>
      </select>
      <p class="control-hint">A constant charge leaves −value free to keep improving as you overpack, so the search is rewarded for overfilling.</p>
    </div>
    <div class="control">
      <div class="control-head"><label for="ret">What gets returned</label></div>
      <select id="ret" class="demo-select">
        <option value="current">The current state (as published)</option>
        <option value="best">The best solution seen</option>
      </select>
      <p class="control-hint">The original class has no incumbent variable at all — <code>get_solution</code> returns whatever the walk last touched.</p>
    </div>`
  toggles.querySelector('#pen').addEventListener('change', e => { state.penalty = e.target.value; run() })
  toggles.querySelector('#ret').addEventListener('change', e => { state.returnMode = e.target.value; run() })

  const actions = document.createElement('div')
  actions.className = 'demo-actions'
  const fixBtn = document.createElement('button')
  fixBtn.textContent = 'Fix all three'
  const resetBtn = document.createElement('button')
  resetBtn.className = 'ghost'
  resetBtn.textContent = 'Back to published'
  actions.append(fixBtn, resetBtn)

  const stats = document.createElement('div')
  stats.className = 'stat-row'
  controls.append(sT0.node, sCool.node, toggles, actions, stats)

  const chartHost = document.createElement('div')
  main.appendChild(chartHost)
  grid.append(controls, main)
  p2.appendChild(grid)

  root.append(p1, p2)

  /* --- run ------------------------------------------------------------- */

  function applyPreset(preset) {
    Object.assign(state, preset)
    sT0.set(Math.log10(state.T0))
    sCool.set(state.cooling)
    toggles.querySelector('#pen').value = state.penalty
    toggles.querySelector('#ret').value = state.returnMode
    run()
  }
  fixBtn.addEventListener('click', () => applyPreset(FIXED))
  resetBtn.addEventListener('click', () => applyPreset(PUBLISHED))

  function run() {
    const started = performance.now()
    const r = anneal(inst, {
      T0: state.T0, coolingFactor: state.cooling, iterations: state.iterations,
      flipsPerMove: state.flips, penalty: state.penalty, returnMode: state.returnMode,
      seed: 12345,
    })
    const ms = performance.now() - started
    const gap = (optimum - r.reported.value) / optimum
    const over = r.reported.load - inst.limit

    stats.innerHTML = `
      <div class="stat${r.uphillRate > 0.9 ? ' is-warn' : ''}">
        <div class="stat-label">Uphill moves accepted</div>
        <div class="stat-value">${pct(r.uphillRate)}</div></div>
      <div class="stat${r.reported.feasible ? ' is-pick' : ' is-warn'}">
        <div class="stat-label">Knapsack load</div>
        <div class="stat-value">${r.reported.load}<small> / ${inst.limit}</small></div></div>
      <div class="stat"><div class="stat-label">Value returned</div>
        <div class="stat-value">${r.reported.value}</div></div>
      <div class="stat${r.reported.feasible && gap < 0.15 ? ' is-pick' : ''}">
        <div class="stat-label">Gap to the proven optimum (${optimum})</div>
        <div class="stat-value">${r.reported.feasible ? pct(gap) : '—'}</div></div>
      <div class="stat"><div class="stat-label">Computed in</div>
        <div class="stat-value">${ms.toFixed(0)}<small> ms</small></div></div>`

    const verdict = document.createElement('p')
    verdict.className = 'plot-caption'
    verdict.innerHTML = r.reported.feasible
      ? `Feasible, and <strong>${pct(gap)}</strong> from the optimum a dynamic program
         proves is ${optimum}. The published sweep spent ${hours.toFixed(2)} hours and
         never got here.`
      : `Infeasible: the knapsack holds ${inst.limit} and this solution loads
         <strong>${r.reported.load}</strong>, over by ${over}. With a constant penalty,
         adding another item still improves the objective — the search is being paid to
         overfill.`

    chartHost.innerHTML = ''
    const tr = r.trace
    const vals = tr.flatMap(t => [t[1], t[2]])
    const plot = new Plot({
      width: 620, height: 260,
      pad: { top: 18, right: 22, bottom: 40, left: 66 },
      xDomain: [0, state.iterations],
      yDomain: [Math.min(...vals) * 1.02, Math.max(...vals) * 1.02],
      title: 'Objective over the search',
      xLabel: 'Iteration',
    })
    plot.axes({ yFormat: v => fmt(v, 0), xFormat: v => (v >= 1000 ? `${v / 1000}k` : String(v)) })
    const series = [
      { name: 'Where the walk is', color: 'var(--series-2)', points: tr.map(t => [t[0], t[1]]) },
      { name: 'Best seen so far', color: 'var(--series-1)', points: tr.map(t => [t[0], t[2]]) },
    ]
    plot.line(series[0].points, { color: series[0].color, width: 1.5, opacity: 0.75 })
    plot.line(series[1].points, { color: series[1].color, width: 2 })
    plot.hover({ series, xFormat: v => `iteration ${Math.round(v)}` })
    plot.mount(chartHost)
    const lg = legend(series)
    if (lg) chartHost.appendChild(lg)
    chartHost.appendChild(verdict)
  }

  run()
}

/* ------------------------------------------------------------------ boot */

const root = document.getElementById('demo-root')
if (root) {
  const raw = document.getElementById('demo-fixture')
  let published = null
  try { published = raw ? JSON.parse(raw.textContent) : null } catch { /* the live part still works */ }
  try {
    mount(root, published)
  } catch (err) {
    root.innerHTML = `<p class="note">The demo failed to start: ${err.message}. Everything
      it would show is written out below and in the markdown version of this page.</p>`
    console.error(err)
  }
}
