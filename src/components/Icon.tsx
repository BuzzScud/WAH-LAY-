/**
 * The handful of icons this site needs, as inline SVG.
 *
 * Emoji were doing this job before: they render differently on every platform,
 * change size unpredictably next to text, and read as literal words to a
 * screen reader ("wastebasket"). These inherit currentColor and stay put.
 */
interface Props {
  className?: string;
  /** Icons are decorative by default; pass a label to expose one. */
  label?: string;
}

const base = (label?: string) => ({
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  role: label ? ('img' as const) : undefined,
  'aria-label': label,
  'aria-hidden': label ? undefined : true,
});

export function TrashIcon({ className, label }: Props) {
  return (
    <svg {...base(label)} className={className}>
      <path d="M4 7h16M10 4h4M9 7v12M15 7v12M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function CloseIcon({ className, label }: Props) {
  return (
    <svg {...base(label)} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function CheckIcon({ className, label }: Props) {
  return (
    <svg {...base(label)} className={className}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

export function PhoneIcon({ className, label }: Props) {
  return (
    <svg {...base(label)} className={className}>
      <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 006 6l1.5-2 4 1.5v3a2 2 0 01-2.2 2A16.5 16.5 0 014.5 5.7 2 2 0 016.5 3.5z" />
    </svg>
  );
}

export function ArrowRightIcon({ className, label }: Props) {
  return (
    <svg {...base(label)} className={className}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

/** Marks a spicy dish. Filled, so it holds up at 12px next to a dish name. */
export function ChiliIcon({ className, label }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path
        d="M13 5.2c1.6-1.9 3.6-2 4.6-1.4.5.3.3 1-.3 1-1 0-1.9.5-2.4 1.3 2.4 1 3.6 3.4 3.6 6.1 0 4.4-3.6 8-8 8-3.4 0-6-1.9-6-3.6 0-.8.7-1.1 1.4-.9 3.6 1.1 7.1-2.3 7.1-6.2 0-1.6-.4-3.1-1.1-4.3z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Small four-point star used as a list marker and marquee separator. */
export function SparkIcon({ className, label }: Props) {
  return (
    <svg viewBox="0 0 24 24" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill="currentColor" />
    </svg>
  );
}
