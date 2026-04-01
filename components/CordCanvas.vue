<script setup lang="ts">
const props = defineProps<{
  fromEl: Element | null
  toEl: Element | null
  containerEl: Element | null
}>()

const emit = defineEmits<{ (e: 'plugged-in'): void }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── Physics ────────────────────────────────────────────────────────────────
interface Node { x: number; y: number; px: number; py: number }

const NODES = 28
const GRAVITY = 0.38
const DAMPING = 0.983
const ITERS = 10
const DRAW_MS = 2200
const MOUSE_RADIUS = 70
const MOUSE_PUSH   = 12

let nodes: Node[] = []
let restLen = 0
let raf = 0
let startMs = 0
let phaseStartMs = 0
let dpr = 1

type Phase = 'drawing' | 'plugged' | 'sparked' | 'electrify' | 'done'
let phase: Phase = 'drawing'

let startPos = { x: 0, y: 0 }
let endPos   = { x: 0, y: 0 }   // cord tip = back (left side) of plug body
let plugBaseX = 0                 // prong-entry point = right edge of plug body
let emittedPluggedIn = false

const mouse = { x: -9999, y: -9999 }
let canvasOriginX = 0
let canvasOriginY = 0

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function initNodes() {
  const dist = Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y)
  restLen = (dist * 1.4) / (NODES - 1)
  nodes = Array.from({ length: NODES }, () => ({
    x: startPos.x, y: startPos.y,
    px: startPos.x, py: startPos.y,
  }))
}

function stepPhysics(tipX: number, tipY: number) {
  // Pin first node to start, last to tip target
  nodes[0]!.x = startPos.x;   nodes[0]!.y = startPos.y
  nodes[0]!.px = startPos.x;  nodes[0]!.py = startPos.y
  nodes[NODES - 1]!.x = tipX; nodes[NODES - 1]!.y = tipY
  nodes[NODES - 1]!.px = tipX; nodes[NODES - 1]!.py = tipY

  // Verlet integrate middle nodes
  for (let i = 1; i < NODES - 1; i++) {
    const n = nodes[i]!
    const vx = (n.x - n.px) * DAMPING
    const vy = (n.y - n.py) * DAMPING
    n.px = n.x; n.py = n.y
    n.x += vx
    n.y += vy + GRAVITY
  }

  // Satisfy distance constraints
  for (let iter = 0; iter < ITERS; iter++) {
    for (let i = 0; i < NODES - 1; i++) {
      const a = nodes[i]!, b = nodes[i + 1]!
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001
      const correction = (dist - restLen) / dist * 0.5
      if (i > 0)        { a.x += dx * correction; a.y += dy * correction }
      if (i < NODES - 2) { b.x -= dx * correction; b.y -= dy * correction }
    }
  }

  // Mouse repulsion — push middle nodes away from the cursor
  for (let i = 1; i < NODES - 1; i++) {
    const n = nodes[i]!
    const dx = n.x - mouse.x
    const dy = n.y - mouse.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < MOUSE_RADIUS && dist > 0) {
      const t = 1 - dist / MOUSE_RADIUS
      n.x += (dx / dist) * MOUSE_PUSH * t
      n.y += (dy / dist) * MOUSE_PUSH * t
    }
  }
}

// ── Drawing helpers ────────────────────────────────────────────────────────
function buildSmoothPath(ctx: CanvasRenderingContext2D) {
  ctx.beginPath()
  ctx.moveTo(nodes[0]!.x, nodes[0]!.y)
  for (let i = 1; i < nodes.length - 1; i++) {
    const mx = (nodes[i]!.x + nodes[i + 1]!.x) / 2
    const my = (nodes[i]!.y + nodes[i + 1]!.y) / 2
    ctx.quadraticCurveTo(nodes[i]!.x, nodes[i]!.y, mx, my)
  }
  ctx.lineTo(nodes[NODES - 1]!.x, nodes[NODES - 1]!.y)
}

function drawCord(ctx: CanvasRenderingContext2D) {
  // Drop shadow
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.65)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetX = 1
  ctx.shadowOffsetY = 5
  buildSmoothPath(ctx)
  ctx.strokeStyle = '#080808'
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.restore()

  // Dark rubber body
  buildSmoothPath(ctx)
  ctx.strokeStyle = '#1e1e22'
  ctx.lineWidth = 5.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()

  // Mid-tone secondary layer (subtle colour band)
  buildSmoothPath(ctx)
  ctx.strokeStyle = '#2a2a30'
  ctx.lineWidth = 3.5
  ctx.lineCap = 'round'
  ctx.stroke()

  // Specular highlight — offset slightly up-left
  ctx.save()
  ctx.translate(-0.6, -1.5)
  buildSmoothPath(ctx)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()
}

