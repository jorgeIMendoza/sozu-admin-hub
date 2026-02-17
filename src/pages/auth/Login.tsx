import { useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, LogIn, AlertCircle, RefreshCw, Clock, ShieldAlert } from 'lucide-react';
import { z } from 'zod';
import { checkForUpdates, clearCacheAndReload } from '@/utils/versionUtils';
import { APP_VERSION } from '@/lib/config';
import sozuLogo from '@/assets/sozu-logo-black.png';

const BLOCKED_ROLE_NAMES = ['Cliente', 'Directores'];

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

  if (isBlocked) {
    return (
      <div className="min-h-screen bg-[hsl(0,0%,97%)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-0 shadow-xl rounded-2xl">
          <CardContent className="pt-10 pb-10 text-center px-8 space-y-4">
            <ShieldAlert className="h-16 w-16 text-destructive mx-auto" />
            <h1 className="text-2xl font-bold text-destructive">
              Acceso No Autorizado
            </h1>
            <p className="text-[hsl(0,0%,34%)]">
              Tu tipo de usuario no tiene acceso a este sistema.
              Contacta al administrador si crees que esto es un error.
            </p>
            <Button variant="destructive" onClick={handleGoToLogin} className="rounded-full">
              <LogIn className="mr-2 h-4 w-4" />
              Iniciar Sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(0,0%,97%)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src={sozuLogo}
            alt="Sozu"
            className="h-9 mx-auto mb-3"
          />
          <p className="text-[hsl(0,0%,34%)] text-sm">
            Plataforma de gestión inmobiliaria
          </p>
        </div>

        <Card className="border-0 shadow-xl rounded-2xl">
          <CardHeader className="text-center pb-2 px-8 pt-8">
            <CardTitle className="text-xl font-bold text-[hsl(0,0%,0%)]">Iniciar Sesión</CardTitle>
            <CardDescription className="text-[hsl(0,0%,34%)]">
              Ingresa tus credenciales para acceder al sistema
            </CardDescription>
          </CardHeader>
          <CardContent className="px-8 pb-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              {inactivityLogout && !error && !isUpdating && (
                <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 rounded-lg">
                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <AlertDescription className="text-amber-700 dark:text-amber-300">
                    Tu sesión expiró por inactividad. Por favor inicia sesión nuevamente.
                  </AlertDescription>
                </Alert>
              )}
              
              {isUpdating && (
                <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950 rounded-lg">
                  <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
                  <AlertDescription className="text-blue-700 dark:text-blue-300">
                    Actualizando a la última versión...
                  </AlertDescription>
                </Alert>
              )}
              
              {error && (
                <Alert variant="destructive" className="rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold text-[hsl(0,0%,0%)]">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  required
                  className="h-11 rounded-lg border-gray-200 focus:border-[hsl(158,64%,38%)] focus:ring-[hsl(158,64%,38%)]"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold text-[hsl(0,0%,0%)]">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  required
                  className="h-11 rounded-lg border-gray-200 focus:border-[hsl(158,64%,38%)] focus:ring-[hsl(158,64%,38%)]"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 rounded-full bg-[hsl(158,64%,38%)] hover:bg-[hsl(158,64%,32%)] text-white font-semibold shadow-lg shadow-[hsl(158,64%,38%)]/20"
                disabled={isLoading || isUpdating}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : isUpdating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Actualizando...
                  </>
                ) : (
                  <>
                    <LogIn className="mr-2 h-4 w-4" />
                    Iniciar Sesión
                  </>
                )}
              </Button>
              
              <p className="text-xs text-[hsl(0,0%,50%)] text-center mt-4">
                {APP_VERSION}
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
