import React from 'react'

interface LogoProps {
  className?: string
}

const Logo: React.FC<LogoProps> = ({ className }) => {
  return (
    <img
      src="/logo.png"
      alt="Ani-Web"
      className={className}
      style={{
        height: 'var(--logo-height, 75px)',
        width: 'auto',
        display: 'block',
        objectFit: 'contain',
      }}
    />
  )
}

export default Logo
