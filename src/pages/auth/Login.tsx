import { useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, LogIn, AlertCircle, RefreshCw, Clock } from 'lucide-react';
import { z } from 'zod';
import { checkForUpdates, clearCacheAndReload } from '@/utils/versionUtils';
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
  
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Check if user was logged out due to inactivity
  const inactivityLogout = searchParams.get('reason') === 'inactivity';
  // If already logged in, redirect
  if (user) {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin';
    navigate(from, { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Validate input
      const result = loginSchema.safeParse({ email, password });
      if (!result.success) {
        setError(result.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      // Check for app updates before login
      const hasUpdate = await checkForUpdates();
      if (hasUpdate) {
        setIsUpdating(true);
        setIsLoading(false);
        // Clear cache and reload to get latest version
        await clearCacheAndReload();
        return; // Page will reload
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

      // Redirect will happen automatically via useAuth
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin';
      navigate(from, { replace: true });
    } catch (err) {
      setError('Error al iniciar sesión. Intenta de nuevo.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <img 
              src="/images/sozu-logo.png" 
              alt="Sozu Logo" 
              className="h-12 w-auto"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <CardTitle className="text-2xl font-bold">Iniciar Sesión</CardTitle>
          <CardDescription>
            Ingresa tus credenciales para acceder al sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {inactivityLogout && !error && !isUpdating && (
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  Tu sesión expiró por inactividad. Por favor inicia sesión nuevamente.
                </AlertDescription>
              </Alert>
            )}
            
            {isUpdating && (
              <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
                <AlertDescription className="text-blue-700 dark:text-blue-300">
                  Actualizando a la última versión...
                </AlertDescription>
              </Alert>
            )}
            
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                autoComplete="email"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading || isUpdating}>
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
