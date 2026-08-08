/**
 * Minimal SVG chart primitives.
 *
 * No dependencies, by necessity and by preference: the site's CSP blocks every
 * external host, and a charting library would dwarf the solver it is drawing.
 *
 * The mark specs here are fixed, not per-chart decisions — 2px lines with round
 * caps, markers at least 8px carrying a 2px ring in the surface colour so they
 * stay legible where they overlap, hairline solid gridlines one step off the
 * surface, area fills as a 10% wash rather than a saturated block. Labels are
 * placed selectively: the extreme and the endpoint, never a number on every
 * point.
 *
 * Colours arrive as CSS custom properties so light and dark are two selected
 * palettes rather than one flipped palette.
 */

const NS = 'http://www.w3.org/2000/svg'

export const el = (name, attrs = {}, children = []) => {
  const node = document.createElementNS(NS, name)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue
    node.setAttribute(k, String(v))
  }
  for (const c of [].concat(children)) {
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return node
}

/** Nice round tick values covering [lo, hi]. Readers round anyway; the axis
 *  should round first. */
export function ticks(lo, hi, target = 5) {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / target
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag
  const out = []
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) {
    out.push(Math.abs(t) < step * 1e-9 ? 0 : t)
  }
  return out
}

export const fmt = (v, digits = 2) =>
  Math.abs(v) >= 1000
    ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : v.toFixed(digits).replace(/\.?0+$/, '') || '0'

/**
 * A single plotting frame. Everything is drawn through scales so the callers
 * never touch pixel space.
 */
export class Plot {
  constructor({
    width = 640, height = 200, pad = { top: 14, right: 18, bottom: 28, left: 46 },
    xDomain, yDomain, xLabel, yLabel, title,
  }) {
    this.w = width
    this.h = height
    this.pad = pad
    this.xd = xDomain
    this.yd = yDomain
    this.svg = el('svg', {
      viewBox: `0 0 ${width} ${height}`,
      class: 'plot',
      role: 'img',
      preserveAspectRatio: 'xMidYMid meet',
      ...(title ? { 'aria-label': title } : { 'aria-hidden': 'true' }),
    })
    this.layers = {
      grid: el('g', { class: 'plot-grid' }),
      area: el('g'),
      line: el('g'),
      mark: el('g'),
      label: el('g', { class: 'plot-label' }),
      hover: el('g', { class: 'plot-hover' }),
    }
    for (const g of Object.values(this.layers)) this.svg.appendChild(g)
    this.xLabel = xLabel
    this.yLabel = yLabel
  }

  x(v) {
    const [a, b] = this.xd
    return this.pad.left + ((v - a) / (b - a)) * (this.w - this.pad.left - this.pad.right)
  }

  y(v) {
    const [a, b] = this.yd
    return this.h - this.pad.bottom - ((v - a) / (b - a)) * (this.h - this.pad.top - this.pad.bottom)
  }

  /** Hairline, solid, recessive. Never dashed — a dashed grid reads as data. */
  axes({ xTicks, yTicks, xFormat = v => fmt(v), yFormat = v => fmt(v) } = {}) {
    const xs = xTicks ?? ticks(this.xd[0], this.xd[1], 5)
    const ys = yTicks ?? ticks(this.yd[0], this.yd[1], 4)

    for (const t of ys) {
      this.layers.grid.appendChild(el('line', {
        x1: this.pad.left, x2: this.w - this.pad.right, y1: this.y(t), y2: this.y(t),
      }))
      this.layers.grid.appendChild(el('text', {
        x: this.pad.left - 8, y: this.y(t) + 4, 'text-anchor': 'end', class: 'tick',
      }, yFormat(t)))
    }
    for (const t of xs) {
      this.layers.grid.appendChild(el('text', {
        x: this.x(t), y: this.h - this.pad.bottom + 17, 'text-anchor': 'middle', class: 'tick',
      }, xFormat(t)))
    }
    if (this.xLabel) {
      this.layers.grid.appendChild(el('text', {
        x: (this.pad.left + this.w - this.pad.right) / 2, y: this.h - 2,
        'text-anchor': 'middle', class: 'axis-title',
      }, this.xLabel))
    }
    return this
  }

  path(points) {
    return points.map((p, i) => `${i ? 'L' : 'M'}${this.x(p[0]).toFixed(2)} ${this.y(p[1]).toFixed(2)}`).join('')
  }

