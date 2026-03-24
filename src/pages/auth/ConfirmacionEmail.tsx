import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Mail } from 'lucide-react';
import sozuLogo from '@/assets/sozu-logo-black.png';
import { supabase } from '@/integrations/supabase/client';

export default function ConfirmacionEmail() {
  const calledRef = useRef(false);
  const [loginUrl, setLoginUrl] = useState('/auth/login');

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const email = params.get('email');
    const nombre = params.get('nombre') || '';

    if (email) {
      // Fire-and-forget: trigger post-confirmation logic
      supabase.functions.invoke('post-confirmacion-registro', {
        body: { email, nombre },
      }).catch(err => console.error('Post-confirm error:', err));

      // Determine redirect URL based on user role
      supabase
        .from('usuarios')
        .select('rol_id')
        .ilike('email', email.toLowerCase())
        .maybeSingle()
        .then(({ data }) => {
          if (data?.rol_id === 23) {
            setLoginUrl('https://clientes.sozu.com/auth/login');
          } else {
            setLoginUrl('https://inmobiliarias.sozu.com/auth/login');
          }
        });
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
          href={loginUrl}
          className="login-btn-primary flex items-center justify-center gap-2 no-underline"
        >
          Ir a Iniciar Sesión
        </a>
      </div>
    </div>
  );
}
