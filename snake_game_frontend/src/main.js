import './style.css'

const STORAGE_KEYS = {
  highScore: 'snake.highScore.v1',
  soundEnabled: 'snake.soundEnabled.v1',
}

/**
 * Create a small WebAudio helper that can do simple "beeps" without any assets.
 * Audio is started only after a user gesture (start/resume) to satisfy autoplay policies.
 */
class SoundManager {
  constructor() {
    /** @type {AudioContext | null} */
    this._ctx = null
    /** @type {boolean} */
    this.enabled = true
  }

  /** Initialize AudioContext lazily. Must be called from a user gesture handler. */
  ensureContext() {
    if (!this.enabled) return
    if (this._ctx) return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    this._ctx = new AudioCtx()
  }

  /** Attempt to resume if browser suspended the context. */
  async resumeIfNeeded() {
    if (!this._ctx) return
    if (this._ctx.state === 'suspended') {
      try {
        await this._ctx.resume()
      } catch {
        // ignore
      }
    }
  }

  /**
   * Play a simple beep.
   * @param {number} freq
   * @param {number} durationMs
   * @param {number} volume
   * @param {'square'|'sine'|'triangle'|'sawtooth'} type
   */
  beep(freq, durationMs = 60, volume = 0.04, type = 'square') {
    if (!this.enabled) return
    if (!this._ctx) return
    const now = this._ctx.currentTime

    const osc = this._ctx.createOscillator()
    const gain = this._ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(freq, now)

    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(volume, now + 0.01)
    gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000)

    osc.connect(gain)
    gain.connect(this._ctx.destination)

    osc.start(now)
    osc.stop(now + durationMs / 1000 + 0.02)
  }

  food() {
    this.beep(880, 70, 0.05, 'square')
  }

  turn() {
    this.beep(440, 25, 0.025, 'square')
  }

  gameOver() {
    this.beep(220, 140, 0.06, 'square')
    setTimeout(() => this.beep(165, 140, 0.05, 'square'), 120)
  }

  start() {
    this.beep(660, 80, 0.05, 'square')
  }

  pause() {
    this.beep(330, 60, 0.04, 'square')
  }
}

/**
 * Grid / gameplay constants (tuned for classic feel).
 */
const GRID_COLS = 24
const GRID_ROWS = 24

const SPEED = {
  startMs: 140,
  minMs: 55,
  // How much to speed up every time you eat (ms reduction).
  stepMs: 4,
}

// Allow first move "buffer" for direction changes between ticks.
const INPUT_BUFFER_SIZE = 2

/**
 * @typedef {{x:number,y:number}} Point
 */

const Direction = {
  Up: { x: 0, y: -1, name: 'up' },
  Down: { x: 0, y: 1, name: 'down' },
  Left: { x: -1, y: 0, name: 'left' },
  Right: { x: 1, y: 0, name: 'right' },
}

/**
 * @param {Point} a
 * @param {Point} b
 */
function samePoint(a, b) {
  return a.x === b.x && a.y === b.y
}

/**
 * @param {number} minInclusive
 * @param {number} maxInclusive
 */
function randInt(minInclusive, maxInclusive) {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive
}

/**
 * Create a random food position not on the snake.
 * Also avoids spawning exactly on the head to prevent instant eat on some edge cases.
 * @param {Point[]} snake
 * @returns {Point}
 */
function spawnFood(snake) {
  const occupied = new Set(snake.map((p) => `${p.x},${p.y}`))
  const headKey = `${snake[0].x},${snake[0].y}`

  // If somehow the board is full, return a dummy food (handled by win condition logic).
  if (occupied.size >= GRID_COLS * GRID_ROWS) return { x: 0, y: 0 }

  while (true) {
    const p = { x: randInt(0, GRID_COLS - 1), y: randInt(0, GRID_ROWS - 1) }
    const key = `${p.x},${p.y}`
    if (!occupied.has(key) && key !== headKey) return p
  }
}

