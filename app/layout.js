import "./globals.css";
import { Poppins } from "next/font/google";

const poppins = Poppins({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700", "800"],
    display: "swap",
    variable: "--font-poppins",
});

export const metadata = {
    title: "Akshaya Patra — Best Employee of the Quarter",
    description:
        "Employee Evaluation System for Akshaya Patra (Jaipur Branch Pilot)",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en" className={poppins.variable}>
            <body className={`${poppins.className} bg-[#F5F5F5] text-[#1A1A2E] antialiased min-h-screen`}>
                {children}
            </body>
        </html>
    );
}
