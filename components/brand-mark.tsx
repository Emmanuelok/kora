import type { SVGProps } from 'react';

/** A vector mark avoids platform-dependent colour emoji rendering. */
export default function BrandMark(props: SVGProps<SVGSVGElement>) {
  return <svg width="1em" height="1em" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
    <g transform="translate(50 50)">{[0, 45, 90, 135].map(angle => <rect key={angle} x="-5.5" y="-43" width="11" height="86" rx="5.5" transform={`rotate(${angle})`}/>)}</g>
  </svg>;
}
