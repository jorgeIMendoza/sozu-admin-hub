import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ArrowLeft, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { z } from 'zod';
import sozuLogo from '@/assets/sozu-logo-black.png';

const emailSchema = z.string().email('Email inválido');

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = emailSchema.safeParse(email.trim());
      if (!result.success) {
        setError('Ingresa un email válido');
        setIsLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke('reset-user-password', {
        body: { email: email.trim() },
        headers: {},
      });

      if (fnError) {
        // Try to parse the error body for a user-friendly message
        try {
          const errorBody = JSON.parse(fnError.message);
          setError(errorBody.error || 'No se encontró una cuenta activa con ese correo');
        } catch {
          setError('No se encontró una cuenta activa con ese correo');
        }
        setIsLoading(false);
        return;
      }

      if (data?.error) {
        setError(data.error);
        setIsLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('Error al procesar la solicitud. Intenta de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-gradient" />
      <div className="login-card relative z-10">
        <div className="text-center mb-7">
          <img src={sozuLogo} alt="Sozu" className="h-10 mx-auto" />
        </div>

        {success ? (
          <>
            <div className="text-center">
              <CheckCircle className="h-14 w-14 mx-auto mb-4" style={{ color: 'hsl(145 40% 45%)' }} />
              <h1 className="text-xl font-black text-[hsl(0_0%_5%)] mb-3" style={{ letterSpacing: '-0.02em' }}>
                Contraseña reseteada
              </h1>
              <p className="text-sm mb-2" style={{ color: 'hsl(0 0% 45%)' }}>
                Se ha reseteado tu contraseña exitosamente.
              </p>
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm text-left mt-4" style={{ color: 'hsl(210 20% 30%)', background: 'hsl(210 30% 96%)' }}>
                <Mail className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: 'hsl(210 60% 50%)' }} />
                <span>
                  Revisa tu correo electrónico. Recibirás un enlace para confirmar tu email. Una vez confirmado, se te enviarán tus nuevas credenciales temporales.
                </span>
              </div>
            </div>
            <button
              onClick={() => navigate('/auth/login')}
              className="login-btn-primary flex items-center justify-center gap-2 mt-6"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio de sesión
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black text-center text-[hsl(0_0%_5%)] mb-1.5" style={{ letterSpacing: '-0.02em' }}>
              Recuperar contraseña
            </h1>
            <p className="text-sm text-center mb-7" style={{ color: 'hsl(0 0% 45%)' }}>
              Ingresa tu correo electrónico para restablecer tu contraseña
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm" style={{ color: 'hsl(0 84% 40%)', background: 'hsl(0 84% 97%)' }}>
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-[hsl(0_0%_5%)] mb-2">Email</label>
                <input
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  required
                  className="login-input w-full"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="login-btn-primary flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Validando...
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" />
                    Validar
                  </>
                )}
              </button>
            </form>

            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => navigate('/auth/login')}
                className="text-sm font-medium hover:underline transition-colors flex items-center justify-center gap-1.5 mx-auto"
                style={{ color: 'hsl(145 40% 40%)' }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver al inicio de sesión
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
