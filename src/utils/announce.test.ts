import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { announce } from './announce'

describe('announce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runAllTimers()
    vi.useRealTimers()
  })

  it('appends an aria-live="polite" aria-atomic="true" element to document.body', () => {
    announce('init')
    const el = document.querySelector('[aria-live="polite"][aria-atomic="true"]')
    expect(el).not.toBeNull()
    expect(document.body.contains(el)).toBe(true)
  })

  it('writes text to the region after 300 ms', () => {
    announce('Hello world')
    vi.advanceTimersByTime(300)
    const el = document.querySelector('[aria-live="polite"]')!
    expect(el.textContent).toBe('Hello world')
  })

  it('debounces rapid calls — only the last message is emitted', () => {
    announce('First')
    announce('Second')
    announce('Third')
    vi.advanceTimersByTime(300)
    const el = document.querySelector('[aria-live="polite"]')!
    expect(el.textContent).toBe('Third')
  })

  it('does not emit before 300 ms have elapsed', () => {
    announce('Pending')
    vi.advanceTimersByTime(299)
    const el = document.querySelector('[aria-live="polite"]')!
    expect(el.textContent).not.toBe('Pending')
  })

  it('emits exactly at 300 ms', () => {
    announce('On time')
    vi.advanceTimersByTime(300)
    const el = document.querySelector('[aria-live="polite"]')!
    expect(el.textContent).toBe('On time')
  })

  it('reuses the same element on subsequent calls', () => {
    announce('First call')
    vi.advanceTimersByTime(300)
    announce('Second call')
    vi.advanceTimersByTime(300)
    const els = document.querySelectorAll('[aria-live="polite"]')
    expect(els.length).toBe(1)
  })
})
