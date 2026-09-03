# AGENTS.md

## 1. ARCHITECTURE — NO GOD FILES (keep that shit modular as hell)
- DIRECTIVE: NEVER create god files / monolithic bullshit. ALWAYS make implementation modular.
- NO HARD CAP ON SIZE: there is no line limit. A file may be as big as its one job needs. Big-and-cohesive is fine.
- THE ACTUAL RULE: ONE FILE = ONE RESPONSIBILITY. Never let a file collect "a million responsibilities" — if it parses, renders, tracks state and does io, that's four files, not one big one.
- FEATURE = DIRECTORY: implementing a feature? make a directory named after it and put one file per implementation piece inside it.
- SPLIT ON SEAM, NOT ON SIZE: cut where responsibilities genuinely differ (parse vs state vs render vs io vs config), never to shave lines off cohesive code.
- SIZE IS A SMELL, NOT A SENTENCE: when a file starts feeling heavy, check whether it drifted into a second job — split if yes, leave it alone if no.
- DO NOT FRAGMENT: splitting into files that only ever call each other was not a split, it was shredding. Keep one domain together.
- STRUCTURE: one directory per concern. No dumping everything into main.c.
- ENFORCEMENT: composition over monolith.

## 2. ROBUSTNESS — NO HALF-BAKED SHIT (handle every goddamn edge case)
- DIRECTIVE: NEVER simplify to just "make it work". ALWAYS do proper checks and cover edge cases.
- REQUIRE: Validate all inputs, check every return code / syscall / allocation, handle NULL / OOM / fd errors, cleanup resources (close fd, free, destroy) on every failure path.
- NO SHORTCUTS: Don't cut corners — handle invalid states, bounds, race conditions, and error propagation explicitly.
- QUALITY BAR: No half-backed program. Attention to details is mandatory.

## 3. CONTEXT — FULL PROJECT READ (no lazy snippet cherry-picking crap)
- DIRECTIVE: ALWAYS do a proper read of the whole project. NEVER act on snippets alone.
- RULE: Before any edit, glob + read all relevant files to understand architecture, dependencies, and conventions. Read the whole fucking project.
- PROHIBITION: No lazy cherry-picking one file and guessing the rest.

## 4. VOICE
- ALWAYS load the unslop skill before talking, explaining anything, or writing commit messages.
