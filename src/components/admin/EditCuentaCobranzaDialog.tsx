import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  pago_completado: boolean;
  monto_pagado: number;
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
  disabled?: boolean;
}

function SortableItem({ id, children, disabled = false }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ 
    id,
    disabled 
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? 'not-allowed' : 'grab',
  };

  return (
    <TableRow 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...(disabled ? {} : listeners)}
      className={disabled ? 'pointer-events-none' : ''}
    >
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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('propiedad');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [porcentaje, setPorcentaje] = useState('');
  const [acuerdos, setAcuerdos] = useState<AcuerdoPago[]>([]);
  const [selectedEsquema, setSelectedEsquema] = useState('');
  const [editingAcuerdo, setEditingAcuerdo] = useState<number | null>(null);
  const [editingDate, setEditingDate] = useState<Date | undefined>(undefined);
  const [editingAmount, setEditingAmount] = useState<number | null>(null);
  const [editingMonto, setEditingMonto] = useState<string>('');
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [buyerToDelete, setBuyerToDelete] = useState<{ id: number; name: string } | null>(null);
  const [selectedNotario, setSelectedNotario] = useState<string>('');

  const handleNavigateToCompradores = (rfc?: string) => {
    if (rfc) {
      // Navigate to compradores page with search filter (not rfc filter)
      navigate(`/admin/compradores?search=${encodeURIComponent(rfc)}`);
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

  // Get legal representative details for persona moral
  const { data: representanteLegal } = useQuery({
    queryKey: ["representante_legal", vendedorDetalle?.id_entidad_relacionada_rep_leg],
    queryFn: async () => {
      if (!vendedorDetalle?.id_entidad_relacionada_rep_leg) return null;
      
      const { data } = await supabase
        .from('entidades_relacionadas')
        .select(`
          personas!entidades_relacionadas_id_persona_fkey(*)
        `)
        .eq('id', vendedorDetalle.id_entidad_relacionada_rep_leg)
        .single();

      return data?.personas;
    },
    enabled: !!vendedorDetalle?.id_entidad_relacionada_rep_leg && vendedorDetalle?.tipo_persona === 'pm'
  });

  // Get estacionamientos details
  const { data: estacionamientosDetalle } = useQuery({
    queryKey: ["estacionamientos_detalle", propiedadDetalle?.id],
    queryFn: async () => {
      if (!propiedadDetalle?.id) return [];
      
      const { data } = await supabase
        .from('estacionamientos')
        .select(`
          id,
          nombre,
          m2,
          ubicacion,
          es_incluido,
          tipos_estacionamiento:id_tipo(nombre)
        `)
        .eq('id_propiedad', propiedadDetalle.id)
        .eq('activo', true);

      return data || [];
    },
    enabled: !!propiedadDetalle?.id
  });

  // Get bodegas details
  const { data: bodegasDetalle } = useQuery({
    queryKey: ["bodegas_detalle", propiedadDetalle?.id],
    queryFn: async () => {
      if (!propiedadDetalle?.id) return [];
      
      const { data } = await supabase
        .from('bodegas')
        .select(`
          id,
          nombre,
          m2,
          ubicacion,
          es_incluido
        `)
        .eq('id_propiedad', propiedadDetalle.id)
        .eq('activo', true);

      return data || [];
    },
    enabled: !!propiedadDetalle?.id
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
      // Use raw query to avoid TypeScript type issues
      const { data: acuerdos, error } = await supabase
        .from('acuerdos_pago')
        .select('*')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (error) {
        console.error('Error fetching acuerdos_pago:', error);
        throw error;
      }

      if (!acuerdos || acuerdos.length === 0) return [];

      // Get conceptos de pago
      const conceptoIds = [...new Set(acuerdos.map((a: any) => a.id_concepto))];
      const { data: conceptos } = await supabase
        .from('conceptos_pago')
        .select('id, nombre')
        .in('id', conceptoIds);

      // Get aplicaciones de pago for each acuerdo
      const acuerdoIds = acuerdos.map((a: any) => a.id);
      const { data: aplicaciones } = await supabase
        .from('aplicaciones_pago')
        .select(`
          id,
          monto,
          id_acuerdo_pago
        `)
        .in('id_acuerdo_pago', acuerdoIds)
        .eq('activo', true);

      return acuerdos.map((acuerdo: any) => {
        const concepto = conceptos?.find(c => c.id === acuerdo.id_concepto);
        const acuerdoAplicaciones = aplicaciones?.filter(a => a.id_acuerdo_pago === acuerdo.id) || [];
        
        // Calculate total paid amount from aplicaciones
        const totalAplicado = acuerdoAplicaciones.reduce((sum, app) => sum + app.monto, 0);
        
        return {
          id: acuerdo.id,
          orden: acuerdo.orden,
          monto: acuerdo.monto,
          fecha_pago: acuerdo.fecha_pago,
          id_concepto: acuerdo.id_concepto,
          concepto_nombre: concepto?.nombre || 'Sin concepto',
          pago_completado: acuerdo.pago_completado, // Use the database field directly
          monto_pagado: totalAplicado
        };
      });
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

  // Get notarios
  const { data: notarios } = useQuery({
    queryKey: ["notarios"],
    queryFn: async () => {
      const { data } = await supabase
        .from('notarios')
        .select('id, nombre, notaria')
        .eq('activo', true)
        .order('nombre', { ascending: true });

      return data || [];
    }
  });

  // Search for persons (buyers/leads) - search by name, RFC, CURP, email
  const { data: personasBusqueda } = useQuery({
    queryKey: ["personas_busqueda", searchTerm, compradoresExistentes?.map(c => c.personas?.id)],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      
      // Get existing buyer IDs to exclude them
      const existingBuyerIds = compradoresExistentes?.map(c => c.personas?.id).filter(Boolean) || [];
      
      const { data } = await supabase
        .from('personas')
        .select('id, nombre_legal, rfc, curp, email, telefono, tipo_persona')
        .or(`nombre_legal.ilike.%${searchTerm}%,rfc.ilike.%${searchTerm}%,curp.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .eq('activo', true)
        .not('id', 'in', existingBuyerIds.length > 0 ? `(${existingBuyerIds.join(',')})` : '(0)')
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

  // Update selectedNotario when cuentaDetalle is loaded
  useEffect(() => {
    if (cuentaDetalle?.id_notario) {
      setSelectedNotario(cuentaDetalle.id_notario.toString());
    }
  }, [cuentaDetalle]);

  const totalPorcentajes = compradoresExistentes?.reduce((sum, c) => sum + (c.porcentaje_copropiedad || 0), 0) || 0;
  const porcentajeDisponible = 100 - totalPorcentajes;
  const isMultipleBuyers = compradoresExistentes && compradoresExistentes.length > 1;
  const isValidTotal = Math.abs(totalPorcentajes - 100) < 0.01; // Allow for small floating point differences

  // Mutation to update buyer percentage
  const updateBuyerPercentageMutation = useMutation({
    mutationFn: async ({ buyerId, newPercentage }: { buyerId: number; newPercentage: number }) => {
      const { error } = await supabase
        .from('compradores')
        .update({ porcentaje_copropiedad: newPercentage })
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('id_persona', buyerId)
        .eq('activo', true);
      
      if (error) throw error;
    },
    onSuccess: () => {
      refetchCompradores();
    },
    onError: (error) => {
      console.error("Error updating buyer percentage:", error);
      toast.error("Error al actualizar el porcentaje: " + (error as Error).message);
    }
  });

  // Mutation to delete buyer
  const deleteBuyerMutation = useMutation({
    mutationFn: async (personaId: number) => {
      // First delete the buyer
      const { error: deleteError } = await supabase
        .from('compradores')
        .delete()
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('id_persona', personaId);
      
      if (deleteError) throw deleteError;

      // Get remaining buyers after deletion
      const { data: remainingBuyers, error: fetchError } = await supabase
        .from('compradores')
        .select('id_persona')
        .eq('id_cuenta_cobranza', cuenta.id)
        .eq('activo', true);

      if (fetchError) throw fetchError;

      // If there are remaining buyers, redistribute percentages equally
      if (remainingBuyers && remainingBuyers.length > 0) {
        const newPercentage = 100 / remainingBuyers.length;
        
        // Update all remaining buyers with equal percentage
        const { error: updateError } = await supabase
          .from('compradores')
          .update({ porcentaje_copropiedad: newPercentage })
          .eq('id_cuenta_cobranza', cuenta.id)
          .eq('activo', true);

        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      toast.success("Comprador eliminado y porcentajes redistribuidos exitosamente");
      refetchCompradores();
      setDeleteDialogOpen(false);
      setBuyerToDelete(null);
    },
    onError: (error) => {
      console.error("Error deleting buyer:", error);
      toast.error("Error al eliminar comprador: " + (error as Error).message);
    }
  });

  const handleDeleteBuyer = (personaId: number, nombreComprador: string) => {
    setBuyerToDelete({ id: personaId, name: nombreComprador });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteBuyer = () => {
    if (buyerToDelete) {
      deleteBuyerMutation.mutate(buyerToDelete.id);
    }
  };

  const handlePercentageChange = (buyerId: number, newValue: string) => {
    const newPercentage = parseFloat(newValue) || 0;
    if (newPercentage >= 0 && newPercentage <= 100) {
      updateBuyerPercentageMutation.mutate({ buyerId, newPercentage });
    }
  };

  const handleTabChange = (newTab: string) => {
    if (activeTab === 'compradores' && !isValidTotal) {
      toast.error("Los porcentajes de copropiedad deben sumar exactamente 100% antes de cambiar de pestaña");
      return;
    }
    setActiveTab(newTab);
  };

  const handleCloseModal = () => {
    if (activeTab === 'compradores' && !isValidTotal) {
      toast.error("Los porcentajes de copropiedad deben sumar exactamente 100% antes de cerrar");
      return;
    }
    onClose();
  };
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
              id_proyecto: null, // Set to null for buyers as requested
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
      console.log('Buyer added successfully, setting tab to compradores');
      toast.success("Comprador agregado exitosamente. Puedes agregar más compradores.");
      refetchCompradores();
      // Don't call onUpdate() to prevent modal from closing
      setSelectedPersona(null);
      // Ensure we stay in "compradores" tab after successful addition
      console.log('Current activeTab before setting:', activeTab);
      setActiveTab('compradores');
      console.log('Tab set to compradores');
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
    console.log('Current activeTab before mutation:', activeTab);
    addCompradorMutation.mutate({ 
      personaId: selectedPersona.id
    });
    console.log('Mutation triggered from handleAddComprador');
  };

  const handleCreateAcuerdo = () => {
    if (!selectedEsquema) return;
    createAcuerdoMutation.mutate(parseInt(selectedEsquema));
  };

  // Mutation to update payment agreement amount
  const updateAmountMutation = useMutation({
    mutationFn: async ({ id, monto }: { id: number; monto: number }) => {
      console.log('Amount mutation called with:', { id, monto });
      
      const { data, error } = await supabase
        .from('acuerdos_pago')
        .update({ monto })
        .eq('id', id)
        .select();
      
      console.log('Amount update result:', { data, error });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      console.log('Amount update successful:', data);
      toast.success("Monto actualizado exitosamente");
      setEditingAmount(null);
      setEditingMonto('');
      // Invalidate and refetch the acuerdos_pago query
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuenta.id] });
    },
    onError: (error) => {
      console.error("Error updating amount:", error);
      toast.error("Error al actualizar el monto: " + (error as Error).message);
      setEditingAmount(null);
      setEditingMonto('');
    }
  });
  const updateAcuerdoMutation = useMutation({
    mutationFn: async ({ id, fecha_pago }: { id: number; fecha_pago: Date | null }) => {
      console.log('Mutation called with:', { id, fecha_pago });
      const dateString = fecha_pago?.toISOString().split('T')[0]; // Use date format YYYY-MM-DD
      console.log('Formatted date string:', dateString);
      
      const { data, error } = await supabase
        .from('acuerdos_pago')
        .update({ fecha_pago: dateString })
        .eq('id', id)
        .select();
      
      console.log('Update result:', { data, error });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      console.log('Update successful:', data);
      toast.success("Fecha actualizada exitosamente");
      setEditingAcuerdo(null);
      setEditingDate(undefined);
      // Invalidate and refetch the acuerdos_pago query
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuenta.id] });
    },
    onError: (error) => {
      console.error("Error updating date:", error);
      toast.error("Error al actualizar la fecha: " + (error as Error).message);
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

  // Mutation to update notario
  const updateNotarioMutation = useMutation({
    mutationFn: async (notarioId: number | null) => {
      const { error } = await supabase
        .from('cuentas_cobranza')
        .update({ id_notario: notarioId })
        .eq('id', cuenta.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notario actualizado exitosamente");
      // Refetch the cuenta data to update the UI
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuenta.id] });
    },
    onError: (error) => {
      console.error("Error updating notario:", error);
      toast.error("Error al actualizar el notario");
    }
  });

  const handleAmountUpdate = (acuerdoId: number, monto: number) => {
    console.log('Updating amount for acuerdo:', acuerdoId, 'to:', monto);
    updateAmountMutation.mutate({ id: acuerdoId, monto });
  };

  const handleDateUpdate = (acuerdoId: number, fecha: Date | undefined) => {
    if (fecha) {
      console.log('Updating date for acuerdo:', acuerdoId, 'to:', fecha);
      updateAcuerdoMutation.mutate({ id: acuerdoId, fecha_pago: fecha });
    }
  };

  const handleNotarioChange = (value: string) => {
    setSelectedNotario(value);
    const notarioId = value ? parseInt(value) : null;
    updateNotarioMutation.mutate(notarioId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = acuerdos.findIndex(item => item.id.toString() === active.id);
      const newIndex = acuerdos.findIndex(item => item.id.toString() === over?.id);

      // Don't allow moving completed payments or payments with partial payments
      const activeItem = acuerdos[oldIndex];
      const overItem = acuerdos[newIndex];
      
      if (activeItem?.pago_completado || overItem?.pago_completado) {
        toast.error("No se pueden mover pagos completados");
        return;
      }

      // Don't allow moving payments that have partial payments (monto_pagado > 0)
      if (activeItem?.monto_pagado > 0 || overItem?.monto_pagado > 0) {
        toast.error("No se pueden mover pagos que tienen montos aplicados");
        return;
      }

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

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
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
                  <>
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
                      <div>
                        <Label>Notario</Label>
                        <Select value={selectedNotario} onValueChange={handleNotarioChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar notario" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Sin notario</SelectItem>
                            {notarios?.map((notario) => (
                              <SelectItem key={notario.id} value={notario.id.toString()}>
                                {notario.nombre} - {notario.notaria}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Estacionamientos Section */}
                    {estacionamientosDetalle && estacionamientosDetalle.filter(e => e.es_incluido).length > 0 && (
                      <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                        <h4 className="font-medium text-foreground mb-4">Estacionamientos Incluidos</h4>
                        <div className="grid gap-3">
                          {estacionamientosDetalle.filter(e => e.es_incluido).map((estacionamiento) => (
                            <div key={estacionamiento.id} className="flex justify-between items-center p-3 bg-background rounded border">
                              <div className="flex gap-4">
                                <div>
                                  <p className="font-medium">{estacionamiento.nombre}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {estacionamiento.tipos_estacionamiento?.nombre || 'Tipo no especificado'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{estacionamiento.m2} m²</p>
                                  <p className="text-sm text-muted-foreground">
                                    {estacionamiento.ubicacion || 'Ubicación no especificada'}
                                  </p>
                                </div>
                              </div>
                              <Badge variant="default">Incluido</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bodegas Section */}
                    {bodegasDetalle && bodegasDetalle.filter(b => b.es_incluido).length > 0 && (
                      <div className="mt-6 p-4 bg-muted/30 rounded-lg">
                        <h4 className="font-medium text-foreground mb-4">Bodegas Incluidas</h4>
                        <div className="grid gap-3">
                          {bodegasDetalle.filter(b => b.es_incluido).map((bodega) => (
                            <div key={bodega.id} className="flex justify-between items-center p-3 bg-background rounded border">
                              <div className="flex gap-4">
                                <div>
                                  <p className="font-medium">{bodega.nombre}</p>
                                  <p className="text-sm text-muted-foreground">
                                    Bodega de almacenamiento
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{bodega.m2} m²</p>
                                  <p className="text-sm text-muted-foreground">
                                    {bodega.ubicacion || 'Ubicación no especificada'}  
                                  </p>
                                </div>
                              </div>
                              <Badge variant="default">Incluida</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
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
                    
                    {/* Campos adicionales para Persona Moral */}
                    {vendedorDetalle.tipo_persona === 'pm' && (
                      <>
                        {vendedorDetalle.nombre_comercial && (
                          <div>
                            <Label>Nombre Comercial</Label>
                            <Input value={vendedorDetalle.nombre_comercial} readOnly />
                          </div>
                        )}
                        {representanteLegal && (
                          <div>
                            <Label>Representante Legal</Label>
                            <Input value={representanteLegal.nombre_legal || ''} readOnly />
                          </div>
                        )}
                      </>
                    )}
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
                      {!isValidTotal && (
                        <span className="text-destructive ml-2 font-medium">
                          ¡Debe sumar exactamente 100%!
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
                               {comprador.personas?.nombre_legal}
                             </TableCell>
                             <TableCell className="text-muted-foreground">
                               {comprador.personas?.rfc || 'N/A'}
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
                                 value={comprador.porcentaje_copropiedad.toFixed(2)}
                                 onChange={(e) => handlePercentageChange(comprador.personas?.id || 0, e.target.value)}
                                 className="w-20 h-8 text-sm"
                                 disabled={updateBuyerPercentageMutation.isPending}
                               />
                             </TableCell>
                             <TableCell className="text-right">
                               <Button 
                                 variant="outline" 
                                 size="sm"
                                 onClick={() => handleDeleteBuyer(comprador.personas?.id || 0, comprador.personas?.nombre_legal || '')}
                                 disabled={deleteBuyerMutation.isPending}
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
              <CardContent className="pt-6">
                {/* Purchase and UMA Information Section */}
                <div className="mb-6 p-4 bg-muted/30 rounded-lg">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div>
                      <h4 className="font-medium text-foreground mb-1">Fecha de Compra</h4>
                      <p className="text-sm text-muted-foreground">
                        {cuentaDetalle?.fecha_compra ? 
                          format(new Date(cuentaDetalle.fecha_compra), 'dd/MM/yyyy', { locale: es }) : 
                          'No definida'
                        }
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground mb-1">Precio de Lista</h4>
                      <p className="text-sm text-muted-foreground">
                        {propiedadDetalle?.precio_lista ? 
                          new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(propiedadDetalle.precio_lista) : 
                          'No definido'
                        }
                      </p>
                      {propiedadDetalle?.precio_lista && cuentaDetalle?.precio_final && (
                        <p className="text-xs text-muted-foreground">
                          {(() => {
                            const difference = ((cuentaDetalle.precio_final - propiedadDetalle.precio_lista) / propiedadDetalle.precio_lista) * 100;
                            return difference > 0 ? 
                              `${difference.toFixed(2)}% interés` : 
                              difference < 0 ?
                              `${Math.abs(difference).toFixed(2)}% descuento` :
                              '0.00% descuento';
                          })()}
                        </p>
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground mb-1">Precio Final</h4>
                      <p className="text-sm text-muted-foreground">
                        {cuentaDetalle?.precio_final ? 
                          new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cuentaDetalle.precio_final) : 
                          'No definido'
                        }
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground mb-1">Valor de la UMA</h4>
                      <p className="text-sm text-muted-foreground">
                        {cuentaDetalle?.valor_uma ? 
                          new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cuentaDetalle.valor_uma) : 
                          'No definido'
                        }
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Unidad de Medida y Actualización vigente
                      </p>
                    </div>
                  </div>
                </div>

                {/* Acuerdo de Pago Title */}
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-foreground">Acuerdo de Pago</h3>
                </div>

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
                            <TableHead>Fecha de Pago</TableHead>
                            <TableHead>Monto</TableHead>
                            <TableHead>Porcentaje</TableHead>
                            <TableHead>Pagado</TableHead>
                            <TableHead>Estatus</TableHead>
                          </TableRow>
                        </TableHeader>
                      <TableBody>
                        <SortableContext
                          items={acuerdos.map(a => a.id.toString())}
                          strategy={verticalListSortingStrategy}
                        >
                           {acuerdos.map((acuerdo, index) => (
                              <SortableItem 
                                key={acuerdo.id} 
                                id={acuerdo.id.toString()}
                                disabled={acuerdo.pago_completado || acuerdo.monto_pagado > 0}
                              >
                                <TableCell>{acuerdo.concepto_nombre}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <span>
                                        {acuerdo.fecha_pago ? format(new Date(acuerdo.fecha_pago), 'dd/MM/yyyy', { locale: es }) : 'Sin fecha'}
                                      </span>
                                      {!acuerdo.pago_completado && (
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 w-6 p-0"
                                              onClick={() => {
                                                console.log('Date edit button clicked for acuerdo:', acuerdo.id);
                                                setEditingAcuerdo(acuerdo.id);
                                                setEditingDate(acuerdo.fecha_pago ? new Date(acuerdo.fecha_pago) : undefined);
                                              }}
                                            >
                                              <Edit className="h-3 w-3" />
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                              mode="single"
                                              selected={editingDate}
                                              onSelect={(date) => {
                                                console.log('Calendar date selected:', date);
                                                setEditingDate(date);
                                                if (date) {
                                                  handleDateUpdate(acuerdo.id, date);
                                                }
                                              }}
                                              disabled={(date) => date < new Date('1900-01-01')}
                                              initialFocus
                                              className="p-3 pointer-events-auto"
                                            />
                                          </PopoverContent>
                                        </Popover>
                                      )}
                                    </div>
                                  </TableCell>
                                <TableCell>
                                  {!acuerdo.pago_completado && editingAmount === acuerdo.id ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={editingMonto}
                                        onChange={(e) => setEditingMonto(e.target.value)}
                                        className="w-32"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            const monto = parseFloat(editingMonto);
                                            if (!isNaN(monto) && monto > 0) {
                                              handleAmountUpdate(acuerdo.id, monto);
                                            }
                                          }
                                          if (e.key === 'Escape') {
                                            setEditingAmount(null);
                                            setEditingMonto('');
                                          }
                                        }}
                                      />
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          const monto = parseFloat(editingMonto);
                                          if (!isNaN(monto) && monto > 0) {
                                            handleAmountUpdate(acuerdo.id, monto);
                                          }
                                        }}
                                      >
                                        Guardar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setEditingAmount(null);
                                          setEditingMonto('');
                                        }}
                                      >
                                        Cancelar
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span>
                                        {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(acuerdo.monto)}
                                      </span>
                                      {!acuerdo.pago_completado && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0"
                                          onClick={() => {
                                            setEditingAmount(acuerdo.id);
                                            setEditingMonto(acuerdo.monto.toString());
                                          }}
                                        >
                                          <Edit className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>{cuentaDetalle?.precio_final ? ((acuerdo.monto / cuentaDetalle.precio_final) * 100).toFixed(2) : 0}%</TableCell>
                                <TableCell>
                                  {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(acuerdo.monto_pagado || 0)}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-center">
                                    {acuerdo.pago_completado ? (
                                      <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full text-xs font-medium">
                                        Pagado
                                      </span>
                                    ) : (
                                      <span className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 rounded-full text-xs font-medium">
                                        Pendiente
                                      </span>
                                    )}
                                  </div>
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
                  
                   // Close the person form first
                   setShowPersonForm(false);
                   console.log('PersonForm closed, about to add buyer and set tab');
                   // Add the buyer and ensure we stay in compradores tab
                   addCompradorMutation.mutate({ personaId: persona.id });
                   console.log('Mutation called, setting tab to compradores');
                   // Force tab to compradores immediately and with delay
                   setActiveTab('compradores');
                   setTimeout(() => {
                     console.log('Timeout: setting tab to compradores again');
                     setActiveTab('compradores');
                   }, 100);
                }}
                initialData={{ tipo_persona: 'pf' }}
                entityType="comprador"
                restrictToBasicTab={true}
              />
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar eliminación</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro de que deseas eliminar a <strong>"{buyerToDelete?.name}"</strong> de la lista de compradores?
                <br /><br />
                Los porcentajes de copropiedad se redistribuirán automáticamente entre los compradores restantes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmDeleteBuyer}
                disabled={deleteBuyerMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteBuyerMutation.isPending ? "Eliminando..." : "Eliminar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleCloseModal}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}