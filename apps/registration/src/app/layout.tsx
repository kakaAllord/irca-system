import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Karibu IRCA',
  description: 'Registration for International Revival Church Arusha.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The flow is a column of 16px controls; letting it zoom is fine and helps
  // older eyes, so no maximum-scale lock.
  themeColor: '#1c1c1c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
