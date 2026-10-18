import { Moon, Sun } from 'lucide-react';
import { setThemePreference, useTheme } from './lib/theme';
export function ThemeToggle() {
  const {theme}=useTheme();const label=theme==='dark'?'Switch to light theme':'Switch to dark theme';
  return <button className="icon-button theme-toggle" aria-label={label} title={label} aria-pressed={theme==='dark'} onClick={()=>setThemePreference(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>;
}
