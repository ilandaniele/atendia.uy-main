import { memo, useEffect, useState, useMemo } from 'react';

interface WYSIWYGEditorProps {
    markdown: string;
    onChange?: (markdown: string) => void;
}

const WYSIWYGEditor = memo(function WYSIWYGEditor({
    markdown,
    onChange
}: WYSIWYGEditorProps) {
    const [Editor, setEditor] = useState<any>(null);

    useEffect(() => {
        let isMounted = true;

        if (typeof window !== 'undefined') {
            const loadFroala = async () => {
                try {
                    // Import core styles
                    // @ts-ignore
                    await import('froala-editor/css/froala_style.min.css');
                    // @ts-ignore
                    await import('froala-editor/css/froala_editor.pkgd.min.css');
                    
                    // Import JS
                    // @ts-ignore
                    await import('froala-editor/js/plugins.pkgd.min.js');
                    // @ts-ignore
                    await import('froala-editor/js/languages/es.js');
                    
                    // Import React component
                    // @ts-ignore
                    const froala = await import('react-froala-wysiwyg');
                    
                    if (isMounted) {
                        setEditor(() => froala.default || froala);
                    }
                } catch (error) {
                    console.error("Error loading Froala Editor:", error);
                }
            };
            loadFroala();
        }

        return () => {
            isMounted = false;
        };
    }, []);

    const config = useMemo(() => ({
        placeholderText: 'Escribe tu contenido aquí...',
        attribution: false,
        heightMin: 350,
        language: 'es',
        pluginsEnabled: null, // Enable all plugins
        imageUpload: false, // Disable default upload unless configured
        quickInsertEnabled: false, // Disable quick insert button on left
        charCounterCount: false,
    }), []);

    if (!Editor) {
        return (
            <div className="w-full h-[350px] flex items-center justify-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg">
                <span className="text-slate-500 dark:text-slate-400">Cargando editor...</span>
            </div>
        );
    }

    return (
        <div className="froala-editor-container min-h-[350px]">
            {/* CSS override for dark mode if needed, though Froala handles its own styles mostly */}
            <style>{`
                .froala-editor-container .fr-box.fr-basic .fr-element {
                    min-height: 350px;
                    font-family: inherit;
                }
                /* Dark mode adjustments if parent has .dark class */
                :global(.dark) .fr-box.fr-basic {
                    background: #0f172a;
                    border-color: #334155;
                }
                :global(.dark) .fr-box.fr-basic .fr-element {
                    color: #f1f5f9;
                }
                :global(.dark) .fr-toolbar {
                    background: #1e293b;
                    border-color: #334155;
                    color: #e2e8f0;
                }
                :global(.dark) .fr-toolbar .fr-command.fr-btn {
                    color: #e2e8f0;
                }
                :global(.dark) .fr-toolbar .fr-command.fr-btn svg path {
                    fill: #e2e8f0;
                }
            `}</style>
            <Editor
                tag='textarea'
                model={markdown}
                onModelChange={onChange}
                config={config}
            />
        </div>
    );
});

export default WYSIWYGEditor;
