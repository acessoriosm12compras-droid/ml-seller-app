export default function Logo({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      role="img"
      aria-label="Seller ML"
      style={{ flexShrink: 0 }}
    >
      <rect x="0" y="0" width="28" height="28" rx="8" fill="var(--accent, #f0a420)" />
      {/* spark / linha ascendente */}
      <polyline
        points="6,20 11,13.5 15,16 22,8"
        fill="none"
        stroke="var(--on-accent, #fff8ee)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {/* ponto de destaque no topo */}
      <circle cx="22" cy="8" r="2.2" fill="var(--on-accent, #fff8ee)" />
      {/* barra de sombra sutil na parte inferior */}
      <rect x="0" y="20" width="28" height="8" rx="0" fill="rgba(0,0,0,0.12)" style={{ borderRadius: '0 0 8px 8px' }} />
      <rect x="0" y="20" width="28" height="8" rx="8" fill="rgba(0,0,0,0.10)" />
    </svg>
  )
}
