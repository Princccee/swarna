import { useTranslation } from 'react-i18next';

interface Category {
  id: string;
  name: string;
}

interface Props {
  categories: Category[];
  activeCategoryId: string;
  onChange: (id: string) => void;
  dark?: boolean;
}

export function CategoryRail({ categories, activeCategoryId, onChange, dark = false }: Props) {
  const { t } = useTranslation();

  const chips = [{ id: '', name: t('common.all') ?? 'All' }, ...categories];

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        padding: '0 0 4px',
        scrollbarWidth: 'none',
      }}
    >
      <style>{`.cat-rail::-webkit-scrollbar { display: none; }`}</style>
      <div className="cat-rail" style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        {chips.map((cat) => {
          const active = cat.id === activeCategoryId;
          return (
            <button
              key={cat.id}
              onClick={() => onChange(cat.id)}
              style={{
                flexShrink: 0,
                padding: '6px 16px',
                borderRadius: '99px',
                border: active
                  ? '1.5px solid #c8860a'
                  : dark ? '1.5px solid #3a3228' : '1.5px solid hsl(214 32% 88%)',
                background: active ? '#c8860a' : dark ? '#201c17' : '#fff',
                color: active ? '#fff' : dark ? '#ede0c8' : 'hsl(38 30% 40%)',
                fontSize: '0.82rem',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s, border-color 0.15s, color 0.15s',
                letterSpacing: '0.01em',
              }}
            >
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
