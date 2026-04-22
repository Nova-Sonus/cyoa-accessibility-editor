let announcerEl: HTMLElement | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function getAnnouncerEl(): HTMLElement {
  if (announcerEl === null) {
    const el = document.createElement('div')
    el.setAttribute('aria-live', 'polite')
    el.setAttribute('aria-atomic', 'true')
    el.style.position = 'absolute'
    el.style.width = '1px'
    el.style.height = '1px'
    el.style.padding = '0'
    el.style.margin = '-1px'
    el.style.overflow = 'hidden'
    el.style.clip = 'rect(0, 0, 0, 0)'
    el.style.whiteSpace = 'nowrap'
    el.style.borderWidth = '0'
    document.body.appendChild(el)
    announcerEl = el
  }
  return announcerEl
}

/**
 * Write `text` to the consolidated aria-live announcer region.
 * Debounced to 300 ms — rapid calls keep only the most recent message.
 */
export function announce(text: string): void {
  const el = getAnnouncerEl() // ensure element is in the DOM immediately
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    el.textContent = text
  }, 300)
}
