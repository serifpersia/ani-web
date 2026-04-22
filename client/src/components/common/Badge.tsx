import { ComponentChildren } from 'preact'
import './Badge.css'

interface Props {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning'
  className?: string
  children: ComponentChildren
}

export function Badge({ variant = 'primary', className = '', children }: Props) {
  return <span className={`badge badge-${variant} ${className}`}>{children}</span>
}
