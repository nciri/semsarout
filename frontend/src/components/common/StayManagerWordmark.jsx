/**
 * Wordmark StayManager.ma reproduisant la charte du site officiel :
 * police Kaushan Script, vert #1F3D34 (blanc en variante `light`),
 * initiales S/M à 1.32em et ".ma" doré #C9A24B.
 */
function StayManagerWordmark({ light = false, className = '' }) {
  return (
    <span
      className={`whitespace-nowrap ${className}`}
      style={{
        fontFamily: '"Kaushan Script", cursive',
        fontWeight: 400,
        lineHeight: 1,
        color: light ? '#FFFFFF' : '#1F3D34'
      }}
    >
      <span style={{ fontSize: '1.32em' }}>S</span>tay
      <span style={{ fontSize: '1.32em' }}>M</span>anager
      <span style={{ color: '#C9A24B' }}>.ma</span>
    </span>
  )
}

export default StayManagerWordmark
