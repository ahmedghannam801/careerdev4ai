// Apply the persisted theme before first paint so the app never flashes the
// opposite mode. This reads the same preference the app already uses.
//
// It lives in its own file (instead of an inline <script>) so the production
// Content-Security-Policy can keep `script-src 'self'` without an inline hash.
try {
  var savedSettings = localStorage.getItem('careerpilot_settings');
  if (savedSettings && JSON.parse(savedSettings).theme === 'dark') {
    document.documentElement.classList.add('dark');
  }
} catch (error) {
  /* Ignore malformed or unavailable storage. */
}
