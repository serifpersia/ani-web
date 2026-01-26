import React from 'react';

const Logo: React.FC = () => {
  return (
    <svg height="40" width="125" style={{ display: 'block', overflow: 'visible' }}>
      <style>
        {`
      .ani-text,
      .web-text {
        font-family: var(--font-family, sans-serif);
        font-size: 30px;
        transition: fill 0.2s ease-in-out;
        user-select: none;
      }
      .ani-text {
        font-weight: 700;
      }
      .web-text {
        font-weight: 600;
      }
      `}
      </style>
      <text x="0" y="30" className="ani-text" style={{ fill: 'var(--text-primary)' }}>ani</text>
      <text x="42" y="30" className="web-text" style={{ fill: 'var(--accent)' }}>web</text>
    </svg>
  );
};

export default Logo;