import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

interface PehlooLogoProps {
    className?: string;
    size?: number;
}

/**
 * Pixel-art theatre masks logo.
 * - Default: happy face
 * - Hover: sad face
 * - Click: rapid-fire toggle for ~1s
 */
export function PehlooLogo({ className, size = 32 }: PehlooLogoProps) {
    const [showSad, setShowSad] = useState(false);
    const [isFlickering, setIsFlickering] = useState(false);
    const flickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMouseEnter = useCallback(() => {
        if (!isFlickering) setShowSad(true);
    }, [isFlickering]);

    const handleMouseLeave = useCallback(() => {
        if (!isFlickering) setShowSad(false);
    }, [isFlickering]);

    const handleClick = useCallback(() => {
        // Clear any existing flicker
        if (flickerRef.current) clearInterval(flickerRef.current);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        setIsFlickering(true);
        let toggle = false;

        flickerRef.current = setInterval(() => {
            toggle = !toggle;
            setShowSad(toggle);
        }, 80);

        timeoutRef.current = setTimeout(() => {
            if (flickerRef.current) clearInterval(flickerRef.current);
            flickerRef.current = null;
            setIsFlickering(false);
            setShowSad(false);
        }, 1000);
    }, []);

    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 14"
            width={size}
            height={size * (14 / 16)}
            className={cn('shrink-0 cursor-pointer', className)}
            aria-label="Pehloo logo"
            role="img"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
        >
            {/* ======== HAPPY FACE (comedy) ======== */}
            <g
                fill="currentColor"
                style={{
                    opacity: showSad ? 0 : 1,
                    transition: isFlickering ? 'none' : 'opacity 0.2s ease',
                }}
            >
                {/* Mask outline */}
                <rect x="0" y="0" width="7" height="1" />
                <rect x="0" y="0" width="1" height="8" />
                <rect x="0" y="7" width="2" height="1" />
                <rect x="1" y="8" width="1" height="1" />
                <rect x="2" y="9" width="1" height="1" />
                <rect x="3" y="10" width="2" height="1" />
                <rect x="6" y="0" width="1" height="3" />
                {/* Left eye */}
                <rect x="1.5" y="3" width="1.5" height="1.5" />
                {/* Right eye */}
                <rect x="4.5" y="3" width="1.5" height="1.5" />
                {/* Smile */}
                <rect x="2" y="7" width="1" height="1" />
                <rect x="3" y="8" width="2" height="1" />
                <rect x="5" y="7" width="1" height="1" />
            </g>

            {/* ======== SAD FACE (tragedy) ======== */}
            <g
                fill="currentColor"
                style={{
                    opacity: showSad ? 1 : 0,
                    transition: isFlickering ? 'none' : 'opacity 0.2s ease',
                }}
            >
                {/* Mask outline */}
                <rect x="9" y="0" width="7" height="1" />
                <rect x="15" y="0" width="1" height="8" />
                <rect x="14" y="7" width="2" height="1" />
                <rect x="14" y="8" width="1" height="1" />
                <rect x="13" y="9" width="1" height="1" />
                <rect x="11" y="10" width="2" height="1" />
                <rect x="9" y="0" width="1" height="3" />
                {/* Left eye */}
                <rect x="10" y="3" width="1.5" height="1.5" />
                {/* Right eye */}
                <rect x="13" y="3" width="1.5" height="1.5" />
                {/* Frown */}
                <rect x="10" y="8" width="1" height="1" />
                <rect x="11" y="7" width="2" height="1" />
                <rect x="13" y="8" width="1" height="1" />
            </g>

            {/* Divider (always visible) */}
            <rect x="7.5" y="0" width="1" height="11" fill="currentColor" opacity="0.3" />
        </svg>
    );
}
