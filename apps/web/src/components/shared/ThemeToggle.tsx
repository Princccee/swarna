import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../../stores/theme.store';

export function ThemeToggle() {
  const { theme, toggle } = useThemeStore();
  return (
    <button
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="text-muted-foreground hover:text-amber-400 transition-colors"
    >
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
