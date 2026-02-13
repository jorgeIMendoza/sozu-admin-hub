// Feature flag: set to true to re-enable PWA install prompt
const PWA_INSTALL_ENABLED = false;

import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { X, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function PWAInstallPrompt() {
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // PWA update management
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW registrado correctamente');
    },
    onRegisterError(error) {
      console.error('Error al registrar SW:', error);
    },
  });

  // Auto-update when new version is available (no toast)
  useEffect(() => {
    if (needRefresh) {
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  // Install prompt handling
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      toast.success('¡Aplicación instalada correctamente!');
    } else {
      toast.info('Instalación cancelada');
    }
    
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
    setDeferredPrompt(null);
  };

  if (!PWA_INSTALL_ENABLED || !showInstallPrompt) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-card border rounded-lg shadow-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-sm mb-1">Instalar SOZU Admin</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Instala la aplicación en tu dispositivo para un acceso más rápido
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleInstall} className="h-8">
              <Download className="w-3 h-3 mr-1" />
              Instalar
            </Button>
            <Button size="sm" variant="outline" onClick={handleDismiss} className="h-8">
              Ahora no
            </Button>
          </div>
        </div>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={handleDismiss}
          className="h-6 w-6 p-0 ml-2"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}
