import { describe, expect, it } from 'vitest'
import { Direction, GRID, SPEED, spawnFood, stepCore } from './snakeTestCore'

describe('snake core logic', () => {
  it('moves the snake forward by one cell and advances tail when not eating', () => {
    const state = {
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 3, y: 5 },
      ],
      food: { x: 20, y: 20 },
      direction: Direction.Right,
      tickMs: SPEED.startMs,
      score: 0,
    }

    const next = stepCore(state)

    expect(next.gameOver).toBe(false)
    expect(next.ate).toBe(false)
    expect(next.snake).toEqual([
      { x: 6, y: 5 },
      { x: 5, y: 5 },
      { x: 4, y: 5 },
    ])
    expect(next.score).toBe(0)
    expect(next.tickMs).toBe(SPEED.startMs)
  })

  it('detects wall collision', () => {
    const state = {
      snake: [
        { x: GRID.cols - 1, y: 0 },
        { x: GRID.cols - 2, y: 0 },
        { x: GRID.cols - 3, y: 0 },
      ],
      food: { x: 10, y: 10 },
      direction: Direction.Right, // will go out of bounds
      tickMs: SPEED.startMs,
      score: 0,
    }

    const next = stepCore(state)
    expect(next.gameOver).toBe(true)
  })

  it('allows moving into the tail cell when the snake is not eating (tail moves away)', () => {
    // Shape such that head moves into the current tail position.
    const state = {
      snake: [
        { x: 2, y: 1 }, // head
        { x: 2, y: 2 },
        { x: 1, y: 2 },
        { x: 1, y: 1 }, // tail (target)
      ],
      food: { x: 10, y: 10 }, // not eating
      direction: Direction.Left, // head goes to (1,1) which equals tail
      tickMs: SPEED.startMs,
      score: 0,
    }

    const next = stepCore(state)

    expect(next.gameOver).toBe(false)
    // After a normal move, length unchanged and tail removed.
    expect(next.snake).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ])
  })

  it('treats moving into the tail cell as collision if the snake is eating (tail does not move away)', () => {
    const state = {
      snake: [
        { x: 2, y: 1 }, // head
        { x: 2, y: 2 },
        { x: 1, y: 2 },
        { x: 1, y: 1 }, // tail (target)
      ],
      food: { x: 1, y: 1 }, // willEat == true if head moves into tail cell
      direction: Direction.Left,
      tickMs: SPEED.startMs,
      score: 0,
    }

    const next = stepCore(state)
    expect(next.gameOver).toBe(true)
  })

  it('increments score by 10 and speeds up when eating, clamped to minMs', () => {
    const state = {
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 3, y: 5 },
      ],
      food: { x: 6, y: 5 }, // directly in front of head
      direction: Direction.Right,
      tickMs: SPEED.startMs,
      score: 0,
    }

    const next = stepCore(state)
    expect(next.gameOver).toBe(false)
    expect(next.ate).toBe(true)
    expect(next.score).toBe(10)
    expect(next.snake.length).toBe(state.snake.length + 1)
    expect(next.tickMs).toBe(SPEED.startMs - SPEED.stepMs)

    // Clamp behavior
    const nearMin = {
      ...state,
      tickMs: SPEED.minMs,
      food: { x: 6, y: 5 },
    }
    const next2 = stepCore(nearMin)
    expect(next2.tickMs).toBe(SPEED.minMs)
  })

  it('spawnFood never returns a point on the snake body or head (deterministic RNG path)', () => {
    const snake = [
      { x: 0, y: 0 }, // head
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]

    // RNG sequence that tries head, then body, then finally an empty cell.
    // randInt uses rng() twice per attempt (x then y).
    const seq = [
      // attempt 1 -> (0,0) (head) -> reject
      0, 0,
      // attempt 2 -> (1,0) (on snake) -> reject
      1 / (GRID.cols - 1), 0,
      // attempt 3 -> (10,10) -> accept
      10 / (GRID.cols - 1), 10 / (GRID.rows - 1),
    ]
    let i = 0
    const rng = () => {
      const v = seq[i] ?? 0.5
      i += 1
      return v
    }

    const food = spawnFood(snake, GRID, rng)
    expect(food).toEqual({ x: 10, y: 10 })

    const keys = new Set(snake.map((p) => `${p.x},${p.y}`))
    expect(keys.has(`${food.x},${food.y}`)).toBe(false)
    expect(`${food.x},${food.y}`).not.toBe(`${snake[0].x},${snake[0].y}`)
  })
})