  line(points, { color = 'var(--series-1)', width = 2, dash = null, opacity = 1 } = {}) {
    this.layers.line.appendChild(el('path', {
      d: this.path(points), fill: 'none', stroke: color, 'stroke-width': width,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
      ...(dash ? { 'stroke-dasharray': dash } : {}), opacity,
    }))
    return this
  }

  /** A 10% wash under a line, never a saturated block. */
  area(points, { color = 'var(--series-1)' } = {}) {
    const base = this.y(Math.max(this.yd[0], 0))
    const d = this.path(points)
      + `L${this.x(points[points.length - 1][0]).toFixed(2)} ${base.toFixed(2)}`
      + `L${this.x(points[0][0]).toFixed(2)} ${base.toFixed(2)}Z`
    this.layers.area.appendChild(el('path', { d, fill: color, opacity: 0.1, stroke: 'none' }))
    return this
  }

  /** Markers carry a surface-coloured ring: it keeps them readable where they
   *  cross a line, and it is part of the hover target. */
  dot(px, py, { color = 'var(--series-1)', r = 4.5 } = {}) {
    this.layers.mark.appendChild(el('circle', {
      cx: this.x(px), cy: this.y(py), r, fill: color,
      stroke: 'var(--viz-surface)', 'stroke-width': 2,
    }))
    return this
  }

  /** Columns: capped thickness, rounded at the data end, square at the baseline. */
  bars(data, { color = 'var(--series-1)', maxWidth = 24, gap = 2, opacity = 1 } = {}) {
    if (!data.length) return this
    const slot = (this.w - this.pad.left - this.pad.right) / data.length
    const bw = Math.max(1, Math.min(maxWidth, slot - gap))
    const base = this.y(Math.max(this.yd[0], 0))
    const r = Math.min(4, bw / 2)
    for (const [vx, vy] of data) {
      const top = this.y(vy)
      const height = Math.max(0, base - top)
      if (height <= 0.01) continue
      const x = this.x(vx) - bw / 2
      // Rounded only at the data end; the baseline stays square.
      const rr = Math.min(r, height)
      this.layers.mark.appendChild(el('path', {
        d: `M${x} ${base}L${x} ${top + rr}Q${x} ${top} ${x + rr} ${top}`
          + `L${x + bw - rr} ${top}Q${x + bw} ${top} ${x + bw} ${top + rr}L${x + bw} ${base}Z`,
        fill: color, opacity,
      }))
    }
    return this
  }

  /** Sparing by design — the extreme, the endpoint, the one point with a story. */
  label(px, py, text, { dy = -12, anchor = 'middle', color = null } = {}) {
    this.layers.label.appendChild(el('text', {
      x: this.x(px), y: this.y(py) + dy, 'text-anchor': anchor,
      class: 'point-label', ...(color ? { fill: color } : {}),
    }, text))
    return this
  }

  /** A reference line the data is read against (a baseline, a target, a bound). */
  rule(value, text, { axis = 'y', color = 'var(--viz-rule)' } = {}) {
    if (axis === 'y') {
      this.layers.line.appendChild(el('line', {
        x1: this.pad.left, x2: this.w - this.pad.right, y1: this.y(value), y2: this.y(value),
        stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '5 4',
      }))
      if (text) {
        this.layers.label.appendChild(el('text', {
          x: this.w - this.pad.right, y: this.y(value) - 6, 'text-anchor': 'end', class: 'rule-label',
        }, text))
      }
    } else {
      this.layers.line.appendChild(el('line', {
        x1: this.x(value), x2: this.x(value), y1: this.pad.top, y2: this.h - this.pad.bottom,
        stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '5 4',
      }))
    }
    return this
  }