// Arc-length parameterisation of the rope
function buildArcLengths(): number[] {
  const cum = [0]
  for (let i = 1; i < nodes.length; i++) {
    const dx = nodes[i]!.x - nodes[i - 1]!.x
    const dy = nodes[i]!.y - nodes[i - 1]!.y
    cum.push(cum[i - 1]! + Math.sqrt(dx * dx + dy * dy))
  }
  return cum
}

function pointAt(cum: number[], s: number) {
  for (let i = 1; i < cum.length; i++) {
    if (cum[i]! >= s) {
      const u = (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]!)
      return {
        x: nodes[i - 1]!.x + (nodes[i]!.x - nodes[i - 1]!.x) * u,
        y: nodes[i - 1]!.y + (nodes[i]!.y - nodes[i - 1]!.y) * u,
      }
    }
  }
  return { x: nodes[NODES - 1]!.x, y: nodes[NODES - 1]!.y }
}

function drawElectricity(ctx: CanvasRenderingContext2D, t: number) {
  const cum = buildArcLengths()
  const totalLen = cum[cum.length - 1]!

  const dashLen = 14
  const period = 50
  const speed = 280
  let pos = (t * speed) % period

  ctx.save()
  ctx.lineCap = 'round'

  while (pos < totalLen) {
    const s0 = pos
    const s1 = Math.min(pos + dashLen, totalLen)
    const p0 = pointAt(cum, s0)
    const p1 = pointAt(cum, s1)

    // Build dash path through intermediate nodes
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    for (let i = 1; i < cum.length; i++) {
      if (cum[i]! > s0 && cum[i]! < s1) ctx.lineTo(nodes[i]!.x, nodes[i]!.y)
    }
    ctx.lineTo(p1.x, p1.y)

    // Outer glow
    ctx.shadowColor = '#fde047'
    ctx.shadowBlur = 12
    ctx.strokeStyle = '#fde047'
    ctx.lineWidth = 3
    ctx.globalAlpha = 0.85
    ctx.stroke()

    // White inner core
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.9
    ctx.stroke()

    pos += period
  }
  ctx.restore()
}

