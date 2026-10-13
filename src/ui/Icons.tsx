import React from 'react';
import { create } from 'zustand';

export type IconName =
  | 'messages'
  | 'bank'
  | 'invest'
  | 'forbes'
  | 'cars'
  | 'jobs'
  | 'calls'
  | 'gist'
  | 'light'
  | 'settings'
  | 'hunger'
  | 'energy'
  | 'fun'
  | 'social'
  | 'hygiene'
  | 'bladder'
  | 'music'
  | 'music-off'
  | 'home'
  | 'map'
  | 'buy'
  | 'phone'
  | 'bell'
  | 'arrow-up'
  | 'arrow-down'
  | 'radio'
  | 'civic'
  | 'knock'
  | 'break-in'
  | 'share'
  | 'enter'
  | 'upgrade'
  | 'build'
  | 'plot'
  | 'star';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName | string;
  size?: number | string;
  color?: string;
  fallback?: string;
}

export function Icon({ name, size = 20, color = 'currentColor', fallback, className, style, ...props }: IconProps) {
  const s = typeof size === 'number' ? `${size}px` : size;

  const baseSvgProps = {
    width: s,
    height: s,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style },
    ...props,
  };

  switch (name) {
    case 'messages':
      return (
        <svg {...baseSvgProps}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );

    case 'bank':
      return (
        <svg {...baseSvgProps}>
          <line x1="3" y1="21" x2="21" y2="21" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <polyline points="3 10 12 3 21 10" />
          <line x1="6" y1="14" x2="6" y2="18" />
          <line x1="10" y1="14" x2="10" y2="18" />
          <line x1="14" y1="14" x2="14" y2="18" />
          <line x1="18" y1="14" x2="18" y2="18" />
        </svg>
      );

    case 'invest':
      return (
        <svg {...baseSvgProps}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      );

    case 'forbes':
      return (
        <svg {...baseSvgProps}>
          <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" fill={color === 'currentColor' ? 'none' : color} />
          <circle cx="12" cy="18" r="1" />
        </svg>
      );

    case 'cars':
      return (
        <svg {...baseSvgProps}>
          <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H6c-.6 0-1.1.2-1.5.6L2.3 10C1.5 10.4 1 11.2 1 12v4c0 .6.4 1 1 1h2" />
          <circle cx="7" cy="17" r="2" />
          <path d="M9 17h6" />
          <circle cx="17" cy="17" r="2" />
        </svg>
      );

    case 'jobs':
      return (
        <svg {...baseSvgProps}>
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );

    case 'calls':
      return (
        <svg {...baseSvgProps}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      );

    case 'gist':
      return (
        <svg {...baseSvgProps}>
          <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
        </svg>
      );

    case 'light':
      return (
        <svg {...baseSvgProps}>
          <line x1="9" y1="18" x2="15" y2="18" />
          <line x1="10" y1="22" x2="14" y2="22" />
          <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5" />
        </svg>
      );

    case 'settings':
      return (
        <svg {...baseSvgProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );

    case 'home':
      return (
        <svg {...baseSvgProps}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );

    case 'knock':
      return (
        <svg {...baseSvgProps}>
          <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
          <path d="M3 21h18" />
          <circle cx="14.5" cy="12.5" r="1" />
        </svg>
      );

    case 'break-in':
      return (
        <svg {...baseSvgProps}>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </svg>
      );

    case 'share':
      return (
        <svg {...baseSvgProps}>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      );

    case 'enter':
      return (
        <svg {...baseSvgProps}>
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <polyline points="10 17 15 12 10 7" />
          <line x1="15" y1="12" x2="3" y2="12" />
        </svg>
      );

    case 'upgrade':
      return (
        <svg {...baseSvgProps}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="16 12 12 8 8 12" />
          <line x1="12" y1="16" x2="12" y2="8" />
        </svg>
      );

    case 'build':
      return (
        <svg {...baseSvgProps}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z" />
        </svg>
      );

    case 'plot':
      return (
        <svg {...baseSvgProps}>
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );

    case 'star':
      return (
        <svg {...baseSvgProps}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );

    case 'map':
      return (
        <svg {...baseSvgProps}>
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      );

    case 'buy':
      return (
        <svg {...baseSvgProps}>
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      );

    case 'phone':
      return (
        <svg {...baseSvgProps}>
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
      );

    case 'music':
      return (
        <svg {...baseSvgProps}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );

    case 'music-off':
      return (
        <svg {...baseSvgProps}>
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v9" />
          <circle cx="6" cy="18" r="3" />
          <path d="M12 4.33l9-1.33v7.67" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );

    case 'hunger':
      return (
        <svg {...baseSvgProps}>
          <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
          <line x1="6" y1="1" x2="6" y2="4" />
          <line x1="10" y1="1" x2="10" y2="4" />
          <line x1="14" y1="1" x2="14" y2="4" />
        </svg>
      );

    case 'energy':
      return (
        <svg {...baseSvgProps}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );

    case 'fun':
      return (
        <svg {...baseSvgProps}>
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
      );

    case 'social':
      return (
        <svg {...baseSvgProps}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );

    case 'hygiene':
      return (
        <svg {...baseSvgProps}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
          <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
          <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
          <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
        </svg>
      );

    case 'bladder':
      return (
        <svg {...baseSvgProps}>
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        </svg>
      );

    case 'radio':
      return (
        <svg {...baseSvgProps}>
          <circle cx="12" cy="12" r="2" />
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
        </svg>
      );

    case 'civic':
      return (
        <svg {...baseSvgProps}>
          <path d="M3 10h18L12 3 3 10zM5 20h14M7 10v8m5-8v8m5-8v8M3 22h18" />
        </svg>
      );

    default:
      if (fallback) {
        return <span style={{ fontSize: s, lineHeight: 1 }}>{fallback}</span>;
      }
      return (
        <svg {...baseSvgProps}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

// The colour Noto emoji are a third of the game's download, so they come in their own file once the game is on
// screen (notoSet.tsx). Until it lands, the phone's own emoji shows.
const useNoto = create<{ set: typeof import('./notoSet') | null }>(() => ({ set: null }));
void import('./notoSet').then(
  (set) => useNoto.setState({ set }),
  () => {},
);

/** Colour Noto emoji (offline). Falls back to the plain emoji if unmapped. */
export function Emoji({ char, size = 20, style }: { char: string; size?: number | string; style?: React.CSSProperties }) {
  const noto = useNoto((s) => s.set);
  const hit = noto?.notoName(char);
  if (!noto || !hit) return <span style={{ fontSize: size, lineHeight: 1, ...style }}>{char}</span>;
  return <noto.NotoIcon name={hit} size={size} style={style} />;
}

/** Same-weight chevrons drawn as SVG, so they match each other (the ⌃ ⌄ text glyphs come from different fonts). */
const CHEVRON_PATHS = {
  up: 'M3.5 10.5 8 6l4.5 4.5',
  down: 'M3.5 5.5 8 10l4.5-4.5',
  left: 'M10.5 3.5 6 8l4.5 4.5',
  right: 'M5.5 3.5 10 8l-4.5 4.5',
};

export function Chevron({ dir, size = 16 }: { dir: 'up' | 'down' | 'left' | 'right'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block' }}>
      <path d={CHEVRON_PATHS[dir]} />
    </svg>
  );
}
