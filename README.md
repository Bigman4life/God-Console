# God Console

> You begin with absolutely nothing. No menus. No world. No tutorial.
> Just an endless black void and a single blinking command prompt.
>
> ```
> >
> ```
>
> **Language is the interface. The player is reality itself.**

This repo is the first playable slice of that idea — the iconic opening moment,
made real and runnable, with an engine architecture designed to grow toward the
full vision.

## Run it

No build step. Just open the file:

```bash
# from the repo root
open index.html        # macOS
xdg-open index.html    # Linux
# or drag index.html into any browser
```

Then type. Start with:

```
let there be light
```

…and watch reality assemble itself.

## Commands this slice understands

It uses a **deterministic keyword interpreter** (no AI key required), so the
opening feels real today:

| Type something like… | What happens |
|---|---|
| `let there be light` | The genesis sequence: light → stars → a sun → a world |
| `create an ocean planet` | Climate shifts to a calm water world |
| `start an ice age` | Snow spreads, oceans freeze, civilizations falter |
| `make it volcanic` | Black sand, obsidian peaks, lava |
| `increase gravity to 2G` | Gravity changes; the world adjusts |
| `remove gravity` | Matter drifts free |
| `add three moons` | Moons emerge and begin orbiting |
| `make the oceans purple` | Ocean hue changes |
| `double the size of the sun` | The star swells; the climate reacts |
| `create intelligent life` | Life evolves… and eventually looks back at *you* |
| `accelerate time` / `pause` | Time scales up to millions of years/sec, or freezes |
| `zoom out` / `zoom in` | Step through Quantum → … → Universe |
| `undo` · `save` · `help` | Step back · export the universe · list commands |

The UI fades while you observe and returns when you act — the world is the HUD.

## Architecture

The slice mirrors the five cooperating systems from the design doc, scaled into
one file (`index.html`). Each maps to a clean upgrade path:

```
sentence ─▶ INTERPRETER ─▶ intent {verb, params} ─▶ EXECUTE ─▶ WORLD STATE
                                                                  │
                                          SIM LAYER (physics/time)│ per frame
                                                                  ▼
                                                      RENDERER (progressive)
```

| System | Today (this slice) | "Ultra code" upgrade |
|---|---|---|
| **Interpreter** | keyword → `intent` object | swap in an LLM that emits the *same* `intent` JSON → true open-ended language |
| **World State** | single `World` object + history (undo) + `it` memory | persistent DB, branching timelines |
| **Procedural gen** | canvas blobs, particles, orbits | terrain/material/creature generators driven by AI descriptions |
| **Sim layer** | time scale, gravity, climate, orbits | climate/ecosystem/evolution/economy models |
| **Renderer** | staged 2D canvas build | streamed 3D LOD assets (WebGL/WebGPU) |

The key design bet (same as the doc): **the AI never renders pixels.** It
interprets and describes; a deterministic engine builds. That keeps things
responsive and lets the creative layer be swapped or upgraded independently.

## The honest roadmap

**Real now**
- Void + prompt + "language is the only interface" UX
- Progressive, animated genesis
- Deterministic intent engine: gravity, moons, climate, color, time, zoom, undo, save

**Next (with an LLM as the interpreter)**
- Open-ended natural language → structured edits
- Conversational memory ("make *it* darker")
- Scripted-but-emergent civilizations that "discover the player"

**Research-tier (be realistic)**
- Real-time arbitrary 3D geometry from text
- Genuinely emergent (not faked) civilization history
- Live shared multiplayer universes

## Status

Vertical slice. One file, no dependencies. The point is to prove the *feeling* —
that a sentence can write reality into existence — and to leave clean seams where
the AI and 3D layers plug in later.
