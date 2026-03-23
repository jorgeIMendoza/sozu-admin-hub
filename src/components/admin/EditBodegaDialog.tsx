import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface Bodega {
  id: number;
  nombre: string;
  m2: number;
  ubicacion: string;
  activo: boolean;
  proyecto_nombre: string;
  numero_propiedad: string;
  es_incluido?: boolean;
  precio_final?: number | null;
}

interface EditBodegaDialogProps {
  bodega: Bodega | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: number, data: Partial<Bodega>) => void;
}

export const EditBodegaDialog = ({
  bodega,
  open,
  onClose,
  onSave,
}: EditBodegaDialogProps) => {
  const [formData, setFormData] = useState(() => ({
    nombre: bodega?.nombre || "",
    m2: bodega?.m2 || 0,
    ubicacion: bodega?.ubicacion || "",
    es_incluido: bodega?.es_incluido ?? true,
  }));

  useEffect(() => {
    if (bodega) {
      setFormData({
        nombre: bodega.nombre,
        m2: bodega.m2,
        ubicacion: bodega.ubicacion,
        es_incluido: bodega.es_incluido ?? true,
      });
    }
  }, [bodega]);

  const handleSave = () => {
    if (bodega) {
      onSave(bodega.id, formData);
    }
  };

  const handleClose = () => {
    onClose();
    setFormData({
      nombre: "",
      m2: 0,
      ubicacion: "",
      es_incluido: true,
    });
  };

  const precioFinal = bodega?.precio_final ?? 0;
  const puedeSerIncluido = precioFinal === 0 || precioFinal === null;

  if (!bodega) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Bodega</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input
              id="nombre"
              value={formData.nombre}
              onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="m2">M2</Label>
            <Input
              id="m2"
              type="number"
              value={formData.m2}
              onChange={(e) => setFormData({ ...formData, m2: parseFloat(e.target.value) || 0 })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ubicacion">Ubicación</Label>
            <Textarea
              id="ubicacion"
              value={formData.ubicacion}
              onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="es_incluido" className={!puedeSerIncluido ? "text-muted-foreground" : ""}>
                Es incluido (con el departamento)
              </Label>
              <Switch
                id="es_incluido"
                checked={formData.es_incluido}
                onCheckedChange={(checked) => setFormData({ ...formData, es_incluido: checked })}
                disabled={!puedeSerIncluido}
              />
            </div>
            {!puedeSerIncluido && (
              <p className="text-xs text-destructive">
                Solo se puede marcar como incluido cuando el precio final es $0.
              </p>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              Guardar Cambios
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};