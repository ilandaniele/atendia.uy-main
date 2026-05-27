import { useEffect } from 'react';

export default function AtendiaWidget() {
  useEffect(() => {
    // Evitar que el script se inyecte múltiples veces (problema común en React)
    if (document.getElementById('atendia-script-loader')) return;

    const script = document.createElement('script');
    script.id = 'atendia-script-loader';
    script.type = 'text/javascript';
    script.async = true;
    
    // Inyectamos exactamente tu snippet
    script.innerHTML = `
      (function(w,d,s,o,f,js,fjs){
        w['AtendiaWidgetObject']=o;
        w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
        js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
        js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
      }(window,document,'script','atendia','https://cdn.atendia.uy/widget/v1/atendia-widget.min.js'));
      
      atendia('init',{token:'a6ea6cd983f64c41b7f9da4ff7a91664mo3l4pjd'});
    `;

    document.body.appendChild(script);

    // Función de limpieza al desmontar (cuando sales a una ruta no pública)
    return () => {
      const existingScript = document.getElementById('atendia-script-loader');
      if (existingScript) existingScript.remove();
      
      // Intentamos remover el contenedor visual que crea tu widget (si existe)
      const widgetContainer = document.getElementById('atendia-widget-container'); 
      if (widgetContainer) widgetContainer.remove();
      
      // Limpiamos la función global para evitar errores si el usuario vuelve a entrar
      // @ts-ignore (ignoramos TypeScript acá porque window.atendia es inyectado dinámicamente)
      delete window.atendia;
      // @ts-ignore
      delete window.AtendiaWidgetObject;
    };
  }, []);

  return null;
}