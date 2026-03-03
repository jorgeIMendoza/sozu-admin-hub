import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface PdfViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  title?: string;
}

export function PdfViewerDialog({ open, onOpenChange, url, title = "Documento PDF" }: PdfViewerDialogProps) {
  const isMobile = useIsMobile();

  const content = (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex justify-end mb-2">
        <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank")} className="gap-1.5">
          <Download className="h-4 w-4" />
          Descargar
        </Button>
      </div>
      <iframe src={url} className="flex-1 w-full rounded border" title={title} />
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[95vh] h-[95vh] rounded-t-3xl overflow-hidden flex flex-col">
          <DrawerHeader className="text-left pb-1 px-4 shrink-0">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>Documento firmado</DrawerDescription>
          </DrawerHeader>
          <div className="flex-1 overflow-hidden flex flex-col px-4 pb-4">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] w-full max-h-[90vh] h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Documento firmado</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
