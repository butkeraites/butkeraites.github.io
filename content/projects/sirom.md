---
title: SIROM
tagline: Robust optimization without having to pick an uncertainty budget first.
summary: A sampling-based method that hands you a Pareto frontier of robust solutions and lets you choose the trade-off after seeing the options, instead of committing to an uncertainty budget before you know what it costs.
status: demo
order: 1
demoModule: /demos/robust-portfolio.mjs
runtime: server
fixture: {"name": "robust-portfolio", "url": "https://sirom-1024241903118.us-central1.run.app/portfolio/optimize", "body": {"target_return": 0.12, "number_of_scenarios": 300, "uncertainty_scale": 1.0}}
repo: https://github.com/butkeraites/sirom
license: MIT
techniques: ["Robust optimization", "Monte Carlo sampling", "Linear programming", "Clustering"]
stack: ["Python", "OR-Tools", "scikit-learn", "NumPy"]
metrics: [{"label": "Bandwidth Packing cases matched or beaten", "value": "92.5%"}, {"label": "Pipeline runtime, after optimization", "value": "30.034s → 1.027s (29.2×)"}, {"label": "Frontier envelope reproduced across constraint structures", "value": "18 / 18"}]
---

## The problem with asking first

Plenty of optimization problems have coefficients nobody knows exactly. Demand,
cost, capacity — they live in a *range* rather than at a point. Classical robust
optimization handles this by making you specify, up front, how much uncertainty
you want protection against. That is the uncertainty budget, and it is a strange
thing to ask of a decision-maker: choose your insurance premium before anyone
has told you what the policy covers.

The honest answer is usually "it depends what it costs" — and you cannot know
what it costs until you have solved the problem.

## What SIROM does instead

SIROM takes a linear program whose coefficients are intervals and inverts the
question. It **samples** the uncertain region, **solves** each realization,
**clusters** the resulting solutions by how they behave, and returns a small
**Pareto frontier** of candidates — each labelled with its objective value and
the probability it stays feasible under uncertainty.

You pick the trade-off afterwards, looking at real numbers.

The method was published in *Expert Systems with Applications* in 2022,
co-authored with **Michel Gendreau**, and evaluated on the Bandwidth Packing
Problem, where it matched or outperformed the methods in the literature in
**92.5%** of cases.

## What the frontier actually shows you

Each point is a candidate plan. Moving right buys you a higher probability of
staying feasible; moving up costs you objective value. The interesting part is
that the frontier is rarely smooth — it has cliffs, and the cliffs are where
the real decisions live.

Push the target return high enough and the frontier does not just shift, it
*collapses*: the set of achievable robust solutions shrinks, sampled futures
start coming back infeasible, and the method tells you plainly that what you
asked for is not available at any robustness worth having.

## Engineering notes

The interesting work was not the maths. Getting the pipeline from **30.034
seconds to 1.027 seconds** — a 29.2× speed-up — required per-phase attribution
rather than guessing, and the profile was counter-intuitive: the clustering
step cost more than every linear program in the sweep combined.

That result generalises. When a pipeline mixes a "real" solver with ordinary
data manipulation, intuition consistently blames the solver.

## A note on fidelity

A browser port of this method cannot reproduce the Python output bit-for-bit —
k-means initialisation is randomised, and no two implementations will cluster
identically. The defensible claim, which the repository's own benchmarks
support across 18 of 18 constraint structures, is that the frontier's
**envelope** is invariant: the range of objective values and feasibility
probabilities matches, even when the specific set of points does not.

That distinction is worth stating out loud rather than hiding. A demo that
claims more than it can prove is worse than no demo.
