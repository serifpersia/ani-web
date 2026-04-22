import { ComponentChildren } from 'preact'
import './Card.css'

interface Props {
  children: ComponentChildren
  className?: string
  onClick?: () => void
}

export function Card({ children, className = '', onClick }: Props) {
  return (
    <div className={`card ${className}`} onClick={onClick}>
      {children}
    </div>
  )
}

export function CardImage({
  src,
  alt,
  className = '',
}: {
  src: string
  alt: string
  className?: string
}) {
  return (
    <div className={`card-image ${className}`}>
      <img src={src} alt={alt} loading="lazy" />
    </div>
  )
}

export function CardContent({
  children,
  className = '',
}: {
  children: ComponentChildren
  className?: string
}) {
  return <div className={`card-content ${className}`}>{children}</div>
}
