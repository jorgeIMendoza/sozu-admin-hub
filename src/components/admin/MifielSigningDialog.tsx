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

      // Create the mifiel-widget element
      const widget = document.createElement('mifiel-widget') as any;
      widget.setAttribute('id', 'mifiel-widget');
      widget.setAttribute('widget-id', widgetId);
      const env = import.meta.env.VITE_MIFIEL_ENVIRONMENT || 'sandbox';
      widget.setAttribute('environment', env === 'production' ? 'production' : 'sandbox');
      containerRef.current.appendChild(widget);

      // Listen for events
      widget.addEventListener('success', () => {
        onSuccess?.();
      });
      widget.addEventListener('error', (e: any) => {
        onError?.(e?.detail?.message || 'Error en la firma');
      });
    };

    // Load the Mifiel CDN script if not already loaded
    if (!scriptLoadedRef.current && !document.querySelector('script[src*="mifiel.com/widget"]')) {
      const script = document.createElement('script');
      const mifielEnv = import.meta.env.VITE_MIFIEL_ENVIRONMENT || 'sandbox';
      const mifielHost = mifielEnv === 'production' ? 'app.mifiel.com' : 'app-sandbox.mifiel.com';
      script.src = `https://${mifielHost}/sign-widget-assets/v3/index.js`;
      script.type = 'module';
      script.onload = () => {
        scriptLoadedRef.current = true;
        // Small delay to let the custom element register
        setTimeout(loadWidget, 500);
      };
      document.head.appendChild(script);
    } else {
      scriptLoadedRef.current = true;
      setTimeout(loadWidget, 300);
    }
  }, [open, widgetId, onSuccess, onError]);

  const content = (
    <div className="min-h-[400px] flex flex-col">
      <div ref={containerRef} className="flex-1 min-h-[350px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Cargando firma digital...</p>
        </div>
      </div>
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Firma Digital</DialogTitle>
          <DialogDescription>Firma la Carta de Acuerdos de forma electrónica</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
