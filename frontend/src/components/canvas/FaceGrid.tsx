import { PehlooFaceDivider, PehlooHappyFace, PehlooSadFace } from '@/components/ui/pehlooFace';

/**
 * The canvas backdrop: a square lattice of theatre masks.
 *
 * Painted as an SVG `<pattern>` fill rather than one DOM node per face. A repeating fill is
 * square by construction (the tile is square), covers any viewport for O(1) cost, and lets the
 * faces flip from a single CSS animation inside a `<mask>` with no per-face React work.
 *
 * `TILE` is the on-screen pitch, so `TILE` is both the column and the row spacing.
 */
const TILE = 80;
const FACE_WIDTH = 34;
/** The shared face geometry's viewBox in `pehlooFace.tsx`. */
const FACE_VIEWBOX_WIDTH = 16;
const FACE_VIEWBOX_HEIGHT = 14;
const FACE_SCALE = FACE_WIDTH / FACE_VIEWBOX_WIDTH;
const FACE_HEIGHT = FACE_WIDTH * (FACE_VIEWBOX_HEIGHT / FACE_VIEWBOX_WIDTH);
const FACE_X = (TILE - FACE_WIDTH) / 2;
const FACE_Y = (TILE - FACE_HEIGHT) / 2;

interface Props {
  /** While true, faces flip to the tragedy mask in a band that sweeps across the lattice. */
  processing: boolean;
}

export function FaceGrid({ processing }: Props) {
  return (
    <svg
      className={`pf-face-grid h-full w-full text-foreground${processing ? ' is-processing' : ''}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <g id="pf-face-happy">
          <PehlooHappyFace />
          <PehlooFaceDivider />
        </g>
        <g id="pf-face-sad">
          <PehlooSadFace />
          <PehlooFaceDivider />
        </g>

        <pattern id="pf-lattice-happy" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          <use href="#pf-face-happy" transform={`translate(${FACE_X} ${FACE_Y}) scale(${FACE_SCALE})`} />
        </pattern>
        <pattern id="pf-lattice-sad" width={TILE} height={TILE} patternUnits="userSpaceOnUse">
          <use href="#pf-face-sad" transform={`translate(${FACE_X} ${FACE_Y}) scale(${FACE_SCALE})`} />
        </pattern>

        {/* Hard-edged diagonal band, kept ~1.5 tiles wide so faces flip one at a time as it
            crosses them. The tragedy layer is revealed by the band; the comedy layer is hidden by
            its complement, so a face swaps rather than gaining a second mask. */}
        <linearGradient id="pf-wave" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.44" stopColor="black" />
          <stop offset="0.46" stopColor="white" />
          <stop offset="0.54" stopColor="white" />
          <stop offset="0.56" stopColor="black" />
        </linearGradient>
        <linearGradient id="pf-wave-inverse" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.44" stopColor="white" />
          <stop offset="0.46" stopColor="black" />
          <stop offset="0.54" stopColor="black" />
          <stop offset="0.56" stopColor="white" />
        </linearGradient>
        <mask id="pf-wave-sad-mask">
          <rect
            className="pf-wave-band"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            fill="url(#pf-wave)"
          />
        </mask>
        <mask id="pf-wave-happy-mask">
          <rect
            className="pf-wave-band"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
            fill="url(#pf-wave-inverse)"
          />
        </mask>
      </defs>

      <rect
        className="pf-wave-happy"
        width="100%"
        height="100%"
        fill="url(#pf-lattice-happy)"
        mask="url(#pf-wave-happy-mask)"
      />
      <rect
        className="pf-wave-sad"
        width="100%"
        height="100%"
        fill="url(#pf-lattice-sad)"
        mask="url(#pf-wave-sad-mask)"
      />
    </svg>
  );
}
