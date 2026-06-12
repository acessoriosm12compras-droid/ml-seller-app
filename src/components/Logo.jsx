export default function Logo({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      role="img"
      aria-label="Seller ML"
      style={{ flexShrink: 0 }}
    >
      <rect x="1" y="1" width="24" height="24" rx="7" fill="var(--accent, #E89B16)" />
      <polyline
        points="6,17 11,12 14,14.5 20,8"
        fill="none"
        stroke="var(--surface, #ffffff)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="8" r="2" fill="var(--surface, #ffffff)" />
    </svg>
  )
}
