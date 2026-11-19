import React from 'react';

interface CompassHudProps {
  heading: number;
}

const CARDINALS: Array<{ deg: number; label: string; major: boolean }> = [
  { deg: 0, label: 'С', major: true },
  { deg: 45, label: 'СВ', major: false },
  { deg: 90, label: 'В', major: true },
  { deg: 135, label: 'ЮВ', major: false },
  { deg: 180, label: 'Ю', major: true },
  { deg: 225, label: 'ЮЗ', major: false },
  { deg: 270, label: 'З', major: true },
  { deg: 315, label: 'СЗ', major: false },
];

function normalizeHeading(deg: number): number {
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

export const CompassHud: React.FC<CompassHudProps> = ({ heading }) => {
  const norm = normalizeHeading(heading);
  const pxPerDeg = 2.4; // 360 deg = 864px strip

  // Render 3 cycles (-360, 0, +360) so wrapping across North is seamless
  const ticks: Array<{ key: string; deg: number; label?: string; major?: boolean }> = [];
  for (let cycle = -1; cycle <= 1; cycle++) {
    const offset = cycle * 360;
    for (let d = 0; d < 360; d += 15) {
      const cardinal = CARDINALS.find((c) => c.deg === d);
      ticks.push({
        key: `${cycle}_${d}`,
        deg: d + offset,
        label: cardinal?.label,
        major: cardinal?.major,
      });
    }
  }

  return (
    <div
      className="pointer-events-none absolute top-16 left-1/2 z-20 -translate-x-1/2 select-none sm:top-3.5 landscape-phone:top-2"
      aria-label={`Компас: ${Math.round(norm)}°`}
    >
      <div
        className="relative h-7 w-[184px] overflow-hidden rounded-lg border border-slate-700/80 shadow-lg sm:h-9 sm:w-[290px] landscape-phone:h-8 landscape-phone:w-[220px]"
        style={{ backgroundColor: 'rgba(11, 18, 32, 0.86)' }}
      >
        {/* Center North/Heading indicator notch */}
        <div
          className="absolute top-0 left-1/2 z-10 h-2 w-0.5 -translate-x-1/2 bg-amber-400"
          aria-hidden="true"
        />
        <div
          className="absolute bottom-0 left-1/2 z-10 h-1.5 w-0.5 -translate-x-1/2 bg-amber-400/80"
          aria-hidden="true"
        />

        {/* Sliding degree strip */}
        <div
          className="absolute top-0 left-1/2 h-full will-change-transform"
          style={{
            transform: `translate3d(${-norm * pxPerDeg}px, 0, 0)`,
          }}
        >
          {ticks.map((t) => (
            <div
              key={t.key}
              className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center justify-center"
              style={{ left: `${t.deg * pxPerDeg}px` }}
            >
              {t.label ? (
                <span
                  className={
                    t.major
                      ? 'font-mono text-xs font-bold tracking-wide text-slate-100'
                      : 'font-mono text-[10px] font-medium text-slate-400'
                  }
                >
                  {t.label === 'С' ? (
                    <span className="text-amber-400">С</span>
                  ) : (
                    t.label
                  )}
                </span>
              ) : (
                <span className="h-1.5 w-px bg-slate-600" />
              )}
            </div>
          ))}
        </div>

        {/* Left & Right edge fades */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-10"
          style={{
            background:
              'linear-gradient(to right, rgba(11,18,32,0.96), rgba(11,18,32,0))',
          }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-10"
          style={{
            background:
              'linear-gradient(to left, rgba(11,18,32,0.96), rgba(11,18,32,0))',
          }}
        />
      </div>
    </div>
  );
};
