import "./globals.css";
import { DM_Sans } from "next/font/google";

const dmSans = DM_Sans({
    subsets: ["latin"],
    weight: ["400", "500", "600", "700", "800"],
    display: "swap",
    variable: "--font-dm-sans",
});

export const metadata = {
    title: "Akshaya Patra — Best Employee of the Quarter",
    description:
        "Employee Evaluation System for Akshaya Patra (Jaipur Branch Pilot)",
    // iOS / Android web-app niceties so the site behaves like a real app when
    // pinned to home screen.
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "Akshaya Patra",
    },
    // Tells iOS Safari + Chrome address bar to theme to brand blue.
    themeColor: "#003087",
    formatDetection: {
        telephone: false,    // stop iOS from auto-linking 10-digit empCodes as phone numbers
        date: false,
        email: false,
        address: false,
    },
};

// Next.js 14 viewport export — separated from `metadata` per the framework
// convention. `viewport-fit=cover` is required for safe-area-inset support on
// notched iPhones; `maximum-scale=5` keeps user-zoom available (accessibility)
// while preventing the iOS double-tap zoom from kicking in unexpectedly.
export const viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    viewportFit: "cover",
    themeColor: "#003087",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" className={dmSans.variable}>
            <body className={`${dmSans.className} bg-[#F5F5F5] text-[#1A1A2E] antialiased min-h-screen min-h-[100dvh]`}>
                {children}
            </body>
        </html>
    );
}
