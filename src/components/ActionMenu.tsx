import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export interface ActionMenuItem {
  icon?: LucideIcon
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

/** `false`/`null` entries are dropped so callers can inline permission checks. */
export type ActionMenuEntry = ActionMenuItem | 'separator' | false | null | undefined

const MENU_MARGIN = 8

export function ActionMenu({ items, label, align = 'end' }: {
  items: ActionMenuEntry[]
  label: string
  align?: 'start' | 'end'
}) {
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const entries = items.filter((item): item is ActionMenuItem | 'separator' => Boolean(item))
  const actionable = entries.filter((item): item is ActionMenuItem => item !== 'separator' && !item.disabled)

  const close = useCallback((returnFocus = true) => {
    setOpen(false)
    setPosition(null)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  // Position against the trigger in viewport space. Fixed positioning keeps the
  // menu out of the table's horizontal scroll container, which would clip it.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return
      const rect = trigger.getBoundingClientRect()
      const { offsetHeight: height, offsetWidth: width } = menu
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow < height + MENU_MARGIN && rect.top > height + MENU_MARGIN
        ? rect.top - height - 4
        : rect.bottom + 4
      const rawLeft = align === 'end' ? rect.right - width : rect.left
      const left = Math.min(
        Math.max(MENU_MARGIN, rawLeft),
        Math.max(MENU_MARGIN, window.innerWidth - width - MENU_MARGIN),
      )
      setPosition({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [align, open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [close, open])

  useEffect(() => {
    if (open && position) menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[activeIndex]?.focus()
  }, [activeIndex, open, position])

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key === 'Tab') { close(false); return }
    if (!actionable.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((current) => (current + 1) % actionable.length) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((current) => (current - 1 + actionable.length) % actionable.length) }
    if (event.key === 'Home') { event.preventDefault(); setActiveIndex(0) }
    if (event.key === 'End') { event.preventDefault(); setActiveIndex(actionable.length - 1) }
  }

  const openWith = (index: number) => {
    setActiveIndex(index)
    setOpen(true)
  }

  if (!actionable.length) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn h-8 w-8"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openWith(0))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); openWith(0) }
          if (event.key === 'ArrowUp') { event.preventDefault(); openWith(actionable.length - 1) }
        }}
      >
        <MoreHorizontal size={17} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="menu animate-overlay fixed z-[60]"
          style={{
            top: position?.top ?? -9999,
            left: position?.left ?? -9999,
            visibility: position ? 'visible' : 'hidden',
          }}
          onKeyDown={onMenuKeyDown}
        >
          {entries.map((entry, index) => {
            if (entry === 'separator') return <div className="menu-separator" key={`separator-${index}`} role="separator" />
            const Icon = entry.icon
            return (
              <button
                key={entry.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={entry.disabled}
                className={`menu-item ${entry.danger ? 'menu-item-danger' : ''}`}
                onClick={() => { close(); entry.onSelect() }}
                onMouseEnter={() => {
                  const position = actionable.indexOf(entry)
                  if (position >= 0) setActiveIndex(position)
                }}
              >
                {Icon && <Icon className="shrink-0 opacity-70" size={15} />}
                {entry.label}
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
