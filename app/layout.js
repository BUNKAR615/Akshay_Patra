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
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" className={dmSans.variable}>
            <body className={`${dmSans.className} bg-[#F5F5F5] text-[#1A1A2E] antialiased min-h-screen`}>
                {children}
            </body>
        </html>
    );
}
