import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Edit, Trash2, Plus } from 'lucide-react';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PersonForm } from './PersonForm';

interface Comprador {
  porcentaje_copropiedad: number;
  personas?: {
    id: number;
    nombre_legal: string;
    rfc?: string;
    curp?: string;
    email: string;
    telefono?: string;
    tipo_persona: string;
  };
}

interface CuentaCobranza {
  id: number;
  precio_final: number;
  porcentaje_comision_venta?: number;
}

interface Persona {
  id: number;
  nombre_legal: string;
  rfc?: string;
  curp?: string;
  email: string;
  telefono?: string;
  tipo_persona: string;
}

interface AcuerdoPago {
  id: number;
  orden: number;
  monto: number;
  fecha_pago?: string;
  id_concepto: number;
  concepto_nombre?: string;
}

interface EsquemaPago {
  id: number;
  nombre: string;
  porcentaje_enganche: number;
  porcentaje_mensualidades: number;
  porcentaje_entrega: number;
  numero_mensualidades: number;
}

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
}

function SortableItem({ id, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children}
    </TableRow>
  );
}

interface EditCuentaCobranzaDialogProps {
  cuenta: CuentaCobranza;
  onClose: () => void;
  onUpdate: () => void;
}

export function EditCuentaCobranzaDialog({ cuenta, onClose, onUpdate }: EditCuentaCobranzaDialogProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('propiedad');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [porcentaje, setPorcentaje] = useState('');
  const [acuerdos, setAcuerdos] = useState<AcuerdoPago[]>([]);
  const [selectedEsquema, setSelectedEsquema] = useState('');
  const [editingAcuerdo, setEditingAcuerdo] = useState<number | null>(null);
  const [editingDate, setEditingDate] = useState<Date | undefined>(undefined);
  const [showPersonForm, setShowPersonForm] = useState(false);

  const handleNavigateToCompradores = (rfc?: string) => {
    if (rfc) {
      // Navigate to compradores page with RFC filter
      navigate(`/admin/compradores?rfc=${encodeURIComponent(rfc)}`);
    } else {
      navigate('/admin/compradores');
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get cuenta details
  const { data: cuentaDetalle } = useQuery({
    queryKey: ["cuenta_detalle", cuenta.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('cuentas_cobranza')
        .select('*')
        .eq('id', cuenta.id)
        .single();
      return data;
    }
  });

  // Get property details
  const { data: propiedadDetalle } = useQuery({
    queryKey: ["propiedad_detalle", cuentaDetalle?.id_oferta],
    queryFn: async () => {
      if (!cuentaDetalle?.id_oferta) return null;
      
      const { data: ofertaData } = await supabase
        .from('ofertas')
        .select('id_propiedad')
        .eq('id', cuentaDetalle.id_oferta)
        .single();

      if (!ofertaData?.id_propiedad) return null;

      const { data } = await supabase
        .from('propiedades')
        .select(`
          id,
          numero_propiedad,
          numero_piso,
          m2_reales,
          precio_lista,
          descripcion,
          id_entidad_relacionada_dueno,
          id_edificio_modelo
        `)
        .eq('id', ofertaData.id_propiedad)
        .single();

      return data;
    },
    enabled: !!cuentaDetalle?.id_oferta
  });

  // Get seller details
  const { data: vendedorDetalle } = useQuery({
    queryKey: ["vendedor_detalle", propiedadDetalle?.id_entidad_relacionada_dueno],
    queryFn: async () => {
      if (!propiedadDetalle?.id_entidad_relacionada_dueno) return null;
      
      const { data } = await supabase
        .from('entidades_relacionadas')
        .select(`
          personas!entidades_relacionadas_id_persona_fkey(*)
        `)
        .eq('id', propiedadDetalle.id_entidad_relacionada_dueno)
        .single();

      return data?.personas;
    },
    enabled: !!propiedadDetalle?.id_entidad_relacionada_dueno
  });

  // Get existing buyers
  const { data: compradoresExistentes, refetch: refetchCompradores } = useQuery({
    queryKey: ["compradores_existentes", cuenta.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('compradores')
        .select(`
          porcentaje_copropiedad,
          personas!compradores_id_persona_fkey(*)
        `)
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true);

      return data || [];
    }
  });

  // Get payment agreements
  const { data: acuerdosPago } = useQuery({
    queryKey: ["acuerdos_pago", cuenta.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('acuerdos_pago')
        .select(`
          id,
          orden,
          monto,
          fecha_pago,
          id_concepto
        `)
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (data && data.length > 0) {
        const conceptoIds = [...new Set(data.map(a => a.id_concepto))];
        const { data: conceptos } = await supabase
          .from('conceptos_pago')
          .select('id, nombre')
          .in('id', conceptoIds);

        return data.map(acuerdo => ({
          ...acuerdo,
          concepto_nombre: conceptos?.find(c => c.id === acuerdo.id_concepto)?.nombre || 'Sin concepto'
        }));
      }
      
      return [];
    }
  });

  // Get payment schemes
  const { data: esquemasPago } = useQuery({
    queryKey: ["esquemas_pago"],
    queryFn: async () => {
      if (!propiedadDetalle) return [];
      
      const { data: entidad } = await supabase
        .from('entidades_relacionadas')
        .select('id_proyecto')
        .eq('id', propiedadDetalle.id_entidad_relacionada_dueno)
        .single();
        
      if (!entidad?.id_proyecto) return [];

      const { data } = await supabase
        .from('esquemas_pago')
        .select('id, nombre, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, numero_mensualidades')
        .eq('id_proyecto', entidad.id_proyecto)
        .eq('es_manual', false)
        .eq('activo', true)
        .order('nombre', { ascending: true });

      return data || [];
    },
    enabled: !!propiedadDetalle
  });

  // Search for persons (buyers/leads) - search by name, RFC, CURP, email
  const { data: personasBusqueda } = useQuery({
    queryKey: ["personas_busqueda", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      
      const { data } = await supabase
        .from('personas')
        .select('id, nombre_legal, rfc, curp, email, telefono, tipo_persona')
        .or(`nombre_legal.ilike.%${searchTerm}%,rfc.ilike.%${searchTerm}%,curp.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .eq('activo', true)
        .limit(10);

      return data || [];
    },
    enabled: searchTerm.length >= 2
  });

  useEffect(() => {
    if (acuerdosPago) {
      setAcuerdos(acuerdosPago);
    }
  }, [acuerdosPago]);

  const totalPorcentajes = compradoresExistentes?.reduce((sum, c) => sum + (c.porcentaje_copropiedad || 0), 0) || 0;
  const porcentajeDisponible = 100 - totalPorcentajes;
  const isMultipleBuyers = compradoresExistentes && compradoresExistentes.length > 1;

  // Mutation to add new buyer
  const addCompradorMutation = useMutation({
    mutationFn: async ({ personaId }: { personaId: number }) => {
      console.log('Adding buyer with personaId:', personaId, typeof personaId);
      
      // Validate personaId
      if (!personaId || typeof personaId !== 'number' || isNaN(personaId)) {
        throw new Error('ID de persona inválido');
      }

      // Get the project ID from the entidad relacionada dueno
      if (propiedadDetalle?.id_entidad_relacionada_dueno) {
        const { data: entidadData } = await supabase
          .from('entidades_relacionadas')
          .select('id_proyecto')
          .eq('id', propiedadDetalle.id_entidad_relacionada_dueno)
          .single();
          
        const projectId = entidadData?.id_proyecto;
        
        if (projectId) {
          // Check if person exists in entidades_relacionadas with id_tipo_entidad=7
          const { data: existingRelation } = await supabase
            .from("entidades_relacionadas")
            .select("id")
            .eq("id_persona", personaId)
            .eq("id_tipo_entidad", 7)
            .eq("activo", true)
            .maybeSingle();

          if (!existingRelation) {
            // Create new relation in entidades_relacionadas with id_tipo_entidad=2
            const relationData = {
              id_persona: personaId,
              id_proyecto: projectId,
              id_tipo_entidad: 2,
              id_estatus_persona: 3,
              activo: true
            };

            console.log('Creating entidades_relacionadas with data:', relationData);
            const { error: relationError } = await supabase
              .from("entidades_relacionadas")
              .insert(relationData);

            if (relationError) {
              console.error("Error creating entidades_relacionadas:", relationError);
              throw relationError;
            }
          }
        }
      }

      // Calculate the new percentage for equal distribution
      const currentBuyersCount = compradoresExistentes?.length || 0;
      const newBuyersCount = currentBuyersCount + 1;
      const newPercentage = 100 / newBuyersCount;

      // First, add the new buyer
      const compradorData = {
        id_cuenta_cobranza: cuenta.id,
        id_persona: personaId,
        porcentaje_copropiedad: newPercentage,
        activo: true
      };
      
      console.log('Creating comprador with data:', compradorData);
      const { error: insertError } = await supabase
        .from('compradores')
        .insert(compradorData);
      
      if (insertError) {
        console.error("Error creating comprador:", insertError);
        throw insertError;
      }

      // Then update all existing buyers with the new percentage
      if (compradoresExistentes && compradoresExistentes.length > 0) {
        for (const comprador of compradoresExistentes) {
          const { error: updateError } = await supabase
            .from('compradores')
            .update({ porcentaje_copropiedad: newPercentage })
            .eq('id_cuenta_cobranza', cuenta.id)
            .eq('id_persona', comprador.personas?.id)
            .eq('activo', true);
          
          if (updateError) {
            console.error("Error updating buyer percentage:", updateError);
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Comprador agregado exitosamente. Puedes agregar más compradores.");
      refetchCompradores();
      onUpdate();
      setSelectedPersona(null);
      // Reset the PersonForm but keep the modal open
      setShowPersonForm(false);
      setTimeout(() => setShowPersonForm(true), 100);
    },
    onError: (error) => {
      console.error("Error adding buyer:", error);
      toast.error("Error al agregar comprador: " + (error as Error).message);
    }
  });

  // Mutation to create payment agreement
  const createAcuerdoMutation = useMutation({
    mutationFn: async (esquemaId: number) => {
      // Simulate API call - in real implementation this would call an endpoint
      const { data: esquema } = await supabase
        .from('esquemas_pago')
        .select('*')
        .eq('id', esquemaId)
        .single();
      
      if (!esquema || !cuentaDetalle) throw new Error('Esquema o cuenta no encontrada');
      
      const precioFinal = cuentaDetalle.precio_final;
      
      // Calculate payment amounts
      const montoApartado = 20000; // Fixed amount
      const montoEnganche = (precioFinal * esquema.porcentaje_enganche / 100) - montoApartado;
      const montoMensualidad = (precioFinal * esquema.porcentaje_mensualidades / 100) / esquema.numero_mensualidades;
      const montoEntrega = precioFinal * esquema.porcentaje_entrega / 100;
      
      // Create payment agreements
      const acuerdos = [];
      
      // Apartado
      acuerdos.push({
        id_cuenta_cobranza: cuenta.id,
        orden: 1,
        monto: montoApartado,
        id_concepto: 1, // Apartado
        activo: true
      });
      
      // Enganche
      if (montoEnganche > 0) {
        acuerdos.push({
          id_cuenta_cobranza: cuenta.id,
          orden: 2,
          monto: montoEnganche,
          id_concepto: 2, // Enganche
          activo: true
        });
      }
      
      // Mensualidades
      for (let i = 0; i < esquema.numero_mensualidades; i++) {
        acuerdos.push({
          id_cuenta_cobranza: cuenta.id,
          orden: (montoEnganche > 0 ? 3 : 2) + i,
          monto: montoMensualidad,
          id_concepto: 5, // Parcialidad
          activo: true
        });
      }
      
      // Entrega
      acuerdos.push({
        id_cuenta_cobranza: cuenta.id,
        orden: acuerdos.length + 1,
        monto: montoEntrega,
        id_concepto: 3, // Entrega
        activo: true
      });

      const { error } = await supabase
        .from('acuerdos_pago')
        .insert(acuerdos);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acuerdo de pago creado exitosamente");
      onUpdate();
    }
  });

  const handleAddComprador = () => {
    if (!selectedPersona) {
      toast.error("No se ha seleccionado ninguna persona");
      return;
    }

    if (!selectedPersona.id || typeof selectedPersona.id !== 'number') {
      toast.error("ID de persona inválido");
      return;
    }

    console.log('handleAddComprador called with selectedPersona:', selectedPersona);
    addCompradorMutation.mutate({ 
      personaId: selectedPersona.id
    });
  };

  const handleCreateAcuerdo = () => {
    if (!selectedEsquema) return;
    createAcuerdoMutation.mutate(parseInt(selectedEsquema));
  };

  // Mutation to update payment agreement date
  const updateAcuerdoMutation = useMutation({
    mutationFn: async ({ id, fecha_pago }: { id: number; fecha_pago: Date | null }) => {
      const { error } = await supabase
        .from('acuerdos_pago')
        .update({ fecha_pago: fecha_pago?.toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fecha actualizada exitosamente");
      setEditingAcuerdo(null);
      setEditingDate(undefined);
    }
  });

  // Mutation to update payment agreement order
  const updateOrderMutation = useMutation({
    mutationFn: async (updatedAcuerdos: AcuerdoPago[]) => {
      const updates = updatedAcuerdos.map((acuerdo, index) => ({
        id: acuerdo.id,
        orden: index + 1
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('acuerdos_pago')
          .update({ orden: update.orden })
          .eq('id', update.id);
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Orden actualizado");
    }
  });

  const handleDateUpdate = (acuerdoId: number, fecha: Date | undefined) => {
    if (fecha) {
      updateAcuerdoMutation.mutate({ id: acuerdoId, fecha_pago: fecha });
      
      // After updating the date, reorder by fecha_pago
      setTimeout(() => {
        const updatedAcuerdos = [...acuerdos].sort((a, b) => {
          const dateA = a.id === acuerdoId && fecha ? fecha : (a.fecha_pago ? new Date(a.fecha_pago) : new Date('9999-12-31'));
          const dateB = b.fecha_pago ? new Date(b.fecha_pago) : new Date('9999-12-31');
          return dateA.getTime() - dateB.getTime();
        });
        
        setAcuerdos(updatedAcuerdos);
        updateOrderMutation.mutate(updatedAcuerdos);
      }, 500);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = acuerdos.findIndex(item => item.id.toString() === active.id);
      const newIndex = acuerdos.findIndex(item => item.id.toString() === over?.id);

      const newAcuerdos = arrayMove(acuerdos, oldIndex, newIndex);
      setAcuerdos(newAcuerdos);
      updateOrderMutation.mutate(newAcuerdos);
    }
  };

  const getPersonTypeLabel = (tipo: string) => {
    return tipo === 'pf' ? 'Persona Física' : tipo === 'pm' ? 'Persona Moral' : tipo;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Cuenta de Cobranza - CC-{String(cuenta.id).padStart(6, '0')}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="propiedad">Datos de la Propiedad</TabsTrigger>
            <TabsTrigger value="vendedor">Datos del Vendedor</TabsTrigger>
            <TabsTrigger value="compradores">Datos del Comprador</TabsTrigger>
            <TabsTrigger value="acuerdo">Acuerdo de Pago</TabsTrigger>
            <TabsTrigger value="comisiones">Comisiones</TabsTrigger>
          </TabsList>

          <TabsContent value="propiedad" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Información de la Propiedad</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {propiedadDetalle ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Número de Propiedad</Label>
                      <Input value={propiedadDetalle.numero_propiedad || ''} readOnly />
                    </div>
                    <div>
                      <Label>Piso</Label>
                      <Input value={propiedadDetalle.numero_piso || ''} readOnly />
                    </div>
                    <div>
                      <Label>Metros Cuadrados</Label>
                      <Input value={`${propiedadDetalle.m2_reales || 0} m²`} readOnly />
                    </div>
                    <div>
                      <Label>Precio de Lista</Label>
                      <Input value={new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(propiedadDetalle.precio_lista || 0)} readOnly />
                    </div>
                    <div className="col-span-2">
                      <Label>Descripción</Label>
                      <Textarea value={propiedadDetalle.descripcion || 'Sin descripción'} readOnly />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">Cargando información de la propiedad...</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vendedor" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Información del Vendedor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {vendedorDetalle ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Nombre Legal</Label>
                      <Input value={vendedorDetalle.nombre_legal || ''} readOnly />
                    </div>
                    <div>
                      <Label>RFC</Label>
                      <Input value={vendedorDetalle.rfc || ''} readOnly />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input value={vendedorDetalle.email || ''} readOnly />
                    </div>
                    <div>
                      <Label>Teléfono</Label>
                      <Input value={vendedorDetalle.telefono || ''} readOnly />
                    </div>
                    <div>
                      <Label>Tipo de Persona</Label>
                      <Input value={getPersonTypeLabel(vendedorDetalle.tipo_persona || '')} readOnly />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">Cargando información del vendedor...</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compradores" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Compradores</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Total asignado: {totalPorcentajes.toFixed(2)}%
                      {Math.abs(totalPorcentajes - 100) > 0.01 && (
                        <span className={totalPorcentajes > 100 ? "text-destructive ml-2" : "text-warning ml-2"}>
                          {totalPorcentajes > 100 ? "¡Excede el 100%!" : "¡Debe sumar 100%!"}
                        </span>
                      )}
                    </p>
                  </div>
                  <Button onClick={() => setShowPersonForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nuevo Comprador
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {compradoresExistentes && compradoresExistentes.length > 0 ? (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Nombre</TableHead>
                          <TableHead className="font-semibold">RFC</TableHead>
                          <TableHead className="font-semibold">Email</TableHead>
                          <TableHead className="font-semibold">Tipo</TableHead>
                          <TableHead className="font-semibold">Porcentaje (%)</TableHead>
                          <TableHead className="font-semibold text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                         {compradoresExistentes.map((comprador, index) => (
                           <TableRow key={index} className="hover:bg-muted/30 transition-colors">
                             <TableCell className="font-medium">
                               <button
                                 onClick={() => handleNavigateToCompradores(comprador.personas?.rfc)}
                                 className="text-primary hover:underline cursor-pointer text-left"
                               >
                                 {comprador.personas?.nombre_legal}
                               </button>
                             </TableCell>
                             <TableCell className="text-muted-foreground">
                               <button
                                 onClick={() => handleNavigateToCompradores(comprador.personas?.rfc)}
                                 className="text-primary hover:underline cursor-pointer"
                               >
                                 {comprador.personas?.rfc || 'N/A'}
                               </button>
                             </TableCell>
                            <TableCell className="text-muted-foreground">
                              {comprador.personas?.email || 'N/A'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {getPersonTypeLabel(comprador.personas?.tipo_persona || '')}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={comprador.porcentaje_copropiedad}
                                className="w-20 h-8 text-sm"
                                readOnly
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No hay compradores registrados
                  </div>
                )}

                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Buscar Persona para Agregar como Comprador</Label>
                  </div>
                  
                  <Input
                    placeholder="Buscar por nombre, RFC, CURP o email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />

                  {personasBusqueda && personasBusqueda.length > 0 && (
                    <div className="mt-2 border rounded max-h-48 overflow-y-auto">
                      {personasBusqueda.map((persona) => (
                        <div
                          key={persona.id}
                          className="p-2 hover:bg-muted cursor-pointer border-b last:border-b-0"
                          onClick={() => {
                            setSelectedPersona(persona);
                            setSearchTerm('');
                          }}
                        >
                          <p className="font-medium">{persona.nombre_legal}</p>
                          <p className="text-sm text-muted-foreground">
                            {persona.rfc && `RFC: ${persona.rfc}`}
                            {persona.curp && `${persona.rfc ? ' | ' : ''}CURP: ${persona.curp}`}
                            {` | Email: ${persona.email}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedPersona && (
                    <div className="p-4 border rounded bg-muted">
                      <p className="font-medium mb-2">Persona Seleccionada:</p>
                      <p>{selectedPersona.nombre_legal}</p>
                      <p className="text-sm text-muted-foreground">
                        {selectedPersona.rfc && `RFC: ${selectedPersona.rfc}`}
                        {selectedPersona.curp && `${selectedPersona.rfc ? ' | ' : ''}CURP: ${selectedPersona.curp}`}
                        {` | Email: ${selectedPersona.email}`}
                      </p>
                      
                      <div className="mt-4 text-sm text-muted-foreground bg-muted/50 p-3 rounded">
                        <p>
                          Al agregar este comprador, el porcentaje de propiedad se distribuirá automáticamente 
                          entre todos los compradores ({((compradoresExistentes?.length || 0) + 1)} compradores = {(100 / ((compradoresExistentes?.length || 0) + 1)).toFixed(2)}% cada uno).
                        </p>
                      </div>
                      
                      <div className="mt-4">
                        <Button onClick={handleAddComprador} disabled={addCompradorMutation.isPending} className="w-full">
                          Agregar Comprador
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="acuerdo" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Acuerdo de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                {acuerdos && acuerdos.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Concepto</TableHead>
                          <TableHead>Monto</TableHead>
                          <TableHead>Porcentaje</TableHead>
                          <TableHead>Fecha de Pago</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <SortableContext
                          items={acuerdos.map(a => a.id.toString())}
                          strategy={verticalListSortingStrategy}
                        >
                          {acuerdos.map((acuerdo, index) => (
                            <SortableItem key={acuerdo.id} id={acuerdo.id.toString()}>
                              <TableCell>{acuerdo.concepto_nombre}</TableCell>
                              <TableCell>{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(acuerdo.monto)}</TableCell>
                              <TableCell>{cuentaDetalle?.precio_final ? ((acuerdo.monto / cuentaDetalle.precio_final) * 100).toFixed(2) : 0}%</TableCell>
                              <TableCell>
                                {editingAcuerdo === acuerdo.id ? (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" className="h-8 text-xs">
                                        <CalendarIcon className="mr-2 h-3 w-3" />
                                        {editingDate ? format(editingDate, 'dd/MM/yyyy', { locale: es }) : 'Seleccionar'}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <Calendar
                                        mode="single"
                                        selected={editingDate}
                                        onSelect={(date) => {
                                          setEditingDate(date);
                                          if (date) {
                                            handleDateUpdate(acuerdo.id, date);
                                          }
                                        }}
                                        disabled={(date) => date < new Date('1900-01-01')}
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span>
                                      {acuerdo.fecha_pago ? format(new Date(acuerdo.fecha_pago), 'dd/MM/yyyy', { locale: es }) : 'Sin fecha'}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => {
                                        setEditingAcuerdo(acuerdo.id);
                                        setEditingDate(acuerdo.fecha_pago ? new Date(acuerdo.fecha_pago) : undefined);
                                      }}
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {editingAcuerdo === acuerdo.id && (
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingAcuerdo(null);
                                        setEditingDate(undefined);
                                      }}
                                    >
                                      Cancelar
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </SortableItem>
                          ))}
                        </SortableContext>
                      </TableBody>
                    </Table>
                  </DndContext>
                ) : (
                  <div className="space-y-4">
                    <p className="text-muted-foreground">No hay acuerdo de pago configurado</p>
                    
                    <div className="space-y-2">
                      <Label>Seleccionar Plan de Pago</Label>
                      <Select value={selectedEsquema} onValueChange={setSelectedEsquema}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un plan de pago" />
                        </SelectTrigger>
                        <SelectContent>
                          {esquemasPago?.map((esquema) => (
                            <SelectItem key={esquema.id} value={esquema.id.toString()}>
                              {esquema.nombre} - Enganche: {esquema.porcentaje_enganche}% | 
                              Mensualidades: {esquema.numero_mensualidades} pagos de {esquema.porcentaje_mensualidades}% | 
                              Entrega: {esquema.porcentaje_entrega}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Button 
                        onClick={handleCreateAcuerdo} 
                        disabled={!selectedEsquema || createAcuerdoMutation.isPending}
                      >
                        Crear Acuerdo de Pago
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="comisiones" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Información de Comisiones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label>Porcentaje de Comisión por Venta</Label>
                    <Input 
                      value={`${cuentaDetalle?.porcentaje_comision_venta || 0}%`} 
                      readOnly 
                    />
                  </div>
                  {cuentaDetalle?.precio_final && cuentaDetalle.porcentaje_comision_venta && (
                    <div>
                      <Label>Monto de Comisión</Label>
                      <Input 
                        value={new Intl.NumberFormat('es-MX', { 
                          style: 'currency', 
                          currency: 'MXN' 
                        }).format((cuentaDetalle.precio_final * cuentaDetalle.porcentaje_comision_venta) / 100)} 
                        readOnly 
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {showPersonForm && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
            <div className="bg-background rounded-lg shadow-lg max-w-4xl max-h-[90vh] overflow-y-auto">
              <PersonForm
                onCancel={() => setShowPersonForm(false)}
                onSubmit={(persona) => {
                  console.log('PersonForm onSubmit called with persona:', persona);
                  
                  if (!persona.id || typeof persona.id !== 'number') {
                    toast.error("Error: No se pudo obtener el ID de la persona creada");
                    return;
                  }
                  
                   // Don't close the modal - just add the buyer and stay open
                   // This allows the user to continue adding more buyers
                   addCompradorMutation.mutate({ personaId: persona.id });
                }}
                initialData={{ tipo_persona: 'pf' }}
                entityType="comprador"
                restrictToBasicTab={true}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}