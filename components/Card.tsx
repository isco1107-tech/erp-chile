import React from 'react';

interface CardProps {
  title: string;
  value: string;
}

const Card: React.FC<CardProps> = ({ title, value }) => {
  return (
    <div className="hud-surface rounded-2xl p-4 transition-all hover:border-cyan-500/40">
      <h3 className="hud-label mb-3">{title}</h3>
      <p className="font-mono text-3xl font-bold tabular-nums text-cyan-300">{value}</p>
    </div>
  );
};

export default Card;