const MEASUREMENT_ID = 'G-W6LF4ZBZ4Q';

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function initializeAnalytics() {
  // Never load Google's script in development or local production previews.
  if (!import.meta.env.PROD) return;

  const { protocol } = window.location;
  const hostname = window.location.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !['http:', 'https:'].includes(protocol) ||
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0' ||
    hostname === '[::1]' ||
    /^127\./.test(hostname)
  ) {
    return;
  }

  if (window.gtag) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
}
