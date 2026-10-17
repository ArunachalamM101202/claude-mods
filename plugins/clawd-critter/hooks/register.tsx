import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

// ── state the band draws from ──────────────────────────────────────────────

const isHidden = atom({ plugin: 'clawd-critter', key: 'isHidden' } as const, false)

// ── the stage: a pixel canvas drawn with half blocks, two pixels per cell ──

const KEY = 'critter'
const ROWS = 6
const H = ROWS * 2
const GROUND = H - 1
const TOP = H - 2 - 5 // sprite top row while standing
const TICK_MS = 100

const NONE = -1
const DEFAULT = 0x01000000
const ORANGE = 0xd97757
const EYE = 0x2a1a14
const DIRT = 0x4a4a4a
const WHITE = 0xf2f2f2
const YELLOW = 0xffd166
const BLUE = 0x6cb6ff
const GREEN = 0x4ade80
const RED = 0xff5f56
const PINK = 0xff7eb6
const BROWN = 0x8b5a2b
const DARK_BROWN = 0x5c3a1a
const GRAY = 0x9a9a9a
const SCREEN = 0x1e1e1e
const ROPE = 0xc8a165
const CONFETTI = [YELLOW, PINK, BLUE, GREEN, 0xf4a582]

type Act =
  | 'sleep' | 'walk' | 'wave' | 'bash' | 'test' | 'install' | 'add' | 'danger'
  | 'commit' | 'push' | 'pull' | 'inspect' | 'branch' | 'merge' | 'stash'
  | 'edit' | 'web' | 'agent' | 'todo' | 'celebrate' | 'dizzy' | 'pet'

type Shape = 'dot' | 'z' | 'heart'
type Particle = {
  x: number; y: number; vx: number; vy: number; g: number
  life: number; c: number; shape: Shape
}

const LINES = {
  sleep: ['zzz… napping until you need me', 'dreaming of perfectly linted code', '*snore* … five more minutes'],
  wave: ['oh! a task! let’s gooo', '*stretches tiny claws* ready!', 'hi hi hi, on it'],
  walk: ['hmm… thinking very hard', 'pacing dramatically', 'brain go brrr', 'scuttle scuttle', 'consulting my inner crab'],
  bash: ['tap tap tap on the tiny terminal', 'typing with both claws', 'hacker voice: I’m in'],
  test: ['running tests… please be green please be green', 'sweating nervously at the test runner', 'claws crossed'],
  install: ['carrying all of node_modules on my head', 'stacking dependencies like a pro', 'deliveries! so many boxes'],
  add: ['packing files into the staging box', 'git add: box, box, box'],
  danger: ['eek! handle with care', 'covering my eyes for this one', 'I did not see anything'],
  commit: ['*stamp* commit made!', 'another green dot for the ground', 'saving our progress, proudly'],
  push: ['heave-ho! pushing to the remote', 'shoving commits uphill', 'special delivery for origin'],
  pull: ['tug-of-war with origin', 'reeling in fresh commits', 'pulling with all four little legs'],
  inspect: ['sniff sniff… investigating', 'detective mode: on', 'reading very carefully, squinting'],
  branch: ['hopping to another branch', 'swinging from branch to branch'],
  merge: ['merging timelines, do not panic', 'holding two branches together with tape'],
  stash: ['hiding changes in my secret box', 'stash! nobody saw that'],
  edit: ['bonk bonk, hammering code into shape', 'tiny carpenter at work'],
  web: ['beep boop, receiving the internet', 'antenna up, surfing the web'],
  agent: ['called in a tiny friend for help', 'teamwork makes the dream work'],
  todo: ['making a list, checking it twice'],
  celebrate: ['ta-da! all done', 'victory wiggle!', 'nailed it'],
  dizzy: ['oof… that one tripped me', 'seeing stars, gimme a sec'],
  pet: ['*happy clicking noises*', 'aww, thank you', '*purrs in crab*'],
  testPass: ['tests passed! happy dance'],
  testFail: ['tests failed… lying down for a sec'],
  denied: ['ok ok, not doing that one', '*sulks politely*'],
  aborted: ['stopping! stopping!', 'screeching halt'],
} satisfies Record<string, string[]>

type Offsets = ReadonlyArray<readonly [number, number]>
const RING: Offsets = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
const ZED: Offsets = [[0, 0], [1, 0], [2, 0], [3, 0], [2, 1], [1, 2], [0, 3], [1, 3], [2, 3], [3, 3]]
const HEART: Offsets = [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, 2]]

