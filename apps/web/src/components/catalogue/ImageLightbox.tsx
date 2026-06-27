import { useEffect, useRef, useState, useCallback } from 'react';

interface Props {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 4;

  const clampPan = useCallback((x: number, y: number, z: number) => {
    const el = containerRef.current;
    if (!el) return { x, y };
    const rect = el.getBoundingClientRect();
    const maxX = (rect.width * (z - 1)) / 2;
    const maxY = (rect.height * (z - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  }, []);

  const changeZoom = useCallback((delta: number) => {
    setZoom((z) => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + delta));
      if (next === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const navigate = useCallback((dir: 1 | -1) => {
    setIndex((i) => (i + dir + images.length) % images.length);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [images.length]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') navigate(1);
      if (e.key === 'ArrowLeft') navigate(-1);
      if (e.key === '+' || e.key === '=') changeZoom(0.5);
      if (e.key === '-') changeZoom(-0.5);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, navigate, changeZoom]);

  // Wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    changeZoom(e.deltaY < 0 ? 0.3 : -0.3);
  };

  // Drag pan
  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setPan((p) => clampPan(p.x + dx, p.y + dy, zoom));
  };

  const onPointerUp = () => { dragging.current = false; };

  // Touch swipe (when not zoomed)
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (zoom > 1) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current || zoom > 1) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    if (Math.abs(dx) > 50) navigate(dx < 0 ? 1 : -1);
    touchStart.current = null;
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'rgba(0,0,0,0.4)',
      }}>
        {/* Image counter */}
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.82rem' }}>
          {index + 1} / {images.length}
        </span>

        {/* Zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => changeZoom(-0.5)} style={zoomBtnStyle} title="Zoom out">−</button>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', minWidth: '32px', textAlign: 'center' }}>
            {zoom.toFixed(1)}×
          </span>
          <button onClick={() => changeZoom(0.5)} style={zoomBtnStyle} title="Zoom in">+</button>
          {zoom > 1 && (
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} style={{ ...zoomBtnStyle, fontSize: '0.7rem', padding: '4px 8px' }}>
              Reset
            </button>
          )}
        </div>

        {/* Close */}
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)',
          cursor: 'pointer', fontSize: '1.4rem', lineHeight: 1, padding: '4px 8px',
        }}>✕</button>
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          cursor: zoom > 1 ? 'grab' : 'default',
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img
          src={images[index]}
          alt=""
          draggable={false}
          style={{
            maxWidth: '90vw', maxHeight: '80vh',
            objectFit: 'contain',
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: dragging.current ? 'none' : 'transform 0.15s ease',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Prev / Next arrows */}
      {images.length > 1 && (
        <>
          <button
            onClick={() => navigate(-1)}
            style={{ ...navBtnStyle, left: '16px' }}
          >
            ‹
          </button>
          <button
            onClick={() => navigate(1)}
            style={{ ...navBtnStyle, right: '16px' }}
          >
            ›
          </button>
        </>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div style={{
          position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.5)',
          padding: '8px', borderRadius: '12px',
        }}>
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => { setIndex(i); setZoom(1); setPan({ x: 0, y: 0 }); }}
              style={{
                width: '44px', height: '44px', borderRadius: '6px', overflow: 'hidden',
                border: i === index ? '2px solid hsl(38 89% 58%)' : '2px solid transparent',
                padding: 0, cursor: 'pointer', flexShrink: 0,
              }}
            >
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff',
  borderRadius: '6px',
  width: '32px', height: '32px',
  cursor: 'pointer',
  fontSize: '1.1rem',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1,
};

const navBtnStyle: React.CSSProperties = {
  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
  background: 'rgba(255,255,255,0.12)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', borderRadius: '50%',
  width: '48px', height: '48px',
  cursor: 'pointer', fontSize: '1.8rem', lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 10,
};
