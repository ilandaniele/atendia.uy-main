/**
 * Sirve el embed script del widget con VITE_SITE_URL inyectado en build time.
 * GET /widget/v1/atendia-widget.js
 */
export function loader() {
    const siteUrl = import.meta.env.VITE_SITE_URL?.replace(/\/$/, '') ?? 'https://atendia.uy';
    const script = buildWidgetScript(siteUrl);

    return new Response(script, {
        headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
            'Access-Control-Allow-Origin': '*',
        },
    });
}

function buildWidgetScript(siteUrl: string): string {
    return `
(function (w, d) {
    'use strict';

    var BASE_URL     = ${JSON.stringify(siteUrl)};
    var CONTAINER_ID = 'atendia-container';
    var IFRAME_ID    = 'atendia-iframe';
    var BUTTON_ID    = 'atendia-button';
    var STYLE_ID     = 'atendia-styles';

    var isOpen      = false;
    var iframeReady = false;
    var _color      = '#0ea5e9';
    var _position   = 'bottom-right';
    var _btn, _container;

    // ── Helpers ────────────────────────────────────────────────────────────────

    function getContrastColor(hex) {
        if (!hex) return '#ffffff';
        var c = hex.replace('#', '');
        if (c.length === 3) c = c.split('').map(function (x) { return x + x; }).join('');
        if (c.length !== 6) return '#ffffff';
        var r = parseInt(c.slice(0, 2), 16);
        var g = parseInt(c.slice(2, 4), 16);
        var b = parseInt(c.slice(4, 6), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#000000' : '#ffffff';
    }

    function iconChat(c) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="' + c + '"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
    }

    function iconClose(c) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="' + c + '"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    }

    // ── CSS ────────────────────────────────────────────────────────────────────

    function buildCSS(color, pos) {
        var left   = pos === 'bottom-left';
        var hDesk  = left ? 'left:24px;right:auto' : 'right:24px;left:auto';
        var hMob   = left ? 'left:16px;right:auto' : 'right:16px;left:auto';

        return [
            '#' + BUTTON_ID + '{position:fixed;' + hDesk + ';bottom:24px;',
            'width:56px;height:56px;border-radius:50%;background:' + color + ';',
            'border:none;cursor:pointer;display:flex;align-items:center;',
            'justify-content:center;z-index:2147483647;padding:0;',
            'box-shadow:0 4px 20px rgba(0,0,0,.22);',
            'transition:transform .2s ease,box-shadow .2s ease;}',
            '#' + BUTTON_ID + ':hover{transform:scale(1.08);box-shadow:0 8px 28px rgba(0,0,0,.28)}',
            '#' + CONTAINER_ID + '{position:fixed;' + hDesk + ';bottom:92px;',
            'width:380px;height:600px;max-height:calc(100vh - 108px);',
            'border-radius:16px;overflow:hidden;',
            'box-shadow:0 8px 40px rgba(0,0,0,.18);border:1px solid rgba(0,0,0,.08);',
            'z-index:2147483646;opacity:0;pointer-events:none;',
            'transform:translateY(14px) scale(.97);',
            'transition:opacity .22s ease,transform .22s ease;}',
            '#' + CONTAINER_ID + '.atendia-open{opacity:1;pointer-events:all;transform:translateY(0) scale(1)}',
            '#' + IFRAME_ID + '{width:100%;height:100%;border:none;display:block}',
            '@media(max-width:480px){',
            '#' + CONTAINER_ID + '{right:0!important;left:0!important;bottom:0;',
            'width:100%;height:100%;max-height:100%;border-radius:0;border:none}',
            '#' + BUTTON_ID + '{' + hMob + ';bottom:16px}}',
        ].join('');
    }

    function applyStyles(color, pos) {
        var el = d.getElementById(STYLE_ID);
        if (!el) { el = d.createElement('style'); el.id = STYLE_ID; d.head.appendChild(el); }
        el.textContent = buildCSS(color, pos);
    }

    // ── Open / close ───────────────────────────────────────────────────────────

    function openWidget(token) {
        if (!iframeReady) {
            d.getElementById(IFRAME_ID).src =
                BASE_URL + '/chat/' + token + '?host=' + encodeURIComponent(w.location.hostname);
            iframeReady = true;
        }
        isOpen = true;
        _container.classList.add('atendia-open');
        _btn.setAttribute('aria-label', 'Cerrar chat');
        _btn.innerHTML = iconClose(getContrastColor(_color));
    }

    function closeWidget() {
        isOpen = false;
        _container.classList.remove('atendia-open');
        _btn.setAttribute('aria-label', 'Abrir chat');
        _btn.innerHTML = iconChat(getContrastColor(_color));
    }

    function syncColor(color) {
        _color = color;
        _btn.style.background = color;
        _btn.innerHTML = isOpen ? iconClose(getContrastColor(color)) : iconChat(getContrastColor(color));
        applyStyles(color, _position);
    }

    // ── Init ───────────────────────────────────────────────────────────────────

    function init(opts) {
        opts = opts || {};
        var token = opts.token;
        if (!token) { console.error('[Atendia] token requerido'); return; }

        _color    = (opts.theme && opts.theme.primaryColor) || '#0ea5e9';
        _position = (opts.theme && opts.theme.position)     || 'bottom-right';

        applyStyles(_color, _position);

        _container = d.createElement('div');
        _container.id = CONTAINER_ID;

        var iframe = d.createElement('iframe');
        iframe.id    = IFRAME_ID;
        iframe.title = 'Chat de atención - Atendia';
        iframe.allow = 'microphone';
        _container.appendChild(iframe);
        d.body.appendChild(_container);

        _btn = d.createElement('button');
        _btn.id = BUTTON_ID;
        _btn.setAttribute('aria-label', 'Abrir chat');
        _btn.innerHTML = iconChat(getContrastColor(_color));
        _btn.addEventListener('click', function () {
            if (isOpen) { closeWidget(); } else { openWidget(token); }
        });
        d.body.appendChild(_btn);

        w.addEventListener('message', function (e) {
            if (!e.data || typeof e.data.type !== 'string') return;
            if (e.data.type === 'atendia:close') { closeWidget(); }
            if (e.data.type === 'atendia:ready') {
                // La BD es la fuente de verdad: sincronizar color y posición
                if (e.data.primaryColor && e.data.primaryColor !== _color) syncColor(e.data.primaryColor);
                if (e.data.position && e.data.position !== _position) {
                    _position = e.data.position;
                    applyStyles(_color, _position);
                }
            }
        });
    }

    // ── Procesar cola de llamadas previas al load ──────────────────────────────

    function handler() {
        var args = Array.prototype.slice.call(arguments);
        if (args[0] === 'init') init(args[1]);
    }

    var stub = w[w['AtendiaWidgetObject']];
    if (stub && stub.q) { stub.q.forEach(function (a) { handler.apply(null, a); }); }
    w[w['AtendiaWidgetObject']] = handler;

}(window, document));
`.trim();
}
