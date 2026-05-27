import { Link } from "react-router";
import { FaArrowLeft, FaEnvelope } from "react-icons/fa6";
import { LogoSpark } from "../../../logo";

export function meta() {
    return [{ title: "Página no encontrada — Atendia" }];
}

export function headers() {
    return {
        "Cache-Control": "public, max-age=60, s-maxage=86400",
    };
}

export function loader() {
    return new Response(null, { status: 404 });
}

export default function NotFoundPage() {
    return (
        <div className="flex-1 flex items-center justify-center px-4 py-20">
            <div className="max-w-lg w-full text-center flex flex-col items-center gap-10">
                {/* Visual */}
                <span className="text-8xl sm:text-9xl font-black bg-linear-to-r from-fuchsia-700 to-purple-800 bg-clip-text text-transparent select-none leading-none">
                    404
                </span>

                {/* Copy */}
                <div className="flex flex-col gap-3">
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
                        Página no encontrada
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base leading-relaxed max-w-sm mx-auto">
                        La página que buscás no existe o fue movida. Si creés que es un error, no dudes en contactarnos.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <FaArrowLeft className="h-3.5 w-3.5" />
                        Volver al inicio
                    </Link>
                    <Link
                        to="/contacto"
                        className="btn-primary gap-2 w-full sm:w-auto"
                    >
                        <FaEnvelope className="h-3.5 w-3.5" />
                        Contactar soporte
                    </Link>
                </div>
            </div>
        </div>
    );
}
