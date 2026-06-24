"use client";

import Image from "next/image";

// Intrinsic aspect ratio of the logo artwork (public/akshaya-patra-logo.jpg, 260x145).
const RATIO = 260 / 145;

/**
 * Shared Akshaya Patra brand lockup used across the whole app EXCEPT the login
 * page (login keeps its own dedicated logo treatment — see app/login/page.js).
 *
 * The new full-colour logo is rendered on a small white rounded chip. The chip
 * keeps the wordmark crisp and legible on the dark navy headers / sidebar, and
 * blends seamlessly into white headers (e.g. the in-exam top bar), where the
 * logo simply appears to sit directly on the white surface.
 *
 * `height` is the rendered height of the logo image in px; the chip padding and
 * width follow from it, so callers only pick one number.
 */
export default function BrandLogo({ height = 28, padX = 7, padY = 4, className = "", style }) {
    const imgH = height;
    const imgW = Math.round(imgH * RATIO);
    return (
        <span
            className={`inline-flex items-center justify-center rounded-md bg-white shrink-0 ${className}`}
            style={{ padding: `${padY}px ${padX}px`, ...style }}
        >
            <Image
                src="/akshaya-patra-logo.jpg"
                alt="Akshaya Patra"
                width={imgW}
                height={imgH}
                priority
                style={{ height: imgH, width: "auto", display: "block" }}
            />
        </span>
    );
}
