import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Property {
  id: number;
  dueño: string;
  numero_propiedad: string;
  numero_piso: number;
  m2_reales: number;
  precio_lista: number;
  clabe_stp: string;
  vista: string;
  transaccion: string;
  tipo_propiedad: string;
  disponibilidad: string;
  activo: boolean;
}

interface EditPropertyDialogProps {
  property: Property;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditPropertyDialog = ({ property, onClose, onSuccess }: EditPropertyDialogProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    numero_propiedad: property.numero_propiedad,
    numero_piso: property.numero_piso,
    m2_reales: property.m2_reales,
    m2_escriturables: 0,
    precio_lista: property.precio_lista,
    monto_apartado: 0,
    clabe_stp_tmp_apartado: property.clabe_stp,
    id_vista: '',
    id_tipo_transaccion: '',
    id_tipo_propiedad: '',
    id_estatus_disponibilidad: '',
    id_entidad_relacionada_dueno: '',
    id_edificio_modelo: ''
  });

  // Fetch catalogs for dropdowns
  const { data: vistas } = useQuery({
    queryKey: ['vistas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vistas')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    }
  });

  const { data: tiposTransaccion } = useQuery({
    queryKey: ['tipos_transaccion'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_transaccion')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    }
  });

  const { data: tiposPropiedad } = useQuery({
    queryKey: ['tipos_propiedad'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_propiedad')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    }
  });

  const { data: estatusDisponibilidad } = useQuery({
    queryKey: ['estatus_disponibilidad'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estatus_disponibilidad')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    }
  });

  // Fetch property project info first
  const { data: propertyProject } = useQuery({
    queryKey: ['property_project', property.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('propiedades')
        .select(`
          id,
          edificios_modelos!id_edificio_modelo (
            edificios!edificios_modelos_id_edificio_fkey (
              proyectos!fk_edificios_proyecto (
                id,
                nombre
              )
            )
          )
        `)
        .eq('id', property.id)
        .single();
      if (error) throw error;
      return data?.edificios_modelos?.edificios?.proyectos;
    }
  });

  // Fetch owners based on the custom query logic
  const { data: entidadesRelacionadas } = useQuery({
    queryKey: ['propietarios_filtered'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          id_proyecto,
          id_persona,
          proyectos!entidades_relacionadas_id_proyecto_fkey (
            id,
            nombre
          ),
          personas!fk_entrel_persona (
            id,
            nombre_legal
          ),
          tipos_entidad!id_tipo_entidad (
            id,
            nombre
          )
        `)
        .lte('id_tipo_entidad', 2)
        .eq('activo', true);
      
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch models based on project
  const { data: edificiosModelos } = useQuery({
    queryKey: ['modelos_filtered', propertyProject?.nombre],
    queryFn: async () => {
      if (!propertyProject?.nombre) return [];
      
      const { data, error } = await supabase
        .from('edificios_modelos')
        .select(`
          id,
          id_edificio,
          id_modelo,
          edificios!edificios_modelos_id_edificio_fkey (
            id,
            nombre,
            proyectos!fk_edificios_proyecto (
              id,
              nombre
            )
          ),
          modelos!edificios_modelos_id_modelo_fkey (
            id,
            nombre
          )
        `)
        .eq('activo', true);
      
      if (error) throw error;
      
      // Filter by project name
      const filtered = data?.filter(em => 
        em.edificios?.proyectos?.nombre === propertyProject.nombre
      ) || [];
      
      return filtered;
    },
    enabled: !!propertyProject?.nombre
  });

  // Fetch current property details to populate form
  useEffect(() => {
    const fetchPropertyDetails = async () => {
      const { data, error } = await supabase
        .from('propiedades')
        .select('*')
        .eq('id', property.id)
        .single();
      
      if (error) {
        console.error('Error fetching property details:', error);
        return;
      }

      setFormData({
        numero_propiedad: data.numero_propiedad,
        numero_piso: data.numero_piso || 0,
        m2_reales: data.m2_reales || 0,
        m2_escriturables: data.m2_escriturables || 0,
        precio_lista: data.precio_lista,
        monto_apartado: data.monto_apartado || 0,
        clabe_stp_tmp_apartado: data.clabe_stp_tmp_apartado || '',
        id_vista: data.id_vista?.toString() || '',
        id_tipo_transaccion: data.id_tipo_transaccion?.toString() || '',
        id_tipo_propiedad: data.id_tipo_propiedad?.toString() || '',
        id_estatus_disponibilidad: data.id_estatus_disponibilidad?.toString() || '',
        id_entidad_relacionada_dueno: data.id_entidad_relacionada_dueno?.toString() || '',
        id_edificio_modelo: data.id_edificio_modelo?.toString() || ''
      });
    };

    fetchPropertyDetails();
  }, [property.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('propiedades')
        .update({
          numero_propiedad: formData.numero_propiedad,
          numero_piso: formData.numero_piso,
          m2_reales: formData.m2_reales,
          m2_escriturables: formData.m2_escriturables,
          precio_lista: formData.precio_lista,
          monto_apartado: formData.monto_apartado,
          clabe_stp_tmp_apartado: formData.clabe_stp_tmp_apartado,
          id_vista: parseInt(formData.id_vista),
          id_tipo_transaccion: parseInt(formData.id_tipo_transaccion),
          id_tipo_propiedad: parseInt(formData.id_tipo_propiedad),
          id_estatus_disponibilidad: parseInt(formData.id_estatus_disponibilidad),
          id_entidad_relacionada_dueno: parseInt(formData.id_entidad_relacionada_dueno),
          id_edificio_modelo: parseInt(formData.id_edificio_modelo)
        })
        .eq('id', property.id);

      if (error) throw error;

      toast({
        title: "Propiedad actualizada",
        description: "Los datos de la propiedad se han actualizado correctamente.",
      });

      onSuccess();
    } catch (error) {
      console.error('Error updating property:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la propiedad.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Propiedad: {property.numero_propiedad}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numero_propiedad">Número de Propiedad</Label>
              <Input
                id="numero_propiedad"
                value={formData.numero_propiedad}
                onChange={(e) => setFormData(prev => ({ ...prev, numero_propiedad: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="numero_piso">Número de Piso</Label>
              <Input
                id="numero_piso"
                type="number"
                value={formData.numero_piso}
                onChange={(e) => setFormData(prev => ({ ...prev, numero_piso: parseInt(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="m2_reales">M² Reales</Label>
              <Input
                id="m2_reales"
                type="number"
                step="0.01"
                value={formData.m2_reales}
                onChange={(e) => setFormData(prev => ({ ...prev, m2_reales: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="m2_escriturables">M² Escriturables</Label>
              <Input
                id="m2_escriturables"
                type="number"
                step="0.01"
                value={formData.m2_escriturables}
                onChange={(e) => setFormData(prev => ({ ...prev, m2_escriturables: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="precio_lista">Precio Lista</Label>
              <Input
                id="precio_lista"
                type="number"
                step="0.01"
                value={formData.precio_lista}
                onChange={(e) => setFormData(prev => ({ ...prev, precio_lista: parseFloat(e.target.value) || 0 }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="monto_apartado">Monto Apartado</Label>
              <Input
                id="monto_apartado"
                type="number"
                step="0.01"
                value={formData.monto_apartado}
                onChange={(e) => setFormData(prev => ({ ...prev, monto_apartado: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clabe_stp">CLABE STP</Label>
              <Input
                id="clabe_stp"
                value={formData.clabe_stp_tmp_apartado}
                onChange={(e) => setFormData(prev => ({ ...prev, clabe_stp_tmp_apartado: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vista">Vista</Label>
              <Select value={formData.id_vista} onValueChange={(value) => setFormData(prev => ({ ...prev, id_vista: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una vista" />
                </SelectTrigger>
                <SelectContent>
                  {vistas?.map((vista) => (
                    <SelectItem key={vista.id} value={vista.id.toString()}>
                      {vista.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo_transaccion">Tipo de Transacción</Label>
              <Select value={formData.id_tipo_transaccion} onValueChange={(value) => setFormData(prev => ({ ...prev, id_tipo_transaccion: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona tipo de transacción" />
                </SelectTrigger>
                <SelectContent>
                  {tiposTransaccion?.map((tipo) => (
                    <SelectItem key={tipo.id} value={tipo.id.toString()}>
                      {tipo.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo_propiedad">Tipo de Propiedad</Label>
              <Select value={formData.id_tipo_propiedad} onValueChange={(value) => setFormData(prev => ({ ...prev, id_tipo_propiedad: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona tipo de propiedad" />
                </SelectTrigger>
                <SelectContent>
                  {tiposPropiedad?.map((tipo) => (
                    <SelectItem key={tipo.id} value={tipo.id.toString()}>
                      {tipo.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="estatus_disponibilidad">Estatus de Disponibilidad</Label>
              <Select value={formData.id_estatus_disponibilidad} onValueChange={(value) => setFormData(prev => ({ ...prev, id_estatus_disponibilidad: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona estatus" />
                </SelectTrigger>
                <SelectContent>
                  {estatusDisponibilidad?.map((estatus) => (
                    <SelectItem key={estatus.id} value={estatus.id.toString()}>
                      {estatus.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="propietario">Propietario</Label>
              <Select value={formData.id_entidad_relacionada_dueno} onValueChange={(value) => setFormData(prev => ({ ...prev, id_entidad_relacionada_dueno: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona propietario" />
                </SelectTrigger>
                <SelectContent>
                  {entidadesRelacionadas?.map((entidad) => (
                    <SelectItem key={entidad.id} value={entidad.id.toString()}>
                      {entidad.personas?.nombre_legal} - {entidad.proyectos?.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edificio_modelo">Modelos</Label>
              <Select value={formData.id_edificio_modelo} onValueChange={(value) => setFormData(prev => ({ ...prev, id_edificio_modelo: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona modelo" />
                </SelectTrigger>
                <SelectContent>
                  {edificiosModelos?.map((em) => (
                    <SelectItem key={em.id} value={em.id.toString()}>
                      {em.edificios?.nombre} - {em.modelos?.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};