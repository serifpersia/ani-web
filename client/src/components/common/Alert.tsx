import { ComponentChildren } from 'preact'
import './Alert.css'

interface Props {
  variant?: 'info' | 'success' | 'warning' | 'error'
  children: ComponentChildren
  className?: string
}

export function Alert({ variant = 'info', children, className = '' }: Props) {
  return <div className={`alert alert-${variant} ${className}`}>{children}</div>
}