const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)] ?? ''

// ── classifying what Claude is doing ───────────────────────────────────────

const TEST = /\b(jest|vitest|pytest|mocha|rspec|phpunit|(npm|pnpm|yarn|bun)( run)? test|cargo test|go test|make test|deno test)\b/
const INSTALL = /\b((npm|pnpm|yarn|bun) (install|add|i|ci)|pip3? install|brew install|cargo (add|install)|apt(-get)? install|gem install|poetry add|uv (add|pip install))\b/
const DANGER = /\b(rm\s+-\w*[rf]|sudo|git\s+reset\s+--hard|git\s+clean\s+-\w*f|git\s+push\s+.*(--force|-f\b))/
const GIT = /\bgit\s+(?:-C\s+\S+\s+|-c\s+\S+\s+)*([a-z][\w-]*)/

function classifyBash(cmd: string): Act {
  if (DANGER.test(cmd)) return 'danger'
  const git = GIT.exec(cmd)?.[1]
  if (git !== undefined) {
    if (git === 'commit') return 'commit'
    if (git === 'push') return 'push'
    if (git === 'pull' || git === 'fetch' || git === 'clone') return 'pull'
    if (git === 'add') return 'add'
    if (['status', 'diff', 'log', 'show', 'blame', 'grep'].includes(git)) return 'inspect'
    if (['checkout', 'switch', 'branch', 'worktree'].includes(git)) return 'branch'
    if (['merge', 'rebase', 'cherry-pick', 'revert'].includes(git)) return 'merge'
    if (git === 'stash') return 'stash'
  }
  if (TEST.test(cmd)) return 'test'
  if (INSTALL.test(cmd)) return 'install'
  if (/\b(curl|wget|http)\b/.test(cmd)) return 'web'
  return 'bash'
}

function classify(tool: string, input: Record<string, unknown>): { act: Act; detail: string } {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const base = (p: string) => p.split('/').pop() ?? p
  const clip = (s: string) => (s.length > 48 ? `${s.slice(0, 47)}…` : s)

  if (tool === 'Bash') {
    const cmd = str('command')
    return { act: classifyBash(cmd), detail: clip(cmd.split('\n')[0] ?? '') }
  }
  if (['Read', 'Grep', 'Glob', 'LS'].includes(tool)) {
    return { act: 'inspect', detail: `${tool} ${clip(base(str('file_path')) || str('pattern'))}` }
  }
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    return { act: 'edit', detail: `${tool} ${base(str('file_path') || str('notebook_path'))}` }
  }
  if (tool === 'WebFetch' || tool === 'WebSearch') {
    return { act: 'web', detail: clip(str('url') || str('query')) }
  }
  if (tool === 'Agent' || tool === 'Task') return { act: 'agent', detail: clip(str('description')) }
  if (tool === 'TodoWrite') return { act: 'todo', detail: 'TodoWrite' }
  if (tool.startsWith('mcp__')) return { act: 'web', detail: tool.split('__').slice(1).join(' ') }
  return { act: 'walk', detail: tool }
}

// ── cells: pixels → half-block cells → base64 ──────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  const at = (k: number) => bytes[k] ?? 0
  const ch = (n: number) => B64.charAt(n & 63)
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (at(i) << 16) | (at(i + 1) << 8) | at(i + 2)
    out += ch(n >> 18) + ch(n >> 12) + ch(n >> 6) + ch(n)
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = at(i) << 16
    out += `${ch(n >> 18)}${ch(n >> 12)}==`
  } else if (rest === 2) {
    const n = (at(i) << 16) | (at(i + 1) << 8)
    out += `${ch(n >> 18)}${ch(n >> 12)}${ch(n >> 6)}=`
  }
  return out
}

function encode(px: Int32Array, w: number): string {
  const words = new Uint32Array(w * ROWS * 3)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < w; c++) {
      const top = px[2 * r * w + c] ?? NONE
      const bottom = px[(2 * r + 1) * w + c] ?? NONE
      const o = (r * w + c) * 3
      if (top === NONE && bottom === NONE) {
        words[o] = 0x20; words[o + 1] = DEFAULT; words[o + 2] = DEFAULT
      } else if (bottom === NONE) {
        words[o] = 0x2580; words[o + 1] = top; words[o + 2] = DEFAULT
      } else if (top === NONE) {
        words[o] = 0x2584; words[o + 1] = bottom; words[o + 2] = DEFAULT
      } else {
        words[o] = 0x2580; words[o + 1] = top; words[o + 2] = bottom
      }
    }
  }
  return toBase64(new Uint8Array(words.buffer))
}

