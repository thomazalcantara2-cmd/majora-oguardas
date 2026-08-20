import './globals.css';

export const metadata = {
  title: 'Confirmação de Dados Cadastrais — Majoração de Jornada',
  description:
    'Confirmação de dados de requerimento de majoração de jornada de 30h para 40h — SEGEP, Guarda Municipal de Jaboatão dos Guararapes.'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
