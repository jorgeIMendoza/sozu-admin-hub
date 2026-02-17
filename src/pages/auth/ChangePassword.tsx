import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { activityLoggerService } from '@/services/activityLoggerService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, KeyRound, AlertCircle, CheckCircle, ShieldAlert, LogOut } from 'lucide-react';
import { z } from 'zod';

const BLOCKED_ROLE_NAMES = ['Cliente', 'Directores'];

const passwordSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[a-z]/, 'Debe contener al menos una minúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un símbolo especial'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
});

export default function ChangePassword() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const { updatePassword, profile, signOut, session, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // If no session, redirect to login - user needs to login with temp password first
  useEffect(() => {
    if (!authLoading && !session) {
      navigate('/auth/login', { replace: true });
    }
  }, [authLoading, session, navigate]);

  // If user doesn't need to change password, redirect
  useEffect(() => {
    if (!authLoading && session && profile && !profile.debe_cambiar_password) {
      navigate('/admin', { replace: true });
    }
  }, [authLoading, session, profile, navigate]);

  const handleSignOut = () => {
    supabase.auth.signOut().finally(() => {
      window.location.href = '/auth/login';
    });
  };

  // Show loading while checking auth state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render if no session
  if (!session) {
    return null;
  }

  // Block users with restricted roles
  if (profile && BLOCKED_ROLE_NAMES.includes(profile.rol_nombre)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center p-8 bg-card rounded-lg shadow-lg max-w-md space-y-4">
          <ShieldAlert className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold text-destructive">
            Acceso No Autorizado
          </h1>
          <p className="text-muted-foreground">
            Tu tipo de usuario no tiene acceso a este sistema.
            Contacta al administrador si crees que esto es un error.
          </p>
          <Button variant="destructive" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar Sesión
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Validate input
      const result = passwordSchema.safeParse({ newPassword, confirmPassword });
      if (!result.success) {
        setError(result.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      const { error } = await updatePassword(newPassword);
      
      if (error) {
        await activityLoggerService.registrarActualizacion(
          profile?.email || session?.user?.email || 'sistema',
          'contraseña',
          null,
          { origen: 'cambio_password_temporal' },
          'cambiar_password_temporal',
          'error',
          error.message
        );
        setError(error.message);
        setIsLoading(false);
        return;
      }

      // Log successful password change
      await activityLoggerService.registrarActualizacion(
        profile?.email || session?.user?.email || 'sistema',
        'contraseña',
        null,
        { origen: 'cambio_password_temporal' },
        'cambiar_password_temporal',
        'exito'
      );

      // Success - redirect to admin
      navigate('/admin', { replace: true });
    } catch (err) {
      setError('Error al cambiar la contraseña. Intenta de nuevo.');
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth/login', { replace: true });
  };

  const passwordRequirements = [
    { text: 'Al menos 8 caracteres', valid: newPassword.length >= 8 },
    { text: 'Al menos una mayúscula', valid: /[A-Z]/.test(newPassword) },
    { text: 'Al menos una minúscula', valid: /[a-z]/.test(newPassword) },
    { text: 'Al menos un número', valid: /[0-9]/.test(newPassword) },
    { text: 'Al menos un símbolo especial', valid: /[^A-Za-z0-9]/.test(newPassword) },
  ];

  const neuInputStyle = {
    background: 'hsl(220,20%,93%)',
    boxShadow: 'inset 4px 4px 8px hsl(220,20%,86%), inset -4px -4px 8px hsl(0,0%,100%)',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(220,20%,93%)] p-4">
      <div
        className="w-full max-w-md bg-white rounded-3xl px-8 py-10 sm:px-10"
        style={{
          boxShadow: '12px 12px 30px hsl(220,20%,84%), -12px -12px 30px hsl(0,0%,100%)',
        }}
      >
        <div className="flex justify-center mb-4">
          <div className="p-3 rounded-full bg-[hsl(158,64%,38%)]/10">
            <KeyRound className="h-8 w-8 text-[hsl(158,64%,38%)]" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-center text-[hsl(0,0%,15%)] mb-2">Cambiar Contraseña</h1>
        <p className="text-sm text-[hsl(0,0%,55%)] text-center mb-8">
          Por seguridad, debes cambiar tu contraseña temporal antes de continuar
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm text-red-600 bg-red-50/80"
              style={{ boxShadow: '4px 4px 10px hsl(220,20%,86%), -4px -4px 10px hsl(0,0%,100%)' }}>
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-[hsl(0,0%,15%)] mb-2">Nueva Contraseña</label>
            <input
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
              required
              className="w-full px-5 py-4 rounded-2xl text-sm text-[hsl(0,0%,15%)] placeholder:text-[hsl(0,0%,60%)] outline-none transition-all duration-200 focus:ring-2 focus:ring-[hsl(158,64%,38%)]/30 disabled:opacity-50 border border-[hsl(220,20%,88%)]"
              style={neuInputStyle}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[hsl(0,0%,15%)] mb-2">Confirmar Contraseña</label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="new-password"
              required
              className="w-full px-5 py-4 rounded-2xl text-sm text-[hsl(0,0%,15%)] placeholder:text-[hsl(0,0%,60%)] outline-none transition-all duration-200 focus:ring-2 focus:ring-[hsl(158,64%,38%)]/30 disabled:opacity-50 border border-[hsl(220,20%,88%)]"
              style={neuInputStyle}
            />
          </div>

          {/* Password requirements */}
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold text-[hsl(0,0%,35%)]">Requisitos:</p>
            {passwordRequirements.map((req, index) => (
              <div key={index} className="flex items-center gap-2">
                {req.valid ? (
                  <CheckCircle className="h-4 w-4 text-[hsl(158,64%,38%)]" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-[hsl(0,0%,75%)]" />
                )}
                <span className={req.valid ? 'text-[hsl(158,64%,38%)]' : 'text-[hsl(0,0%,55%)]'}>
                  {req.text}
                </span>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 rounded-2xl text-white font-semibold text-sm tracking-wide transition-all duration-300 disabled:opacity-60 flex items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, hsl(180,60%,55%), hsl(158,64%,38%))',
              boxShadow: '0 8px 24px hsla(158,64%,38%,0.3)',
            }}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Cambiando contraseña...
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                Cambiar Contraseña
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoading}
            className="w-full py-3 text-sm text-[hsl(0,0%,45%)] hover:text-[hsl(0,0%,25%)] transition-colors"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
