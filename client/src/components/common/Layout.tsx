import { ComponentChildren, JSX } from 'preact'
import './Container.css'

interface Props {
  children: ComponentChildren
  size?: 'sm' | 'md' | 'lg' | 'full'
  className?: string
}

export function Container({ children, size = 'lg', className = '' }: Props) {
  return <div className={`container container-${size} ${className}`}>{children}</div>
}

export function Flex({
  children,
  className = '',
  gap,
  align,
  justify,
  direction = 'row',
  wrap,
}: {
  children: ComponentChildren
  className?: string
  gap?: string
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
  direction?: 'row' | 'col'
  wrap?: boolean
}) {
  const classes = [
    'flex',
    direction === 'col' && 'flex-col',
    wrap && 'flex-wrap',
    align && `items-${align}`,
    justify && `justify-${justify}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} style={{ gap }}>
      {children}
    </div>
  )
}

export function Grid({
  children,
  cols,
  gap,
  className = '',
}: {
  children: ComponentChildren
  cols?: number
  gap?: string
  className?: string
}) {
  return (
    <div
      className={`grid ${className}`}
      style={
        {
          '--grid-cols': cols,
          gap,
        } as JSX.CSSProperties
      }
    >
      {children}
    </div>
  )
}

export function Stack({
  children,
  gap,
  className = '',
}: {
  children: ComponentChildren
  gap?: string
  className?: string
}) {
  return (
    <div className={`stack ${className}`} style={{ gap }}>
      {children}
    </div>
  )
}
