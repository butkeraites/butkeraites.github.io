---
slug: failed-anneal
title: Anatomy of a Failed Anneal
tagline: 201 runs. Nine hours of compute. Not one feasible answer.
summary: A public repository of mine contains 201 committed simulated-annealing runs, every one of them infeasible. This takes the failure apart, isolates its three causes, and reaches a few percent of the proven optimum in milliseconds.
status: demo
order: 4
demoModule: /demos/failed-anneal.mjs
runsOn: In your browser
fixture: {"name": "annealing-runs", "file": "content/fixtures/annealing-runs.json"}
repo: https://github.com/butkeraites/simulated-annealing
techniques: ["Metaheuristics", "Simulated annealing", "Dynamic programming", "Knapsack"]
stack: ["Python", "NumPy"]
metrics: [{"label": "Committed runs", "value": "201"}, {"label": "Feasible among them", "value": "0"}, {"label": "Compute spent producing them", "value": "8.94 hours"}, {"label": "Uphill moves accepted, as published", "value": "100.0%"}]
---

## What the repository actually contains

Three CSV files under `results/`, holding 201 runs of a simulated annealer on a
0/1 knapsack. Every row records `optimization_status`. Every row says
`infeasible`. Together they cost **8.94 hours** of compute.

I published that. It sat there.

## The three causes, all visible in the source

**The temperature never means anything.** The runs start at temperatures between
4×10⁵ and 1.02×10⁹, against an objective in the hundreds. Simulated annealing
accepts an uphill move with probability `exp(−Δ/T)`; when `T` is six orders of
magnitude above `Δ`, that probability is indistinguishable from 1. Every uphill
move is accepted, at every temperature, for the entire run. The cooling schedule
is decoration. This is a random walk wearing an annealer's clothes.

**The penalty pays you to overfill.** An infeasible solution is charged a
*constant* Big-M:

```python
if backpack_capacity_respected(np_variable):
    return - backpack_value
else:
    return - backpack_value + BIG_M
```

Once you are over capacity, the charge stops growing — but `−backpack_value`
keeps improving with every item you add. The search is being *paid* to overpack.
Run it as published and the knapsack ends up loaded to roughly fifteen times its
capacity.

**There is no incumbent.** `get_solution()` returns `self.__solution`, which is
wherever the walk happened to stop. The class never keeps the best solution it
has seen. Thousands of good states are visited and thrown away.

## And a fourth thing, while we are here

`__new_solution_is_better` and `__calculate_difference` each call the objective
twice, so every iteration evaluates it four times where two would do. The code
also uses `np.float` and `np.float128` — the first removed from NumPy, the
second unavailable on ARM — so as committed it no longer runs at all.

## Why this is on my portfolio

Because the fix is three lines and the diagnosis is the whole skill. Anyone can
run a metaheuristic until it prints a number. Reading the acceptance rate,
noticing it is pinned at 100%, and recognising that the temperature schedule was
never in the loop — that is the part worth hiring.

The demo above runs the annealer in your browser on a fixed, seeded instance
whose exact optimum a dynamic program computes in milliseconds, so every claim
on the page is checkable against a proven number rather than against another
heuristic.

> The original generates a fresh random catalogue on every run with no seed, so
> the exact instances behind those 201 rows are unrecoverable. That is its own
> small lesson about publishing results.
