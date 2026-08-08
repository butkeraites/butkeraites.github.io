/**
 * Simulated annealing on a 0/1 knapsack — faithful to butkeraites/simulated-annealing,
 * with each of its three defects switchable.
 *
 * The point of the port is not to run the algorithm. It is to make three
 * specific mistakes visible, then let you turn each one off and watch what
 * happens:
 *
 *   RETURN MODE       the original returns the CURRENT state. There is no
 *                     incumbent anywhere in the class, so whatever random walk
 *                     it happened to end on is the answer.
 *
 *   TEMPERATURE       the published runs start at T0 between 4e5 and 1.02e9
 *                     against an objective in the hundreds. exp(Δ/T) is then
 *                     ~1 for every move, so every uphill step is accepted and
 *                     the temperature schedule never does anything.
 *
 *   PENALTY           infeasible solutions are charged a CONSTANT Big-M. Adding
 *                     another item to an already-overfull knapsack still lowers
 *                     the objective, so overpacking is rewarded.
 *
 * The instance is fixed and seeded here. The original generates a fresh random
 * catalogue on every run with no seed, so its exact instances are unrecoverable
 * — which is itself part of why 201 runs produced no comparable result.
 */

/** mulberry32 — deterministic, so the demo is reproducible across reloads. */
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The same shape as the original: 2n products, capacities in 1..25, values in
 * 25..49, and a knapsack that holds n units.
 */
export function makeInstance({ items = 50, seed = 20260808 } = {}) {
  const rand = rng(seed)
  const n = 2 * items
  const capacity = new Int32Array(n)
  const value = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    capacity[i] = 1 + Math.floor(rand() * 25)
    value[i] = 25 + Math.floor(rand() * 25)
  }
  return { n, capacity, value, limit: items, bigM: Math.max(...value) * n }
}

/** Exact optimum by dynamic programming — the yardstick the heuristic is
 *  measured against. O(n · limit), trivial at this size. */
export function exactOptimum({ n, capacity, value, limit }) {
  const best = new Int32Array(limit + 1)
  for (let i = 0; i < n; i++) {
    const c = capacity[i]
    const v = value[i]
    for (let w = limit; w >= c; w--) {
      const cand = best[w - c] + v
      if (cand > best[w]) best[w] = cand
    }
  }
  return best[limit]
}

export const load = (x, inst) => {
  let t = 0
  for (let i = 0; i < inst.n; i++) if (x[i]) t += inst.capacity[i]
  return t
}

export const packedValue = (x, inst) => {
  let t = 0
  for (let i = 0; i < inst.n; i++) if (x[i]) t += inst.value[i]
  return t
}

/**
 * The objective, in both flavours.
 *
 * `constant` is the original: a fixed Big-M once the knapsack overflows, which
 * leaves the -value term free to keep improving as you overpack.
 * `proportional` charges for the overflow itself, so the gradient points back
 * toward feasibility.
 */
export function objective(x, inst, penalty) {
  const v = packedValue(x, inst)
  const over = load(x, inst) - inst.limit
  if (over <= 0) return -v
  return penalty === 'constant' ? -v + inst.bigM : -v + inst.bigM * 0.02 * over
}

/**
 * Run the annealer.
 *
 * Returns the trace the demo plots plus the two answers — what the original
 * would have reported, and what it should have.
 */
export function anneal(inst, {
  T0 = 1.0201e9,
  coolingFactor = 0.999999,
  iterations = 20000,
  flipsPerMove = 1,
  penalty = 'constant',
  returnMode = 'current',
  seed = 12345,
  traceEvery = 40,
} = {}) {
  const rand = rng(seed)
  const x = new Uint8Array(inst.n)
  let T = T0

  let current = objective(x, inst, penalty)
  let best = current
  const bestX = new Uint8Array(inst.n)

  let uphillOffered = 0
  let uphillAccepted = 0
  const trace = []

  for (let it = 0; it < iterations; it++) {
    // Perturb: flip k random bits, exactly as the original does.
    const flipped = []
    for (let f = 0; f < flipsPerMove; f++) {
      const p = Math.floor(rand() * inst.n)
      x[p] ^= 1
      flipped.push(p)
    }
    const candidate = objective(x, inst, penalty)
    const delta = candidate - current

    let accept
    if (delta < 0) {
      accept = true
    } else {
      uphillOffered++
      // The original computes exp((current - candidate) / T) — with T orders of
      // magnitude above the objective scale this is ~1 and always accepted.
      accept = rand() <= Math.exp(-delta / T)
      if (accept) uphillAccepted++
    }

    if (accept) {
      current = candidate
      if (current < best) {
        best = current
        bestX.set(x)
      }
    } else {
      for (const p of flipped) x[p] ^= 1   // undo
    }

    T *= coolingFactor

    if (it % traceEvery === 0 || it === iterations - 1) {
      trace.push([it, current, best, T])
    }
  }

  const reported = returnMode === 'current' ? x : bestX
  const reportedLoad = load(reported, inst)
  const reportedValue = packedValue(reported, inst)

  return {
    trace,
    uphillRate: uphillOffered ? uphillAccepted / uphillOffered : 0,
    uphillOffered,
    finalTemperature: T,
    reported: {
      value: reportedValue,
      load: reportedLoad,
      feasible: reportedLoad <= inst.limit,
      items: Array.from(reported).reduce((a, b) => a + b, 0),
    },
    incumbent: {
      value: packedValue(bestX, inst),
      load: load(bestX, inst),
      feasible: load(bestX, inst) <= inst.limit,
    },
  }
}
