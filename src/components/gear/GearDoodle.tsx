'use client';

type GearDoodleProps = {
  variant: 'bike' | 'shoe';
  retired?: boolean;
  className?: string;
};

/**
 * Hand-drawn doodle-style SVG illustrations for gear cards.
 * Uses rough/sketchy strokes to achieve a playful look.
 */
const GearDoodle = ({variant, retired = false, className = ''}: GearDoodleProps) => {
  const strokeColor = retired ? 'hsl(var(--muted-foreground))' : 'hsl(var(--nav-gear))';
  const fillAccent = retired ? 'hsl(var(--muted-foreground) / 0.1)' : 'hsl(var(--nav-gear) / 0.15)';

  if (variant === 'bike') {
    return (
      <svg
        viewBox="0 0 200 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        {/* Back wheel */}
        <circle
          cx="50" cy="80" r="28"
          stroke={strokeColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2 4"
          fill={fillAccent}
        />
        {/* Back wheel hub */}
        <circle cx="50" cy="80" r="4" fill={strokeColor} opacity={0.6} />
        {/* Front wheel */}
        <circle
          cx="150" cy="80" r="28"
          stroke={strokeColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="2 4"
          fill={fillAccent}
        />
        {/* Front wheel hub */}
        <circle cx="150" cy="80" r="4" fill={strokeColor} opacity={0.6} />
        {/* Frame — seat tube */}
        <path
          d="M50 80 L85 38"
          stroke={strokeColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Frame — down tube */}
        <path
          d="M50 80 L110 62"
          stroke={strokeColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Frame — top tube */}
        <path
          d="M85 38 L118 40"
          stroke={strokeColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Frame — head tube */}
        <path
          d="M118 40 L110 62"
          stroke={strokeColor}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Fork */}
        <path
          d="M118 40 L150 80"
          stroke={strokeColor}
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Chain stay */}
        <path
          d="M110 62 L150 80"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity={0.7}
        />
        {/* Seat */}
        <path
          d="M78 35 Q85 28 92 35"
          stroke={strokeColor}
          strokeWidth="3"
          strokeLinecap="round"
          fill={fillAccent}
        />
        {/* Handlebars */}
        <path
          d="M112 32 Q118 28 126 30"
          stroke={strokeColor}
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Pedal crank */}
        <circle cx="110" cy="62" r="6" stroke={strokeColor} strokeWidth="2" fill={fillAccent} />
        {/* Spokes — back wheel (sketchy) */}
        <path d="M50 80 L38 58" stroke={strokeColor} strokeWidth="1" opacity={0.3} />
        <path d="M50 80 L68 62" stroke={strokeColor} strokeWidth="1" opacity={0.3} />
        <path d="M50 80 L30 72" stroke={strokeColor} strokeWidth="1" opacity={0.3} />
        <path d="M50 80 L62 98" stroke={strokeColor} strokeWidth="1" opacity={0.3} />
        {/* Spokes — front wheel (sketchy) */}
        <path d="M150 80 L138 58" stroke={strokeColor} strokeWidth="1" opacity={0.3} />
        <path d="M150 80 L168 62" stroke={strokeColor} strokeWidth="1" opacity={0.3} />
        <path d="M150 80 L132 92" stroke={strokeColor} strokeWidth="1" opacity={0.3} />
        <path d="M150 80 L164 98" stroke={strokeColor} strokeWidth="1" opacity={0.3} />
      </svg>
    );
  }

  // Shoe variant
  return (
    <svg
      viewBox="0 0 200 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Sole */}
      <path
        d="M20 88 Q18 92 22 96 L160 96 Q172 96 178 90 Q180 88 178 84 L170 82 L20 82 Z"
        stroke={strokeColor}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={fillAccent}
      />
      {/* Shoe body */}
      <path
        d="M26 82 L30 48 Q32 38 42 34 L72 28 Q82 26 88 30 L100 38 Q108 42 115 42 L165 52 Q174 54 176 62 L178 78 Q178 82 174 82 Z"
        stroke={strokeColor}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={fillAccent}
      />
      {/* Tongue */}
      <path
        d="M62 32 Q64 18 72 14 Q78 12 82 16 L88 30"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Lace holes */}
      <circle cx="56" cy="38" r="2" fill={strokeColor} opacity={0.5} />
      <circle cx="68" cy="34" r="2" fill={strokeColor} opacity={0.5} />
      <circle cx="80" cy="32" r="2" fill={strokeColor} opacity={0.5} />
      {/* Laces (sketchy zigzag) */}
      <path
        d="M56 38 L68 34 M68 34 L60 36 M60 36 L80 32 M80 32 L72 34"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity={0.6}
      />
      {/* Toe cap line */}
      <path
        d="M160 68 Q165 72 168 80"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.5}
      />
      {/* Heel detail */}
      <path
        d="M28 48 L30 78"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={0.4}
      />
      {/* Sole tread marks */}
      <path d="M40 96 L40 92" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
      <path d="M60 96 L60 92" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
      <path d="M80 96 L80 92" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
      <path d="M100 96 L100 92" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
      <path d="M120 96 L120 92" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
      <path d="M140 96 L140 92" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" opacity={0.3} />
      {/* Nike-style swoosh doodle */}
      <path
        d="M48 68 Q80 74 120 58 Q140 50 155 55"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity={0.5}
      />
    </svg>
  );
};

export default GearDoodle;
