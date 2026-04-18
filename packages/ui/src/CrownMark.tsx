import type { SVGProps } from 'react';

/**
 * Citizens Wear crown mark.
 *
 * Placeholder watermark — minimalist, line-style, tuned to the 50/20/30
 * palette. Rendered in gold by default; pass `className` to override. When
 * Citizens Network finalises brand assets this component is the single
 * swap-point.
 */
export function CrownMark({
  className,
  title = 'Citizens Wear',
  ...rest
}: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 48 36"
      role="img"
      aria-label={title}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <title>{title}</title>
      {/* Crown band */}
      <path d="M6 28h36" />
      {/* Crown silhouette: five peaks with jeweled dots */}
      <path d="M6 28 L10 10 L17 22 L24 6 L31 22 L38 10 L42 28" />
      {/* Jewels */}
      <circle cx="10" cy="10" r="1.2" fill="currentColor" />
      <circle cx="24" cy="6" r="1.4" fill="currentColor" />
      <circle cx="38" cy="10" r="1.2" fill="currentColor" />
      {/* Base line */}
      <path d="M8 32h32" strokeOpacity="0.6" />
    </svg>
  );
}
