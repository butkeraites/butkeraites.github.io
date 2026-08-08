/**
 * Separation-Constrained Layout.
 *
 * A room, a grid of seats, and a rule that says no two occupied seats may sit
 * closer than some distance. Choosing the most seats you can fill is maximum
 * independent set on the conflict graph — solved exactly here, in the browser,
 * so the capacity numbers are facts rather than estimates.
 *
 * Written during COVID for schools. It is a facility-layout problem, and the
 * pandemic is its origin story rather than its subject: the same model covers
 * call-centre desks, exam halls, and anywhere a separation rule meets a fixed
 * floor plan.
 */

import { solve } from './lib/layout.mjs'
import { slider, tableView } from './lib/chart.mjs'

const GUIDELINES = [
  { at: 1.0, label: 'WHO 1 m' },
  { at: 1.5, label: 'EU 1.5 m' },
  { at: 2.0, label: 'CDC 2 m' },
]

export function mount(root) {
  root.innerHTML = ''
  root.classList.add('viz')

  const params = {
    roomWidth: 10, roomDepth: 7,
    seatWidth: 0.5, seatDepth: 0.5,
    rows: 6,
    aisles: [1, 2, 1, 1, 2, 1],
    minDistance: 1.0,
  }
  let showGraph = false

  const panel = document.createElement('section')
  panel.className = 'demo-panel'
  panel.innerHTML = `
    <h3>Move the rule, watch the room empty</h3>
    <p class="panel-note">Every filled seat is one the solver chose; the pale circle around
      it is the exclusion zone the rule demands. Drag the distance past a spacing in the
      floor plan and capacity does not taper — it drops by half, because a whole class of
      seats becomes unusable at once.</p>`

  const grid = document.createElement('div')
  grid.className = 'panel-grid'
  const controls = document.createElement('div')
  controls.className = 'controls'
  const main = document.createElement('div')

  const sDist = slider({
    label: 'Required separation', min: 0.5, max: 3.0, step: 0.05,
    value: params.minDistance, format: v => `${v.toFixed(2)} m`,
    hint: 'Marked at the three guidelines that were actually in force.',
    onInput: v => { params.minDistance = v; render() },
  })
  const sRows = slider({
    label: 'Rows of seats', min: 2, max: 10, step: 1,
    value: params.rows, format: v => v.toFixed(0),
    onInput: v => { params.rows = v; render() },
  })
  const sDepth = slider({
    label: 'Room depth', min: 4, max: 14, step: 0.5,
    value: params.roomDepth, format: v => `${v.toFixed(1)} m`,
    onInput: v => { params.roomDepth = v; render() },
  })

  // One slider per aisle: widening a single gap re-spaces the lattice
  // asymmetrically, which is the control that makes this a layout problem
  // rather than a grid calculator.
  const aisleBox = document.createElement('div')
  aisleBox.className = 'control'
  aisleBox.innerHTML = `<div class="control-head"><label>Aisle widths</label></div>
    <p class="control-hint">One per gap between seat columns. Widen a single aisle and the
    conflict graph changes shape, not just size.</p>`
  const aisleRow = document.createElement('div')
  aisleRow.className = 'aisle-row'
  params.aisles.forEach((w, i) => {
    const inp = document.createElement('input')
    inp.type = 'range'; inp.min = '0.5'; inp.max = '3'; inp.step = '0.1'; inp.value = String(w)
    inp.className = 'aisle-slider'
    inp.setAttribute('aria-label', `Aisle ${i + 1} width in metres`)
    inp.addEventListener('input', () => { params.aisles[i] = Number(inp.value); render() })
    aisleRow.appendChild(inp)
  })
  aisleBox.appendChild(aisleRow)

  const graphToggle = document.createElement('div')
  graphToggle.className = 'demo-actions'
  const gBtn = document.createElement('button')
  gBtn.className = 'ghost'
  gBtn.textContent = 'Show the conflict graph'
  gBtn.addEventListener('click', () => {
    showGraph = !showGraph
    gBtn.textContent = showGraph ? 'Hide the conflict graph' : 'Show the conflict graph'
    render()
  })
  graphToggle.appendChild(gBtn)

  const stats = document.createElement('div')
  stats.className = 'stat-row'
  controls.append(sDist.node, sRows.node, sDepth.node, aisleBox, graphToggle, stats)

  const planHost = document.createElement('div')
  main.appendChild(planHost)
  grid.append(controls, main)
  panel.appendChild(grid)
  root.appendChild(panel)

  function render() {
    const r = solve(params)

    /* --- floor plan ------------------------------------------------- */
    // The canvas is sized to the CONTENT, not to the room: seats that overflow
    // the wall are the point of the excluded-seat message, and clipping them at
    // the room boundary would hide exactly what the strip below claims.
    const contentWidth = Math.max(params.roomWidth,
      ...r.seats.map(s => s.x + params.seatWidth))
    const W = 620
    const pad = 26
    const scale = (W - pad * 2) / contentWidth
    const H = Math.max(params.roomDepth, r.depthUsed) * scale + pad * 2

    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    svg.setAttribute('class', 'plot floorplan')
    svg.setAttribute('role', 'img')
    svg.setAttribute('aria-label',
      `Floor plan: ${r.capacity} of ${r.seatCount} seats occupied at ${params.minDistance.toFixed(2)} metres separation`)

    const X = v => pad + v * scale
    const Y = v => pad + v * scale

    const room = document.createElementNS(ns, 'rect')
    room.setAttribute('x', pad); room.setAttribute('y', pad)
    room.setAttribute('width', params.roomWidth * scale)
    room.setAttribute('height', params.roomDepth * scale)
    room.setAttribute('fill', 'none')
    room.setAttribute('stroke', 'var(--viz-rule)')
    room.setAttribute('stroke-width', 1.5)
    svg.appendChild(room)

    // Exclusion zones first, so seats draw on top of them.
    for (const s of r.usable) {
      if (!r.occupied.has(s.id)) continue
      const c = document.createElementNS(ns, 'circle')
      c.setAttribute('cx', X(s.cx)); c.setAttribute('cy', Y(s.cy))
      c.setAttribute('r', (params.minDistance / 2) * scale)
      c.setAttribute('fill', 'var(--series-1)')
      c.setAttribute('opacity', 0.1)
      svg.appendChild(c)
    }

    if (showGraph) {
      for (const [a, b] of r.edges) {
        const sa = r.seats[a], sb = r.seats[b]
        const l = document.createElementNS(ns, 'line')
        l.setAttribute('x1', X(sa.cx)); l.setAttribute('y1', Y(sa.cy))
        l.setAttribute('x2', X(sb.cx)); l.setAttribute('y2', Y(sb.cy))
        l.setAttribute('stroke', 'var(--series-2)')
        l.setAttribute('stroke-width', 1)
        l.setAttribute('opacity', 0.35)
        svg.appendChild(l)
      }
    }

    for (const s of r.seats) {
      const rect = document.createElementNS(ns, 'rect')
      rect.setAttribute('x', X(s.x)); rect.setAttribute('y', Y(s.y))
      rect.setAttribute('width', params.seatWidth * scale)
      rect.setAttribute('height', params.seatDepth * scale)
      rect.setAttribute('rx', 2)
      if (!s.inside) {
        rect.setAttribute('fill', 'none')
        rect.setAttribute('stroke', 'var(--series-2)')
        rect.setAttribute('stroke-dasharray', '3 2')
        rect.setAttribute('stroke-width', 1)
      } else if (r.occupied.has(s.id)) {
        rect.setAttribute('fill', 'var(--series-1)')
      } else {
        rect.setAttribute('fill', 'var(--viz-grid)')
      }
      const t = document.createElementNS(ns, 'title')
      t.textContent = s.inside
        ? `Row ${s.row + 1}, seat ${s.col + 1} — ${r.occupied.has(s.id) ? 'occupied' : 'left empty'}`
        : `Row ${s.row + 1}, seat ${s.col + 1} — outside the room`
      rect.appendChild(t)
      svg.appendChild(rect)
    }

    planHost.innerHTML = ''
    planHost.appendChild(svg)

    /* --- the solver strip -------------------------------------------- */
    const strip = document.createElement('p')
    strip.className = 'plot-caption solver-strip'
    strip.innerHTML = `<strong>${r.binaries} binary variables · ${r.constraints} conflict
      constraints · ${r.nodes} branch-and-bound nodes · ${r.ms.toFixed(1)} ms</strong> —
      solved to proven optimality${r.exact ? '' : ' (node budget reached; result is a bound)'}.
      ${r.excluded ? `${r.excluded} seat${r.excluded === 1 ? '' : 's'} fall outside the room and
      were excluded; the original model laid them out anyway, overflowing by
      ${r.overflowX.toFixed(2)} m.` : 'Every seat fits inside the room.'}`
    planHost.appendChild(strip)

    /* --- tiles -------------------------------------------------------- */
    const guideline = GUIDELINES.find(g => Math.abs(g.at - params.minDistance) < 0.03)
    stats.innerHTML = `
      <div class="stat is-pick"><div class="stat-label">Seats you can fill</div>
        <div class="stat-value">${r.capacity}<small> / ${r.seatCount}</small></div></div>
      <div class="stat"><div class="stat-label">Room occupancy</div>
        <div class="stat-value">${((r.capacity / r.seatCount) * 100).toFixed(0)}<small>%</small></div></div>
      <div class="stat"><div class="stat-label">${guideline ? guideline.label : 'Separation'}</div>
        <div class="stat-value">${params.minDistance.toFixed(2)}<small> m</small></div></div>`

    planHost.appendChild(tableView(
      `Capacity against the separation rule, for this floor plan`,
      ['Separation', 'Seats', 'Occupancy', 'Conflicts'],
      [0.5, 1.0, 1.25, 1.35, 1.5, 1.75, 2.0, 2.5, 3.0].map(d => {
        const s = solve({ ...params, minDistance: d })
        return [`${d.toFixed(2)} m`, String(s.capacity),
          `${((s.capacity / s.seatCount) * 100).toFixed(0)}%`, String(s.constraints)]
      })))
  }

  render()
}

/* ------------------------------------------------------------------ boot */

const root = document.getElementById('demo-root')
if (root) {
  try {
    mount(root)
  } catch (err) {
    root.innerHTML = `<p class="note">The demo failed to start: ${err.message}. Everything
      it would show is written out below and in the markdown version of this page.</p>`
    console.error(err)
  }
}
