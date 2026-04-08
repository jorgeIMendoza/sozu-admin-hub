import { useState } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, LogIn, AlertCircle, RefreshCw, Clock, ShieldAlert, Building2, User, CheckCircle } from 'lucide-react';
import { z } from 'zod';
import { checkForUpdates, clearCacheAndReload } from '@/utils/versionUtils';
import { APP_VERSION } from '@/lib/config';
import sozuLogo from '@/assets/sozu-logo-black.png';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

interface PortalOption {
  label: string;
  description: string;
  icon: typeof Building2;
  rolId: number;
  route: string;
}

const ENTITY_TYPE_TO_PORTAL: Record<number, PortalOption> = {
  19: {
    label: 'Portal Agente',
    description: 'Accede a inventario, ofertas y comisiones',
    icon: Building2,
    rolId: 3,
    route: '/admin',
  },
  2: {
    label: 'Portal Cliente',
    description: 'Consulta tu propiedad, pagos y documentos',
    icon: User,
    rolId: 23,
    route: '/admin/portal-cliente/inicio',
  },
};

const PORTAL_LABELS: Record<string, { label: string; color: string }> = {
  agentes: { label: 'Portal Agentes', color: 'hsl(158 64% 38%)' },
  inmobiliarias: { label: 'Portal Inmobiliarias', color: 'hsl(158 64% 38%)' },
  clientes: { label: 'Portal Clientes', color: 'hsl(210 80% 45%)' },
};

export default function Login({ portalContext }: { portalContext?: 'agentes' | 'inmobiliarias' | 'clientes' | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  
  const [availablePortals, setAvailablePortals] = useState<PortalOption[]>([]);
  const [showPortalSelector, setShowPortalSelector] = useState(false);
  
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const inactivityLogout = searchParams.get('reason') === 'inactivity';
  const passwordUpdated = searchParams.get('reason') === 'password-updated';
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

  const handleSelectPortal = async (portal: PortalOption) => {
    try {
      // Update rol_id in usuarios table
      await supabase
        .from('usuarios')
        .update({ rol_id: portal.rolId })
        .ilike('email', email.trim().toLowerCase());

      navigate(portal.route, { replace: true });
    } catch (err) {
      console.error('Error selecting portal:', err);
      navigate('/admin', { replace: true });
    }
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

      const emailLower = email.trim().toLowerCase();

      // Check if the user has a blocked role - but allow Cliente and Agente to proceed
      const { data: userData } = await supabase
        .from("usuarios")
        .select("rol_id, id_persona")
        .ilike("email", emailLower)
        .maybeSingle();

      const isClienteRole = userData?.rol_id === 23;
      const isAgenteRole = userData?.rol_id === 3;

      if (!isClienteRole && !isAgenteRole) {
        const { data: isBlockedResult } = await supabase.rpc('check_email_blocked_role', {
          p_email: emailLower
        });

        if (isBlockedResult) {
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

      // Check for multiple portals via entidades_relacionadas
      if (userData?.id_persona) {
        const { data: entidades } = await supabase
          .from('entidades_relacionadas')
          .select('id_tipo_entidad')
          .eq('id_persona', userData.id_persona)
          .eq('activo', true);

        const entityTypes = [...new Set(entidades?.map(e => e.id_tipo_entidad) || [])];
        const portals = entityTypes
          .filter(t => ENTITY_TYPE_TO_PORTAL[t])
          .map(t => ENTITY_TYPE_TO_PORTAL[t]);

        if (portals.length > 1) {
          setAvailablePortals(portals);
          setShowPortalSelector(true);
          setIsLoading(false);
          return;
        }
      }

      // Single portal or no multi-role: redirect based on current rol_id
      if (isClienteRole) {
        navigate('/admin/portal-cliente/inicio', { replace: true });
      } else {
        navigate('/admin', { replace: true });
      }
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

  if (showPortalSelector) {
    return (
      <div className="login-page">
        <div className="login-bg-gradient" />
        <div className="login-card relative z-10">
          <div className="text-center mb-7">
            <img src={sozuLogo} alt="Sozu" className="h-10 mx-auto" />
          </div>
          <h1 className="text-2xl font-black text-center text-[hsl(0_0%_5%)] mb-1.5" style={{ letterSpacing: '-0.02em' }}>
            Selecciona tu portal
          </h1>
          <p className="text-sm text-center mb-7" style={{ color: 'hsl(0 0% 45%)' }}>
            Tienes acceso a múltiples portales
          </p>
          <div className="space-y-3">
            {availablePortals.map((portal) => {
              const Icon = portal.icon;
              return (
                <button
                  key={portal.rolId}
                  onClick={() => handleSelectPortal(portal)}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border-2 text-left transition-all hover:shadow-md"
                  style={{
                    borderColor: 'hsl(0 0% 90%)',
                    background: 'hsl(0 0% 100%)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'hsl(145 40% 50%)';
                    e.currentTarget.style.background = 'hsl(145 40% 97%)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'hsl(0 0% 90%)';
                    e.currentTarget.style.background = 'hsl(0 0% 100%)';
                  }}
                >
                  <div
                    className="flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0"
                    style={{ background: 'hsl(145 40% 94%)' }}
                  >
                    <Icon className="h-5 w-5" style={{ color: 'hsl(145 40% 35%)' }} />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[hsl(0_0%_5%)]">{portal.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'hsl(0 0% 50%)' }}>{portal.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
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
        {portalContext && PORTAL_LABELS[portalContext] && (
          <div className="flex justify-center mb-2">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white"
              style={{ background: PORTAL_LABELS[portalContext].color }}
            >
              <Building2 className="h-3 w-3" />
              {PORTAL_LABELS[portalContext].label}
            </span>
          </div>
        )}
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

          {passwordUpdated && !error && !isUpdating && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm" style={{ color: 'hsl(145 45% 28%)', background: 'hsl(145 45% 94%)' }}>
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>Tu contraseña se cambió correctamente. Inicia sesión con tu nueva contraseña.</span>
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
          <Link
            to="/auth/forgot-password"
            className="text-sm font-medium hover:underline transition-colors"
            style={{ color: 'hsl(145 40% 40%)' }}
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <div className="login-separator mt-5 text-center">
          <span className="login-version">{APP_VERSION}</span>
        </div>
      </div>
    </div>
  );
}
