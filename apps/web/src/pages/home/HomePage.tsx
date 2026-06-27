import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRateStore } from '../../stores/rate.store';

// ─── Scroll reveal hook ───────────────────────────────────────────────────────

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function Reveal({
  children, delay = 0, className = '', from = 'bottom', style = {},
}: {
  children: React.ReactNode; delay?: number; className?: string;
  from?: 'bottom' | 'left' | 'right'; style?: React.CSSProperties;
}) {
  const { ref, inView } = useInView();
  const translate = from === 'left' ? 'translateX(-48px)' : from === 'right' ? 'translateX(48px)' : 'translateY(48px)';
  return (
    <div ref={ref} className={className} style={{
      ...style,
      opacity: inView ? 1 : 0,
      transform: inView ? 'translate(0)' : translate,
      transition: `opacity 0.9s ease ${delay}ms, transform 0.9s cubic-bezier(.22,1,.36,1) ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

// ─── Mandala SVG ─────────────────────────────────────────────────────────────

function Mandala() {
  const G = 'rgba(201,151,58,';
  return (
    <svg viewBox="0 0 500 500" className="w-full h-full" style={{ overflow: 'visible' }}>
      {/* Outermost ring */}
      <circle cx="250" cy="250" r="240" fill="none" stroke={`${G}0.08)`} strokeWidth="1" />
      <circle cx="250" cy="250" r="228" fill="none" stroke={`${G}0.12)`} strokeWidth="0.5" strokeDasharray="3 9" />

      {/* 16 outer petal dots */}
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * 22.5 * Math.PI) / 180;
        return <circle key={i} cx={250 + Math.cos(a) * 215} cy={250 + Math.sin(a) * 215} r="2.5" fill={`${G}0.35)`} />;
      })}

      {/* 8 large petals */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * 45 * Math.PI) / 180;
        const cx = 250 + Math.cos(a) * 150;
        const cy = 250 + Math.sin(a) * 150;
        const deg = i * 45;
        return (
          <ellipse key={i} cx={cx} cy={cy} rx="18" ry="52"
            fill={`${G}0.06)`} stroke={`${G}0.22)`} strokeWidth="0.6"
            transform={`rotate(${deg}, ${cx}, ${cy})`} />
        );
      })}

      {/* 8 small petals (rotated 22.5°) */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = ((i * 45 + 22.5) * Math.PI) / 180;
        const cx = 250 + Math.cos(a) * 130;
        const cy = 250 + Math.sin(a) * 130;
        const deg = i * 45 + 22.5;
        return (
          <ellipse key={i} cx={cx} cy={cy} rx="10" ry="36"
            fill={`${G}0.04)`} stroke={`${G}0.15)`} strokeWidth="0.5"
            transform={`rotate(${deg}, ${cx}, ${cy})`} />
        );
      })}

      {/* Mid rings */}
      <circle cx="250" cy="250" r="100" fill="none" stroke={`${G}0.15)`} strokeWidth="0.5" />
      <circle cx="250" cy="250" r="88"  fill="none" stroke={`${G}0.08)`} strokeWidth="0.5" strokeDasharray="2 6" />

      {/* 16 mid dots */}
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * 22.5 * Math.PI) / 180;
        return <circle key={i} cx={250 + Math.cos(a) * 100} cy={250 + Math.sin(a) * 100} r="1.5" fill={`${G}0.45)`} />;
      })}

      {/* Inner lotus — 8 petals */}
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * 45 * Math.PI) / 180;
        const cx = 250 + Math.cos(a) * 48;
        const cy = 250 + Math.sin(a) * 48;
        return (
          <ellipse key={i} cx={cx} cy={cy} rx="8" ry="22"
            fill={`${G}0.10)`} stroke={`${G}0.30)`} strokeWidth="0.5"
            transform={`rotate(${i * 45}, ${cx}, ${cy})`} />
        );
      })}

      {/* Inner rings */}
      <circle cx="250" cy="250" r="30" fill="none" stroke={`${G}0.25)`} strokeWidth="0.5" />
      <circle cx="250" cy="250" r="18" fill={`${G}0.08)`} stroke={`${G}0.35)`} strokeWidth="0.5" />

      {/* Center jewel */}
      <circle cx="250" cy="250" r="9" fill={`${G}0.45)`} stroke={`${G}0.7)`} strokeWidth="0.8" />
      <circle cx="250" cy="250" r="4" fill={`${G}0.9)`} />
    </svg>
  );
}

// ─── Jewellery category SVG icons ────────────────────────────────────────────

const CATEGORIES = [
  {
    name: 'Necklaces',
    hindi: 'Haar',
    desc: 'Layered chains, temple pendants, and kundan sets crafted in 22K gold.',
    icon: (
      <svg viewBox="0 0 80 80" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 18 Q40 62 64 18" stroke="#C9973A" strokeWidth="2.5"/>
        {[20,27,34,40,46,53,60].map((x, i) => (
          <circle key={i} cx={x} cy={18 + Math.sin((i/6)*Math.PI)*30} r="2.2" fill="#E8B84B" opacity="0.9"/>
        ))}
        <path d="M37 54 L40 68 L43 54" stroke="#C9973A" strokeWidth="1.5"/>
        <ellipse cx="40" cy="70" rx="4" ry="5.5" fill="rgba(201,151,58,0.3)" stroke="#C9973A" strokeWidth="1.5"/>
        <circle cx="40" cy="70" r="2" fill="#E8B84B"/>
      </svg>
    ),
  },
  {
    name: 'Rings',
    hindi: 'Angoothi',
    desc: 'Solitaires, bands, and statement rings set with precious gemstones.',
    icon: (
      <svg viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="44" r="22" stroke="#C9973A" strokeWidth="3" fill="rgba(201,151,58,0.05)"/>
        <path d="M30 25 Q40 10 50 25" stroke="#C9973A" strokeWidth="2.5"/>
        <ellipse cx="40" cy="17" rx="7" ry="5" fill="rgba(201,151,58,0.2)" stroke="#E8B84B" strokeWidth="1.5"/>
        <ellipse cx="40" cy="17" rx="3.5" ry="2.5" fill="#E8B84B"/>
      </svg>
    ),
  },
  {
    name: 'Bangles',
    hindi: 'Kangan',
    desc: 'Handcrafted gold and diamond bangles in traditional and modern styles.',
    icon: (
      <svg viewBox="0 0 80 80" fill="none">
        <circle cx="42" cy="42" r="22" stroke="#C9973A" strokeWidth="3.5" fill="rgba(201,151,58,0.04)"/>
        <circle cx="36" cy="36" r="19" stroke="#E8B84B" strokeWidth="2" strokeDasharray="3 4" fill="none" opacity="0.6"/>
        {[0,45,90,135,180,225,270,315].map((deg, i) => {
          const a = (deg * Math.PI) / 180;
          return <circle key={i} cx={42 + Math.cos(a)*22} cy={42 + Math.sin(a)*22} r="2" fill="#E8B84B" opacity="0.8"/>;
        })}
      </svg>
    ),
  },
  {
    name: 'Earrings',
    hindi: 'Jhumka',
    desc: 'Chandbali, jhumka, and stud earrings in gold, pearl, and enamel.',
    icon: (
      <svg viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="24" r="10" stroke="#C9973A" strokeWidth="2" fill="rgba(201,151,58,0.1)"/>
        <path d="M30 30 Q24 50 40 62 Q56 50 50 30" stroke="#C9973A" strokeWidth="2" fill="rgba(201,151,58,0.08)"/>
        {[0,1,2].map(i => (
          <line key={i} x1={35+i*2.5} y1="62" x2={34+i*2} y2="72" stroke="#E8B84B" strokeWidth="1.2"/>
        ))}
        {[0,1,2].map(i => (
          <circle key={i} cx={34+i*2+0.5} cy="73" r="1.5" fill="#E8B84B"/>
        ))}
        <circle cx="40" cy="24" r="4" fill="#E8B84B" opacity="0.8"/>
      </svg>
    ),
  },
  {
    name: 'Maang Tikka',
    hindi: 'Matha Patti',
    desc: 'Elegant forehead ornaments for weddings and festive occasions.',
    icon: (
      <svg viewBox="0 0 80 80" fill="none">
        <path d="M40 12 L40 38" stroke="#C9973A" strokeWidth="1.5" strokeDasharray="2 3"/>
        <path d="M20 12 Q40 8 60 12" stroke="#C9973A" strokeWidth="2"/>
        {[20,30,40,50,60].map((x, i) => (
          <circle key={i} cx={x} cy="12" r="2.5" fill="#E8B84B" opacity="0.8"/>
        ))}
        <ellipse cx="40" cy="46" rx="10" ry="13" fill="rgba(201,151,58,0.15)" stroke="#C9973A" strokeWidth="1.8"/>
        <ellipse cx="40" cy="46" rx="5" ry="7" fill="rgba(201,151,58,0.35)" stroke="#E8B84B" strokeWidth="1"/>
        <circle cx="40" cy="46" r="2.5" fill="#E8B84B"/>
        <path d="M34 56 L32 68" stroke="#C9973A" strokeWidth="1.2"/>
        <path d="M46 56 L48 68" stroke="#C9973A" strokeWidth="1.2"/>
        <circle cx="32" cy="69" r="2" fill="#E8B84B"/>
        <circle cx="48" cy="69" r="2" fill="#E8B84B"/>
      </svg>
    ),
  },
  {
    name: 'Anklets',
    hindi: 'Payal',
    desc: 'Sterling silver and gold anklets with traditional ghungroo charms.',
    icon: (
      <svg viewBox="0 0 80 80" fill="none">
        <ellipse cx="40" cy="38" rx="26" ry="10" stroke="#C9973A" strokeWidth="2.5" fill="rgba(201,151,58,0.05)"/>
        {[0,40,80,120,160,200,240,280,320].map((deg, i) => {
          const a = (deg * Math.PI) / 180;
          const inCharm = i % 3 === 0;
          const bx = 40 + Math.cos(a) * 26;
          const by = 38 + Math.sin(a) * 10;
          return inCharm ? (
            <g key={i}>
              <line x1={bx} y1={by} x2={bx} y2={by+10} stroke="#C9973A" strokeWidth="1.2"/>
              <ellipse cx={bx} cy={by+14} rx="2.5" ry="3.5" fill="rgba(201,151,58,0.3)" stroke="#E8B84B" strokeWidth="1"/>
            </g>
          ) : (
            <circle key={i} cx={bx} cy={by} r="1.8" fill="#E8B84B" opacity="0.7"/>
          );
        })}
      </svg>
    ),
  },
];

// ─── Promise pillars ──────────────────────────────────────────────────────────

const PILLARS = [
  {
    num: '916',
    unit: 'BIS Hallmark',
    label: 'Purity Certified',
    desc: 'Every piece carries a Bureau of Indian Standards hallmark — guaranteed 22K purity you can trust.',
    icon: (
      <svg viewBox="0 0 40 40" fill="none">
        <path d="M20 4 L34 10 L34 22 Q34 32 20 37 Q6 32 6 22 L6 10 Z" stroke="#C9973A" strokeWidth="1.5" fill="rgba(201,151,58,0.08)"/>
        <path d="M13 20 L18 25 L27 15" stroke="#E8B84B" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    num: '100%',
    unit: '',
    label: 'Live Metal Rates',
    desc: 'Gold and silver prices update in real time from international bullion markets — no hidden markups.',
    icon: (
      <svg viewBox="0 0 40 40" fill="none">
        <polyline points="6,30 14,18 22,24 30,12" stroke="#C9973A" strokeWidth="1.5" strokeLinejoin="round"/>
        <circle cx="30" cy="12" r="2.5" fill="#E8B84B"/>
        <line x1="6" y1="32" x2="34" y2="32" stroke="#C9973A" strokeWidth="1" opacity="0.4"/>
      </svg>
    ),
  },
  {
    num: '∞',
    unit: '',
    label: 'Bespoke Orders',
    desc: 'Work directly with our karigar team to design custom jewellery for weddings, anniversaries, or gifting.',
    icon: (
      <svg viewBox="0 0 40 40" fill="none">
        <path d="M8 32 Q12 8 20 20 Q28 32 32 8" stroke="#C9973A" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        <circle cx="20" cy="20" r="3" fill="rgba(201,151,58,0.3)" stroke="#E8B84B" strokeWidth="1"/>
      </svg>
    ),
  },
];

// ─── Rates strip ──────────────────────────────────────────────────────────────

function RatesStrip() {
  const rates = useRateStore((s) => s.rates);
  const connected = useRateStore((s) => s.connected);

  const LABELS: Record<string, string> = {
    'GOLD:GOLD_24K': 'Gold 24K', 'GOLD:GOLD_22K': 'Gold 22K',
    'GOLD:GOLD_18K': 'Gold 18K', 'SILVER:SILVER_999': 'Silver 999',
  };

  const items = Object.entries(LABELS)
    .map(([key, label]) => {
      const r = rates[key];
      return r ? `${label}  ₹${r.ratePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/g` : null;
    })
    .filter(Boolean) as string[];

  if (items.length === 0) return null;

  const doubled = [...items, ...items];

  return (
    <div style={{ background: '#1A1408', borderTop: '1px solid rgba(201,151,58,0.2)', borderBottom: '1px solid rgba(201,151,58,0.2)' }}
      className="overflow-hidden py-2.5">
      <div className="flex gap-10 whitespace-nowrap animate-ticker" style={{ width: 'max-content' }}>
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center gap-2.5 text-sm font-medium" style={{ color: '#E8B84B' }}>
            {connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-live-pulse inline-block" />}
            {item}
            <span style={{ color: 'rgba(201,151,58,0.3)' }}>◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HomePage() {
  const [heroReady, setHeroReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  const BG = '#0C0A06';
  const CARD_BG = '#131008';
  const GOLD = '#C9973A';
  const GOLD_LIGHT = '#E8B84B';
  const GOLD_PALE = '#F5E6C8';
  const MUTED = '#8A7A62';

  return (
    <div style={{ background: BG, color: GOLD_PALE, fontFamily: 'system-ui, sans-serif', overflowX: 'hidden' }}>

      {/* ── Global keyframes ── */}
      <style>{`
        @keyframes hp-spin   { to { transform: rotate(360deg); } }
        @keyframes hp-spin-r { to { transform: rotate(-360deg); } }
        @keyframes hp-float  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
        @keyframes hp-shimmer {
          0%   { background-position: -400% center; }
          100% { background-position:  400% center; }
        }
        @keyframes hp-pulse { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }
        .hp-gold-text {
          background: linear-gradient(90deg, #8A6008 0%, #E8B84B 30%, #FDF0C8 50%, #E8B84B 70%, #8A6008 100%);
          background-size: 300% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: hp-shimmer 5s linear infinite;
        }
        .hp-card:hover .hp-card-inner {
          border-color: rgba(201,151,58,0.5) !important;
          box-shadow: 0 0 28px rgba(201,151,58,0.12);
          transform: translateY(-4px);
        }
      `}</style>

      {/* ═══════════════════════════════════════════ HERO ══════════════════════ */}
      <section style={{ minHeight: '100vh', position: 'relative', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 1.5rem' }}>

        {/* Scattered star dots */}
        {[
          [8,12],[92,8],[5,55],[96,38],[12,82],[88,74],[50,6],[3,30],[97,65],[45,95],[70,15],[20,70],
        ].map(([x, y], i) => (
          <div key={i} style={{
            position: 'absolute', left: `${x}%`, top: `${y}%`,
            width: i % 3 === 0 ? 3 : 2, height: i % 3 === 0 ? 3 : 2,
            borderRadius: '50%', background: GOLD_LIGHT,
            opacity: 0.3 + (i % 5) * 0.1,
            animation: `hp-pulse ${2.5 + (i % 4) * 0.7}s ease-in-out infinite`,
            animationDelay: `${i * 0.3}s`,
          }} />
        ))}

        {/* Mandala */}
        <div style={{
          position: 'absolute', width: 'min(680px, 140vw)', height: 'min(680px, 140vw)',
          opacity: 0.9, animation: 'hp-spin 60s linear infinite',
          pointerEvents: 'none',
        }}>
          <Mandala />
        </div>

        {/* Counter-rotating inner ring */}
        <div style={{
          position: 'absolute', width: 'min(340px, 70vw)', height: 'min(340px, 70vw)',
          opacity: 0.6, animation: 'hp-spin-r 40s linear infinite',
          pointerEvents: 'none',
        }}>
          <svg viewBox="0 0 300 300" className="w-full h-full">
            <circle cx="150" cy="150" r="140" fill="none" stroke="rgba(201,151,58,0.15)" strokeWidth="1" strokeDasharray="6 12"/>
            {Array.from({ length: 24 }, (_, i) => {
              const a = (i * 15 * Math.PI) / 180;
              return <circle key={i} cx={150 + Math.cos(a) * 140} cy={150 + Math.sin(a) * 140} r="1.5" fill="rgba(201,151,58,0.4)"/>;
            })}
          </svg>
        </div>

        {/* Hero text */}
        <div style={{
          position: 'relative', textAlign: 'center', zIndex: 1,
          opacity: heroReady ? 1 : 0, transform: heroReady ? 'translateY(0)' : 'translateY(30px)',
          transition: 'opacity 1.2s ease, transform 1.2s cubic-bezier(.22,1,.36,1)',
        }}>
          {/* Pre-title */}
          <p style={{
            fontSize: '0.68rem', letterSpacing: '0.35em', color: GOLD,
            textTransform: 'uppercase', marginBottom: '1.2rem', fontWeight: 500,
          }}>
            Est. Mumbai · Fine Indian Jewellery
          </p>

          {/* Main title */}
          <h1 className="hp-gold-text" style={{
            fontSize: 'clamp(3.5rem, 14vw, 9rem)', fontWeight: 800,
            letterSpacing: '-0.02em', lineHeight: 0.9,
            marginBottom: '0.3rem',
          }}>
            SVARNA
          </h1>
          <p style={{
            fontSize: 'clamp(0.9rem, 3vw, 1.4rem)', letterSpacing: '0.55em',
            color: 'rgba(245,230,200,0.6)', textTransform: 'uppercase',
            fontWeight: 300, marginBottom: '1.8rem',
          }}>
            J E W E L S
          </p>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1.8rem' }}>
            <div style={{ height: 1, width: 80, background: `linear-gradient(to right, transparent, ${GOLD})` }} />
            <span style={{ color: GOLD, fontSize: '0.7rem' }}>◆</span>
            <div style={{ height: 1, width: 80, background: `linear-gradient(to left, transparent, ${GOLD})` }} />
          </div>

          {/* Tagline */}
          <p style={{
            fontSize: 'clamp(1rem, 3vw, 1.25rem)', color: 'rgba(245,230,200,0.75)',
            fontWeight: 300, letterSpacing: '0.04em', marginBottom: '2.8rem',
            maxWidth: 420, margin: '0 auto 2.8rem',
          }}>
            Where Heritage Meets Craft
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/catalogue" style={{
              background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)`,
              color: '#0C0A06', padding: '0.85rem 2.2rem',
              borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.875rem',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              textDecoration: 'none', transition: 'opacity 0.2s, transform 0.2s',
              display: 'inline-block',
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Explore Collection
            </Link>
            <Link to="/auth/login" style={{
              border: `1.5px solid rgba(201,151,58,0.45)`,
              color: GOLD_PALE, padding: '0.85rem 2.2rem',
              borderRadius: '0.5rem', fontWeight: 500, fontSize: '0.875rem',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              textDecoration: 'none', transition: 'border-color 0.2s, color 0.2s',
              display: 'inline-block', backdropFilter: 'blur(4px)',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD_LIGHT; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(201,151,58,0.45)'; e.currentTarget.style.color = GOLD_PALE; }}
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Scroll cue */}
        <div style={{
          position: 'absolute', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
          opacity: heroReady ? 0.5 : 0, transition: 'opacity 1.5s 1.5s ease',
        }}>
          <span style={{ fontSize: '0.6rem', letterSpacing: '0.25em', color: GOLD, textTransform: 'uppercase' }}>Scroll</span>
          <div style={{ width: 1, height: 32, background: `linear-gradient(to bottom, ${GOLD}, transparent)`, animation: 'hp-float 2s ease-in-out infinite' }} />
        </div>
      </section>

      {/* ═══════════════════════════════════════ LIVE RATES ════════════════════ */}
      <RatesStrip />

      {/* ═══════════════════════════════════ COLLECTIONS ═══════════════════════ */}
      <section style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.25rem,5vw,4rem)' }}>
        <Reveal className="text-center" style={{ marginBottom: '3.5rem' }}>
          <p style={{ fontSize: '0.68rem', letterSpacing: '0.35em', color: GOLD, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
            Handcrafted in India
          </p>
          <h2 style={{ fontSize: 'clamp(2rem,5vw,3rem)', fontWeight: 700, color: GOLD_PALE, marginBottom: '1rem' }}>
            Our Collections
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
            <div style={{ height: 1, width: 60, background: `linear-gradient(to right, transparent, ${GOLD})` }} />
            <span style={{ color: GOLD, fontSize: '0.6rem' }}>◆</span>
            <div style={{ height: 1, width: 60, background: `linear-gradient(to left, transparent, ${GOLD})` }} />
          </div>
        </Reveal>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
          gap: '1.25rem',
          maxWidth: 1100,
          margin: '0 auto',
        }}>
          {CATEGORIES.map((cat, i) => (
            <Reveal key={cat.name} delay={i * 90} className="hp-card" style={{ cursor: 'default' }}>
              <div className="hp-card-inner" style={{
                background: CARD_BG,
                border: '1px solid rgba(201,151,58,0.12)',
                borderRadius: '1rem',
                padding: '2rem 1.75rem',
                transition: 'border-color 0.3s, box-shadow 0.3s, transform 0.3s',
                height: '100%',
              }}>
                {/* Icon */}
                <div style={{ width: 80, height: 80, marginBottom: '1.25rem' }}>
                  {cat.icon}
                </div>
                {/* Name */}
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: GOLD_PALE, marginBottom: '0.2rem' }}>
                  {cat.name}
                </h3>
                <p style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: GOLD, textTransform: 'uppercase', marginBottom: '0.85rem', fontWeight: 500 }}>
                  {cat.hindi}
                </p>
                <p style={{ fontSize: '0.875rem', color: MUTED, lineHeight: 1.65 }}>
                  {cat.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ════════════════════════════ THE SVARNA PROMISE ═══════════════════════ */}
      <section style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.25rem,5vw,4rem)', background: '#0F0D08' }}>
        <Reveal className="text-center" style={{ marginBottom: '3.5rem' }}>
          <p style={{ fontSize: '0.68rem', letterSpacing: '0.35em', color: GOLD, textTransform: 'uppercase', marginBottom: '0.75rem' }}>
            Our Commitment
          </p>
          <h2 style={{ fontSize: 'clamp(2rem,5vw,3rem)', fontWeight: 700, color: GOLD_PALE }}>
            The Svarna Promise
          </h2>
        </Reveal>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))',
          gap: '2rem',
          maxWidth: 1000,
          margin: '0 auto',
        }}>
          {PILLARS.map((p, i) => (
            <Reveal key={p.label} delay={i * 120}>
              <div style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
                {/* Icon circle */}
                <div style={{
                  width: 64, height: 64, margin: '0 auto 1.5rem',
                  border: `1px solid rgba(201,151,58,0.25)`,
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(201,151,58,0.05)',
                }}>
                  {p.icon}
                </div>
                {/* Big number */}
                <div className="hp-gold-text" style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', fontWeight: 800, lineHeight: 1, marginBottom: '0.5rem' }}>
                  {p.num}
                </div>
                {p.unit && <div style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: GOLD, textTransform: 'uppercase', marginBottom: '0.75rem' }}>{p.unit}</div>}
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: GOLD_PALE, marginBottom: '0.85rem' }}>{p.label}</h3>
                <p style={{ fontSize: '0.875rem', color: MUTED, lineHeight: 1.7, maxWidth: 280, margin: '0 auto' }}>{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ════════════════════════════ HERITAGE SECTION ═════════════════════════ */}
      <section style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.25rem,5vw,4rem)', position: 'relative', overflow: 'hidden' }}>

        {/* Background mandala watermark */}
        <div style={{
          position: 'absolute', right: '-10%', top: '50%', transform: 'translateY(-50%)',
          width: 'min(500px, 80vw)', height: 'min(500px, 80vw)',
          opacity: 0.04, animation: 'hp-spin 90s linear infinite', pointerEvents: 'none',
        }}>
          <Mandala />
        </div>

        <div style={{ maxWidth: 760, margin: '0 auto', position: 'relative' }}>
          <Reveal from="left">
            <p style={{ fontSize: '0.68rem', letterSpacing: '0.35em', color: GOLD, textTransform: 'uppercase', marginBottom: '1rem' }}>
              Our Legacy
            </p>
            <h2 style={{ fontSize: 'clamp(2rem,5vw,3rem)', fontWeight: 700, color: GOLD_PALE, marginBottom: '2rem', lineHeight: 1.15 }}>
              A Thousand Years<br />of Indian Craft
            </h2>
          </Reveal>

          <Reveal from="left" delay={150}>
            <p style={{ fontSize: '1.05rem', color: MUTED, lineHeight: 1.85, marginBottom: '1.5rem' }}>
              Indian jewellery is one of the oldest art forms on earth — worn by royalty, offered at temples,
              and passed down through generations as heirlooms of love. At Svarna, we honour that tradition
              with every piece that leaves our workshop.
            </p>
            <p style={{ fontSize: '1.05rem', color: MUTED, lineHeight: 1.85, marginBottom: '2.5rem' }}>
              Each ornament is crafted by master karigars trained in techniques that trace their roots to
              Mughal and Rajput ateliers. From meenakari enamel to kundan stone-setting and jadau inlay —
              we make jewellery that carries a story.
            </p>
          </Reveal>

          <Reveal from="left" delay={250}>
            <div style={{ display: 'flex', gap: '3rem', flexWrap: 'wrap' }}>
              {[['22K & 18K', 'Gold purity'], ['BIS 916', 'Hallmarked'], ['HUID', 'Tracked items']].map(([val, label]) => (
                <div key={label}>
                  <div className="hp-gold-text" style={{ fontSize: '1.75rem', fontWeight: 800 }}>{val}</div>
                  <div style={{ fontSize: '0.75rem', color: MUTED, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '0.2rem' }}>{label}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════ METALS SECTION ═════════════════════════ */}
      <section style={{ background: '#0F0D08', padding: 'clamp(3rem,6vw,5rem) clamp(1.25rem,5vw,4rem)' }}>
        <Reveal>
          <div style={{
            maxWidth: 1000, margin: '0 auto',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))',
            gap: '1px', border: '1px solid rgba(201,151,58,0.12)', borderRadius: '1rem', overflow: 'hidden',
          }}>
            {[
              { label: 'Gold 24K', sub: 'Pure · Investment', karat: '999.9' },
              { label: 'Gold 22K', sub: 'Jewellery · BIS 916', karat: '916.7' },
              { label: 'Gold 18K', sub: 'Versatile · Modern', karat: '750.0' },
              { label: 'Silver 999', sub: 'Fine Silver', karat: '999.0' },
            ].map((m, i) => (
              <div key={m.label} style={{
                padding: '2rem 1.5rem', textAlign: 'center',
                background: i % 2 === 0 ? CARD_BG : '#0C0A06',
                borderRight: '1px solid rgba(201,151,58,0.08)',
              }}>
                <div style={{ fontSize: '0.6rem', letterSpacing: '0.3em', color: GOLD, textTransform: 'uppercase', marginBottom: '0.5rem' }}>{m.sub}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: GOLD_PALE, marginBottom: '0.25rem' }}>{m.label}</div>
                <div style={{ fontSize: '0.75rem', color: MUTED, fontFamily: 'monospace' }}>Fineness {m.karat}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ══════════════════════════════════ CTA ════════════════════════════════ */}
      <section style={{
        padding: 'clamp(5rem,10vw,9rem) clamp(1.25rem,5vw,4rem)',
        textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* Background mandala */}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ width: 'min(600px, 100vw)', height: 'min(600px, 100vw)', opacity: 0.06, animation: 'hp-spin 80s linear infinite' }}>
            <Mandala />
          </div>
        </div>

        <Reveal style={{ position: 'relative' }}>
          <p style={{ fontSize: '0.68rem', letterSpacing: '0.35em', color: GOLD, textTransform: 'uppercase', marginBottom: '1rem' }}>
            Begin Your Journey
          </p>
          <h2 style={{ fontSize: 'clamp(2rem,5vw,3.25rem)', fontWeight: 700, color: GOLD_PALE, marginBottom: '1.25rem', lineHeight: 1.15 }}>
            Discover Your<br />Perfect Ornament
          </h2>
          <p style={{ fontSize: '1rem', color: MUTED, maxWidth: 480, margin: '0 auto 2.5rem', lineHeight: 1.75 }}>
            Browse our full catalogue, check today's live rates, or visit our showroom
            for a personal consultation with our jewellery experts.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/catalogue" style={{
              background: `linear-gradient(135deg, ${GOLD} 0%, ${GOLD_LIGHT} 100%)`,
              color: '#0C0A06', padding: '0.9rem 2.5rem',
              borderRadius: '0.5rem', fontWeight: 700, fontSize: '0.875rem',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              textDecoration: 'none', transition: 'opacity 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              Browse Catalogue
            </Link>
            <Link to="/auth/login" style={{
              border: `1.5px solid rgba(201,151,58,0.4)`,
              color: GOLD_PALE, padding: '0.9rem 2.5rem',
              borderRadius: '0.5rem', fontWeight: 500, fontSize: '0.875rem',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              textDecoration: 'none', transition: 'border-color 0.2s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(201,151,58,0.4)')}
            >
              Staff Login
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ════════════════════════════════ FOOTER ═══════════════════════════════ */}
      <footer style={{
        borderTop: '1px solid rgba(201,151,58,0.12)',
        padding: '2rem clamp(1.25rem,5vw,4rem)',
        display: 'flex', flexWrap: 'wrap', gap: '1rem',
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: GOLD, fontSize: '0.9rem' }}>◆</span>
          <span style={{ fontWeight: 700, color: GOLD_PALE, fontSize: '0.95rem', letterSpacing: '0.05em' }}>SVARNA JEWELS</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: MUTED }}>
          BIS Hallmarked · Live Rates · Bespoke Orders
        </p>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <Link to="/catalogue" style={{ fontSize: '0.75rem', color: MUTED, textDecoration: 'none', letterSpacing: '0.05em' }}
            onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
            onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
            Catalogue
          </Link>
          <Link to="/auth/login" style={{ fontSize: '0.75rem', color: MUTED, textDecoration: 'none', letterSpacing: '0.05em' }}
            onMouseEnter={e => (e.currentTarget.style.color = GOLD)}
            onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
            Login
          </Link>
        </div>
      </footer>
    </div>
  );
}
