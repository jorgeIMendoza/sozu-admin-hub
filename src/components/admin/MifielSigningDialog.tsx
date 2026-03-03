import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

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
  const [zoom, setZoom] = useState(1);

  // Reset zoom when dialog opens
  useEffect(() => {
    if (open) setZoom(1);
  }, [open]);

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

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleZoomReset = () => setZoom(1);

  const zoomControls = (
    <div className="flex items-center justify-center gap-1 py-2 sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b">
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomOut} disabled={zoom <= 0.5}>
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-mono min-w-[3.5rem]" onClick={handleZoomReset}>
        {Math.round(zoom * 100)}%
      </Button>
      <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomIn} disabled={zoom >= 2.5}>
        <ZoomIn className="h-4 w-4" />
      </Button>
      {zoom !== 1 && (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomReset}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  const content = (
    <div className="flex flex-col flex-1 overflow-hidden">
      {zoomControls}
      <div className="flex-1 overflow-auto">
        <div ref={containerRef} className="min-h-[60vh] flex items-center justify-center mifiel-fullwidth" style={{ transformOrigin: 'top center' }}>
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Cargando firma digital...</p>
          </div>
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
          transform: scale(${zoom});
          transform-origin: top center;
          transition: transform 0.2s ease;
        }
      `}</style>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[98vh] h-[98vh] rounded-t-3xl overflow-hidden flex flex-col">
          <DrawerHeader className="text-left pb-1 px-4 shrink-0">
            <DrawerTitle>Firma Digital</DrawerTitle>
            <DrawerDescription>Firma la Carta de Acuerdos de forma electrónica</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-hidden flex flex-col px-2 pb-4">
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
