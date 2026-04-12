import type { ReactNode, CSSProperties } from 'react'
import { useScrollReveal } from './useScrollReveal'

interface Props {
  children: ReactNode
  delay?: number        // stagger delay in ms
  direction?: 'up' | 'left' | 'right'
  className?: string
}

const offsets: Record<string, string> = {
  up: 'translateY(40px)',
  left: 'translateX(-40px)',
  right: 'translateX(40px)',
}

export function ScrollReveal({ children, delay = 0, direction = 'up', className = '' }: Props) {
  const { ref, visible } = useScrollReveal(0.15)

  const style: CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translate(0,0)' : offsets[direction],
    transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
    willChange: 'opacity, transform',
  }

  return (
    <div ref={ref} style={style} className={className}>
      {children}
    </div>
  )
}