function drawSparks(ctx: CanvasRenderingContext2D, elapsed: number) {
  const x = plugBaseX + 14, y = endPos.y  // burst from prong tips
  const t = Math.min(1, elapsed / 580)

  ctx.save()
  const rays = [
    { a: -50, l: 24, w: 2.5 }, { a: 0, l: 30, w: 2.5 }, { a: 50, l: 24, w: 2.5 },
    { a: -115, l: 20, w: 2 }, { a: 115, l: 20, w: 2 },
    { a: -22, l: 14, w: 1.5 }, { a: 22, l: 14, w: 1.5 },
    { a: -80, l: 11, w: 1.5 }, { a: 80, l: 11, w: 1.5 },
  ]
  for (const ray of rays) {
    const opacity = Math.max(0, 1 - t * 1.9)
    if (opacity <= 0) continue
    ctx.globalAlpha = opacity
    ctx.shadowColor = '#fde047'
    ctx.shadowBlur = 8
    ctx.strokeStyle = '#fde047'
    ctx.lineWidth = ray.w
    ctx.lineCap = 'round'
    const rad = (ray.a * Math.PI) / 180
    const len = ray.l * Math.min(1, t * 2.8)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(rad) * len, y + Math.sin(rad) * len)
    ctx.stroke()
  }

  // Expanding burst ring
  const burstOpacity = Math.max(0, 0.75 - t * 1.3)
  if (burstOpacity > 0) {
    ctx.globalAlpha = burstOpacity
    ctx.fillStyle = 'rgba(253,224,71,0.55)'
    ctx.shadowColor = '#fde047'
    ctx.shadowBlur = 18
    ctx.beginPath()
    ctx.arc(x, y, 5 + t * 22, 0, Math.PI * 2)
    ctx.fill()
  }

  // White core flash
  const coreOpacity = Math.max(0, 1 - t * 3.5)
  if (coreOpacity > 0) {
    ctx.globalAlpha = coreOpacity
    ctx.fillStyle = '#ffffff'
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawSocket(ctx: CanvasRenderingContext2D) {
  const x = plugBaseX, y = endPos.y
  // Plate
  rr(ctx, x + 2, y - 16, 12, 32, 4)
  ctx.fillStyle = '#28282d'; ctx.fill()
  ctx.strokeStyle = '#3f3f46'; ctx.lineWidth = 0.8; ctx.stroke()
  // Slots (aligned to prong positions: top y-9 h5, bottom y+4 h5, ground y-2 h4)
  ctx.fillStyle = '#111114'
  rr(ctx, x + 2, y - 9, 9, 5, 1); ctx.fill()
  rr(ctx, x + 2, y + 4, 9, 5, 1); ctx.fill()
  ctx.fillStyle = '#0d0d0f'
  rr(ctx, x + 2, y - 2, 7, 4, 1); ctx.fill()
}

function drawPlug(ctx: CanvasRenderingContext2D, bx: number, by: number, snapOffset = 0, lit = false) {
  // bx is the prong-entry point; body extends 22px to the left of it
  const px = bx + snapOffset, py = by
  // Body
  rr(ctx, px - 22, py - 14, 22, 28, 4)
  ctx.fillStyle = '#2a2a30'; ctx.fill()
  ctx.strokeStyle = '#52525b'; ctx.lineWidth = 0.8; ctx.stroke()
  // Grip ridges
  ctx.strokeStyle = '#3f3f46'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'
  for (const ry of [-7, -1, 5]) {
    ctx.beginPath(); ctx.moveTo(px - 18, py + ry); ctx.lineTo(px - 4, py + ry); ctx.stroke()
  }
  // Prongs
  ctx.fillStyle = '#c0c0c8'
  rr(ctx, px, py - 9, 14, 5, 1.5); ctx.fill()
  rr(ctx, px, py + 4, 14, 5, 1.5); ctx.fill()
  ctx.fillStyle = '#a8a8b0'
  rr(ctx, px, py - 2, 10, 4, 1); ctx.fill()
  // LED
  ctx.save()
  ctx.beginPath(); ctx.arc(px - 11, py, 3, 0, Math.PI * 2)
  ctx.fillStyle = lit ? '#4ade80' : '#2a2a2a'
  if (lit) { ctx.shadowColor = 'rgba(74,222,128,1)'; ctx.shadowBlur = 8 }
  ctx.fill()
  ctx.restore()
}

// ── Animation loop ─────────────────────────────────────────────────────────
function loop(now: number) {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const W = canvas.width / dpr
  const H = canvas.height / dpr

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.save()
  ctx.scale(dpr, dpr)

  if (!startMs) { startMs = now; phaseStartMs = now }
  const elapsed = now - startMs
  const pe = now - phaseStartMs

  let tipX = endPos.x, tipY = endPos.y

  // Phase transitions
  if (phase === 'drawing') {
    const t = Math.min(1, elapsed / DRAW_MS)
    const e = easeInOutCubic(t)
    tipX = startPos.x + (endPos.x - startPos.x) * e
    tipY = startPos.y + (endPos.y - startPos.y) * e
    if (t >= 1) { phase = 'plugged'; phaseStartMs = now }
  }
  if (phase === 'plugged' && pe > 220) {
    phase = 'sparked'; phaseStartMs = now
    if (!emittedPluggedIn) { emittedPluggedIn = true; emit('plugged-in') }
  }
  if (phase === 'sparked' && pe > 620) { phase = 'electrify'; phaseStartMs = now }
  if (phase === 'electrify' && pe > 3000) { phase = 'done'; phaseStartMs = now }

  stepPhysics(tipX, tipY)

  // Draw back-to-front
  drawSocket(ctx)
  drawCord(ctx)

  if (phase === 'drawing') {
    // Plug travels with the cord tip; back of body = tip, so prong-entry = tip + 22
    drawPlug(ctx, tipX + 22, tipY)
  } else {
    // Springy snap offset: overshoot then settle
    let snapOffset = 0
    if (phase === 'plugged') {
      const snapT = Math.min(1, pe / 220)
      snapOffset = -14 * (1 - easeInOutCubic(snapT))
    }
    const lit = phase === 'sparked' || phase === 'electrify' || phase === 'done'
    drawPlug(ctx, plugBaseX, endPos.y, snapOffset, lit)
  }

  if (phase === 'sparked') drawSparks(ctx, pe)
  if (phase === 'electrify') drawElectricity(ctx, pe / 1000)

  ctx.restore()
  raf = requestAnimationFrame(loop)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
let initialized = false

const DESKTOP_MIN = 700

function tryStart() {
  if (initialized) return
  if (window.innerWidth <= DESKTOP_MIN) return
  const canvas = canvasRef.value
  if (!canvas || !props.fromEl || !props.toEl || !props.containerEl) return
  initialized = true

  // Reset animation state so re-init after a mobile→desktop resize starts fresh
  phase = 'drawing'
  startMs = 0
  phaseStartMs = 0
  emittedPluggedIn = false

  const container = props.containerEl.getBoundingClientRect()
  const from      = props.fromEl.getBoundingClientRect()
  const to        = props.toEl.getBoundingClientRect()

  if (to.left <= from.right + 20) return // single column, skip

  dpr = window.devicePixelRatio || 1

  canvas.width  = Math.round(container.width  * dpr)
  canvas.height = Math.round(container.height * dpr)
  canvas.style.width  = `${container.width}px`
  canvas.style.height = `${container.height}px`

  // Measure positions relative to the canvas's own rendered rect so any
  // discrepancy between the hero bounding rect and the canvas's actual
  // inset-0 position is automatically cancelled out.
  const cvs = canvas.getBoundingClientRect()
  canvasOriginX = cvs.left
  canvasOriginY = cvs.top

  // Start: 6 o'clock position on the clock SVG (y=97 in the 0-100 viewBox)
  startPos = {
    x: from.left + from.width / 2 - cvs.left,
    y: from.top + from.height * 0.97 - cvs.top,
  }

  // plugBaseX = left edge of box = where prongs insert into socket
  // endPos    = back of plug body (22 px to the left) = where cord terminates
  const socketX = to.left - cvs.left
  const socketY = to.top - cvs.top + to.height * 0.3
  plugBaseX = socketX
  endPos = { x: socketX - 22, y: socketY }

  initNodes()
  raf = requestAnimationFrame(loop)
}

function onResize() {
  const canvas = canvasRef.value
  if (!canvas || !props.fromEl || !props.toEl || !props.containerEl) return

  // Crossed into mobile — stop the loop and allow a fresh start if back on desktop
  if (window.innerWidth <= DESKTOP_MIN) {
    if (raf) { cancelAnimationFrame(raf); raf = 0 }
    initialized = false
    return
  }

  // Not yet initialized (e.g. page loaded on mobile, then resized to desktop)
  if (!initialized) {
    tryStart()
    return
  }

  // Already running on desktop — just re-measure positions and canvas size
  const container = props.containerEl.getBoundingClientRect()
  const from      = props.fromEl.getBoundingClientRect()
  const to        = props.toEl.getBoundingClientRect()

  dpr = window.devicePixelRatio || 1

  canvas.width  = Math.round(container.width  * dpr)
  canvas.height = Math.round(container.height * dpr)
  canvas.style.width  = `${container.width}px`
  canvas.style.height = `${container.height}px`

  const cvs = canvas.getBoundingClientRect()
  canvasOriginX = cvs.left
  canvasOriginY = cvs.top

  startPos = {
    x: from.left + from.width / 2 - cvs.left,
    y: from.top + from.height * 0.97 - cvs.top,
  }

  const socketX = to.left - cvs.left
  const socketY = to.top - cvs.top + to.height * 0.3
  plugBaseX = socketX
  endPos = { x: socketX - 22, y: socketY }
}

function onMouseMove(e: MouseEvent) {
  mouse.x = e.clientX - canvasOriginX
  mouse.y = e.clientY - canvasOriginY
}
function onMouseLeave() {
  mouse.x = -9999
  mouse.y = -9999
}

// ── ResizeObserver: delay init until the box has settled ──────────────────
// This compensates for async layout shifts (e.g. Cloudflare Turnstile captcha)
// that change the box height after the component mounts.
let boxObserver: ResizeObserver | null = null
let stabilizeTimer: ReturnType<typeof setTimeout> | null = null

function onBoxResize() {
  if (stabilizeTimer) clearTimeout(stabilizeTimer)
  stabilizeTimer = setTimeout(() => {
    stabilizeTimer = null
    if (!initialized) {
      tryStart()
    } else {
      onResize()
    }
  }, 300)
}

function setupObserver() {
  boxObserver?.disconnect()
  if (props.toEl) {
    boxObserver = new ResizeObserver(onBoxResize)
    boxObserver.observe(props.toEl)
  }
}

onMounted(() => {
  nextTick(setupObserver)
  window.addEventListener('resize', onResize, { passive: true })
  window.addEventListener('mousemove', onMouseMove, { passive: true })
  document.documentElement.addEventListener('mouseleave', onMouseLeave)
})
watch(() => props.toEl, () => nextTick(setupObserver))

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
  if (stabilizeTimer) clearTimeout(stabilizeTimer)
  boxObserver?.disconnect()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousemove', onMouseMove)
  document.documentElement.removeEventListener('mouseleave', onMouseLeave)
})
</script>

<template>
  <canvas ref="canvasRef" class="cord-canvas" aria-hidden="true" />
</template>

<style scoped>
.cord-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
@media (max-width: 700px) {
  .cord-canvas { display: none; }
}
</style>
