import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { PehlooFaceDivider, PehlooHappyFace, PehlooSadFace } from '@/components/ui/pehlooFace';

interface Props {
  className?: string;
  size?: number;
  /**
   * Bump to run the rapid happy/sad flicker — the brand mark's "something happened" tic, as the
   * sidebar logo did when the panel was expanded. Also fires on mount for a non-zero value, which
   * is what a panel that remounts on each open relies on.
   */
  flicker?: number;
}

const FLICKER_INTERVAL_MS = 80;
const FLICKER_DURATION_MS = 1000;

export function PehlooFaceMark({ className, size = 32, flicker = 0 }: Props) {
  const [flipped, setFlipped] = useState(false);
  const [flickering, setFlickering] = useState(false);

  useEffect(() => {
    if (!flicker) return;
    setFlickering(true);
    const interval = setInterval(() => setFlipped(value => !value), FLICKER_INTERVAL_MS);
    const stop = setTimeout(() => {
      clearInterval(interval);
      setFlickering(false);
      setFlipped(false);
    }, FLICKER_DURATION_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [flicker]);

  // While flickering the swap is instant; otherwise the masks cross-fade.
  const maskStyle = (visible: boolean) => ({
    opacity: (flipped ? !visible : visible) ? 1 : 0,
    transition: flickering ? 'none' : 'opacity 0.2s ease',
  });

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 14"
      width={size}
      height={size * (14 / 16)}
      className={cn('shrink-0', className)}
      aria-hidden="true"
      focusable="false"
    >
      <g style={maskStyle(true)}>
        <PehlooHappyFace />
      </g>
      <g style={maskStyle(false)}>
        <PehlooSadFace />
      </g>
      <PehlooFaceDivider />
    </svg>
  );
}
