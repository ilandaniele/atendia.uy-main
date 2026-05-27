// src/widget/bootstrapper.ts

interface AtendiaConfig {
    token: string;
    theme?: {
        primaryColor?: string;
    };
}

const GLOBAL_NAME = 'atendia';
const w = window as any;

if (!w.__atendia_initialized) {
    w.__atendia_initialized = true;
    const queue = w[GLOBAL_NAME]?.q || [];

    w[GLOBAL_NAME] = function (command: string, args: any) {
        if (command === 'init') {
            initWidget(args);
        }
    };

    for (let i = 0; i < queue.length; i++) {
        w[GLOBAL_NAME].apply(null, queue[i]);
    }
}

function initWidget(config: AtendiaConfig) {
    if (!config || !config.token) return;

    const baseUrl = import.meta.env.VITE_SITE_URL || 'https://atendia.uy';
    const currentHost = window.location.hostname;
    const iframeSrc = `${baseUrl}/chat/${config.token}?host=${encodeURIComponent(currentHost)}`;
    
    const primaryColor = config.theme?.primaryColor || '#7c3aed';

    const style = document.createElement('style');
    style.innerHTML = `
        #atendia-widget-container {
            position: fixed !important;
            bottom: 20px !important;
            right: 20px !important;
            z-index: 2147483647 !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-end !important;
            pointer-events: none !important;
        }
        #atendia-iframe-wrapper {
            width: 380px !important;
            height: 600px !important;
            max-height: calc(100vh - 100px) !important;
            background: transparent !important;
            border-radius: 16px !important;
            box-shadow: 0 12px 24px rgba(0,0,0,0.15) !important;
            overflow: hidden !important;
            display: none !important;
            margin-bottom: 16px !important;
            transition: opacity 0.3s ease, transform 0.3s ease !important;
            opacity: 0 !important;
            transform: translateY(20px) !important;
            pointer-events: auto !important;
        }
        #atendia-iframe-wrapper.atendia-open {
            display: block !important;
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
        #atendia-chat-iframe {
            width: 100% !important;
            height: 100% !important;
            border: none !important;
            background: transparent !important;
            display: block !important;
        }
        #atendia-toggle-btn {
            width: 60px !important;
            height: 60px !important;
            border-radius: 50% !important;
            background-color: ${primaryColor} !important;
            color: white !important;
            border: none !important;
            cursor: pointer !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            transition: transform 0.2s !important;
            pointer-events: auto !important;
            padding: 0 !important;
            position: relative !important;
        }
        #atendia-toggle-btn:hover { transform: scale(1.05) !important; }
        #atendia-unread-badge {
            position: absolute !important;
            top: -4px !important;
            right: -4px !important;
            min-width: 20px !important;
            height: 20px !important;
            padding: 0 5px !important;
            border-radius: 10px !important;
            background: #ef4444 !important;
            color: #fff !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            line-height: 20px !important;
            text-align: center !important;
            display: none !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.25) !important;
            pointer-events: none !important;
        }
        @media (max-width: 480px) {
            #atendia-widget-container { bottom: 0 !important; right: 0 !important; width: 100vw !important; }
            #atendia-iframe-wrapper { 
                position: fixed !important; 
                top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; 
                width: 100vw !important; 
                height: 100vh !important; /* Fallback navegadores viejos */
                height: 100dvh !important; /* Medida mágica para móviles modernos */
                max-height: none !important; 
                margin: 0 !important; 
                border-radius: 0 !important; 
            }
            #atendia-iframe-wrapper.atendia-open ~ #atendia-toggle-btn { display: none !important; }
        }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'atendia-widget-container';
    
    container.innerHTML = `
        <div id="atendia-iframe-wrapper">
            <iframe id="atendia-chat-iframe" src="${iframeSrc}" allow="clipboard-write"></iframe>
        </div>
        <button id="atendia-toggle-btn" aria-label="Abrir chat">
            <img src="${baseUrl}/favicon.png" alt="Chat" id="atendia-btn-icon" style="width:36px;height:36px;object-fit:contain;display:block;pointer-events:none;" />
            <span id="atendia-unread-badge"></span>
        </button>
    `;

    document.body.appendChild(container);

    const btn = document.getElementById('atendia-toggle-btn');
    const wrapper = document.getElementById('atendia-iframe-wrapper');
    const iframe = document.getElementById('atendia-chat-iframe') as HTMLIFrameElement;
    const badge = document.getElementById('atendia-unread-badge') as HTMLSpanElement;
    let isOpen = false;

    function updateBadge(count: number) {
        if (!badge) return;
        if (count > 0 && !isOpen) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }

    if (btn && wrapper && iframe) {
        btn.addEventListener('click', () => {
            isOpen = !isOpen;
            if (isOpen) {
                // MAGIA: Bloqueamos el scroll del sitio del cliente en móviles
                if (window.innerWidth <= 480) {
                    document.body.style.setProperty('overflow', 'hidden', 'important');
                }
                wrapper.classList.add('atendia-open');
                updateBadge(0);
                iframe.contentWindow?.postMessage({ type: 'atendia:opened' }, '*');
            } else {
                // Restauramos el scroll
                document.body.style.removeProperty('overflow');
                wrapper.classList.remove('atendia-open');
                iframe.contentWindow?.postMessage({ type: 'atendia:closed' }, '*');
            }
        });

        window.addEventListener('message', (event) => {
            if (!event.origin.includes(baseUrl.replace('https://', '').replace('http://', ''))) return;

            if (event.data.type === 'atendia:close') {
                isOpen = false;
                document.body.style.removeProperty('overflow'); // Restauramos acá también
                wrapper.classList.remove('atendia-open');
                iframe.contentWindow?.postMessage({ type: 'atendia:closed' }, '*');
            } else if (event.data.type === 'atendia:unread') {
                updateBadge(event.data.count ?? 0);
            } else if (event.data.type === 'atendia:ready') {
                const color = event.data.primaryColor;
                if (color && btn) {
                    btn.style.setProperty('background-color', color, 'important');
                }
            }
        });
    }
}