---
title: Hardness
tagline: How much punishment can this decision take before it breaks?
summary: A continuous, normalized robustness measure for optimization under interval uncertainty — one number in [0,1] that ranks feasible solutions by how well they resist the uncertainty around them, with an exact closed form and a Monte-Carlo estimator that agree.
status: case-study
order: 2
repo: https://github.com/butkeraites/hardness
license: MIT
techniques: ["Robust optimization", "Interval uncertainty", "Monte Carlo", "Formal verification"]
stack: ["Python", "Agda", "FastAPI", "NumPy"]
metrics: [{"label": "Measure range", "value": "η ∈ [0, 1], continuous"}, {"label": "Closed-form evaluation", "value": "1.6 µs"}, {"label": "20,000-scenario simulation", "value": "9 ms"}, {"label": "Core theory", "value": "machine-checked in Agda"}]
---

## The question nobody asks precisely

"Is this solution robust?" is usually answered with a yes or a no, which is a
strange way to talk about a continuous property. Two plans can both be feasible
under nominal data and both survive the worst case, and still be nothing alike
in how they behave in between.

Hardness gives that middle ground a number. For an optimization problem whose
coefficients live in intervals rather than at points, it aggregates
per-constraint worst-case violation into a single scalar **η ∈ [0, 1]**, so
feasible solutions can be *ranked* rather than merely accepted.

## Two engines that have to agree

The measure is computed two ways, and the fact that they agree is the point.

**Closed form** evaluates a generalized Irwin–Hall CDF exactly. It is the right
tool for small problems and it is fast — microseconds per evaluation.

**Monte Carlo** estimates the same quantity from a violations matrix, with
bootstrap confidence intervals. It scales where the closed form does not.

When an exact method and a sampling method built from different mathematics
land on the same curve, you have evidence the definition is sound rather than
an artifact of one implementation.

## Where it gets interesting

Take a fixed budget — say a renewable generation portfolio with a hard $50M
cap — and sweep one decision variable. Cost is constant by construction, so it
cannot rank anything. Three different robustness measures then proceed to
*disagree* about which plan to buy.

That disagreement is the whole argument for caring about the definition. One
measure slopes monotonically the wrong way. Another is pinned flat at zero
across half the range, unable to express an opinion at all. η picks a plan
whose realized shortfall, under twenty thousand simulated futures, is a small
fraction of what the naive choice delivers — at identical spend.

## The part I am most attached to

The core theory is **formalized in Agda** and machine-checked. Not because a
referee asked, but because a robustness measure that is itself unproven is a
peculiar thing to publish.

That formalization is the audit trail: it says the properties claimed for η are
not claimed on the strength of my careful reading of my own proof.

## Composition

Hardness speaks the same problem schema as [SIROM](/projects/sirom/) —
`lb_A, ub_A, lb_b, ub_b, integer_variables` — deliberately. SIROM *produces*
robust solutions; this *scores* them. Two peer-reviewed methods that compose
without an adapter.
