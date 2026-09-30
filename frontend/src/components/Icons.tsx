/**
 * One SVG sprite for the whole site. <IconSprite/> is rendered once in the layout;
 * <Icon name="leaf"/> references a symbol from it.
 */

export type IconName =
  | "leaf"
  | "logo"
  | "succulent"
  | "gift"
  | "wa"
  | "pot-ceramic"
  | "pot-plastic"
  | "soil"
  | "stones"
  | "bag"
  | "pin"
  | "close"
  | "phone"
  | "clock";

export function Icon({ name, className, title }: { name: string; className?: string; title?: string }) {
  return (
    <svg className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <use href={`#${name}`} />
    </svg>
  );
}

export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <linearGradient id="logoLeafBack" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#33613d" />
          <stop offset="1" stopColor="#8fcf98" />
        </linearGradient>
        <linearGradient id="logoLeafFront" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#183820" />
          <stop offset="1" stopColor="#5da26c" />
        </linearGradient>
        <linearGradient id="logoLeafSide" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#2d5a3a" />
          <stop offset="1" stopColor="#a9dcae" />
        </linearGradient>
        <path id="logoLeafShape" d="M0,0 C-11,-8 -13,-22.5 -1,-35 C10.5,-23.5 12,-8 0,0 Z" />
        <path id="logoLeafRib" d="M0,-1.5 C-1,-13 -1,-25 -1.4,-33.5" />
      </defs>

      <symbol id="leaf" viewBox="0 0 48 48">
        <path d="M24 4C13 10 8 20 10 30c1.5 7 8 12 14 12s12.5-5 14-12c2-10-3-20-14-26z" fill="currentColor" opacity="0.16" />
        <path d="M24 6C17 12 13 20 14.5 28c1.2 6.2 6 10 9.5 10s8.3-3.8 9.5-10C35 20 31 12 24 6z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M24 8v28" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M24 14c-3 1.5-5.5 3.5-6.8 6M24 20c-3.4 1.6-6 3.8-7.4 6.6M24 26c-3.4 1.8-5.8 4-7 6.8M24 14c3 1.5 5.5 3.5 6.8 6M24 20c3.4 1.6 6 3.8 7.4 6.6M24 26c3.4 1.8 5.8 4 7 6.8" fill="none" stroke="currentColor" strokeWidth="1" />
      </symbol>

      <symbol id="logo" viewBox="0 0 64 64">
        <rect x="19" y="45" width="28" height="5.5" rx="2.2" style={{ fill: "var(--accent)" }} />
        <path d="M20.3,49 L45.7,49 L42.2,60.2 C41.8,61.6 40.6,62.5 39.1,62.5 H26.9 C25.4,62.5 24.2,61.6 23.8,60.2 Z" style={{ fill: "var(--accent)" }} />
        <path d="M20.3,49 L45.7,49 L44,54.2 H22 Z" style={{ fill: "color-mix(in srgb, var(--accent) 60%, black)" }} opacity="0.3" />
        <g transform="translate(25,49.5) rotate(-22) scale(0.82)">
          <use href="#logoLeafShape" fill="url(#logoLeafBack)" />
          <use href="#logoLeafRib" stroke="rgba(0,0,0,.28)" strokeWidth="1" fill="none" />
        </g>
        <g transform="translate(40,49.5) rotate(23) scale(0.8)">
          <use href="#logoLeafShape" fill="url(#logoLeafSide)" />
          <use href="#logoLeafRib" stroke="rgba(0,0,0,.25)" strokeWidth="1" fill="none" />
        </g>
        <g transform="translate(33,49.5) rotate(-2) scale(1.02)">
          <use href="#logoLeafShape" fill="url(#logoLeafFront)" />
          <use href="#logoLeafRib" stroke="rgba(0,0,0,.3)" strokeWidth="1.1" fill="none" />
        </g>
      </symbol>

      <symbol id="succulent" viewBox="0 0 48 48">
        <g fill="currentColor">
          <ellipse cx="24" cy="28" rx="6.2" ry="10.5" />
          <ellipse cx="24" cy="28" rx="6.2" ry="10.5" transform="rotate(60 24 28)" opacity=".82" />
          <ellipse cx="24" cy="28" rx="6.2" ry="10.5" transform="rotate(120 24 28)" opacity=".65" />
          <ellipse cx="24" cy="28" rx="6.2" ry="10.5" transform="rotate(180 24 28)" opacity=".82" />
          <ellipse cx="24" cy="28" rx="6.2" ry="10.5" transform="rotate(240 24 28)" opacity=".65" />
          <ellipse cx="24" cy="28" rx="6.2" ry="10.5" transform="rotate(300 24 28)" opacity=".82" />
        </g>
        <circle cx="24" cy="28" r="4" style={{ fill: "var(--accent)" }} />
      </symbol>

      <symbol id="gift" viewBox="0 0 48 48">
        <rect x="10" y="21" width="28" height="18" rx="2" fill="currentColor" opacity=".16" />
        <rect x="10" y="21" width="28" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 27h28M24 21v18" stroke="currentColor" strokeWidth="1.6" />
        <path d="M24 21c-4-6.5-12.5-6-12.5-.8 0 3 6.5 1 12.5.8zM24 21c4-6.5 12.5-6 12.5-.8 0 3-6.5 1-12.5.8z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </symbol>

      <symbol id="pot-ceramic" viewBox="0 0 48 48">
        <rect x="12" y="16" width="24" height="5.5" rx="2.2" style={{ fill: "var(--accent)" }} />
        <path d="M14,21.5 H34 L31.4,41.2 A3 3 0 0 1 28.4,43.8 H19.6 A3 3 0 0 1 16.6,41.2 Z" style={{ fill: "var(--accent)" }} />
        <path d="M17,26 c3.5,2.4 10.5,2.4 14,0" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1.5" strokeLinecap="round" />
      </symbol>

      <symbol id="pot-plastic" viewBox="0 0 48 48">
        <rect x="14.5" y="14.5" width="19" height="4.4" rx="1.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M16,19 H32 L30,37.5 A2.2 2.2 0 0 1 27.8,39.4 H20.2 A2.2 2.2 0 0 1 18,37.5 Z" fill="currentColor" opacity=".14" />
        <path d="M16,19 H32 L30,37.5 A2.2 2.2 0 0 1 27.8,39.4 H20.2 A2.2 2.2 0 0 1 18,37.5 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M17.4,23.5 H30.6 M17.9,28.5 H30.1 M18.4,33.5 H29.6" stroke="currentColor" strokeWidth="1" opacity=".55" />
      </symbol>

      <symbol id="soil" viewBox="0 0 48 48">
        <path d="M7,34 Q16,20 24,20 Q32,20 41,34 Z" fill="currentColor" opacity=".2" />
        <path d="M7,34 Q16,20 24,20 Q32,20 41,34 M7,34 H41" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <g fill="currentColor">
          <circle cx="16" cy="29" r="1.3" /><circle cx="22.5" cy="25" r="1.1" /><circle cx="28.5" cy="27" r="1.3" />
          <circle cx="33.5" cy="31" r="1" /><circle cx="19.5" cy="32" r="1" /><circle cx="30.5" cy="33" r="1.1" />
        </g>
      </symbol>

      <symbol id="stones" viewBox="0 0 48 48">
        <g fill="currentColor">
          <ellipse cx="16" cy="31" rx="7.5" ry="5.2" transform="rotate(-8 16 31)" opacity=".75" />
          <ellipse cx="29" cy="33" rx="9" ry="5.8" transform="rotate(6 29 33)" opacity=".55" />
          <ellipse cx="23" cy="24.5" rx="6.3" ry="4.4" transform="rotate(-4 23 24.5)" opacity=".92" />
        </g>
      </symbol>

      <symbol id="wa" viewBox="0 0 32 32">
        <path fill="currentColor" d="M16 3.2C9.1 3.2 3.5 8.8 3.5 15.7c0 2.6.8 5 2.1 7.1L4.3 28.8l6.2-1.9c1.9 1.1 4.1 1.7 6.4 1.7 6.9 0 12.5-5.6 12.5-12.5S22.9 3.2 16 3.2zm0 3.3c5.1 0 9.2 4.1 9.2 9.2s-4.1 9.2-9.2 9.2c-1.8 0-3.6-.5-5.1-1.5l-.5-.3-3.6.9.9-3.4-.3-.5c-1.1-1.7-1.7-3.5-1.7-5.4 0-5.1 4.2-9.2 9.3-9.2zm-3.9 4.9c-.2 0-.5.1-.7.4-.2.3-.9.9-.9 2.2 0 1.3.9 2.6 1.1 2.8.1.2 1.7 2.9 4.4 3.9 2.1.8 2.8.7 3.3.6.6-.1 1.6-.7 1.8-1.3.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.3-.3-.2-1.5-.7-1.8-.8-.2-.1-.4-.1-.6.1-.2.3-.7.8-.8 1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.2-1.4-.8-.7-1.3-1.7-1.5-2-.1-.2 0-.4.1-.5.1-.1.6-.7.7-.9.1-.2.1-.4 0-.6-.1-.2-.6-1.5-.9-2-.2-.4-.4-.4-.6-.4z" />
      </symbol>

      <symbol id="bag" viewBox="0 0 24 24">
        <path d="M6 7h12l-1 13H7L6 7z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </symbol>

      <symbol id="pin" viewBox="0 0 48 48">
        <path d="M24 4c-7.7 0-14 6.2-14 14 0 10.5 14 26 14 26s14-15.5 14-26c0-7.8-6.3-14-14-14z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="24" cy="18" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </symbol>

      <symbol id="close" viewBox="0 0 24 24">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </symbol>

      <symbol id="phone" viewBox="0 0 24 24">
        <path
          d="M6.6 10.8c1.2 2.4 3.2 4.4 5.6 5.6l1.9-1.9c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.5.6.6 0 1 .4 1 1V19c0 .6-.4 1-1 1C9.9 20 4 14.1 4 6.9c0-.6.4-1 1-1h2.9c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.5.1.3 0 .7-.3 1z"
          fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"
        />
      </symbol>

      <symbol id="clock" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 7.5V12l3.2 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>
    </svg>
  );
}
