let hubRegistration;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      hubRegistration = registration;
      if (registration.active) {
        document.getElementById('offline-toast')?.removeAttribute('hidden');
      }
    });
  });
}

const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone);
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (isIOS && !standalone) {
  document.getElementById('install-hint')?.removeAttribute('hidden');
  document.getElementById('ios-toast')?.removeAttribute('hidden');
}

document.getElementById('update-app')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!(button instanceof HTMLButtonElement) || button.disabled) return;
  button.disabled = true;
  button.textContent = '更新中';
  try {
    if ('serviceWorker' in navigator) {
      const registration = hubRegistration || await navigator.serviceWorker.getRegistration('/');
      await registration?.update();
    }
  } catch {
    // Reloading still gives the browser a chance to pick up a newer shell.
  }
  window.setTimeout(() => window.location.reload(), 180);
});
