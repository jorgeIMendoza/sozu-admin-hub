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

      const { data: isBlocked } = await supabase.rpc('check_email_blocked_role', {
        p_email: email.trim()
      });

      if (isBlocked) {
        setIsBlocked(true);
        setIsLoading(false);
        return;
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

      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin';
      navigate(from, { replace: true });
    } catch (err) {
      setError('Error al iniciar sesión. Intenta de nuevo.');
      setIsLoading(false);
    }
  };

  const neuInputStyle = {
    background: 'hsl(220,20%,93%)',
    boxShadow: 'inset 4px 4px 8px hsl(220,20%,86%), inset -4px -4px 8px hsl(0,0%,100%)',
  };

  if (isBlocked) {
    return (
      <div className="min-h-screen bg-[hsl(220,20%,93%)] flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <img src={sozuLogo} alt="Sozu" className="h-10 mx-auto mb-10" />
          <ShieldAlert className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-[hsl(0,0%,15%)] mb-3">
            Acceso No Autorizado
          </h1>
          <p className="text-[hsl(0,0%,45%)] text-sm mb-8">
            Tu tipo de usuario no tiene acceso a este sistema.
            Contacta al administrador si crees que esto es un error.
          </p>
          <button
            onClick={handleGoToLogin}
            className="w-full py-4 rounded-2xl text-white font-semibold text-sm transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, hsl(0,70%,55%), hsl(0,60%,45%))',
              boxShadow: '0 8px 24px hsla(0,60%,45%,0.3)',
            }}
          >
            <LogIn className="inline mr-2 h-4 w-4" />
            Iniciar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(220,20%,93%)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <img src={sozuLogo} alt="Sozu" className="h-10 mx-auto" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-center text-[hsl(0,0%,15%)] mb-8">
          Iniciar Sesión
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Alerts */}
          {inactivityLogout && !error && !isUpdating && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm text-amber-700 bg-amber-50/80"
              style={{ boxShadow: '4px 4px 10px hsl(220,20%,86%), -4px -4px 10px hsl(0,0%,100%)' }}>
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span>Tu sesión expiró por inactividad.</span>
            </div>
          )}
          
          {isUpdating && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm text-blue-700 bg-blue-50/80"
              style={{ boxShadow: '4px 4px 10px hsl(220,20%,86%), -4px -4px 10px hsl(0,0%,100%)' }}>
              <RefreshCw className="h-4 w-4 flex-shrink-0 animate-spin" />
              <span>Actualizando a la última versión...</span>
            </div>
          )}
          
          {error && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm text-red-600 bg-red-50/80"
              style={{ boxShadow: '4px 4px 10px hsl(220,20%,86%), -4px -4px 10px hsl(0,0%,100%)' }}>
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Email */}
          <div>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              autoComplete="email"
              required
              className="w-full px-5 py-4 rounded-2xl text-sm text-[hsl(0,0%,15%)] placeholder:text-[hsl(0,0%,60%)] outline-none transition-all duration-200 focus:ring-2 focus:ring-[hsl(158,64%,38%)]/30 disabled:opacity-50"
              style={neuInputStyle}
            />
          </div>
          
          {/* Password */}
          <div>
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
              required
              className="w-full px-5 py-4 rounded-2xl text-sm text-[hsl(0,0%,15%)] placeholder:text-[hsl(0,0%,60%)] outline-none transition-all duration-200 focus:ring-2 focus:ring-[hsl(158,64%,38%)]/30 disabled:opacity-50"
              style={neuInputStyle}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || isUpdating}
            className="w-full py-4 rounded-2xl text-white font-semibold text-sm tracking-wide transition-all duration-300 disabled:opacity-60 flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, hsl(180,60%,55%), hsl(158,64%,38%))',
              boxShadow: '0 8px 24px hsla(158,64%,38%,0.3)',
            }}
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
        
        <p className="text-xs text-[hsl(0,0%,55%)] text-center mt-8">
          {APP_VERSION}
        </p>
      </div>
    </div>
  );
}