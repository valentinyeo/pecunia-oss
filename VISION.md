# Vision

Pecunia is an open source, self-hosted personal finance app. Bank sync, categories, budgets, subscriptions, investments, and dashboards live in one repository that runs on your own Cloudflare account. The same capabilities that drive the web app also drive an MCP surface, so an agent can answer money questions with typed tools instead of screen scraping.

It is built on [Rat Stack](https://github.com/joelhooks/rat-stack) and keeps that template's contract, cartridge, machine, and fence rules. `AGENTS.md` is the law; this file is the intent.

## Who it is for

- People who want their transaction history in their own database, on infrastructure they control, without a subscription.
- People who want to read their own repo and see exactly what happens to their data.
- Agents that answer questions about money: how much was spent on a category this month, what a subscription costs per year, which accounts moved. They act through the capabilities, with the schemas and the profile scope that every surface shares.

## What Pecunia will never do

- **Hold user data in source.** No real people, companies, merchants, account ids, amounts, or categories are committed. Fixtures use made-up values such as `Example Ltd` and `Demo Bank`. Production rows live in the database, scoped to a profile.
- **Move money.** Pecunia reads accounts and writes its own records. It never sends a payment, transfers between accounts, or places an order. Bank adapters are read-only.
- **Give advice.** It shows what happened and what a budget allows. It does not recommend an investment, a loan, or a tax position, and it will not present a guess as advice.
- **Phone home.** Sync talks to the provider you configure and to nothing else. There is no telemetry endpoint and no licence check.

## What it promises

- **Money is exact.** An amount is an integer of minor units with a currency code, held in one branded `Money` type. Floating point never touches a balance, a total, or a conversion.
- **Every row belongs to a profile.** A `Profile` is the tenant boundary. Every table carries it, every query filters on it, and no capability returns another profile's rows.
- **Banks are providers behind one port.** Core declares what it needs from a bank; an adapter package implements it; the Wise adapter is the first. Core never imports an adapter, and the lint fence keeps it that way.
- **Jobs are machines.** Sync, import, and reconciliation run as XState machines with declared effects and typed failures, so a half-finished sync is a state you can name, resume, or cancel.
- **One contract, every surface.** Web (RPC), MCP, and the CLI are projections of the same capability. A new query appears in all three or it does not ship.
- **Schema changes are new migrations.** Cloudflare D1 through `packages/database`. A migration that merged is never edited.
- **The checks are real.** TypeScript and Effect diagnostics run strict, lint rules carry the boundaries, and `pnpm turbo run check test build` is the gate. A green gate is the only claim of done.

## The house rule: a clean playground

The house rule is a clean, organized playground where real work gets done. It sets no limit on size. Picture clear, labeled bins on shelves that push in and pull out like game cartridges. Anything good can go in if it passes the cartridge test:

- **Labeled.** One package, one job, named for that job.
- **Push in.** Adding it takes one package plus one `Layer.provide` or Stack line.
- **Pull out.** Removing it takes deleting that package and that line, and `pnpm turbo run check test build` still passes.
- **Self-contained.** It declares its own resources and bindings. Nothing spills into other bins.
- **EZ to trash.** It can be tossed in the garbage without affecting anything else.

A provider adapter, a dashboard, a budget engine, and the MCP surface are all judged by this. It is the reason a private app of this size stays readable.

## Status

In rebuild. This repository started as the Rat Stack template and is becoming Pecunia in slices: the scaffold and fence first, then the domain, then bank sync, then the surfaces. A slice ships only when the gate is green and the template still builds. `README.md` says what runs today.

## Merge by default

- Tests and checks that encode the fence
- Docs that sharpen the intent or the fence
- Cartridges that pass the cartridge test
- Pin bumps that stay exact and reviewed as stack changes
- Made-up fixtures that exercise a real domain rule

## Needs sign-off

- Weakening lefthook, CI, or the `--no-verify` blocks
- Replacing pnpm, Turborepo, Effect, or XState as the default floor
- Adding a dependency version pin, since pins are exact and CI installs cold
- Any schema migration that replaces or deletes stored data
- Anything that would send user data to a third party

## Decision boundaries

- Safe by default: changes that keep the why in `VISION.md` and `AGENTS.md`, keep the fence enforceable, and keep every bin removable
- Needs owner sign-off: new promises, toolchain swaps, or making the fence optional
- Evidence expected: `pnpm turbo run check test build` green, plus the hook policy tests that still block `git commit --no-verify`

## Amendment policy

This document changes when the thesis is wrong. Agents may propose amendments with receipts. A contributor opens a PR with the reasoning and the evidence; the maintainer decides.
