import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Mail } from 'lucide-react';
import sozuLogo from '@/assets/sozu-logo-black.png';
import { supabase } from '@/integrations/supabase/client';

const getPortalUrl = (portal: string | null, destination: string | null) => {
  const host = portal === 'clientes' ? 'https://clientes.sozu.com' : 'https://inmobiliarias.sozu.com';
  const path = destination === 'login' ? '/auth/login' : '/auth/change-password';
  return `${host}${path}`;
};

export default function ConfirmacionEmail() {
  const calledRef = useRef(false);
  const [ctaUrl, setCtaUrl] = useState('https://inmobiliarias.sozu.com/auth/change-password');
  const [ctaLabel, setCtaLabel] = useState('Ir a Cambiar Contraseña');

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const email = params.get('email');
    const nombre = params.get('nombre') || '';
    const portal = params.get('portal');
    const destination = params.get('destination');

    setCtaUrl(getPortalUrl(portal, destination));
    setCtaLabel(destination === 'login' ? 'Ir a Iniciar Sesión' : 'Ir a Cambiar Contraseña');

    if (email) {
      supabase.functions.invoke('post-confirmacion-registro', {
        body: { email, nombre },
      }).then(({ data, error }) => {
        if (error) {
          console.error('Post-confirm error:', error);
          return;
        }

        if (data?.ctaUrl) {
          setCtaUrl(data.ctaUrl);
        }

        if (data?.ctaLabel) {
          setCtaLabel(data.ctaLabel);
        }
      }).catch(err => console.error('Post-confirm error:', err));
    }
  }, []);

  return (
    <div className="login-page">
      <div className="login-bg-gradient" />
      <div className="login-card relative z-10 text-center">
        {/* Logo */}
        <div className="mb-7">
          <img src={sozuLogo} alt="Sozu" className="h-10 mx-auto" />
        </div>

        {/* Success icon */}
        <div
          className="mx-auto mb-5 flex items-center justify-center w-16 h-16 rounded-full"
          style={{ background: 'hsl(145 35% 95%)' }}
        >
          <CheckCircle className="h-8 w-8" style={{ color: 'hsl(145 35% 51%)' }} />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-black text-[hsl(0_0%_5%)] mb-2" style={{ letterSpacing: '-0.02em' }}>
          ¡Gracias por confirmar tu correo!
        </h1>

        <p className="text-sm mb-6" style={{ color: 'hsl(0 0% 45%)' }}>
          Tu cuenta ha sido verificada exitosamente.
        </p>

        {/* Info card */}
        <div
          className="flex items-start gap-3 px-5 py-4 rounded-xl text-left text-sm mb-7"
          style={{ background: 'hsl(210 80% 97%)', color: 'hsl(210 80% 30%)' }}
        >
          <Mail className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p>
            En breve recibirás un correo electrónico con tus <strong>credenciales de acceso</strong> al sistema.
            Revisa tu bandeja de entrada y la carpeta de spam.
          </p>
        </div>

        {/* CTA */}
        <a
          href={ctaUrl}
          className="login-btn-primary flex items-center justify-center gap-2 no-underline"
        >
          {ctaLabel}
        </a>
      </div>
    </div>
  );
}
