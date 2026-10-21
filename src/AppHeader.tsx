import type { ReactNode } from 'react';
import { KiteMark } from './KiteMark';
import { ThemeToggle } from './ThemeToggle';

export function AppHeader({onHome,children,mobileHidden=false,desktopHidden=false}:{onHome:()=>void;children?:ReactNode;mobileHidden?:boolean;desktopHidden?:boolean}) {
  return <header className={`site-header app-header${mobileHidden?' mobile-hidden':''}${desktopHidden?' desktop-hidden':''}`}>
    <a className="brand" aria-label="Kite home" href="/" onClick={event=>{event.preventDefault();onHome();}}><span className="brand-icon"><KiteMark transparent/></span><span className="brand-wordmark">kite</span></a>
    <span className="app-tagline">Your people. Your feed.</span>
    <div className="header-actions"><ThemeToggle/>{children}</div>
  </header>;
}
