/**
 * Pixel-art theatre-masks geometry (16x14 viewBox). One definition, shared by the canvas
 * backdrop pattern and any interactive logo built on it.
 *
 * The brand mark draws the pair side by side (comedy x 0-7, tragedy x 9-16), but each variant
 * here is normalised to the SAME box (mask at x 0-7, divider at 7.5-8.5) so a caller can swap one
 * for the other in place — otherwise flipping a face shifts it sideways.
 */

export function PehlooHappyFace() {
  return (
    <g fill="currentColor">
      <rect x="0" y="0" width="7" height="1" />
      <rect x="0" y="0" width="1" height="8" />
      <rect x="0" y="7" width="2" height="1" />
      <rect x="1" y="8" width="1" height="1" />
      <rect x="2" y="9" width="1" height="1" />
      <rect x="3" y="10" width="2" height="1" />
      <rect x="6" y="0" width="1" height="3" />
      <rect x="1.5" y="3" width="1.5" height="1.5" />
      <rect x="4.5" y="3" width="1.5" height="1.5" />
      <rect x="2" y="7" width="1" height="1" />
      <rect x="3" y="8" width="2" height="1" />
      <rect x="5" y="7" width="1" height="1" />
    </g>
  );
}

export function PehlooSadFace() {
  return (
    <g fill="currentColor">
      <rect x="0" y="0" width="7" height="1" />
      <rect x="6" y="0" width="1" height="8" />
      <rect x="5" y="7" width="2" height="1" />
      <rect x="5" y="8" width="1" height="1" />
      <rect x="4" y="9" width="1" height="1" />
      <rect x="2" y="10" width="2" height="1" />
      <rect x="0" y="0" width="1" height="3" />
      <rect x="1" y="3" width="1.5" height="1.5" />
      <rect x="4" y="3" width="1.5" height="1.5" />
      <rect x="1" y="8" width="1" height="1" />
      <rect x="2" y="7" width="2" height="1" />
      <rect x="4" y="8" width="1" height="1" />
    </g>
  );
}

export function PehlooFaceDivider() {
  return <rect x="7.5" y="0" width="1" height="11" fill="currentColor" opacity="0.3" />;
}
