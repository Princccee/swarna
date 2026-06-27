import { useTranslation } from 'react-i18next';

export function LanguageToggle({ dark = false }: { dark?: boolean }) {
  const { i18n } = useTranslation();
  const isHindi = i18n.language === 'hi';

  function toggle() {
    const next = isHindi ? 'en' : 'hi';
    i18n.changeLanguage(next);
    localStorage.setItem('svarna-lang', next);
  }

  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '4px 5px',
    borderRadius: '6px',
    border: dark ? '1px solid rgba(201,151,58,0.35)' : '1px solid rgba(120,80,0,0.25)',
    background: dark ? 'rgba(201,151,58,0.06)' : 'rgba(120,80,0,0.05)',
    cursor: 'pointer',
    fontFamily: "'Noto Serif Devanagari', system-ui, sans-serif",
    fontSize: '0.72rem',
    fontWeight: 600,
    letterSpacing: '0.03em',
    userSelect: 'none',
    transition: 'border-color 0.2s',
  };

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '2px 8px',
    borderRadius: '4px',
    background: active
      ? dark ? 'rgba(201,151,58,0.22)' : 'rgba(120,80,0,0.12)'
      : 'transparent',
    color: active
      ? dark ? '#E8B84B' : 'hsl(38 89% 28%)'
      : dark ? 'rgba(245,230,200,0.4)' : 'hsl(38 30% 55%)',
    transition: 'background 0.2s, color 0.2s',
    lineHeight: '1.5',
  });

  return (
    <button onClick={toggle} style={base} title={isHindi ? 'Switch to English' : 'हिंदी में बदलें'}>
      <span style={pill(!isHindi)}>EN</span>
      <span style={{ color: dark ? 'rgba(201,151,58,0.25)' : 'rgba(120,80,0,0.2)', fontSize: '0.65rem' }}>|</span>
      <span style={pill(isHindi)}>हि</span>
    </button>
  );
}
