interface Props {
  message: string
  onDismiss?: () => void
}

export default function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div style={{
      background: '#fef2f2', border: '1px solid #fca5a5',
      borderRadius: 8, padding: '1rem 1.5rem',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '1rem',
    }}>
      <span style={{ color: '#b91c1c', fontSize: '0.9rem' }}>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', fontWeight: 700 }}>✕</button>
      )}
    </div>
  )
}
