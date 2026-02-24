export function TransporterIcon({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 44h32c4 0 7-3 7-7v-5c0-4-3-7-7-7H24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M24 25l6-10c1-2 3-3 5-3h7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M12 46h34" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <circle cx="18" cy="46" r="5" fill="currentColor" />
      <circle cx="40" cy="46" r="5" fill="currentColor" />
    </svg>
  )
}

export function MachineGlyph({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="12" y="18" width="40" height="28" rx="6" stroke="currentColor" strokeWidth="3" />
      <path d="M20 26h24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M20 34h18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="46" cy="34" r="3" fill="currentColor" />
    </svg>
  )
}
