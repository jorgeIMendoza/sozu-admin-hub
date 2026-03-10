import { useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, LogIn, AlertCircle, RefreshCw, Clock, ShieldAlert } from 'lucide-react';
import { z } from 'zod';
import { checkForUpdates, clearCacheAndReload } from '@/utils/versionUtils';
import { APP_VERSION } from '@/lib/config';
import sozuLogo from '@/assets/sozu-logo-black.png';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [showForgotMessage, setShowForgotMessage] = useState(false);
  
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const inactivityLogout = searchParams.get('reason') === 'inactivity';
  if (user) {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin';
    navigate(from, { replace: true });
    return null;
  }

  const handleGoToLogin = () => {
    supabase.auth.signOut().finally(() => {
      setIsBlocked(false);
      setError(null);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = loginSchema.safeParse({ email, password });
      if (!result.success) {
        setError(result.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      // Check if the user has a blocked role - but allow Cliente to proceed to portal-cliente
      const { data: userData } = await supabase
        .from("usuarios")
        .select("rol_id")
        .eq("email", email.trim())
        .maybeSingle();

      const isClienteRole = userData?.rol_id === 23;

      if (!isClienteRole) {
        const { data: isBlocked } = await supabase.rpc('check_email_blocked_role', {
          p_email: email.trim()
        });

        if (isBlocked) {
          setIsBlocked(true);
          setIsLoading(false);
          return;
        }
      }

      const hasUpdate = await checkForUpdates();
      if (hasUpdate) {
        setIsUpdating(true);
        setIsLoading(false);
        await clearCacheAndReload();
        return;
      }

      const { error } = await signIn(email, password);
      
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('Email o contraseña incorrectos');
        } else if (error.message.includes('Email not confirmed')) {
          setError('Por favor confirma tu email antes de iniciar sesión');
        } else {
          setError(error.message);
        }
        setIsLoading(false);
        return;
      }

      // Always navigate to /admin and let PermissionRoute handle redirection
      // to the first allowed menu item based on the user's role
      navigate('/admin', { replace: true });
    } catch (err) {
      setError('Error al iniciar sesión. Intenta de nuevo.');
      setIsLoading(false);
    }
  };

  if (isBlocked) {
    return (
      <div className="login-page">
        <div className="login-bg-gradient" />
        <div className="relative w-full max-w-sm text-center z-10">
          <img src={sozuLogo} alt="Sozu" className="h-10 mx-auto mb-10" />
          <ShieldAlert className="h-16 w-16 mx-auto mb-4" style={{ color: 'hsl(0 84% 60%)' }} />
          <h1 className="text-xl font-black text-[hsl(0_0%_5%)] mb-3 tracking-tight">
            Acceso No Autorizado
          </h1>
          <p className="text-sm mb-8" style={{ color: 'hsl(0 0% 45%)' }}>
            Tu tipo de usuario no tiene acceso a este sistema.
            Contacta al administrador si crees que esto es un error.
          </p>
          <button onClick={handleGoToLogin} className="login-btn-primary flex items-center justify-center gap-2">
            <LogIn className="h-4 w-4" />
            Iniciar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-bg-gradient" />
      <div className="login-card relative z-10">
        {/* Logo */}
        <div className="text-center mb-7">
          <img src={sozuLogo} alt="Sozu" className="h-10 mx-auto" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-black text-center text-[hsl(0_0%_5%)] mb-1.5" style={{ letterSpacing: '-0.02em' }}>
          Iniciar Sesión
        </h1>
        <p className="text-sm text-center mb-7" style={{ color: 'hsl(0 0% 45%)' }}>
          Ingresa tus credenciales para acceder al sistema
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Alerts */}
          {inactivityLogout && !error && !isUpdating && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm" style={{ color: 'hsl(43 80% 30%)', background: 'hsl(43 80% 95%)' }}>
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span>Tu sesión expiró por inactividad.</span>
            </div>
          )}
          
          {isUpdating && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm" style={{ color: 'hsl(210 80% 40%)', background: 'hsl(210 80% 95%)' }}>
              <RefreshCw className="h-4 w-4 flex-shrink-0 animate-spin" />
              <span>Actualizando a la última versión...</span>
            </div>
          )}
          
          {error && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm" style={{ color: 'hsl(0 84% 40%)', background: 'hsl(0 84% 97%)' }}>
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Email */}
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
          
          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-[hsl(0_0%_5%)] mb-2">Contraseña</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
              required
              className="login-input w-full"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || isUpdating}
            className="login-btn-primary flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Iniciando sesión...
              </>
            ) : isUpdating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Actualizando...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Iniciar Sesión
              </>
            )}
          </button>
        </form>
        
        {/* Forgot password */}
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => setShowForgotMessage(!showForgotMessage)}
            className="text-sm font-medium hover:underline transition-colors"
            style={{ color: 'hsl(145 40% 40%)' }}
          >
            ¿Olvidaste tu contraseña?
          </button>
          {showForgotMessage && (
            <div className="mt-3 flex items-start gap-3 px-4 py-3 rounded-xl text-sm text-left" style={{ color: 'hsl(210 20% 30%)', background: 'hsl(210 30% 96%)' }}>
              <ShieldAlert className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: 'hsl(210 60% 50%)' }} />
              <span>
                Por razones de seguridad, contacta a tu asesor Sozu para restablecer tu contraseña. Él podrá darte acceso nuevamente.
              </span>
            </div>
          )}
        </div>

        <div className="login-separator mt-5 text-center">
          <span className="login-version">{APP_VERSION}</span>
        </div>
      </div>
    </div>
  );
}
