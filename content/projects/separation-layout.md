---
slug: separation-layout
title: Separation-Constrained Layout
tagline: A distancing rule does not reduce capacity gradually. It cuts it in half, at a threshold you cannot see from the rule itself.
summary: Fit the most people into a room subject to a minimum-separation rule — maximum independent set on a conflict graph, solved to proven optimality in the browser, on a floor plan you can rearrange.
status: demo
order: 5
demoModule: /demos/separation-layout.mjs
runtime: browser
repo: https://github.com/butkeraites/otimizador-de-filas
license: MIT
techniques: ["Mixed-integer programming", "Maximum independent set", "Branch and bound", "Facility layout"]
stack: ["JavaScript", "Python", "OR-Tools"]
metrics: [{"label": "Capacity at 1 m separation", "value": "36 of 36 seats"}, {"label": "Capacity at 1.5 m", "value": "18"}, {"label": "Capacity at 2 m", "value": "9"}, {"label": "Solved to proven optimality in", "value": "under 1 ms"}]
---

## The question schools were actually asking

Not "is this room safe" but "how many can I seat". Those are different problems,
and only the second one is answerable. Given a floor plan, a seat grid, and a
separation rule, what is the largest set of seats you can fill?

Mark every pair of seats closer together than the rule allows, and the answer is
the largest set of seats containing no marked pair. That is **maximum
independent set**, and it is NP-hard in general — but a classroom is small, so it
can be solved to proven optimality rather than approximately. Every capacity
number on this page is exact.

## What the demo shows that a table cannot

Capacity does not decline smoothly as you tighten the rule. It sits flat, then
falls off a cliff, then sits flat again. On the floor plan the demo starts with:

| Separation | Seats | What just happened |
|---|---|---|
| 1.00 m | 36 | every seat usable |
| 1.30 m | 36 | still every seat |
| **1.35 m** | **18** | rows are 1.30 m apart, so every row now conflicts with its neighbour |
| 1.95 m | 18 | |
| **2.00 m** | **9** | the tightest aisle is 1.50 m, so seats within a row start conflicting too |

The thresholds are not in the rule. They are in the *furniture* — and they move
when you widen a single aisle, which is why the demo gives you one slider per
aisle rather than a single "spacing" control.

Going from the WHO's 1 m to the CDC's 2 m does not halve this room. It quarters
it.

## Three corrections to the original

The model this is ported from is from 2020, and shipping it needed fixes.

**Room width was a dead input.** The original builds seat positions from the seat
width and the aisle list alone, and never compares the result to the room it was
given. Its own committed example declares a 10 m room and lays the last seat out
to 11.5 m — six of its forty-two seats are outside the wall. The demo excludes
them and says so on screen.

**Row pitch divided by the wrong number.** `(depth − rows × seat) / rows`, where
*m* rows leave *m − 1* gaps between them. The rows never reached the back wall.

**Every conflict constraint was added twice**, once per ordered pair. Harmless to
the optimum, but it doubles the model and makes the reported size misleading.

## On reading the solver strip

Under the plan you will see the real model: how many binary variables, how many
conflict constraints, how many branch-and-bound nodes, and the wall clock. On a
room this size the node count usually equals the seat count, which means the
bound proved optimality without ever branching. That is not a fast solver — it
is an easy instance, and the difference is worth knowing.