  /**
   * Crosshair and tooltip. An SVG chart in a browser is interactive whether or
   * not you plan for it, so plan for it.
   */
  hover({ series, xFormat = v => fmt(v), onMove = null }) {
    const line = el('line', {
      y1: this.pad.top, y2: this.h - this.pad.bottom,
      stroke: 'var(--viz-rule)', 'stroke-width': 1, opacity: 0,
    })
    this.layers.hover.appendChild(line)
    const dots = series.map(s => {
      const d = el('circle', {
        r: 4.5, fill: s.color, stroke: 'var(--viz-surface)', 'stroke-width': 2, opacity: 0,
      })
      this.layers.hover.appendChild(d)
      return d
    })

    const tip = document.createElement('div')
    tip.className = 'plot-tip'
    tip.hidden = true

    const surface = el('rect', {
      x: this.pad.left, y: this.pad.top,
      width: this.w - this.pad.left - this.pad.right,
      height: this.h - this.pad.top - this.pad.bottom,
      fill: 'transparent', style: 'cursor:crosshair',
    })
    this.layers.hover.appendChild(surface)

    const move = evt => {
      const box = this.svg.getBoundingClientRect()
      const px = ((evt.clientX - box.left) / box.width) * this.w
      const [a, b] = this.xd
      const frac = (px - this.pad.left) / (this.w - this.pad.left - this.pad.right)
      const xv = Math.min(b, Math.max(a, a + frac * (b - a)))

      line.setAttribute('x1', this.x(xv))
      line.setAttribute('x2', this.x(xv))
      line.setAttribute('opacity', 1)

      const rows = []
      series.forEach((s, i) => {
        const pt = s.points.reduce((best, p) =>
          Math.abs(p[0] - xv) < Math.abs(best[0] - xv) ? p : best, s.points[0])
        dots[i].setAttribute('cx', this.x(pt[0]))
        dots[i].setAttribute('cy', this.y(pt[1]))
        dots[i].setAttribute('opacity', 1)
        rows.push(`<span class="k"><i style="background:${s.color}"></i>${s.name}</span><b>${s.format ? s.format(pt[1]) : fmt(pt[1], 3)}</b>`)
      })

      tip.innerHTML = `<div class="tip-x">${xFormat(xv)}</div>${rows.join('')}`
      tip.hidden = false
      const host = this.svg.parentElement
      const hostBox = host.getBoundingClientRect()
      tip.style.left = `${evt.clientX - hostBox.left}px`
      tip.style.top = `${evt.clientY - hostBox.top}px`
      if (onMove) onMove(xv)
    }

    const leave = () => {
      line.setAttribute('opacity', 0)
      dots.forEach(d => d.setAttribute('opacity', 0))
      tip.hidden = true
    }

    surface.addEventListener('pointermove', move)
    surface.addEventListener('pointerleave', leave)
    this.tip = tip
    return this
  }

  /** Wrap in a positioned host so the tooltip can be absolutely placed. */
  mount(parent) {
    const host = document.createElement('div')
    host.className = 'plot-host'
    host.appendChild(this.svg)
    if (this.tip) host.appendChild(this.tip)
    parent.appendChild(host)
    return host
  }
}

/* ------------------------------------------------------------------ legend */

/** Identity must never rest on colour alone; this is the dependable channel.
 *  A single series gets no legend — the title already names it. */
export function legend(series) {
  if (series.length < 2) return null
  const ul = document.createElement('ul')
  ul.className = 'plot-legend'
  for (const s of series) {
    const li = document.createElement('li')
    li.innerHTML = `<i style="background:${s.color}"></i>${s.name}`
    ul.appendChild(li)
  }
  return ul
}

/* ----------------------------------------------------------------- control */

/** A labelled range input whose current value is always visible. */
export function slider({ label, min, max, step, value, format = v => fmt(v), onInput, hint }) {
  const wrap = document.createElement('div')
  wrap.className = 'control'
  const id = `c${Math.abs(label.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))}`
  wrap.innerHTML = `
    <div class="control-head">
      <label for="${id}">${label}</label>
      <output for="${id}">${format(value)}</output>
    </div>
    <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
    ${hint ? `<p class="control-hint">${hint}</p>` : ''}`
  const input = wrap.querySelector('input')
  const out = wrap.querySelector('output')
  input.addEventListener('input', () => {
    const v = Number(input.value)
    out.textContent = format(v)
    onInput(v)
  })
  return { node: wrap, set: v => { input.value = v; out.textContent = format(v); } }
}

/** A table view of the plotted data. Required relief when a series colour sits
 *  below 3:1 on the surface, and the accessible path regardless. */
export function tableView(caption, columns, rows) {
  const details = document.createElement('details')
  details.className = 'table-view'
  details.innerHTML = `<summary>Show the numbers</summary>
    <div class="scroll"><table>
      <caption>${caption}</caption>
      <thead><tr>${columns.map(c => `<th scope="col">${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map((v, i) =>
        i === 0 ? `<th scope="row">${v}</th>` : `<td class="num">${v}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table></div>`
  return details
}
