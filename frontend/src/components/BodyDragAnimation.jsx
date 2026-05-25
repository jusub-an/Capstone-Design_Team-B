import React from 'react';
import './BodyDragAnimation.css';

const HumanFigureSVG = () => (
  <svg
    className="body-figure-svg"
    viewBox="0 0 80 170"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="bfGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#5A6775" />
        <stop offset="100%" stopColor="#3C4550" />
      </linearGradient>
      <filter id="bfShadow" x="-20%" y="-10%" width="140%" height="120%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.22" />
      </filter>
    </defs>

    {/* Head */}
    <circle cx="40" cy="10" r="9" fill="url(#bfGrad)" filter="url(#bfShadow)" />

    {/* Neck */}
    <rect x="37" y="18" width="6" height="7" rx="2" fill="url(#bfGrad)" />

    {/* Torso — smooth curves: wide shoulder → chest → narrow waist → hip */}
    <path
      d="M 22 24
         C 28 22, 52 22, 58 24
         C 58 36, 59 53, 59 65
         C 58 73, 58 79, 58 82
         C 52 85, 28 85, 22 82
         C 22 79, 22 73, 21 65
         C 21 53, 22 36, 22 24 Z"
      fill="url(#bfGrad)" filter="url(#bfShadow)"
    />

    {/* Left arm — bezier taper: shoulder → elbow → wrist */}
    <path
      d="M 22 26
         C 16 34, 8 50, 7 64
         C 7 67, 8 69, 10 70
         L 15 69
         C 15 66, 16 62, 18 56
         C 20 46, 22 36, 27 30 Z"
      fill="url(#bfGrad)"
    />

    {/* Right arm — mirror */}
    <path
      d="M 58 26
         C 64 34, 72 50, 73 64
         C 73 67, 72 69, 70 70
         L 65 69
         C 65 66, 64 62, 62 56
         C 60 46, 58 36, 53 30 Z"
      fill="url(#bfGrad)"
    />

    {/* Left leg — slight outward A-pose */}
    <path
      d="M 22 83
         C 20 100, 16 130, 15 165
         L 25 165
         C 26 130, 30 100, 34 83 Z"
      fill="url(#bfGrad)"
    />

    {/* Right leg — mirror */}
    <path
      d="M 46 83
         C 50 100, 54 130, 55 165
         L 65 165
         C 64 130, 62 100, 58 83 Z"
      fill="url(#bfGrad)"
    />
  </svg>
);

const Cursor = () => (
  <svg className="body-cursor-svg" viewBox="0 0 24 24" width="22" height="22">
    <path fill="#ffffff" stroke="#000000" strokeWidth="1" d="M4 0l16 16-6 1.5 4 6-3 1.5-4-6-4 4z" />
  </svg>
);

const BodyDragAnimation = () => (
  <div className="body-anim-wrapper">
    <div className="body-anim-box">
      <HumanFigureSVG />
      <div className="body-drag-rect" />
      <Cursor />
    </div>
  </div>
);

export default BodyDragAnimation;
