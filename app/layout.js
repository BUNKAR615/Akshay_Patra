import "./globals.css";

export const metadata = {
    title: "Akshaya Patra — Best Employee of the Quarter",
    description:
        "Employee Evaluation System for Akshaya Patra (Jaipur Branch Pilot)",
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head>
                <link
                    href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="bg-[#F5F5F5] text-[#1A1A2E] font-[Poppins] antialiased min-h-screen">
                {children}
            </body>
        </html>
    );
}
