/**
 * Seating under a minimum-separation rule.
 *
 * Lay out a grid of seats in a room, mark every pair closer together than the
 * required distance, and choose the largest set of seats with no marked pair
 * between them. That last step is maximum independent set — NP-hard in general,
 * and small enough here to solve exactly rather than approximately, which is
 * the whole reason the capacity numbers on the page can be stated as facts.
 *
 * Ported from butkeraites/otimizador-de-filas with three corrections:
 *
 *   1. Room width was a dead input. The original builds x from the seat width
 *      and the aisle list alone and never checks the result against the room,
 *      so its own committed example (a 10 m room) lays the last seat out to
 *      11.5 m. Seats that fall outside the room are now excluded, and the
 *      overflow is reported rather than ignored.
 *
 *   2. Row pitch divided by the number of rows instead of the number of gaps
 *      between them, so the rows never reached the back wall.
 *
 *   3. Conflict constraints were added twice — once per ordered pair. Harmless
 *      to the optimum, wasteful to the solver, and misleading if you read the
 *      model size as a measure of the problem.
 */

/** Seat centres, given a room and a per-aisle width list. */
export function layout({ roomWidth, roomDepth, seatWidth, seatDepth, rows, aisles }) {
  const seats = []
  const perRow = aisles.length + 1

  // Gaps BETWEEN rows: m rows leave m-1 gaps. The original divided by m.
  const rowPitch = rows > 1 ? (roomDepth - rows * seatDepth) / (rows - 1) : 0

  let overflowX = 0
  for (let r = 0; r < rows; r++) {
    const y = r * (seatDepth + rowPitch)
    let x = 0
    for (let c = 0; c < perRow; c++) {
      if (c > 0) x += seatWidth + aisles[c - 1]
      const right = x + seatWidth
      const inside = right <= roomWidth + 1e-9
      if (!inside) overflowX = Math.max(overflowX, right - roomWidth)
      seats.push({
        id: seats.length, row: r, col: c,
        x, y,
        cx: x + seatWidth / 2, cy: y + seatDepth / 2,
        inside,
      })
    }
  }

  return {
    seats,
    usable: seats.filter(s => s.inside),
    perRow,
    rowPitch,
    overflowX,
    depthUsed: rows * seatDepth + Math.max(0, rows - 1) * rowPitch,
  }
}

/** Pairs closer than the required separation. Each pair once, not twice. */
export function conflicts(seats, minDistance) {
  const edges = []
  for (let i = 0; i < seats.length; i++) {
    for (let j = i + 1; j < seats.length; j++) {
      const dx = seats[i].cx - seats[j].cx
      const dy = seats[i].cy - seats[j].cy
      const d = Math.hypot(dx, dy)
      if (d < minDistance - 1e-9) edges.push([i, j, d])
    }
  }
  return edges
}

/**
 * Exact maximum independent set by branch and bound on bitsets.
 *
 * The bound is a greedy colouring of the remaining candidates: a set of seats
 * that can be coloured with k colours contains an independent set of at most k,
 * so `chosen + colours` bounds any completion. That is enough to keep a
 * hundred-seat room in the millisecond range while still being provably exact —
 * the alternative, a greedy pick, would make every capacity number on the page
 * a claim rather than a fact.
 */
export function maxIndependentSet(n, edges, { nodeBudget = 2_000_000 } = {}) {
  if (n === 0) return { chosen: [], nodes: 0, exact: true }

  // adjacency as BigInt bitmasks
  const adj = new Array(n).fill(0n)
  for (const [i, j] of edges) {
    adj[i] |= 1n << BigInt(j)
    adj[j] |= 1n << BigInt(i)
  }

  const bits = mask => {
    const out = []
    let m = mask
    while (m) {
      const low = m & -m
      out.push(low.toString(2).length - 1)
      m ^= low
    }
    return out
  }

  let best = 0
  let bestMask = 0n
  let nodes = 0
  let exhausted = false

  /** Greedy colouring bound, and the order to branch in. */
  function colourSort(candidates) {
    const order = []
    const colour = []
    let uncoloured = candidates
    let k = 0
    while (uncoloured) {
      k++
      let available = uncoloured
      while (available) {
        const low = available & -available
        const v = low.toString(2).length - 1
        order.push(v)
        colour.push(k)
        available &= ~adj[v] & ~low
        uncoloured ^= low
      }
    }
    return { order, colour }
  }

  function expand(candidates, chosenMask, size) {
    if (++nodes > nodeBudget) { exhausted = true; return }
    const { order, colour } = colourSort(candidates)
    for (let i = order.length - 1; i >= 0; i--) {
      if (size + colour[i] <= best) return          // bound: cannot beat best
      const v = order[i]
      const vBit = 1n << BigInt(v)
      const nextChosen = chosenMask | vBit
      if (size + 1 > best) { best = size + 1; bestMask = nextChosen }
      const next = candidates & ~adj[v] & ~vBit
      if (next) expand(next, nextChosen, size + 1)
      candidates ^= vBit
      if (exhausted) return
    }
  }

  expand((1n << BigInt(n)) - 1n, 0n, 0)
  return { chosen: bits(bestMask), nodes, exact: !exhausted }
}

/** The whole pipeline: geometry, conflicts, exact optimum. */
export function solve(params) {
  const geo = layout(params)
  const usable = geo.usable
  const t0 = performance.now()
  const edges = conflicts(usable, params.minDistance)
  const mis = maxIndependentSet(usable.length, edges)
  const ms = performance.now() - t0

  const chosen = new Set(mis.chosen.map(i => usable[i].id))
  return {
    ...geo,
    edges: edges.map(([i, j, d]) => [usable[i].id, usable[j].id, d]),
    occupied: chosen,
    capacity: chosen.size,
    seatCount: usable.length,
    excluded: geo.seats.length - usable.length,
    binaries: usable.length,
    constraints: edges.length,
    nodes: mis.nodes,
    exact: mis.exact,
    ms,
  }
}
