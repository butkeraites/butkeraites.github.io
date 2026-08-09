/**
 * Robust Portfolio Builder — SIROM running for real.
 *
 * Unlike the Hardness demo, which computes in the visitor's browser, this one
 * calls the published solver: OR-Tools' GLOP, scikit-learn's clustering, and
 * the Latin-hypercube sampler, in a container that scales to zero. There is no
 * fidelity caveat to write, because there is no reimplementation.
 *
 * Three things make that architecture invisible rather than merely cheap:
 *
 *   1. The page ships with a pre-rendered default frontier, so first paint is
 *      instant and the page still says something true if the service is down.
 *   2. A warm-up ping fires on load, so the container is running by the time
 *      anyone moves a slider.
 *   3. Requests are debounced — a slider drag is one solve, not forty.
 */

import { Plot, slider, tableView, fmt } from './lib/chart.mjs'
import { hardness } from './lib/hardness.mjs'

// Same-origin. Firebase rewrites /portfolio/** and /status to the Cloud Run
// service, so the browser sees one origin: no CORS preflight, no second
// certificate, no cross-origin allowance in the CSP, and the backend URL never
// appears in the page. One origin is one failure mode instead of two.
const API = ''

const PHASES = [
  ['scenario_solves', 'Scenario LPs', 'var(--series-1)'],
  ['clustering', 'Clustering', 'var(--series-2)'],
  ['cluster_resolves', 'Cluster re-solves', 'var(--series-3)'],
  ['quality_scoring', 'Quality scoring', 'var(--series-4)'],
]

const pct = v => `${(v * 100).toFixed(0)}%`
const pct1 = v => `${(v * 100).toFixed(1)}%`

/* ------------------------------------------------------------------- data */

/**
 * Fired on load so the container is already up when the first slider moves.
 *
 * This matters more than it looks: Cloud Run's own startup_latencies metric puts
 * a cold start on this image at 9.6-12.7 s (mean 11.8), dominated by pulling and
 * starting a 500 MB solver image rather than by Python. A visitor who reads the
 * page for ten seconds never sees it; one who grabs a slider immediately would,
 * so the promise below lets the UI say which of the two is happening.
 */
let warm = null
function warmUp() {
  const started = performance.now()
  warm = fetch(`${API}/status`, { mode: 'cors' })
    .then(() => ({ ok: true, ms: performance.now() - started }))
    .catch(() => ({ ok: false, ms: performance.now() - started }))
  return warm
}

/** True while the container is still starting, so the UI can say so. */
let warmedAt = null

