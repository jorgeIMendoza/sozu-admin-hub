import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface Estacionamiento {
  id: number;
  nombre: string;
  m2: number;
  ubicacion: string;
  es_incluido: boolean;
  activo: boolean;
  tipo_nombre: string;
  proyecto_nombre: string;
  numero_propiedad: string;
}

interface EditEstacionamientoDialogProps {
  estacionamiento: Estacionamiento | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: number, data: Partial<Estacionamiento>) => void;
}

export const EditEstacionamientoDialog = ({
  estacionamiento,
  open,
  onClose,
  onSave,
}: EditEstacionamientoDialogProps) => {
  const [formData, setFormData] = useState(() => ({
    nombre: estacionamiento?.nombre || "",
    m2: estacionamiento?.m2 || 0,
    ubicacion: estacionamiento?.ubicacion || "",
    es_incluido: estacionamiento?.es_incluido || false,
  }));

  // Update form data when estacionamiento changes
  useEffect(() => {
    if (estacionamiento) {
      setFormData({
        nombre: estacionamiento.nombre,
        m2: estacionamiento.m2,
        ubicacion: estacionamiento.ubicacion,
        es_incluido: estacionamiento.es_incluido,
      });
    }
  }, [estacionamiento]);

  const handleSave = () => {
    if (estacionamiento) {
      onSave(estacionamiento.id, formData);
    }
  };

  const handleClose = () => {
    onClose();
    setFormData({
      nombre: "",
      m2: 0,
      ubicacion: "",
      es_incluido: false,
    });
  };

  if (!estacionamiento) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Estacionamiento</DialogTitle>
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

          <div className="flex items-center space-x-2">
            <Switch
              id="es_incluido"
              checked={formData.es_incluido}
              disabled
            />
            <Label htmlFor="es_incluido">Incluido</Label>
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