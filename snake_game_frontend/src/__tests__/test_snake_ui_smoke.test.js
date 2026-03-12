/* @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'

/**
 * The app uses <canvas>.getContext('2d'), which jsdom doesn't implement.
 * Provide a minimal mock so importing src/main.js doesn't crash.
 */
function mockCanvas2D() {
  Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => {
      // Minimal surface required by draw()/resizeCanvasToContainer()
      return {
        setTransform: vi.fn(),
        fillRect: vi.fn(),
        strokeRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        // properties used by the code
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        shadowColor: '',
        shadowBlur: 0,
      }
    }),
  })
}

describe('snake UI smoke', () => {
  it('renders expected UI skeleton into #app', async () => {
    document.body.innerHTML = '<div id="app"></div>'

    mockCanvas2D()

    // Import after DOM + canvas mock are in place
    await import('../main.js')

    expect(document.querySelector('.app-shell')).toBeTruthy()
    expect(document.querySelector('#gameCanvas')).toBeTruthy()
    expect(document.querySelector('#scoreValue')?.textContent).toBe('0')
    expect(document.querySelector('#highScoreValue')).toBeTruthy()
    expect(document.querySelector('#startBtn')?.textContent).toMatch(/start/i)
    expect(document.querySelector('#pauseBtn')?.textContent).toMatch(/pause/i)

    // The overlay should exist and contain instructions
    expect(document.querySelector('#overlay')).toBeTruthy()
    expect(document.querySelector('#overlayText')?.textContent).toMatch(/space/i)
  })
})
