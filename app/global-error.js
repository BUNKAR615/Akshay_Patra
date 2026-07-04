"use client";

import { useEffect } from "react";

/**
 * Root global error boundary.
 *
 * `app/error.js` cannot catch errors thrown by the ROOT layout itself (it
 * renders *inside* that layout). `global-error.js` replaces the entire document
 * when the root layout/template crashes, so a failure there shows a recovery
 * screen instead of a blank white page. It must render its own <html>/<body>.
 */
export default function GlobalError({ error, reset }) {
    useEffect(() => {
        console.error("Root global-error boundary caught:", error);
    }, [error]);

    return (
        <html lang="en">
            <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>
                <div
                    style={{
                        minHeight: "100vh",
                        background: "#F5F5F5",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "1.5rem",
                        textAlign: "center",
                    }}
                >
                    <h1 style={{ color: "#003087", fontSize: "1.75rem", marginBottom: "0.75rem" }}>
                        Something went wrong
                    </h1>
                    <p style={{ color: "#333333", maxWidth: "24rem", marginBottom: "2rem" }}>
                        The application hit an unexpected problem. Please try again — if it
                        keeps happening, sign in again.
                    </p>
                    <button
                        onClick={() => reset()}
                        style={{
                            padding: "0.625rem 1.5rem",
                            background: "#003087",
                            color: "#fff",
                            border: "none",
                            borderRadius: "0.5rem",
                            fontWeight: 500,
                            cursor: "pointer",
                        }}
                    >
                        Try Again
                    </button>
                </div>
            </body>
        </html>
    );
}