async function optimize(params, signal, attempt = 0) {
  let res
  try {
    res = await fetch(`${API}/portfolio/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal,
    })
  } catch (err) {
    // A cold container, a dropped connection, a network blip: all arrive as the
    // same opaque TypeError. Retry once with a short backoff before telling a
    // visitor the solver is broken, because most of the time it is not.
    if (err.name === 'AbortError' || attempt > 0) throw err
    await new Promise(r => setTimeout(r, 1200))
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    return optimize(params, signal, attempt + 1)
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      detail = body.detail
        ? `${body.detail}${body.violations ? `: ${body.violations.join('; ')}` : ''}`
        : detail
    } catch { /* keep the status line */ }
    throw new Error(detail)
  }
  return res.json()
}

/* -------------------------------------------------------------------- view */

export function mount(root, fixture) {
  root.innerHTML = ''
  root.classList.add('viz')
  warmUp().then(r => { warmedAt = r.ms })

  const state = {
    target_return: 0.12,
    number_of_scenarios: 300,
    uncertainty_scale: 1.0,
    selected: null,
  }
  let inFlight = null
  let debounce = null

  /* --- chrome --------------------------------------------------------- */

  const panel = document.createElement('section')
  panel.className = 'demo-panel'
  panel.innerHTML = `
    <h3>Ask for more return, and watch the frontier collapse.</h3>
    <p class="panel-note">Every point is a portfolio the solver actually found. Its
      position says what it costs in risk and how often it clears your target under
      uncertain returns. Raise the target far enough and the set of achievable
      portfolios does not just shift — it shrinks.</p>`

  const grid = document.createElement('div')
  grid.className = 'panel-grid'

  const controls = document.createElement('div')
  controls.className = 'controls'

  const sTarget = slider({
    label: 'Target return', min: 0.04, max: 0.20, step: 0.005,
    value: state.target_return, format: pct1,
    hint: 'The floor the portfolio must clear. Asset returns are intervals, so clearing it is a probability, not a fact.',
    onInput: v => { state.target_return = v; schedule() },
  })
  const sWidth = slider({
    label: 'Uncertainty width', min: 0.25, max: 3.0, step: 0.05,
    value: state.uncertainty_scale, format: v => `${v.toFixed(2)}×`,
    hint: 'Widens or narrows every return interval about its midpoint. This is the dial the whole method exists for.',
    onInput: v => { state.uncertainty_scale = v; schedule() },
  })
  const sScen = slider({
    label: 'Scenarios sampled', min: 60, max: 800, step: 20,
    value: state.number_of_scenarios, format: v => v.toFixed(0),
    hint: 'More scenarios, a finer frontier — and a longer solve. The cost is shown below.',
    onInput: v => { state.number_of_scenarios = v; schedule() },
  })

  const stats = document.createElement('div')
  stats.className = 'stat-row'
  controls.append(sTarget.node, sWidth.node, sScen.node, stats)

  const main = document.createElement('div')
  const chartHost = document.createElement('div')
  const status = document.createElement('p')
  status.className = 'plot-caption'
  main.append(chartHost, status)

  grid.append(controls, main)
  panel.appendChild(grid)

  /* --- the chosen portfolio ------------------------------------------- */

  const pickPanel = document.createElement('section')
  pickPanel.className = 'demo-panel'
  pickPanel.innerHTML = `
    <h3>Pick one and look inside</h3>
    <p class="panel-note">Click any point on the frontier. Its allocation appears here,
      scored a second time by <a href="/projects/hardness/">Hardness</a> — a different
      published method, running in your browser while this one runs on a server.</p>`
  const pickBody = document.createElement('div')
  pickBody.className = 'panel-grid'
  pickPanel.appendChild(pickBody)

  /* --- where the time went -------------------------------------------- */

  const perfPanel = document.createElement('section')
  perfPanel.className = 'demo-panel'
  perfPanel.innerHTML = `
    <h3>Where the time actually went</h3>
    <p class="panel-note">Measured per phase on the server, for the solve you just
      triggered. Worth watching as you raise the scenario count: the split moves, and
      it is rarely where people assume.</p>`
  const perfBody = document.createElement('div')
  perfPanel.appendChild(perfBody)

  root.append(panel, pickPanel, perfPanel)

  /* --- rendering ------------------------------------------------------- */

  function renderFrontier(data) {
    chartHost.innerHTML = ''
    const ports = data.portfolios || []
    if (!ports.length) {
      chartHost.innerHTML = `<div class="demo-error">The solver found no portfolio that
        can clear a ${pct1(data.target_return)} target under these intervals. That is a
        real answer, not a failure — narrow the uncertainty or lower the target.</div>`
      return
    }

    const xs = ports.map(p => p.robustness)
    const ys = ports.map(p => p.risk)
    const yLo = Math.min(...ys)
    const yHi = Math.max(...ys)
    const padY = (yHi - yLo) * 0.15 || 0.01

    const plot = new Plot({
      width: 620, height: 300,
      pad: { top: 18, right: 24, bottom: 42, left: 58 },
      xDomain: [0, 1],
      yDomain: [Math.max(0, yLo - padY), yHi + padY],
      title: 'Risk against the probability of clearing the target return',
      xLabel: 'Probability of clearing the target',
    })
    plot.axes({
      xTicks: [0, 0.25, 0.5, 0.75, 1], xFormat: pct,
      yFormat: v => v.toFixed(2),
    })

    // The frontier is a trade-off curve: one series, so no legend — the title
    // names what is plotted. Ordered by robustness so the line reads left to right.
    const pts = ports.map(p => [p.robustness, p.risk])
    plot.line(pts, { color: 'var(--series-1)', width: 2, opacity: 0.55 })

    ports.forEach((p, i) => {
      const isSel = state.selected === i
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      dot.setAttribute('cx', plot.x(p.robustness))
      dot.setAttribute('cy', plot.y(p.risk))
      dot.setAttribute('r', isSel ? 7 : 4.5)
      dot.setAttribute('fill', isSel ? 'var(--accent)' : 'var(--series-1)')
      dot.setAttribute('stroke', 'var(--viz-surface)')
      dot.setAttribute('stroke-width', 2)
      dot.style.cursor = 'pointer'
      dot.addEventListener('click', () => { state.selected = i; renderFrontier(data); renderPick(data, i) })
      // A 4.5px dot is a hostile hover target; widen it without widening the mark.
      dot.addEventListener('pointerenter', () => dot.setAttribute('r', isSel ? 8 : 6.5))
      dot.addEventListener('pointerleave', () => dot.setAttribute('r', isSel ? 7 : 4.5))
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title')
      title.textContent = `risk ${p.risk.toFixed(3)} · clears target ${pct1(p.robustness)} · expected return ${pct1(p.expected_return)}`
      dot.appendChild(title)
      plot.layers.mark.appendChild(dot)
    })

    // Label only the extremes: the safest portfolio and the cheapest one.
    const safest = ports[ports.length - 1]
    const cheapest = ports.reduce((b, p) => (p.risk < b.risk ? p : b), ports[0])
    plot.label(safest.robustness, safest.risk, `safest ${pct1(safest.robustness)}`, { dy: -14, anchor: 'end' })
    if (cheapest !== safest) {
      plot.label(cheapest.robustness, cheapest.risk, `lowest risk`, { dy: 20 })
    }

    plot.mount(chartHost)

    chartHost.appendChild(tableView(
      `Every portfolio on the frontier at a ${pct1(data.target_return)} target`,
      ['#', 'Risk', 'Clears target', 'Expected return', 'Cash'],
      ports.map((p, i) => [
        String(i + 1), p.risk.toFixed(4), pct1(p.robustness),
        pct1(p.expected_return), pct1(p.cash),
      ])))
  }

  function renderStats(data) {
    const ports = data.portfolios || []
    const best = ports.length ? Math.max(...ports.map(p => p.robustness)) : 0
    stats.innerHTML = `
      <div class="stat"><div class="stat-label">Portfolios on the frontier</div>
        <div class="stat-value">${ports.length}</div></div>
      <div class="stat is-pick"><div class="stat-label">Best achievable robustness</div>
        <div class="stat-value">${pct1(best)}</div></div>
      <div class="stat"><div class="stat-label">Solved in</div>
        <div class="stat-value">${(data.wall_seconds * 1000).toFixed(0)}<small> ms</small></div></div>`
  }

  function renderPick(data, index) {
    const p = data.portfolios[index]
    const names = data.assets
    pickBody.innerHTML = ''

    const left = document.createElement('div')
    const rows = names.map((n, i) => ({ name: n, w: p.weights[i] }))
      .concat([{ name: 'Cash', w: p.cash, cash: true }])
    const maxW = Math.max(...rows.map(r => r.w), 0.01)
    left.innerHTML = `<div class="alloc">${rows.map(r => `
      <div class="alloc-row${r.cash ? ' is-cash' : ''}">
        <span class="n">${r.name}</span>
        <span class="track"><span class="fill" style="width:${(r.w / maxW) * 100}%"></span></span>
        <span class="v">${pct1(r.w)}</span>
      </div>`).join('')}</div>`

    // The composition: score this allocation with the other published method.
    // Hardness wants the return floor as a "<= 0" constraint, with the uncertain
    // coefficients being the returns themselves.
    const iv = data.intervals
    const eta = hardness([{
      aLo: iv.map(a => -a.high),
      aHi: iv.map(a => -a.low),
      bLo: -data.target_return,
      bHi: -data.target_return,
    }], p.weights, { mode: 'weighted' })

    const right = document.createElement('div')
    right.innerHTML = `
      <div class="stat-row">
        <div class="stat"><div class="stat-label">Risk</div>
          <div class="stat-value">${p.risk.toFixed(3)}</div></div>
        <div class="stat"><div class="stat-label">Clears the target</div>
          <div class="stat-value">${pct1(p.robustness)}</div></div>
        <div class="stat"><div class="stat-label">Expected return</div>
          <div class="stat-value">${pct1(p.expected_return)}</div></div>
        <div class="stat is-pick"><div class="stat-label">Hardness η<br>scored in your browser</div>
          <div class="stat-value">${eta.eta.toFixed(4)}</div></div>
      </div>
      <p class="plot-caption">SIROM produced this portfolio on a server; Hardness scored
        it here, on your machine, with no round trip. The two speak the same problem schema on purpose — one generates robust
        solutions, the other ranks them. SIROM is peer-reviewed (EWSA 2022); Hardness
        comes from the thesis.</p>`

    pickBody.append(left, right)
  }

  function renderPhases(data) {
    const ps = (data.summary && data.summary.phase_seconds) || {}
    const total = Object.values(ps).reduce((a, b) => a + b, 0)
    if (!total) { perfBody.innerHTML = '<p class="plot-caption">This build of the service does not report per-phase timings.</p>'; return }

    const parts = PHASES.map(([key, label, color]) => ({
      key, label, color, secs: ps[key] || 0, share: (ps[key] || 0) / total,
    })).filter(p => p.secs > 0)

    perfBody.innerHTML = `
      <div class="phase-bar">${parts.map(p =>
        `<span style="width:${p.share * 100}%;background:${p.color}" title="${p.label}: ${(p.secs * 1000).toFixed(0)} ms"></span>`).join('')}</div>
      <ul class="phase-key">${parts.map(p =>
        `<li><i style="background:${p.color}"></i>${p.label} <b>${(p.secs * 1000).toFixed(0)} ms</b> <span>(${(p.share * 100).toFixed(0)}%)</span></li>`).join('')}</ul>
      <p class="plot-caption">Total ${(total * 1000).toFixed(0)} ms of solver time for
        ${data.portfolios.length} portfolios from ${state.number_of_scenarios} scenarios.
        These are this server's numbers on one shared vCPU — the same code on a laptop
        splits the time differently, which is exactly why it is measured rather than
        asserted.</p>`

    perfBody.appendChild(tableView('Solver time by phase',
      ['Phase', 'Milliseconds', 'Share'],
      parts.map(p => [p.label, (p.secs * 1000).toFixed(1), `${(p.share * 100).toFixed(1)}%`])))
  }

  function paint(data, { live }) {
    renderStats(data)
    renderFrontier(data)
    renderPhases(data)
    if (data.portfolios.length) {
      const i = state.selected != null && state.selected < data.portfolios.length
        ? state.selected : data.portfolios.length - 1
      state.selected = i
      renderPick(data, i)
    }
    status.textContent = live
      ? `Solved live. ${data.portfolios.length} portfolios from ${state.number_of_scenarios} scenarios.`
      : 'Showing the pre-rendered default. Move a slider to solve live.'
  }

  /** One solve per gesture, not one per pixel. */
  function schedule() {
    clearTimeout(debounce)
    status.textContent = warmedAt === null
      ? 'Waking the solver — it scales to zero, so the first request pays for the container starting. About ten seconds, once.'
      : 'Solving…'
    debounce = setTimeout(run, 220)
  }

  async function run() {
    if (inFlight) inFlight.abort()
    inFlight = new AbortController()
    try {
      const data = await optimize({
        target_return: state.target_return,
        number_of_scenarios: state.number_of_scenarios,
        uncertainty_scale: state.uncertainty_scale,
      }, inFlight.signal)
      paint(data, { live: true })
    } catch (err) {
      if (err.name === 'AbortError') return
      status.innerHTML = ''
      const box = document.createElement('div')
      box.className = 'demo-error'
      box.innerHTML = `<strong>The solver did not answer.</strong> ${err.message}.
        The frontier above is the last good result. Everything this demo shows is also
        written out below and in <a href="/projects/sirom.md">the markdown version</a>.`
      status.appendChild(box)
    }
  }

  // First paint from the fixture: instant, and true even if the service is down.
  if (fixture) paint(fixture, { live: false })
  else run()
}

/* ------------------------------------------------------------------ boot */

const root = document.getElementById('demo-root')
if (root) {
  const raw = document.getElementById('demo-fixture')
  let fixture = null
  try { fixture = raw ? JSON.parse(raw.textContent) : null } catch { /* fall through to a live solve */ }
  try {
    mount(root, fixture)
  } catch (err) {
    root.innerHTML = `<p class="note">The demo failed to start: ${err.message}. Everything
      it would show is written out below and in the markdown version of this page.</p>`
    console.error(err)
  }
}
