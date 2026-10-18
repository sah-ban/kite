// Apply the saved/system theme before the application renders.
(() => {
  let saved;
  try { saved = localStorage.getItem('freecast-theme'); } catch {}
  const theme = saved === 'dark' || saved === 'light'
    ? saved
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141b18' : '#f7f8f3');
})();
