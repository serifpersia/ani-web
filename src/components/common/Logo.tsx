
import React from 'react';

const Logo: React.FC = () => {
  return (
    <svg height="40" width="125" style={{ display: 'block' }}>
      <style>
        {`
          .ani-text,
          .web-text {
            font-family: var(--font-family);
            font-size: 30px;
            transition: fill 0.2s ease-in-out;
          }
          .ani-text {
            font-weight: 700;
          }
          .web-text {
            font-weight: 600;
          }
        `}
      </style>
      <text x="0" y="30" className="ani-text">ani</text>
      <text x="55" y="30" className="web-text">web</text>
    </svg>
  );
};

export default Logo;
