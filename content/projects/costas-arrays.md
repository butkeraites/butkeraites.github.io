---
slug: costas-arrays
title: The N=32 Wall
tagline: Two numbers nobody can answer, and a search that shows you why.
summary: A verified database of Costas arrays for orders 2–100, algebraic generators built over finite fields, and CP/SAT/LP experiments against the smallest orders where nobody has ever found one — or proved none exists.
status: case-study
order: 3
repo: https://github.com/butkeraites/costas-array
license: MIT
techniques: ["Constraint programming", "SAT solving", "Exhaustive search", "Finite fields"]
stack: ["Python", "C++", "OR-Tools", "kissat"]
metrics: [{"label": "Arrays verified on every CI run", "value": "9,217"}, {"label": "Orders with no known array", "value": "18, smallest is 32"}, {"label": "Exhaustive search, order 15", "value": "2.2 s · 743k nodes"}, {"label": "Exhaustive search, order 17", "value": "does not finish"}]
---

## A permutation with an unreasonable property

A Costas array is a permutation of `1..N` where **every displacement vector
between two dots occurs exactly once**. Draw the dots on a grid, connect any
two, and no other pair anywhere in the array has that same offset.

The property is easy to state and brutal to satisfy. It is also useful: the
autocorrelation of such an arrangement is nearly ideal, which is why they show
up in radar and sonar waveform design.

## The wall

Costas arrays are known for most small orders. Two are missing.

**Nobody has ever found a Costas array of order 32 or 33, and nobody has proved
one does not exist.** Sixteen more orders up to 100 are in the same state. The
algebraic constructions — Welch, Golomb, Lempel, all of them built from
primitive elements of finite fields — produce arrays only for orders tied to
primes and prime powers. Every other order has to be searched. And search runs
into a wall you can feel:

| Order | Exhaustive search |
|---|---|
| 13 | 0.03 s |
| 14 | 0.4 s |
| 15 | 2.2 s, 743k nodes |
| 16 | ~19 s |
| 17 and up | does not finish |

Two orders past a two-second problem, the same program will outlive you.

## What is in the repository

**A verified database.** 9,217 arrays across 82 orders. Every one of them is
re-checked against the definition on every CI run — the difference property is
re-derived from scratch, not trusted. The eighteen orders with no known array
are checked too, against the published table, so the repository cannot quietly
disagree with the literature.

**Generators, not just data.** `costas_generate.py` builds arrays from the
published mathematics with no external input: exhaustive backtracking, the
Welch construction, and Golomb/Lempel over GF(p^k) — including its own
finite-field arithmetic, because the prime-power orders need a real field, not
modular arithmetic. It reproduces the database exactly for orders 2 through 7.
Above that it reproduces a subset, and the repository says so precisely rather
than implying otherwise.

**Search experiments.** Propagator ablations, symmetry breaking over the
dihedral group, LP relaxations sharded by column window, mined clique cuts and
forbidden patterns, and a SAT encoding whose size at order 32 is itself the
story: **1,016,863 variables and 3,048,590 clauses**.

## What the measurements taught me

The honest results are the interesting ones, and they were not what I expected.

Turning the matching propagator *off* cut node counts by only about 16% at
order 14 — while making order 13 roughly **four times faster in wall-clock**.
The dyadic filters changed node counts by **exactly zero** on satisfiable
instances.

The propagators are correct and carefully built. Measured against the thing
that actually matters, most of them do not pay for themselves here. That is
worth more to me than another green benchmark, because it is the kind of result
you only get if you instrument honestly and then publish what came back.
