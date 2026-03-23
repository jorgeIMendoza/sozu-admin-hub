import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Estacionamiento {
  id: number;
  nombre: string;
  m2: number;
  ubicacion: string;
  activo: boolean;
  tipo_nombre: string;
  proyecto_nombre: string;
  numero_propiedad: string;
  id_tipo: number | null;
  es_incluido?: boolean;
  precio_final?: number | null;
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
    id_tipo: estacionamiento?.id_tipo || null,
    es_incluido: estacionamiento?.es_incluido ?? true,
  }));

  // Query para obtener tipos de estacionamiento
  const { data: tiposEstacionamiento = [] } = useQuery({
    queryKey: ['tipos_estacionamiento'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_estacionamiento')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data;
    }
  });

  // Update form data when estacionamiento changes
  useEffect(() => {
    if (estacionamiento) {
      setFormData({
        nombre: estacionamiento.nombre,
        m2: estacionamiento.m2,
        ubicacion: estacionamiento.ubicacion,
        id_tipo: estacionamiento.id_tipo,
        es_incluido: estacionamiento.es_incluido ?? true,
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
      id_tipo: null,
      es_incluido: true,
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

          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo de Estacionamiento</Label>
            <Select 
              value={formData.id_tipo ? formData.id_tipo.toString() : ""} 
              onValueChange={(value) => setFormData({ ...formData, id_tipo: value ? parseInt(value) : null })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent>
                {tiposEstacionamiento.map((tipo) => (
                  <SelectItem key={tipo.id} value={tipo.id.toString()}>
                    {tipo.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="es_incluido">Es incluido (con el departamento)</Label>
            <Switch
              id="es_incluido"
              checked={formData.es_incluido}
              onCheckedChange={(checked) => setFormData({ ...formData, es_incluido: checked })}
            />
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
