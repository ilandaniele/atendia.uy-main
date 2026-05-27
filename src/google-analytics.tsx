import { useEffect } from 'react';

export default function GoogleAnalytics() {
  useEffect(() => {
    // Evitar que el script se inyecte múltiples veces (problema común en React)
    if (document.getElementById('ga-script-config')) return;

    const script1 = document.createElement('script');
    script1.id = 'ga-script-config';
    script1.type = 'text/javascript';
    script1.async = true;
    
    // Inyectamos exactamente tu snippet
    script1.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());

        gtag('config', 'G-X7ESH1VX3L');
    `;

    const script2 = document.createElement('script');
    script2.id = 'atendia-ga-library';
    script2.src = 'https://www.googletagmanager.com/gtag/js?id=G-X7ESH1VX3L';
    script2.async = true;

    document.head.appendChild(script2);
    document.head.appendChild(script1);

    return () => {
      document.getElementById('ga-script-config')?.remove();
      document.getElementById('atendia-ga-library')?.remove();
    };
  }, []);

  return null;
}