// ── the critter's world ────────────────────────────────────────────────────

export const register: Register = on => {
  let capText = LINES.sleep[0]
  let capDetail = ''
  let capDirty = false
  let timer: { cancel: () => void } | undefined

  let t = 0
  let act: Act = 'sleep'
  let actStart = 0
  let timedUntil = 0
  let revertAt = -1
  let active = 0
  let working = false
  let commits = 0
  let x = 4
  let dir: 1 | -1 = 1
  let particles: Particle[] = []

  let bandId = ''
  let width = 80
  let hidden = false

  const say = (lines: string[], detail = '') => {
    capText = pick(lines)
    capDetail = detail
    capDirty = true
  }

  const setAct = (next: Act, detail = '', lines = LINES[next]) => {
    act = next
    actStart = t
    timedUntil = 0
    say(lines, detail)
  }

  const setTimed = (next: Act, ticks: number, lines = LINES[next], detail = '') => {
    setAct(next, detail, lines)
    timedUntil = t + ticks
    revertAt = -1
  }

  const emit = (p: Partial<Particle> & { x: number; y: number }) =>
    particles.push({ vx: 0, vy: 0, g: 0, life: 20, c: WHITE, shape: 'dot', ...p })

  const burst = (cx: number, cy: number, n: number, colors: number[]) => {
    for (let i = 0; i < n; i++) {
      emit({
        x: cx, y: cy,
        vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 1.2 - 0.3, g: 0.12,
        life: 14 + Math.floor(Math.random() * 8),
        c: colors[i % colors.length] ?? YELLOW,
      })
    }
  }

  // ── simulation step ──

  const maxX = () => Math.max(2, width - 13)
  const walk = (every: number) => {
    if (t % every !== 0) return
    x += dir
    if (x >= maxX()) { x = maxX(); dir = -1 }
    if (x <= 1) { x = 1; dir = 1 }
  }
  const front = (lx: number) => (dir === 1 ? x + lx : x + 10 - lx)

  const step = () => {
    const age = t - actStart
    x = Math.min(Math.max(1, x), maxX())

    switch (act) {
      case 'walk': case 'web': case 'agent': walk(1); break
      case 'inspect': case 'install': case 'add': walk(2); break
      case 'push':
        dir = 1
        if (t % 2 === 0) x += 1
        if (x + 16 >= width) { burst(width - 3, TOP, 10, CONFETTI); x = 1 }
        break
      case 'pull':
        dir = 1
        if (t % 3 === 0 && x > 1) x -= 1
        break
      case 'commit':
        if (age === 4) burst(x + 5, TOP - 2, 8, [GREEN, YELLOW])
        break
      case 'celebrate':
        if (t % 2 === 0) emit({ x: Math.random() * width, y: 0, vy: 0.35, vx: (Math.random() - 0.5) * 0.4, life: 30, c: CONFETTI[t % CONFETTI.length] ?? YELLOW })
        break
      case 'sleep':
        if (t % 18 === 0) emit({ x: x + 10, y: TOP, vx: 0.12, vy: -0.12, life: 30, c: WHITE, shape: 'z' })
        break
      case 'pet':
        if (t % 5 === 0) emit({ x: x + 3 + Math.random() * 4, y: TOP - 1, vx: (Math.random() - 0.5) * 0.3, vy: -0.25, life: 20, c: PINK, shape: 'heart' })
        break
      case 'test': case 'danger': case 'merge':
        if (t % 6 === 0) emit({ x: front(dir === 1 ? 1 : 9), y: TOP, vx: -dir * 0.4, vy: -0.5, g: 0.1, life: 10, c: BLUE })
        break
      case 'edit':
        if (t % 6 === 3) burst(front(14), H - 3, 3, [YELLOW, WHITE])
        break
      case 'web':
        break
      case 'stash':
        if (t % 8 === 0) emit({ x: front(10), y: TOP + 2, vx: dir * 0.5, vy: -0.7, g: 0.12, life: 11, c: CONFETTI[(t / 8) % CONFETTI.length] ?? YELLOW })
        break
    }
    if (act === 'web' && t % 4 === 0) emit({ x: x + 5, y: TOP - 3, vx: dir * 0.6, vy: -0.05, life: 12, c: BLUE })

    particles = particles.filter(p => {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life -= 1
      return p.life > 0 && p.y < H && p.x > -4 && p.x < width + 4
    })
    if (particles.length > 120) particles = particles.slice(-120)
  }

  // ── drawing ──

  const draw = (): Int32Array => {
    const w = width
    const px = new Int32Array(w * H).fill(NONE)
    const set = (cx: number, cy: number, c: number) => {
      const ix = Math.round(cx)
      const iy = Math.round(cy)
      if (ix >= 0 && ix < w && iy >= 0 && iy < H) px[iy * w + ix] = c
    }
    const rect = (x0: number, y0: number, rw: number, rh: number, c: number) => {
      for (let dy = 0; dy < rh; dy++) for (let dx = 0; dx < rw; dx++) set(x0 + dx, y0 + dy, c)
    }
    const age = t - actStart

    // ground, and one green dot per commit made this session
    for (let c = 0; c < w; c += 3) set(c, GROUND, DIRT)
    for (let i = 0; i < commits && 2 + i * 4 < w; i++) { set(2 + i * 4, GROUND, GREEN); set(3 + i * 4, GROUND, GREEN) }

    // pose
    const walking = ['walk', 'web', 'agent', 'inspect', 'install', 'add', 'push', 'pull'].includes(act)
    const sit = act === 'sleep' || act === 'dizzy'
    let legs = walking ? (t >> 1) % 2 : 0
    if (act === 'test') legs = t % 2
    let eyes: 'open' | 'closed' | 'happy' = t % 41 === 0 ? 'closed' : 'open'
    if (sit || act === 'danger') eyes = 'closed'
    if (act === 'celebrate' || act === 'pet' || act === 'wave') eyes = 'happy'
    let armsUp = false
    if (act === 'bash' || act === 'test') armsUp = (t >> 1) % 2 === 0
    if (act === 'wave') armsUp = (t >> 2) % 2 === 0
    if (act === 'celebrate' || act === 'danger') armsUp = true
    let lift = 0
    if (act === 'commit') lift = [0, 1, 2, 3, 3, 2, 1, 0, 0, 0][age % 10] ?? 0
    if (act === 'celebrate' || act === 'branch') lift = [0, 1, 2, 2, 1, 0][t % 6] ?? 0
    let ox = x
    if (act === 'danger' || act === 'merge') ox += t % 2 === 0 ? 1 : -1
    if (act === 'pet') ox += (t >> 2) % 2
    if (act === 'commit' && lift > 0) armsUp = true
    const oy = TOP - lift + (sit ? 1 : 0)
    const fx = (lx: number) => (dir === 1 ? ox + lx : ox + 10 - lx)

    // props behind the critter
    if (act === 'agent') {
      // a tiny friend trailing behind
      const bx = dir === 1 ? ox - 8 : ox + 14
      const by = H - 5
      rect(bx, by, 5, 2, ORANGE)
      set(bx + 1, by, EYE); set(bx + 3, by, EYE)
      set(bx + ((t >> 1) % 2), by + 2, ORANGE); set(bx + 3 + ((t >> 1) % 2), by + 2, ORANGE)
    }
    if (act === 'pull') {
      for (let c = ox + 11; c < w; c++) set(c, oy + 3, ROPE)
    }
    if (act === 'merge') {
      for (let c = 0; c < 6; c++) { set(fx(-6 + c), oy - 2 + (c >> 1), BLUE); set(fx(16 - c), oy - 2 + (c >> 1), GREEN) }
    }

    // the critter
    const body = (cx: number, cy: number) => set(ox + cx, oy + cy, ORANGE)
    for (let cy = 0; cy < 5; cy++) for (let cx = 1; cx <= 9; cx++) body(cx, cy)
    if (armsUp) { body(0, 0); body(0, 1); body(10, 0); body(10, 1) } else { body(0, 3); body(10, 3) }
    const [e1, e2] = dir === 1 ? [4, 8] : [2, 6]
    if (eyes !== 'closed') { set(ox + e1, oy + 1, EYE); set(ox + e2, oy + 1, EYE) }
    if (eyes !== 'happy') { set(ox + e1, oy + 2, EYE); set(ox + e2, oy + 2, EYE) }
    if (!sit) for (const c of legs === 0 ? [2, 4, 6, 8] : [1, 3, 7, 9]) body(c, 5)

    // props in front and above
    switch (act) {
      case 'bash': case 'test': {
        const bx = dir === 1 ? ox + 12 : ox - 9
        rect(bx, H - 7, 8, 6, GRAY)
        rect(bx + 1, H - 6, 6, 4, SCREEN)
        set(bx + 1, H - 6, GREEN)
        const typed = age % 6
        for (let i = 0; i < typed; i++) set(bx + 2 + i, H - 6, WHITE)
        if (t % 4 < 2) set(bx + 2 + typed, H - 6, GREEN)
        set(bx + 1, H - 4, act === 'test' ? (t % 6 < 3 ? YELLOW : GREEN) : GRAY)
        break
      }
      case 'install': case 'add': {
        const n = act === 'add' ? 1 + (age >> 3) % 3 : 1 + (age / 12 | 0) % 3
        for (let i = 0; i < n; i++) {
          rect(ox + 3, oy - 2 - i * 2, 5, 2, i % 2 ? DARK_BROWN : BROWN)
          set(ox + 5, oy - 2 - i * 2, YELLOW)
        }
        break
      }
      case 'push': {
        const bx = ox + 11
        rect(bx, H - 6, 5, 5, DARK_BROWN)
        rect(bx + 1, H - 5, 3, 3, BROWN)
        set(bx + 2, H - 4, YELLOW)
        break
      }
      case 'inspect': {
        const cx = fx(12)
        for (const [dx, dy] of RING) set(cx + dx, oy + 1 + dy, GRAY)
        set(cx, oy + 1, BLUE)
        set(fx(11), oy + 3, BROWN)
        break
      }
      case 'branch': {
        const tx = fx(14)
        rect(tx, H - 5, 1, 4, BROWN)
        rect(tx - 2, H - 8, 5, 3, GREEN)
        set(tx - 1, H - 9, GREEN); set(tx + 1, H - 9, GREEN)
        set(tx + 1, H - 7, RED)
        break
      }
      case 'stash': {
        const bx = dir === 1 ? ox + 14 : ox - 9
        rect(bx, H - 5, 6, 4, BROWN)
        rect(bx + 1, H - 5, 4, 1, DARK_BROWN)
        set(bx + 2, H - 6 - ((t >> 2) % 2), BROWN)
        break
      }
      case 'edit': {
        const down = t % 6 >= 3
        if (down) {
          for (let i = 0; i < 3; i++) set(fx(11 + i), oy + 3, BROWN)
          rect(Math.min(fx(14), fx(15)), oy + 2, 2, 3, GRAY)
        } else {
          for (let i = 0; i < 3; i++) set(fx(11), oy + 1 - i, BROWN)
          rect(Math.min(fx(10), fx(12)), oy - 3, 3, 2, GRAY)
        }
        break
      }
      case 'web':
        set(ox + 5, oy - 1, GRAY); set(ox + 5, oy - 2, GRAY)
        set(ox + 5, oy - 3, t % 6 < 3 ? RED : PINK)
        break
      case 'todo': {
        const bx = dir === 1 ? ox + 12 : ox - 6
        rect(bx, H - 8, 5, 7, WHITE)
        const checked = Math.min(3, age >> 3)
        for (let i = 0; i < 3; i++) {
          set(bx + 1, H - 7 + i * 2, i < checked ? GREEN : GRAY)
          rect(bx + 2, H - 7 + i * 2, 2, 1, GRAY)
        }
        break
      }
      case 'dizzy':
        for (let k = 0; k < 2; k++) {
          const a = t * 0.5 + k * Math.PI
          set(ox + 5 + Math.cos(a) * 5, oy - 1 + Math.sin(a) * 1, YELLOW)
        }
        break
    }

    // particles
    for (const p of particles) {
      if (p.shape === 'z') {
        for (const [dx, dy] of ZED) set(p.x + dx, p.y + dy, p.c)
      } else if (p.shape === 'heart') {
        for (const [dx, dy] of HEART) set(p.x + dx, p.y + dy, p.c)
      } else {
        set(p.x, p.y, p.c)
      }
    }
    return px
  }

  const frame = () => encode(draw(), width)

  // ── the clock ──

  const tick = () => {
    t += 1
    if (timedUntil > 0 && t >= timedUntil) {
      timedUntil = 0
      setAct(working ? 'walk' : 'sleep')
    }
    if (revertAt >= 0 && t >= revertAt && active === 0 && timedUntil === 0) {
      revertAt = -1
      setAct(working ? 'walk' : 'sleep')
    }
    step()
  }

  on('session.start', async ($, e, next) => {
    hidden = await read($, isHidden)
    const stored = await $.store.get('isHidden')
    if (typeof stored === 'boolean' && stored !== hidden) {
      hidden = stored
      await update($, isHidden, () => stored)
    }
    await $.command.register({
      name: 'critter',
      description: 'Your little orange critter: /critter [pet|hide|show|stats]',
      argumentHint: 'pet | hide | show | stats',
    })
    timer?.cancel()
    timer = $.clock.every(TICK_MS, () => {
      tick()
      if (bandId === '' || hidden) return
      if (capDirty) {
        // a new caption: redraw the whole band, the raster with it
        capDirty = false
        $.ui.invalidate('ui.render')
        return
      }
      if (act === 'sleep' && t % 3 !== 0) return
      void $.ui.blit({ requestId: bandId, key: KEY, cells: frame() }).catch(() => undefined)
    })
    return next(e)
  })

  on('command.run', { command: 'critter' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const setHidden = async (value: boolean) => {
      hidden = value
      await update($, isHidden, () => value)
      await $.store.set('isHidden', value)
    }

    if (arg === 'hide' || (arg === '' && !hidden)) {
      await setHidden(true)
      return { text: 'The critter waves goodbye and scuttles under the prompt. `/critter show` brings it back.' }
    }
    if (arg === 'show' || arg === '') {
      await setHidden(false)
      setTimed('wave', 15, ['hi again!', 'missed me?'])
      return { text: 'The critter is back!' }
    }
    if (arg === 'pet') {
      if (hidden) await setHidden(false)
      setTimed('pet', 35)
      return { text: 'You pet the critter. It clicks happily.' }
    }
    if (arg === 'stats') {
      const s = commits === 1 ? '' : 's'
      return { text: `The critter has watched ${commits} commit${s} land this session (one green dot each on its ground).` }
    }
    return { text: 'Usage: /critter [pet|hide|show|stats]' }
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      working = true
      if (act === 'sleep') setTimed('wave', 12)
    }
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if ((e as { agentId?: string }).agentId === undefined) {
      working = false
      active = 0
      if (e.reason === 'answer') setTimed('celebrate', 25)
      else if (e.reason === 'aborted') setTimed('dizzy', 20, LINES.aborted)
      else setTimed('dizzy', 25)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    let kind: Act = 'walk'
    try {
      const { act: a, detail } = classify(String(e.tool), e as unknown as Record<string, unknown>)
      kind = a
      active += 1
      revertAt = -1
      setAct(a, detail)
    } catch {
      // the critter never gets in the way of a tool
    }

    let ran
    try {
      ran = await next(e)
    } finally {
      active = Math.max(0, active - 1)
    }

    try {
      if (ran.deny !== undefined) {
        setTimed('dizzy', 20, LINES.denied)
      } else if (ran.isError === true) {
        setTimed('dizzy', 25, kind === 'test' ? LINES.testFail : LINES.dizzy)
      } else if (kind === 'test') {
        setTimed('celebrate', 25, LINES.testPass)
      } else {
        if (kind === 'commit') commits += 1
        revertAt = Math.max(t + 5, actStart + 15)
      }
    } catch {
      // ditto
    }
    return ran
  }).catch(($, e, next) => next(e)) // a critter mishap never blocks a tool

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || e.props.maxRows < ROWS + 1) return next(e)
    if (await read($, isHidden)) return next(e)
    bandId = e.requestId
    width = Math.max(24, Math.min(512, e.props.bodyColumns))
    if (!e.props.isWorking && working && timedUntil === 0) working = false

    const { Box, Text, Raster } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Raster key={KEY} columns={width} rows={ROWS} cells={frame()} />
        <Text wrap="truncate-end">
          <Text color="#d97757" bold>
            ✻ {capText}
          </Text>
          {capDetail !== '' && <Text dimColor> · {capDetail}</Text>}
        </Text>
      </Box>
    )
  })
}
