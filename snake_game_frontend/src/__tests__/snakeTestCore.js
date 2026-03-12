/**
 * Test-only snake core logic.
 *
 * This file intentionally duplicates a small subset of the game rules from src/main.js
 * so we can unit test gameplay behavior without modifying production code.
 *
 * Note: This is *not* used by the app at runtime; it exists only for automated tests.
 */

/**
 * @typedef {{x:number,y:number}} Point
 */

/**
 * @typedef {{x:number,y:number,name?:string}} Direction
 */

export const GRID = {
  cols: 24,
  rows: 24,
}

export const SPEED = {
  startMs: 140,
  minMs: 55,
  stepMs: 4,
}

export const Direction = {
  Up: { x: 0, y: -1, name: 'up' },
  Down: { x: 0, y: 1, name: 'down' },
  Left: { x: -1, y: 0, name: 'left' },
  Right: { x: 1, y: 0, name: 'right' },
}

/**
 * @param {Point} a
 * @param {Point} b
 */
export function samePoint(a, b) {
  return a.x === b.x && a.y === b.y
}

/**
 * @param {Direction} currentDir
 * @param {Direction} newDir
 */
export function isReverse(currentDir, newDir) {
  return currentDir.x + newDir.x === 0 && currentDir.y + newDir.y === 0
}

/**
 * Create a random food position not on the snake and not on the head.
 *
 * This matches the intent/behavior of src/main.js spawnFood.
 *
 * @param {Point[]} snake
 * @param {{cols:number,rows:number}} grid
 * @param {() => number} rng A Math.random-compatible RNG for determinism in tests.
 * @returns {Point}
 */
export function spawnFood(snake, grid = GRID, rng = Math.random) {
  const occupied = new Set(snake.map((p) => `${p.x},${p.y}`))
  const headKey = `${snake[0].x},${snake[0].y}`

  if (occupied.size >= grid.cols * grid.rows) return { x: 0, y: 0 }

  const randInt = (minInclusive, maxInclusive) =>
    Math.floor(rng() * (maxInclusive - minInclusive + 1)) + minInclusive

  while (true) {
    const p = { x: randInt(0, grid.cols - 1), y: randInt(0, grid.rows - 1) }
    const key = `${p.x},${p.y}`
    if (!occupied.has(key) && key !== headKey) return p
  }
}

/**
 * Apply one tick of snake movement/collision rules.
 * Focused on: movement, wall collision, self collision with tail-escape rule,
 * eating behavior, and speed scaling.
 *
 * @param {{
 *  snake: Point[],
 *  food: Point,
 *  direction: Direction,
 *  tickMs: number,
 *  score: number,
 *  grid?: {cols:number,rows:number},
 *  speed?: {minMs:number,stepMs:number},
 * }} state
 * @returns {{
 *  snake: Point[],
 *  food: Point,
 *  direction: Direction,
 *  tickMs: number,
 *  score: number,
 *  gameOver: boolean,
 *  ate: boolean,
 * }}
 */
export function stepCore(state) {
  const grid = state.grid ?? GRID
  const speed = state.speed ?? SPEED

  const head = state.snake[0]
  const newHead = { x: head.x + state.direction.x, y: head.y + state.direction.y }

  // Wall collision
  if (newHead.x < 0 || newHead.x >= grid.cols || newHead.y < 0 || newHead.y >= grid.rows) {
    return { ...state, gameOver: true, ate: false }
  }

  const willEat = samePoint(newHead, state.food)
  const tailToIgnore = willEat ? null : state.snake[state.snake.length - 1]

  // Self collision (tail-escape rule)
  for (let i = 0; i < state.snake.length; i += 1) {
    const seg = state.snake[i]
    if (tailToIgnore && samePoint(seg, tailToIgnore)) continue
    if (samePoint(newHead, seg)) {
      return { ...state, gameOver: true, ate: false }
    }
  }

  const nextSnake = [newHead, ...state.snake]

  if (willEat) {
    return {
      ...state,
      snake: nextSnake,
      score: state.score + 10,
      tickMs: Math.max(speed.minMs, state.tickMs - speed.stepMs),
      gameOver: false,
      ate: true,
    }
  }

  nextSnake.pop()
  return { ...state, snake: nextSnake, gameOver: false, ate: false }
}
