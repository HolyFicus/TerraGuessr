import React from 'react';
import { getMedalMeta } from '../game/geoMath';
import type { MedalTier } from '../game/types';

interface MedalIconProps {
  tier: MedalTier;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const SIZE_MAP = {
  xs: 16,
  sm: 20,
  md: 28,
  lg: 44,
};

const PALETTES: Record<
  MedalTier,
  { rim: string; face: string; inner: string; ribbon: string; star: string }
> = {
  platinum: {
    rim: '#A5F3FC',
    face: '#0E7490',
    inner: '#22D3EE',
    ribbon: '#38BDF8',
    star: '#ECFEFF',
  },
  gold: {
    rim: '#FDE68A',
    face: '#B45309',
    inner: '#F59E0B',
    ribbon: '#D97706',
    star: '#FFFBEB',
  },
  silver: {
    rim: '#F1F5F9',
    face: '#475569',
    inner: '#CBD5E1',
    ribbon: '#64748B',
    star: '#F8FAFC',
  },
  bronze: {
    rim: '#FDBA74',
    face: '#7C2D12',
    inner: '#EA580C',
    ribbon: '#C2410C',
    star: '#FFEDD5',
  },
  none: {
    rim: '#475569',
    face: '#1E293B',
    inner: '#334155',
    ribbon: '#334155',
    star: '#64748B',
  },
};

export const MedalIcon: React.FC<MedalIconProps> = ({
  tier,
  size = 'sm',
  showLabel = false,
  className = '',
}) => {
  const px = SIZE_MAP[size];
  const p = PALETTES[tier];
  const meta = getMedalMeta(tier);

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 ${className}`}
      title={meta.label}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        {/* Ribbon */}
        <path
          d="M10 3H14.5L16 10.5H11.5L10 3Z"
          fill={p.ribbon}
          fillOpacity={tier === 'none' ? 0.35 : 0.9}
        />
        <path
          d="M22 3H17.5L16 10.5H20.5L22 3Z"
          fill={p.ribbon}
          fillOpacity={tier === 'none' ? 0.25 : 0.72}
        />
        {/* Outer medal disc */}
        <circle
          cx="16"
          cy="19"
          r="10"
          fill={p.face}
          stroke={p.rim}
          strokeWidth="1.8"
          strokeDasharray={tier === 'none' ? '2.5 2.5' : undefined}
        />
        {/* Inner metallic ring */}
        <circle
          cx="16"
          cy="19"
          r="7"
          fill={p.inner}
          fillOpacity={tier === 'none' ? 0.2 : 0.35}
          stroke={p.rim}
          strokeOpacity="0.65"
          strokeWidth="1"
        />
        {/* Star / emblem */}
        {tier !== 'none' ? (
          <path
            d="M16 13.6L17.45 16.95L21.1 17.3L18.35 19.7L19.15 23.25L16 21.4L12.85 23.25L13.65 19.7L10.9 17.3L14.55 16.95L16 13.6Z"
            fill={p.star}
          />
        ) : (
          <circle cx="16" cy="19" r="2.2" fill={p.star} fillOpacity="0.55" />
        )}
      </svg>
      {showLabel && (
        <span className={`font-semibold whitespace-nowrap ${meta.textClass}`}>
          {meta.label}
        </span>
      )}
    </span>
  );
};
