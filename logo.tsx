import React from "react";

interface LogoProps {
    className?: string;
    classNameIcon?: string;
}

/**
 * LOGO OFICIAL: ATENDIA SPARK
 * Usa el SVG animado desde /public/animated_logo.svg
 */
export const LogoSpark: React.FC<LogoProps> = ({ className = "w-10 h-10" }) => {
    return (
        <img
            src="/animated_logo.svg"
            alt="Atendia Logo"
            className={className}
        />
    );
};