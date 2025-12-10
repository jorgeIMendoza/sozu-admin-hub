import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Clock, User, MessageSquare } from "lucide-react";

interface HistoryEntry {
  id: number;
  fecha_creacion: string;
  comentario: string;
  email_usuario: string | null;
  id_estatus_verificacion: number;
  estatus_nombre?: string;
}

interface DocumentHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number | null;
  documentName: string;
}

const getStatusInfo = (statusId: number): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
  switch (statusId) {
    case 1:
      return { label: "Pendiente", variant: "secondary" };
    case 2:
      return { label: "Validado", variant: "default" };
    case 3:
      return { label: "Rechazado", variant: "destructive" };
    case 4:
      return { label: "Expirado", variant: "outline" };
    default:
      return { label: "Desconocido", variant: "secondary" };
  }
};

export function DocumentHistoryDialog({
  isOpen,
  onClose,
  documentId,
  documentName,
}: DocumentHistoryDialogProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && documentId) {
      loadHistory();
    }
  }, [isOpen, documentId]);

  const loadHistory = async () => {
    if (!documentId) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('comentarios_verificacion_documento')
        .select(`
          id,
          fecha_creacion,
          comentario,
          email_usuario,
          id_estatus_verificacion
        `)
        .eq('id_documento', documentId)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (error) {
      console.error('Error loading document history:', error);
      setHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Historial de Verificación
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{documentName}</p>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No hay historial de cambios</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((entry) => {
                const statusInfo = getStatusInfo(entry.id_estatus_verificacion);
                return (
                  <div
                    key={entry.id}
                    className="rounded-lg border bg-card p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant={statusInfo.variant}>
                        {statusInfo.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(entry.fecha_creacion)}
                      </span>
                    </div>
                    
                    {entry.comentario && (
                      <p className="text-sm">{entry.comentario}</p>
                    )}
                    
                    {entry.email_usuario && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>{entry.email_usuario}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
