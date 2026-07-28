import './globals.css';
import { Onest, JetBrains_Mono } from 'next/font/google';

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata = {
  title: 'Thesauros Developer Platform — API, SDKs & Yield Infrastructure',
  description:
    'Integrate non-custodial stablecoin yield with the Thesauros API. Typed SDKs, live sandbox, webhooks, usage telemetry and vault-level routing — built for wallets, neobanks and fintechs.',
  openGraph: {
    title: 'Thesauros Developer Platform',
    description: 'One integration. Institutional-grade yield infrastructure.',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${onest.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
