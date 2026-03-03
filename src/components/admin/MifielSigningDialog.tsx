import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2 } from "lucide-react";

interface MifielSigningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgetId: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function MifielSigningDialog({ open, onOpenChange, widgetId, onSuccess, onError }: MifielSigningDialogProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    if (!open || !widgetId) return;

    const loadWidget = () => {
      if (!containerRef.current) return;

      // Clear previous widget
      containerRef.current.innerHTML = '';

      const widget = document.createElement('mifiel-widget') as any;
      widget.setAttribute('id', widgetId);
      const env = import.meta.env.VITE_MIFIEL_ENVIRONMENT || 'sandbox';
      widget.setAttribute('environment', env === 'production' ? 'production' : 'sandbox');
      containerRef.current.appendChild(widget);

      // Listen for official widget events
      widget.addEventListener('signSuccess', () => {
        onSuccess?.();
      });
      widget.addEventListener('signError', (e: any) => {
        onError?.(e?.detail?.message || 'Error en la firma');
      });
    };

    // Load the Mifiel CDN script if not already loaded
    const mifielEnv = import.meta.env.VITE_MIFIEL_ENVIRONMENT || 'sandbox';
    const mifielHost = mifielEnv === 'production' ? 'app.mifiel.com' : 'app-sandbox.mifiel.com';
    const scriptSrc = `https://${mifielHost}/widget-component/index.js`;

    if (!scriptLoadedRef.current && !document.querySelector(`script[src="${scriptSrc}"]`)) {
      const script = document.createElement('script');
      script.src = scriptSrc;
      script.type = 'module';
      script.onload = () => {
        scriptLoadedRef.current = true;
        setTimeout(loadWidget, 500);
      };
      script.onerror = () => {
        console.error('Failed to load Mifiel widget script from:', scriptSrc);
      };
      document.head.appendChild(script);
    } else {
      scriptLoadedRef.current = true;
      setTimeout(loadWidget, 300);
    }
  }, [open, widgetId, onSuccess, onError]);

  const content = (
    <div className="min-h-[75vh] flex flex-col">
      <div ref={containerRef} className="flex-1 min-h-[70vh] flex items-center justify-center [&>mifiel-widget]:w-full [&>mifiel-widget]:h-full [&>mifiel-widget]:min-h-[70vh] [&>mifiel-widget]:flex [&>mifiel-widget]:flex-col [&_mifiel-widget>div]:flex [&_mifiel-widget>div]:flex-col [&_mifiel-widget>div]:h-full mifiel-fullwidth">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando firma digital...</p>
        </div>
      </div>
      <style>{`
        .mifiel-fullwidth mifiel-widget {
          --mifiel-widget-max-width: 100% !important;
        }
        .mifiel-fullwidth mifiel-widget > div,
        .mifiel-fullwidth mifiel-widget > div > div {
          max-width: 100% !important;
          width: 100% !important;
        }
        .mifiel-fullwidth iframe {
          width: 100% !important;
          min-height: 70vh !important;
        }
      `}</style>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[95vh] rounded-t-3xl overflow-hidden">
          <DrawerHeader className="text-left pb-2 px-4">
            <DrawerTitle>Firma Digital</DrawerTitle>
            <DrawerDescription>Firma la Carta de Acuerdos de forma electrónica</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto" style={{ maxHeight: 'calc(95vh - 100px)' }}>
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full max-h-[95vh] h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Firma Digital</DialogTitle>
          <DialogDescription>Firma la Carta de Acuerdos de forma electrónica</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
