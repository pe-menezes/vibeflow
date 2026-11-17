// The theme the button switches to: the opposite of what the page shows now. With no explicit
// choice (no data-theme), the page shows the system theme.
export function nextTheme(current, systemPrefersDark) {
  const shown = current === 'dark' || current === 'light' ? current : systemPrefersDark ? 'dark' : 'light';
  return shown === 'dark' ? 'light' : 'dark';
}