/**
 * Determine if newDir is a direct reversal of currentDir (not allowed).
 */
function isReverse(currentDir, newDir) {
  return currentDir.x + newDir.x === 0 && currentDir.y + newDir.y === 0
}

/**
 * Load persisted integer from localStorage (safe).
 * @param {string} key
 * @param {number} fallback
 */
function loadInt(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    const num = Number.parseInt(raw, 10)
    return Number.isFinite(num) ? num : fallback
  } catch {
    return fallback
  }
}

/**
 * Load persisted boolean from localStorage (safe).
 * @param {string} key
 * @param {boolean} fallback
 */
function loadBool(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return raw === 'true'
  } catch {
    return fallback
  }
}

/**
 * Persist value to localStorage (safe).
 * @param {string} key
 * @param {string} value
 */
function store(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

/**
 * Main app UI.
 */
document.querySelector('#app').innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div>
        <h1 class="title">RETRO SNAKE</h1>
        <p class="subtitle">Eat. Grow. Survive.</p>
      </div>

      <div class="hud">
        <div class="hud-item">
          <div class="hud-label">Score</div>
          <div class="hud-value" id="scoreValue">0</div>
        </div>
        <div class="hud-item">
          <div class="hud-label">High</div>
          <div class="hud-value" id="highScoreValue">0</div>
        </div>
        <div class="hud-item hud-item--small">
          <div class="hud-label">Speed</div>
          <div class="hud-value" id="speedValue">1.0x</div>
        </div>
      </div>
    </header>

    <main class="main">
      <section class="game-panel">
        <div class="canvas-wrap">
          <canvas id="gameCanvas" class="game-canvas" width="720" height="720" aria-label="Snake game canvas"></canvas>

          <div id="overlay" class="overlay" aria-live="polite">
            <div class="overlay-card">
              <div class="overlay-title" id="overlayTitle">Ready?</div>
              <div class="overlay-text" id="overlayText">
                Press <kbd>Space</kbd> to start. Use <kbd>Arrow</kbd> keys or <kbd>WASD</kbd> to move.
              </div>
              <div class="overlay-actions">
                <button id="startBtn" class="btn btn-primary" type="button">Start</button>
                <button id="restartBtn" class="btn" type="button">Restart</button>
              </div>
            </div>
          </div>
        </div>

        <div class="controls-row">
          <button id="pauseBtn" class="btn" type="button">Pause</button>
          <button id="mobileRestartBtn" class="btn" type="button">Restart</button>
          <label class="toggle">
            <input id="soundToggle" type="checkbox" />
            <span class="toggle-ui" aria-hidden="true"></span>
            <span class="toggle-label">Sound</span>
          </label>
        </div>

        <div class="hint-row">
          <div class="hint">
            <strong>Controls:</strong> Arrow keys / WASD — <kbd>Space</kbd> Start/Pause — <kbd>R</kbd> Restart
          </div>
        </div>

        <details class="instructions" open>
          <summary>How to play</summary>
          <ul>
            <li>Eat food to grow and score points.</li>
            <li>Each time you eat, the game speeds up.</li>
            <li>Don’t hit the walls or your own tail.</li>
            <li>Food never spawns on the snake.</li>
          </ul>
        </details>
      </section>
    </main>

    <footer class="footer">
      <span>Tip: On mobile, focus the page then use an external keyboard, or tap the canvas and use <kbd>WASD</kbd> on a connected keyboard.</span>
    </footer>
  </div>
`

/** @type {HTMLCanvasElement} */
const canvas = document.querySelector('#gameCanvas')
const ctx = canvas.getContext('2d', { alpha: false })

const scoreEl = document.querySelector('#scoreValue')
const highScoreEl = document.querySelector('#highScoreValue')
const speedEl = document.querySelector('#speedValue')
const overlayEl = document.querySelector('#overlay')
const overlayTitleEl = document.querySelector('#overlayTitle')
const overlayTextEl = document.querySelector('#overlayText')

const startBtn = document.querySelector('#startBtn')
const restartBtn = document.querySelector('#restartBtn')
const mobileRestartBtn = document.querySelector('#mobileRestartBtn')
const pauseBtn = document.querySelector('#pauseBtn')
const soundToggle = document.querySelector('#soundToggle')

const sound = new SoundManager()
sound.enabled = loadBool(STORAGE_KEYS.soundEnabled, true)
soundToggle.checked = sound.enabled

let highScore = loadInt(STORAGE_KEYS.highScore, 0)
highScoreEl.textContent = `${highScore}`

// Game state
/** @type {Point[]} */
let snake = []
/** @type {Point} */
let food = { x: 0, y: 0 }
let direction = Direction.Right
let queuedDirections = []
let score = 0
let tickMs = SPEED.startMs
let running = false
let paused = false
let gameOver = false
let lastTickAt = 0

function resetGameState() {
  const startX = Math.floor(GRID_COLS / 2)
  const startY = Math.floor(GRID_ROWS / 2)

  snake = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ]
  direction = Direction.Right
  queuedDirections = []
  score = 0
  tickMs = SPEED.startMs
  running = false
  paused = false
  gameOver = false
  lastTickAt = 0

  food = spawnFood(snake)

  syncHud()
  setOverlayVisible(true)
  overlayTitleEl.textContent = 'Ready?'
  overlayTextEl.innerHTML =
    'Press <kbd>Space</kbd> to start. Use <kbd>Arrow</kbd> keys or <kbd>WASD</kbd> to move.'
  pauseBtn.textContent = 'Pause'
}

function setOverlayVisible(visible) {
  overlayEl.classList.toggle('overlay--hidden', !visible)
}

function syncHud() {
  scoreEl.textContent = `${score}`
  highScoreEl.textContent = `${highScore}`

  // Show speed as multiplier vs start speed (higher = faster).
  const mult = SPEED.startMs / tickMs
  speedEl.textContent = `${mult.toFixed(1)}x`
}

/**
 * Compute responsive canvas size while keeping a square.
 * We render at devicePixelRatio for sharp lines.
 */
function resizeCanvasToContainer() {
  const wrap = canvas.parentElement
  const max = wrap ? wrap.clientWidth : 720
  const sizeCss = Math.max(280, Math.min(max, 720))
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))

  canvas.style.width = `${sizeCss}px`
  canvas.style.height = `${sizeCss}px`

  canvas.width = Math.floor(sizeCss * dpr)
  canvas.height = Math.floor(sizeCss * dpr)

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  draw() // redraw after resize
}

window.addEventListener('resize', resizeCanvasToContainer)

/**
 * Enqueue a direction change for the next tick(s).
 * @param {{x:number,y:number,name:string}} newDir
 */
function queueDirection(newDir) {
  if (!running || paused || gameOver) {
    // Allow pre-queue before start: update direction immediately but still prevent reverse.
    if (!running && !gameOver) {
      if (!isReverse(direction, newDir)) direction = newDir
      draw()
      return
    }
    return
  }

  const last = queuedDirections.length ? queuedDirections[queuedDirections.length - 1] : direction
  if (isReverse(last, newDir)) return
  if (queuedDirections.length >= INPUT_BUFFER_SIZE) return

  queuedDirections.push(newDir)
  sound.turn()
}

/**
 * Handle keyboard controls.
 */
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase()

  // Prevent page from scrolling with arrows/space.
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase()) || e.key === ' ') {
    e.preventDefault()
  }

  if (key === ' ' || key === 'spacebar') {
    toggleStartPause()
    return
  }
  if (key === 'r') {
    restart()
    return
  }

  if (key === 'arrowup' || key === 'w') queueDirection(Direction.Up)
  else if (key === 'arrowdown' || key === 's') queueDirection(Direction.Down)
  else if (key === 'arrowleft' || key === 'a') queueDirection(Direction.Left)
  else if (key === 'arrowright' || key === 'd') queueDirection(Direction.Right)
})

/**
 * Start / pause toggle.
 */
function toggleStartPause() {
  // Audio init/resume requires user gesture.
  sound.ensureContext()
  sound.resumeIfNeeded()

  if (gameOver) {
    restart()
    return
  }

  if (!running) {
    running = true
    paused = false
    setOverlayVisible(true)
    overlayTitleEl.textContent = 'Go!'
    overlayTextEl.textContent = 'Good luck.'
    setTimeout(() => setOverlayVisible(false), 450)
    sound.start()
    requestAnimationFrame(loop)
    return
  }

  paused = !paused
  pauseBtn.textContent = paused ? 'Resume' : 'Pause'
  if (paused) {
    setOverlayVisible(true)
    overlayTitleEl.textContent = 'Paused'
    overlayTextEl.innerHTML = 'Press <kbd>Space</kbd> to resume.'
    sound.pause()
  } else {
    setOverlayVisible(false)
    sound.start()
    requestAnimationFrame(loop)
  }
}

function restart() {
  // Audio init/resume requires user gesture.
  sound.ensureContext()
  sound.resumeIfNeeded()
  resetGameState()
  draw()
}

/**
 * Advance the game by one tick.
 */
function step() {
  // Apply queued direction (at most one per tick).
  if (queuedDirections.length) {
    const next = queuedDirections.shift()
    if (next && !isReverse(direction, next)) direction = next
  }

  const head = snake[0]
  const newHead = { x: head.x + direction.x, y: head.y + direction.y }

  // Wall collision
  if (newHead.x < 0 || newHead.x >= GRID_COLS || newHead.y < 0 || newHead.y >= GRID_ROWS) {
    onGameOver()
    return
  }

  // Self collision: allow moving into the last tail cell only if it will move away this tick
  // (i.e., not eating food). Classic snake rule.
  const willEat = samePoint(newHead, food)
  const tailToIgnore = willEat ? null : snake[snake.length - 1]
  for (let i = 0; i < snake.length; i += 1) {
    const seg = snake[i]
    if (tailToIgnore && samePoint(seg, tailToIgnore)) continue
    if (samePoint(newHead, seg)) {
      onGameOver()
      return
    }
  }

  // Move
  snake.unshift(newHead)

  if (willEat) {
    score += 10
    sound.food()

    // Speed up
    tickMs = Math.max(SPEED.minMs, tickMs - SPEED.stepMs)

    // Spawn next food (not on snake)
    food = spawnFood(snake)

    // Win condition: board full
    if (snake.length >= GRID_COLS * GRID_ROWS) {
      onGameOver(true)
      return
    }
  } else {
    snake.pop()
  }

  if (score > highScore) {
    highScore = score
    store(STORAGE_KEYS.highScore, String(highScore))
  }

  syncHud()
}

/**
 * @param {boolean} [won]
 */
function onGameOver(won = false) {
  gameOver = true
  running = false
  paused = false
  pauseBtn.textContent = 'Pause'
  sound.gameOver()

  setOverlayVisible(true)
  overlayTitleEl.textContent = won ? 'You Win!' : 'Game Over'
  overlayTextEl.innerHTML = `Score: <strong>${score}</strong> • High: <strong>${highScore}</strong><br/>Press <kbd>R</kbd> to restart.`
}

/**
 * Render the game.
 */
function draw() {
  // CSS pixels: because we setTransform(dpr...) and canvas style matches logical size.
  const width = parseFloat(canvas.style.width || '720')
  const height = parseFloat(canvas.style.height || '720')

  const cell = Math.floor(Math.min(width / GRID_COLS, height / GRID_ROWS))
  const boardW = cell * GRID_COLS
  const boardH = cell * GRID_ROWS
  const offsetX = Math.floor((width - boardW) / 2)
  const offsetY = Math.floor((height - boardH) / 2)

  // Background (slightly darker to increase perceived contrast)
  ctx.fillStyle = '#05070b'
  ctx.fillRect(0, 0, width, height)

  // Board (deeper tone so bright sprites "pop" against CRT glass)
  ctx.fillStyle = '#07101d'
  ctx.fillRect(offsetX, offsetY, boardW, boardH)

  // Grid lines (still subtle, but a touch stronger for clarity)
  ctx.strokeStyle = 'rgba(78, 161, 255, 0.14)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let x = 0; x <= GRID_COLS; x += 1) {
    const px = offsetX + x * cell + 0.5
    ctx.moveTo(px, offsetY)
    ctx.lineTo(px, offsetY + boardH)
  }
  for (let y = 0; y <= GRID_ROWS; y += 1) {
    const py = offsetY + y * cell + 0.5
    ctx.moveTo(offsetX, py)
    ctx.lineTo(offsetX + boardW, py)
  }
  ctx.stroke()

  // Food (high-contrast amber "phosphor" with glow)
  const foodX = offsetX + food.x * cell
  const foodY = offsetY + food.y * cell
  ctx.fillStyle = '#ffd54a'
  ctx.shadowColor = 'rgba(255, 213, 74, 0.65)'
  ctx.shadowBlur = 14
  ctx.fillRect(foodX + 2, foodY + 2, cell - 4, cell - 4)
  ctx.shadowBlur = 0

  // Snake (bright phosphor green for maximum contrast vs blue/cyan CRT accents)
  for (let i = snake.length - 1; i >= 0; i -= 1) {
    const seg = snake[i]
    const x = offsetX + seg.x * cell
    const y = offsetY + seg.y * cell

    const isHead = i === 0
    if (isHead) {
      ctx.fillStyle = '#7CFF6B'
      ctx.shadowColor = 'rgba(124, 255, 107, 0.55)'
      ctx.shadowBlur = 14
    } else {
      ctx.fillStyle = 'rgba(124, 255, 107, 0.78)'
      ctx.shadowBlur = 0
    }

    ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4)

    if (isHead) {
      // Little "eye" pixel for retro vibe (warm white to stand out from green head)
      ctx.shadowBlur = 0
      ctx.fillStyle = '#fff7ed'
      const eyeX = x + Math.floor(cell * 0.62)
      const eyeY = y + Math.floor(cell * 0.30)
      ctx.fillRect(eyeX, eyeY, Math.max(2, Math.floor(cell * 0.12)), Math.max(2, Math.floor(cell * 0.12)))
    }
  }

  // Border (slightly stronger for separation)
  ctx.strokeStyle = 'rgba(33, 240, 209, 0.42)'
  ctx.lineWidth = 2
  ctx.strokeRect(offsetX + 1, offsetY + 1, boardW - 2, boardH - 2)
}

/**
 * Main RAF loop: keeps drawing smooth; steps at tickMs.
 * @param {number} ts
 */
function loop(ts) {
  if (!running || paused || gameOver) return
  if (!lastTickAt) lastTickAt = ts
  const elapsed = ts - lastTickAt

  if (elapsed >= tickMs) {
    // Avoid spiral of death: move lastTickAt forward by tickMs increments
    lastTickAt = ts - (elapsed % tickMs)
    step()
  }

  draw()
  requestAnimationFrame(loop)
}

// Buttons
startBtn.addEventListener('click', () => toggleStartPause())
restartBtn.addEventListener('click', () => restart())
mobileRestartBtn.addEventListener('click', () => restart())
pauseBtn.addEventListener('click', () => toggleStartPause())

// Canvas click to focus / also acts as start-pause for convenience
canvas.addEventListener('click', () => {
  canvas.focus?.()
  toggleStartPause()
})

soundToggle.addEventListener('change', () => {
  sound.enabled = Boolean(soundToggle.checked)
  store(STORAGE_KEYS.soundEnabled, String(sound.enabled))

  // Initialize context only if enabling and during a user gesture.
  if (sound.enabled) {
    sound.ensureContext()
    sound.resumeIfNeeded()
    sound.start()
  }
})

// Init
resetGameState()
resizeCanvasToContainer()
draw()
