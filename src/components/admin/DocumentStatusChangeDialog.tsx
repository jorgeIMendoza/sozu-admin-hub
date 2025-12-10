import React, { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DocumentStatusChangeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newStatus: number, comment: string) => Promise<void>;
  currentStatus: number;
  documentName: string;
  isLoading?: boolean;
}

const statusOptions = [
  { id: 2, label: "Validado" },
  { id: 3, label: "Rechazado" },
  { id: 4, label: "Expirado" },
];

export function DocumentStatusChangeDialog({
  isOpen,
  onClose,
  onConfirm,
  currentStatus,
  documentName,
  isLoading = false,
}: DocumentStatusChangeDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>(currentStatus.toString());
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    const newStatusId = parseInt(selectedStatus);
    
    // Require comment for non-validated status changes
    if (newStatusId !== 2 && !comment.trim()) {
      setError("El comentario es obligatorio para este estatus");
      return;
    }
    
    setError("");
    await onConfirm(newStatusId, comment.trim());
    setComment("");
    setSelectedStatus(currentStatus.toString());
  };

  const handleClose = () => {
    setComment("");
    setSelectedStatus(currentStatus.toString());
    setError("");
    onClose();
  };

  const currentStatusLabel = statusOptions.find(s => s.id === currentStatus)?.label || "Desconocido";
  const newStatusId = parseInt(selectedStatus);
  const requiresComment = newStatusId !== 2;

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cambiar estatus del documento</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p className="text-sm">
                Documento: <span className="font-medium">{documentName}</span>
              </p>
              <p className="text-sm">
                Estatus actual: <span className="font-medium">{currentStatusLabel}</span>
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="new-status">Nuevo estatus</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona el nuevo estatus" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions
                      .filter(s => s.id !== currentStatus)
                      .map((status) => (
                        <SelectItem key={status.id} value={status.id.toString()}>
                          {status.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="comment">
                  Comentario {requiresComment && <span className="text-destructive">*</span>}
                </Label>
                <Textarea
                  id="comment"
                  placeholder={requiresComment 
                    ? "Escriba el motivo del cambio de estatus..." 
                    : "Comentario opcional..."
                  }
                  value={comment}
                  onChange={(e) => {
                    setComment(e.target.value);
                    if (error) setError("");
                  }}
                  rows={3}
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading || selectedStatus === currentStatus.toString()}
          >
            {isLoading ? "Guardando..." : "Confirmar Cambio"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
