import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileSpreadsheet, Building2, Home, Filter, FileText, Car, Warehouse, Loader2, Download, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useExportToExcel } from "@/hooks/useExportToExcel";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { InmobiliariaHeader } from "@/components/admin/InmobiliariaHeader";
import { EstacionamientosDetailDialog } from "@/components/admin/EstacionamientosDetailDialog";
import { BodegasDetailDialog } from "@/components/admin/BodegasDetailDialog";
import { NewOfferDialog } from "@/components/admin/NewOfferDialog";
import { useToast } from "@/hooks/use-toast";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { generateOfferPDF } from "@/services/htmlToPdfService";
import { CambiarEstatusAprobacionDialog } from "@/components/admin/CambiarEstatusAprobacionDialog";

const ITEMS_PER_PAGE = 50;
// ID del estatus "Disponible" - las inmobiliarias solo ven propiedades disponibles
const ESTATUS_DISPONIBLE_ID = 2;

export default function MisPropiedades() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedInmobiliariaId, setSelectedInmobiliariaId] = useState<number | null>(null);
  const [selectedProyecto, setSelectedProyecto] = useState<string>("all");
  const [selectedModelo, setSelectedModelo] = useState<string>("all");
  const [selectedRecamaras, setSelectedRecamaras] = useState<string>("all");
  const { canExport, canGenerateOffer } = usePagePermissions('/admin/inmobiliarias/mis-propiedades');
  const { exportToExcel, isExporting } = useExportToExcel();
  const { profile } = useAuth();
  const { toast } = useToast();

  // State for detail dialogs
  const [estacionamientosDialogOpen, setEstacionamientosDialogOpen] = useState(false);
  const [bodegasDialogOpen, setBodegasDialogOpen] = useState(false);
  const [selectedPropertyEstacionamientos, setSelectedPropertyEstacionamientos] = useState<any[]>([]);
  const [selectedPropertyBodegas, setSelectedPropertyBodegas] = useState<any[]>([]);
  const [selectedPropertyForDetail, setSelectedPropertyForDetail] = useState<any | null>(null);
  
  // State for offers dialogs
  const [offersDialogOpen, setOffersDialogOpen] = useState(false);
  const [productOffersDialogOpen, setProductOffersDialogOpen] = useState(false);
  const [cambiarEstatusOfferId, setCambiarEstatusOfferId] = useState<number | null>(null);
  const [selectedPropertyOffers, setSelectedPropertyOffers] = useState<any[]>([]);
  const [selectedPropertyProductOffers, setSelectedPropertyProductOffers] = useState<any[]>([]);
  const [selectedPropertyForOffers, setSelectedPropertyForOffers] = useState<any | null>(null);
  const [downloadingOfferId, setDownloadingOfferId] = useState<number | null>(null);
  const [availableSchemes, setAvailableSchemes] = useState<any[]>([]);

  // Get the projects the inmobiliaria has access to
  const { data: projectIds = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['inmobiliaria-project-access', selectedInmobiliariaId],
    queryFn: async () => {
      if (!selectedInmobiliariaId) return [];

      // Get the email associated with the inmobiliaria persona
      const { data: personaData } = await supabase
        .from('personas')
        .select('email')
        .eq('id', selectedInmobiliariaId)
        .single();

      if (!personaData?.email) return [];

      // Query proyectos_acceso using email directly (usuario_id stores email, not UUID)
      const { data, error } = await supabase
        .from('proyectos_acceso')
        .select('proyecto_id')
        .eq('usuario_id', personaData.email)
        .eq('activo', true);

      if (error) throw error;
      return (data || []).map((p: any) => p.proyecto_id);
    },
    enabled: !!selectedInmobiliariaId,
  });

  // Fetch properties using direct query since RPC has different signature
  const { data: propiedades = [], isLoading: loadingProps } = useQuery({
    queryKey: ['mis-propiedades', projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return [];

      // Step 1: Get edificios that belong to the projects
      const { data: edificiosData } = await supabase
        .from('edificios')
        .select('id')
        .in('id_proyecto', projectIds);

      const edificioIds = (edificiosData || []).map((e: any) => e.id);
      if (edificioIds.length === 0) return [];

      // Step 2: Get edificios_modelos for those edificios
      const { data: edificiosModelosData } = await supabase
        .from('edificios_modelos')
        .select('id')
        .in('id_edificio', edificioIds);

      const edificioModeloIds = (edificiosModelosData || []).map((em: any) => em.id);
      if (edificioModeloIds.length === 0) return [];

      // Step 3: Get propiedades for those edificios_modelos - ONLY with estatus "Disponible" (id=2) and approved (es_aprobado=true)
      const { data, error } = await supabase
        .from('propiedades')
        .select(`
          id,
          numero_propiedad,
          precio_lista,
          m2_interiores,
          m2_exteriores,
          activo,
          clabe_stp_tmp_apartado,
          id_edificio_modelo,
          id_estatus_disponibilidad,
          id_entidad_relacionada_dueno,
          id_tipo_transaccion
        `)
        .eq('activo', true)
        .eq('es_aprobado', true) // Only show approved properties (not draft)
        .eq('id_estatus_disponibilidad', ESTATUS_DISPONIBLE_ID)
        .in('id_edificio_modelo', edificioModeloIds)
        .order('numero_propiedad', { ascending: true });

      if (error) {
        console.error('Error fetching propiedades:', error);
        throw error;
      }

      // Step 3.1: Get edificios_modelos data
      const { data: edificiosModelosDetails } = await supabase
        .from('edificios_modelos')
        .select('id, id_edificio, id_modelo')
        .in('id', edificioModeloIds);

      const edificiosModelosMap = new Map((edificiosModelosDetails || []).map((em: any) => [em.id, em]));

      // Step 3.2: Get estatus_disponibilidad
      const estatusIds = [...new Set((data || []).map((p: any) => p.id_estatus_disponibilidad).filter(Boolean))];
      const { data: estatusData } = await supabase
        .from('estatus_disponibilidad')
        .select('id, nombre')
        .in('id', estatusIds);

      const estatusMap = new Map((estatusData || []).map((e: any) => [e.id, e]));

      // Step 3.3: Get entidades_relacionadas and personas for owners
      const entidadIds = [...new Set((data || []).map((p: any) => p.id_entidad_relacionada_dueno).filter(Boolean))];
      let personasMap = new Map();
      if (entidadIds.length > 0) {
        const { data: entidadesData } = await supabase
          .from('entidades_relacionadas')
          .select('id, id_persona')
          .in('id', entidadIds);

        const personaIds = [...new Set((entidadesData || []).map((e: any) => e.id_persona).filter(Boolean))];
        if (personaIds.length > 0) {
          const { data: personasData } = await supabase
            .from('personas')
            .select('id, nombre_legal')
            .in('id', personaIds);

          const personasDataMap = new Map((personasData || []).map((p: any) => [p.id, p]));
          // Map entidad_id -> persona
          for (const ent of (entidadesData || [])) {
            personasMap.set(ent.id, personasDataMap.get(ent.id_persona));
          }
        }
      }

      // Step 3.4: Get cuentas_cobranza with pagos
      const propIds = (data || []).map((p: any) => p.id);
      
      // First get ofertas for these properties
      const { data: ofertasData } = await supabase
        .from('ofertas')
        .select('id, id_propiedad')
        .in('id_propiedad', propIds)
        .eq('activo', true);

      const ofertaIds = (ofertasData || []).map((o: any) => o.id);
      
      let cuentasMap = new Map();
      if (ofertaIds.length > 0) {
        const { data: cuentasData } = await supabase
          .from('cuentas_cobranza')
          .select('id, id_oferta, precio_final, clabe_stp')
          .in('id_oferta', ofertaIds)
          .eq('activo', true);

        // Get pagos for cuentas
        const cuentaIds = (cuentasData || []).map((c: any) => c.id);
        let pagosMap = new Map();
        if (cuentaIds.length > 0) {
          const { data: pagosData } = await supabase
            .from('pagos')
            .select('id, id_cuenta_cobranza, monto, activo')
            .in('id_cuenta_cobranza', cuentaIds)
            .eq('activo', true);

          for (const pago of (pagosData || [])) {
            if (!pagosMap.has(pago.id_cuenta_cobranza)) {
              pagosMap.set(pago.id_cuenta_cobranza, []);
            }
            pagosMap.get(pago.id_cuenta_cobranza).push(pago);
          }
        }

        // Build cuenta with pagos, mapped by propiedad_id via oferta
        const ofertaPropMap = new Map((ofertasData || []).map((o: any) => [o.id, o.id_propiedad]));
        for (const cuenta of (cuentasData || [])) {
          const propId = ofertaPropMap.get(cuenta.id_oferta);
          if (propId) {
            cuentasMap.set(propId, {
              ...cuenta,
              pagos: pagosMap.get(cuenta.id) || []
            });
          }
        }
      }

      // Step 3.5: Get counts for ofertas, estacionamientos, bodegas
      const { data: ofertasCountData } = await supabase
        .from('ofertas')
        .select('id_propiedad')
        .in('id_propiedad', propIds)
        .eq('activo', true)
        .is('id_producto', null);

      const ofertasCountMap = new Map();
      for (const o of (ofertasCountData || [])) {
        ofertasCountMap.set(o.id_propiedad, (ofertasCountMap.get(o.id_propiedad) || 0) + 1);
      }

      const { data: ofertasProdCountData } = await supabase
        .from('ofertas')
        .select('id_propiedad')
        .in('id_propiedad', propIds)
        .eq('activo', true)
        .not('id_producto', 'is', null);

      const ofertasProdCountMap = new Map();
      for (const o of (ofertasProdCountData || [])) {
        ofertasProdCountMap.set(o.id_propiedad, (ofertasProdCountMap.get(o.id_propiedad) || 0) + 1);
      }

      const { data: estCountData } = await supabase
        .from('estacionamientos')
        .select('id_propiedad')
        .in('id_propiedad', propIds)
        .eq('activo', true);

      const estCountMap = new Map();
      for (const e of (estCountData || [])) {
        estCountMap.set(e.id_propiedad, (estCountMap.get(e.id_propiedad) || 0) + 1);
      }

      const { data: bodCountData } = await supabase
        .from('bodegas')
        .select('id_propiedad')
        .in('id_propiedad', propIds)
        .eq('activo', true);

      const bodCountMap = new Map();
      for (const b of (bodCountData || [])) {
        bodCountMap.set(b.id_propiedad, (bodCountMap.get(b.id_propiedad) || 0) + 1);
      }

       // Step 3.6: Calculate correct offer counts excluding cancelled accounts
       // Get all ofertas (property offers) for these properties with creation dates
       const { data: allOfertasData } = await supabase
         .from('ofertas')
         .select('id, id_propiedad, fecha_creacion')
         .in('id_propiedad', propIds)
         .eq('activo', true)
         .is('id_producto', null);

       // Get all product ofertas for these properties with creation dates
       const { data: allOfertasProdData } = await supabase
         .from('ofertas')
         .select('id, id_propiedad, fecha_creacion')
         .in('id_propiedad', propIds)
         .eq('activo', true)
         .not('id_producto', 'is', null);

       // Get all cuentas_cobranza to check cancelled status
       const allOfertaIdsForCounts = [
         ...(allOfertasData || []).map((o: any) => o.id),
         ...(allOfertasProdData || []).map((o: any) => o.id)
       ];

       let cuentasCancelledByProperty: Record<number, string> = {};
       let ofertaCuentaCancelledMap: Record<number, boolean> = {};

       if (allOfertaIdsForCounts.length > 0) {
         // Get cancelled cuentas
         const { data: cancelledCuentasData } = await supabase
           .from('cuentas_cobranza')
           .select('id, id_oferta, fecha_creacion, id_tipo_cancelacion')
           .in('id_oferta', allOfertaIdsForCounts)
           .not('id_tipo_cancelacion', 'is', null);

         // Map ofertas that have cancelled cuentas
         for (const c of (cancelledCuentasData || [])) {
           ofertaCuentaCancelledMap[c.id_oferta] = true;
         }

         // Map oferta_id to property_id
         const ofertaToPropMap: Record<number, number> = {};
         for (const o of [...(allOfertasData || []), ...(allOfertasProdData || [])]) {
           ofertaToPropMap[o.id] = o.id_propiedad;
         }

         // For each property, find the most recent cancelled cuenta to get cutoff date
         for (const c of (cancelledCuentasData || [])) {
           const propId = ofertaToPropMap[c.id_oferta];
           if (propId) {
             if (!cuentasCancelledByProperty[propId] || new Date(c.fecha_creacion) > new Date(cuentasCancelledByProperty[propId])) {
               cuentasCancelledByProperty[propId] = c.fecha_creacion;
             }
           }
         }
       }

       // Calculate correct counts filtering out cancelled offers
       const filteredOfertasCountMap = new Map<number, number>();
       for (const o of (allOfertasData || [])) {
         const cutoffDate = cuentasCancelledByProperty[o.id_propiedad];
         const offerIsCancelledCuenta = ofertaCuentaCancelledMap[o.id];
         
         // Skip if offer has a cancelled cuenta
         if (offerIsCancelledCuenta) continue;
         
         // Skip if offer was created before or at the cutoff date
         if (cutoffDate) {
           const offerDate = new Date(o.fecha_creacion);
           const cutoff = new Date(cutoffDate);
           if (offerDate <= cutoff) continue;
         }
         
         filteredOfertasCountMap.set(o.id_propiedad, (filteredOfertasCountMap.get(o.id_propiedad) || 0) + 1);
       }

       const filteredOfertasProdCountMap = new Map<number, number>();
       for (const o of (allOfertasProdData || [])) {
         const cutoffDate = cuentasCancelledByProperty[o.id_propiedad];
         const offerIsCancelledCuenta = ofertaCuentaCancelledMap[o.id];
         
         // Skip if offer has a cancelled cuenta
         if (offerIsCancelledCuenta) continue;
         
         // Skip if offer was created before or at the cutoff date
         if (cutoffDate) {
           const offerDate = new Date(o.fecha_creacion);
           const cutoff = new Date(cutoffDate);
           if (offerDate <= cutoff) continue;
         }
         
         filteredOfertasProdCountMap.set(o.id_propiedad, (filteredOfertasProdCountMap.get(o.id_propiedad) || 0) + 1);
       }

      // Step 4: Get additional data for edificios and modelos separately
      const edificioIdsForDetails = [...new Set(
        (data || []).map((p: any) => edificiosModelosMap.get(p.id_edificio_modelo)?.id_edificio).filter(Boolean)
      )];
      const { data: edificiosDetails } = await supabase
        .from('edificios')
        .select('id, nombre, id_proyecto')
        .in('id', edificioIdsForDetails);

      // Fetch proyectos info  
      const proyectoIdsForDetails = [...new Set((edificiosDetails || []).map((e: any) => e.id_proyecto).filter(Boolean))];
      const { data: proyectosDetails } = await supabase
        .from('proyectos')
        .select('id, nombre')
        .in('id', proyectoIdsForDetails);

      // Fetch modelos info
      const modeloIdsForDetails = [...new Set(
        (data || []).map((p: any) => edificiosModelosMap.get(p.id_edificio_modelo)?.id_modelo).filter(Boolean)
      )];
      const { data: modelosDetails } = await supabase
        .from('modelos')
        .select('id, nombre, numero_recamaras, numero_completo_banos')
        .in('id', modeloIdsForDetails);

      // Create lookup maps
      const edificiosMap = new Map((edificiosDetails || []).map((e: any) => [e.id, e]));
      const proyectosMap = new Map((proyectosDetails || []).map((p: any) => [p.id, p]));
      const modelosMap = new Map((modelosDetails || []).map((m: any) => [m.id, m]));

      // Step 5: Get previous buyer info for Reventa properties (id_tipo_transaccion = 2)
      const ID_TIPO_REVENTA = 2;
      const reventaPropertyIds = (data || [])
        .filter((p: any) => p.id_tipo_transaccion === ID_TIPO_REVENTA)
        .map((p: any) => p.id);
      
      let reventaPropietariosMap: Record<number, string> = {};
      
      if (reventaPropertyIds.length > 0) {
        // Get the most recent offer for each Reventa property (regardless of active status)
        const { data: reventaOfertas } = await supabase
          .from('ofertas')
          .select('id, id_propiedad, fecha_creacion')
          .in('id_propiedad', reventaPropertyIds)
          .is('id_producto', null)
          .order('fecha_creacion', { ascending: false });
        
        // Group by property and get the most recent offer
        const reventaOfertasMap: Record<number, any> = {};
        (reventaOfertas || []).forEach((oferta: any) => {
          if (!reventaOfertasMap[oferta.id_propiedad]) {
            reventaOfertasMap[oferta.id_propiedad] = oferta;
          }
        });
        
        // Get cuentas_cobranza for these ofertas (including inactive ones since they are deactivated on resale)
        const reventaOfertaIds = Object.values(reventaOfertasMap).map((o: any) => o.id);
        if (reventaOfertaIds.length > 0) {
          const { data: reventaCuentas } = await supabase
            .from('cuentas_cobranza')
            .select('id, id_oferta')
            .in('id_oferta', reventaOfertaIds)
            .order('fecha_creacion', { ascending: false });
          
          // Map by id_oferta, only keeping the first (most recent) cuenta for each oferta
          const reventaCuentasMap: Record<number, any> = {};
          (reventaCuentas || []).forEach((cuenta: any) => {
            if (!reventaCuentasMap[cuenta.id_oferta]) {
              reventaCuentasMap[cuenta.id_oferta] = cuenta;
            }
          });
          
          // Get compradores for these cuentas
          const reventaCuentaIds = Object.values(reventaCuentasMap).map((c: any) => c.id);
          if (reventaCuentaIds.length > 0) {
            const { data: reventaCompradores } = await supabase
              .from('compradores')
              .select('id_cuenta_cobranza, id_persona, porcentaje_copropiedad')
              .in('id_cuenta_cobranza', reventaCuentaIds)
              .eq('activo', true)
              .order('porcentaje_copropiedad', { ascending: false });
            
            // Get persona names
            const reventaPersonaIds = (reventaCompradores || []).map((c: any) => c.id_persona);
            const reventaPersonasNamesMap: Record<number, string> = {};
            if (reventaPersonaIds.length > 0) {
              const { data: personasData } = await supabase
                .from('personas')
                .select('id, nombre_legal')
                .in('id', reventaPersonaIds);
              (personasData || []).forEach((p: any) => {
                reventaPersonasNamesMap[p.id] = p.nombre_legal || 'Sin nombre';
              });
            }
            
            // Build compradores map by cuenta_cobranza_id
            const compradoresPorCuenta: Record<number, { nombre: string; porcentaje: number }[]> = {};
            (reventaCompradores || []).forEach((c: any) => {
              if (!compradoresPorCuenta[c.id_cuenta_cobranza]) {
                compradoresPorCuenta[c.id_cuenta_cobranza] = [];
              }
              compradoresPorCuenta[c.id_cuenta_cobranza].push({
                nombre: reventaPersonasNamesMap[c.id_persona] || 'Sin nombre',
                porcentaje: Number(c.porcentaje_copropiedad) || 0
              });
            });
            
            // Map property ID to previous buyer name
            for (const propId of reventaPropertyIds) {
              const oferta = reventaOfertasMap[propId];
              if (oferta) {
                const cuenta = reventaCuentasMap[oferta.id];
                if (cuenta) {
                  const compradores = compradoresPorCuenta[cuenta.id];
                  if (compradores && compradores.length > 0) {
                    reventaPropietariosMap[propId] = compradores[0].nombre + 
                      (compradores.length > 1 ? ` (+${compradores.length - 1})` : '');
                  }
                }
              }
            }
          }
        }
      }

      return (data || []).map((p: any) => {
        const edModelo = edificiosModelosMap.get(p.id_edificio_modelo);
        const cuentaCobranza = cuentasMap.get(p.id);
        const totalPagado = cuentaCobranza?.pagos
          ?.reduce((sum: number, pago: any) => sum + (pago.monto || 0), 0) || 0;

        const areaTotal = (Number(p.m2_interiores) || 0) + (Number(p.m2_exteriores) || 0);

        // Get edificio and proyecto from lookups
        const edificioId = edModelo?.id_edificio;
        const modeloId = edModelo?.id_modelo;
        const edificio = edificiosMap.get(edificioId);
        const proyecto = edificio ? proyectosMap.get(edificio.id_proyecto) : null;
        const modelo = modelosMap.get(modeloId);
        const estatus = estatusMap.get(p.id_estatus_disponibilidad);
        const propietarioPersona = personasMap.get(p.id_entidad_relacionada_dueno);
        
        // For Reventa properties, show previous buyer as owner
        const esReventa = p.id_tipo_transaccion === ID_TIPO_REVENTA;
        const propietarioDisplay = esReventa && reventaPropietariosMap[p.id]
          ? reventaPropietariosMap[p.id]
          : propietarioPersona?.nombre_legal;

        return {
          id: p.id,
          proyecto_id: proyecto?.id || edificio?.id_proyecto,
          proyecto_nombre: proyecto?.nombre,
          edificio_nombre: edificio?.nombre,
          modelo_nombre: modelo?.nombre,
          numero_departamento: p.numero_propiedad,
          area_total: areaTotal > 0 ? areaTotal : null,
          recamaras: modelo?.numero_recamaras,
          banos: modelo?.numero_completo_banos,
          precio_lista: p.precio_lista,
          estatus_disponibilidad_nombre: estatus?.nombre,
          propietario_nombre: propietarioDisplay,
          cuenta_cobranza_id: cuentaCobranza?.id,
          clabe_stp: cuentaCobranza?.clabe_stp || p.clabe_stp_tmp_apartado,
          precio_final: cuentaCobranza?.precio_final,
          total_pagado: totalPagado,
        num_ofertas: filteredOfertasCountMap.get(p.id) || 0,
        num_ofertas_productos: filteredOfertasProdCountMap.get(p.id) || 0,
          num_estacionamientos: estCountMap.get(p.id) || 0,
          num_bodegas: bodCountMap.get(p.id) || 0,
        };
      });
    },
    enabled: projectIds.length > 0,
  });

  // Extract unique values for filter dropdowns
  const proyectos = useMemo(() => {
    const uniqueProyectos = [...new Set(propiedades.map((p: any) => p.proyecto_nombre).filter(Boolean))];
    return uniqueProyectos.sort();
  }, [propiedades]);

  const modelos = useMemo(() => {
    let filtered = propiedades;
    if (selectedProyecto !== "all") {
      filtered = propiedades.filter((p: any) => p.proyecto_nombre === selectedProyecto);
    }
    const uniqueModelos = [...new Set(filtered.map((p: any) => p.modelo_nombre).filter(Boolean))];
    return uniqueModelos.sort();
  }, [propiedades, selectedProyecto]);

  const recamarasOptions = useMemo(() => {
    const uniqueRecamaras = [...new Set(propiedades.map((p: any) => p.recamaras).filter(Boolean))];
    return uniqueRecamaras.sort((a, b) => a - b);
  }, [propiedades]);

  const filteredPropiedades = useMemo(() => {
    let filtered = propiedades;

    // Filter by proyecto
    if (selectedProyecto !== "all") {
      filtered = filtered.filter((p: any) => p.proyecto_nombre === selectedProyecto);
    }

    // Filter by modelo
    if (selectedModelo !== "all") {
      filtered = filtered.filter((p: any) => p.modelo_nombre === selectedModelo);
    }

    // Filter by recamaras
    if (selectedRecamaras !== "all") {
      filtered = filtered.filter((p: any) => String(p.recamaras) === selectedRecamaras);
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((p: any) =>
        p.proyecto_nombre?.toLowerCase().includes(term) ||
        p.edificio_nombre?.toLowerCase().includes(term) ||
        p.modelo_nombre?.toLowerCase().includes(term) ||
        p.numero_departamento?.toLowerCase().includes(term) ||
        p.propietario_nombre?.toLowerCase().includes(term) ||
        p.clabe_stp?.includes(term)
      );
    }

    return filtered;
  }, [propiedades, searchTerm, selectedProyecto, selectedModelo, selectedRecamaras]);

  const totalPages = Math.ceil(filteredPropiedades.length / ITEMS_PER_PAGE);
  const paginatedProps = filteredPropiedades.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'disponible': return 'bg-green-100 text-green-800';
      case 'vendida': return 'bg-blue-100 text-blue-800';
      case 'apartada': return 'bg-yellow-100 text-yellow-800';
      case 'bloqueada': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleExport = async () => {
    const exportData = filteredPropiedades.map((p: any) => ({
      'Proyecto': p.proyecto_nombre,
      'Propietario': p.propietario_nombre || '-',
      'Edificio': p.edificio_nombre,
      'Modelo': p.modelo_nombre,
      'No. Departamento': p.numero_departamento,
      'Área (m²)': p.area_total || '-',
      'Configuración': `${p.recamaras || 0}R/${p.banos || 0}B`,
      'Precio Lista': p.precio_lista || 0,
      'Estacionamientos': p.num_estacionamientos || 0,
      'Bodegas': p.num_bodegas || 0,
      'Ofertas Comerciales': p.num_ofertas || 0,
      'Ofertas Productos': p.num_ofertas_productos || 0,
      'Estatus': p.estatus_disponibilidad_nombre,
      'Cuenta Cobranza': p.cuenta_cobranza_id ? 'Sí' : 'No',
      'CLABE': p.clabe_stp || '-',
    }));

    await exportToExcel({ data: exportData, filename: 'Mis_Propiedades' });
  };

  // Función para obtener estacionamientos de una propiedad
  const fetchPropertyEstacionamientos = async (propertyId: number) => {
    const { data, error } = await supabase
      .from('estacionamientos')
      .select(`
        id,
        nombre,
        m2,
        ubicacion,
        tipos_estacionamiento!estacionamientos_id_tipo_fkey(nombre),
        productos_servicios!estacionamientos_id_producto_fkey(precio_lista)
      `)
      .eq('id_propiedad', propertyId)
      .eq('activo', true)
      .order('nombre');
    
    if (error) {
      console.error('Error fetching estacionamientos:', error);
      return [];
    }

    return (data || []).map((item: any) => {
      const precioM2 = item.productos_servicios?.precio_lista ?? null;
      const precioFinal = precioM2 !== null ? Number(item.m2 || 0) * Number(precioM2) : null;
      return {
        id: item.id,
        nombre: item.nombre,
        tipo_nombre: item.tipos_estacionamiento?.nombre || 'N/A',
        m2: item.m2,
        ubicacion: item.ubicacion,
        precio_m2: precioM2,
        precio_final: precioFinal
      };
    });
  };

  // Función para obtener bodegas de una propiedad
  const fetchPropertyBodegas = async (propertyId: number) => {
    const { data, error } = await supabase
      .from('bodegas')
      .select(`
        id,
        nombre,
        m2,
        ubicacion,
        productos_servicios!bodegas_id_producto_fkey(precio_lista)
      `)
      .eq('id_propiedad', propertyId)
      .eq('activo', true)
      .order('nombre');
    
    if (error) {
      console.error('Error fetching bodegas:', error);
      return [];
    }

    return (data || []).map((item: any) => {
      const precioM2 = item.productos_servicios?.precio_lista ?? null;
      const precioFinal = precioM2 !== null && item.m2 ? Number(item.m2) * Number(precioM2) : null;
      return {
        id: item.id,
        nombre: item.nombre,
        m2: item.m2,
        ubicacion: item.ubicacion,
        precio_m2: precioM2,
        precio_final: precioFinal
      };
    });
  };

  const handleViewEstacionamientos = async (property: any) => {
    if (property.num_estacionamientos === 0) return;
    
    try {
      const estacionamientos = await fetchPropertyEstacionamientos(property.id);
      setSelectedPropertyEstacionamientos(estacionamientos);
      setSelectedPropertyForDetail(property);
      setEstacionamientosDialogOpen(true);
    } catch (error) {
      console.error('Error fetching estacionamientos:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los estacionamientos",
        variant: "destructive",
      });
    }
  };

  const handleViewBodegas = async (property: any) => {
    if (property.num_bodegas === 0) return;
    
    try {
      const bodegas = await fetchPropertyBodegas(property.id);
      setSelectedPropertyBodegas(bodegas);
      setSelectedPropertyForDetail(property);
      setBodegasDialogOpen(true);
    } catch (error) {
      console.error('Error fetching bodegas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las bodegas",
        variant: "destructive",
      });
    }
  };

  // Fetch property offers (for agents of the selected inmobiliaria) - with full details
  // IMPORTANT: Excludes offers linked to cancelled accounts AND offers created before the cancelled account
  const fetchPropertyOffers = async (propertyId: number): Promise<any[]> => {
    if (!selectedInmobiliariaId) return [];
    
    // Step 1: Find the most recent cancelled cuenta for this property to get the cutoff date
    const { data: cancelledCuentas } = await supabase
      .from('cuentas_cobranza')
      .select('id, id_oferta, fecha_creacion')
      .eq('activo', false)
      .not('id_tipo_cancelacion', 'is', null)
      .order('fecha_creacion', { ascending: false });
    
    // Get ofertas for this property to find which cuentas belong to it
    const { data: propertyOfertas } = await supabase
      .from('ofertas')
      .select('id, fecha_creacion')
      .eq('id_propiedad', propertyId)
      .is('id_producto', null);
    
    const propertyOfertaIds = new Set((propertyOfertas || []).map(o => o.id));
    
    // Find the most recent cancelled cuenta for this property
    const cancelledForProperty = (cancelledCuentas || []).find(c => propertyOfertaIds.has(c.id_oferta));
    const cutoffDate = cancelledForProperty?.fecha_creacion || null;
    
    // Step 2: Use the database function to get offers with agent information
    const { data: offersData, error } = await supabase
      .rpc('get_offers_with_agent' as any, { property_id: propertyId });
    
    if (error) throw error;

    // Step 3: Filter out offers that should not be shown
    const filteredOffers = (offersData || []).filter((offer: any) => {
      // If there's a cutoff date, only show offers created AFTER the cancelled cuenta
      if (cutoffDate) {
        const offerDate = new Date(offer.fecha_generacion);
        const cutoff = new Date(cutoffDate);
        if (offerDate <= cutoff) {
          return false; // Exclude offers created before or at the same time as the cancelled cuenta
        }
      }
      return true;
    });

    // Step 4: Enrich offers with additional data
    const enrichedOffers = await Promise.all(filteredOffers.map(async (offer: any) => {
      let enrichedOffer = { ...offer };
      
      // Get offer display options
      try {
        const { data: offerData } = await supabase
          .from('ofertas')
          .select('mostrar_piso_en_oferta, mostrar_precio_m2_en_oferta, mostrar_seccion_efectivo_en_oferta, id_estatus_aprobacion, estatus_aprobacion!ofertas_id_estatus_aprobacion_fkey(nombre)')
          .eq('id', offer.id)
          .single();
        
        if (offerData) {
          enrichedOffer.mostrar_piso_en_oferta = offerData.mostrar_piso_en_oferta;
          enrichedOffer.mostrar_precio_m2_en_oferta = offerData.mostrar_precio_m2_en_oferta;
          enrichedOffer.mostrar_seccion_efectivo_en_oferta = offerData.mostrar_seccion_efectivo_en_oferta;
          enrichedOffer.id_estatus_aprobacion = offerData.id_estatus_aprobacion;
          enrichedOffer.estatus_aprobacion_nombre = (offerData as any).estatus_aprobacion?.nombre || null;
        }
      } catch (err) {
        console.warn('Error fetching display options for offer:', offer.id);
      }
      
      // Get cuenta_cobranza ID and status if available
      if (offer.cuenta_clabe_stp) {
        try {
          const { data: cuentaData } = await supabase
            .from('cuentas_cobranza')
            .select('id, activo, id_tipo_cancelacion')
            .eq('clabe_stp', offer.cuenta_clabe_stp)
            .single();
          
          if (cuentaData) {
            // Skip offers with cancelled cuentas
            if (cuentaData.id_tipo_cancelacion !== null) {
              return null; // Will be filtered out below
            }
            enrichedOffer.cuenta_cobranza_id = cuentaData.id;
            enrichedOffer.cuenta_activo = cuentaData.activo;
          }
        } catch (err) {
          console.warn('Error fetching cuenta_cobranza ID for offer:', offer.id);
        }
      }
      
      return enrichedOffer;
    }));

    // Filter out null entries (cancelled cuentas)
    return enrichedOffers.filter(offer => offer !== null);
  };

  // Fetch property product offers with full details
  const fetchPropertyProductOffers = async (propertyId: number): Promise<any[]> => {
    if (!selectedInmobiliariaId) return [];
    
    const { data: offersData, error } = await supabase
      .from('ofertas')
      .select(`
        id,
        fecha_generacion,
        activo,
        id_persona_lead,
        email_creador,
        id_esquema_pago_seleccionado,
        id_producto,
        clabe_stp_tmp_producto,
        id_estatus_aprobacion,
        estatus_aprobacion!ofertas_id_estatus_aprobacion_fkey(nombre),
        productos_servicios!ofertas_id_producto_fkey(nombre, precio_lista),
        esquemas_pago!ofertas_id_esquema_pago_seleccionado_fkey(nombre)
      `)
      .eq('id_propiedad', propertyId)
      .not('id_producto', 'is', null)
      .eq('activo', true)
      .order('fecha_generacion', { ascending: false });
    
    if (error) throw error;

    // Enrich offers with additional data
    const enrichedOffers = await Promise.all((offersData || []).map(async (offer: any) => {
      let enrichedOffer = {
        ...offer,
        product_name: offer.productos_servicios?.nombre || 'N/A',
        esquema_nombre: offer.esquemas_pago?.nombre || null,
      };
      
      // Get lead info
      if (offer.id_persona_lead) {
        const { data: personaData } = await supabase
          .from('personas')
          .select('nombre_legal')
          .eq('id', offer.id_persona_lead)
          .maybeSingle();
        
        if (personaData) {
          enrichedOffer.lead_name = personaData.nombre_legal;
        }
      }
      
      // Get cuenta_cobranza if available
      const { data: cuentaData } = await supabase
        .from('cuentas_cobranza')
        .select('id, activo')
        .eq('id_oferta', offer.id)
        .eq('activo', true)
        .maybeSingle();
      
      if (cuentaData) {
        enrichedOffer.cuenta_cobranza_id = cuentaData.id;
        enrichedOffer.cuenta_activo = cuentaData.activo;
      }
      
      return enrichedOffer;
    }));

    return enrichedOffers;
  };

  // Fetch available payment schemes for a project
  const fetchAvailableSchemes = async (projectId: number) => {
    const { data, error } = await supabase
      .from('esquemas_pago')
      .select('id, nombre')
      .eq('id_proyecto', projectId)
      .eq('es_manual', false)
      .eq('activo', true)
      .order('nombre');
    
    if (error) {
      console.error('Error fetching schemes:', error);
      return [];
    }

    return data || [];
  };

  // Handle download offer PDF
  const handleDownloadOffer = async (offer: any) => {
    try {
      setDownloadingOfferId(offer.id);
      
      const { ofertaPdfStorageService } = await import('@/services/ofertaPdfStorageService');
      
      // Check if URL already exists
      const existingUrl = await ofertaPdfStorageService.getExistingUrl(offer.id);
      
      if (existingUrl) {
        // Validar que los datos críticos no hayan cambiado
        const validation = await ofertaPdfStorageService.validateOfferDataAndInvalidateIfNeeded(offer.id);
        
        if (validation.wasInvalidated) {
          // URL fue invalidada, regenerar PDF
          toast({
            title: "Regenerando PDF",
            description: "Los datos de la oferta han sido actualizados, regenerando...",
          });
        } else {
          // URL sigue siendo válida, descargar directamente
          toast({
            title: "Descargando PDF",
            description: "Descargando el PDF de la oferta...",
          });
          
          const filename = existingUrl.split('/').pop() || `oferta-${offer.id}.pdf`;
          await ofertaPdfStorageService.downloadFromUrl(existingUrl, filename);
          
          toast({
            title: "PDF descargado",
            description: "El PDF se ha descargado exitosamente.",
          });
          return;
        }
      }
      
      // No hay URL o fue invalidada, generar nuevo PDF
      {
        toast({
          title: "Generando PDF",
          description: "Preparando la descarga del PDF de la oferta...",
        });

        await generateOfferPDF({
          propertyId: selectedPropertyForOffers?.id,
          offerId: offer.id,
          propertyNumber: selectedPropertyForOffers?.numero_departamento || "N/A",
          leadName: offer.lead_name || "N/A",
          leadEmail: offer.lead_email || "N/A", 
          leadPhone: offer.lead_telefono || "N/A",
          creatorEmail: offer.agent_name || offer.email_creador || "N/A",
          offerOptions: {
            mostrar_piso_en_oferta: offer.mostrar_piso_en_oferta,
            mostrar_precio_m2_en_oferta: offer.mostrar_precio_m2_en_oferta,
            mostrar_seccion_efectivo_en_oferta: offer.mostrar_seccion_efectivo_en_oferta,
          }
        });

        toast({
          title: "PDF generado",
          description: "El PDF se ha generado y descargado exitosamente.",
        });
      }

    } catch (error) {
      console.error('Error generating/downloading PDF:', error);
      toast({
        title: "Error al descargar PDF",
        description: "Hubo un problema al descargar el PDF. Intente nuevamente.",
        variant: "destructive",
      });
    } finally {
      setDownloadingOfferId(null);
    }
  };

  const handleViewOffers = async (property: any) => {
    if (property.num_ofertas === 0) return;
    try {
      const [offers, schemes] = await Promise.all([
        fetchPropertyOffers(property.id),
        fetchAvailableSchemes(property.proyecto_id)
      ]);
      setSelectedPropertyOffers(offers);
      setSelectedPropertyForOffers(property);
      setAvailableSchemes(schemes);
      setOffersDialogOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron cargar las ofertas", variant: "destructive" });
    }
  };

  const handleViewProductOffers = async (property: any) => {
    if (property.num_ofertas_productos === 0) return;
    try {
      const offers = await fetchPropertyProductOffers(property.id);
      setSelectedPropertyProductOffers(offers);
      setSelectedPropertyForOffers(property);
      setProductOffersDialogOpen(true);
    } catch (error) {
      toast({ title: "Error", description: "No se pudieron cargar las ofertas de productos", variant: "destructive" });
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedProyecto("all");
    setSelectedModelo("all");
    setSelectedRecamaras("all");
    setCurrentPage(1);
  };

  const hasActiveFilters = selectedProyecto !== "all" || selectedModelo !== "all" || selectedRecamaras !== "all" || searchTerm !== "";

  const isLoading = loadingProjects || loadingProps;

  if (isLoading && !selectedInmobiliariaId) {
    return (
      <div className="space-y-6">
        <InmobiliariaHeader
          selectedInmobiliariaId={selectedInmobiliariaId}
          onInmobiliariaChange={setSelectedInmobiliariaId}
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InmobiliariaHeader
        selectedInmobiliariaId={selectedInmobiliariaId}
        onInmobiliariaChange={setSelectedInmobiliariaId}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mis Propiedades</h1>
          <p className="text-muted-foreground">
            Propiedades disponibles de los proyectos a los que tienes acceso
          </p>
        </div>
        {canExport && (
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || filteredPropiedades.length === 0}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {isExporting ? 'Exportando...' : 'Exportar'}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Propiedades Disponibles ({filteredPropiedades.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por proyecto, edificio, modelo, departamento..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>

            <Select
              value={selectedProyecto}
              onValueChange={(value) => {
                setSelectedProyecto(value);
                setSelectedModelo("all"); // Reset modelo when proyecto changes
                setCurrentPage(1);
              }}
            >
              <SelectTrigger>
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Proyecto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proyectos</SelectItem>
                {proyectos.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedModelo}
              onValueChange={(value) => {
                setSelectedModelo(value);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger>
                <Home className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Modelo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los modelos</SelectItem>
                {modelos.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Select
                value={selectedRecamaras}
                onValueChange={(value) => {
                  setSelectedRecamaras(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Recámaras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {recamarasOptions.map((r) => (
                    <SelectItem key={r} value={String(r)}>{r} Rec.</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button variant="ghost" size="icon" onClick={clearFilters} title="Limpiar filtros">
                  <Filter className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Propietario</TableHead>
                  <TableHead>Edificio</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>No. Depto</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Config.</TableHead>
                  <TableHead>Precio Lista</TableHead>
                  <TableHead>Est.</TableHead>
                  <TableHead>Bod.</TableHead>
                  <TableHead>Of. Com.</TableHead>
                  <TableHead>Of. Prod.</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead>CLABE</TableHead>
                  {canGenerateOffer && <TableHead>Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canGenerateOffer ? 15 : 14} className="text-center py-8 text-muted-foreground">
                      No se encontraron propiedades
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedProps.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.proyecto_nombre}</TableCell>
                      <TableCell>{p.propietario_nombre || '-'}</TableCell>
                      <TableCell>{p.edificio_nombre}</TableCell>
                      <TableCell>{p.modelo_nombre}</TableCell>
                      <TableCell>{p.numero_departamento}</TableCell>
                      <TableCell>{p.area_total ? `${p.area_total} m²` : '-'}</TableCell>
                      <TableCell>{p.recamaras || 0}R/{p.banos || 0}B</TableCell>
                      <TableCell>{formatCurrency(p.precio_lista)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewEstacionamientos(p)}
                          disabled={p.num_estacionamientos === 0}
                          className="p-0 h-auto font-normal"
                        >
                          <Badge 
                            variant={p.num_estacionamientos > 0 ? "default" : "outline"}
                            className={p.num_estacionamientos > 0 ? "cursor-pointer hover:bg-primary/80" : ""}
                          >
                            {p.num_estacionamientos > 0 ? p.num_estacionamientos : "No"}
                            {p.num_estacionamientos > 0 && <Car className="ml-1 h-3 w-3" />}
                          </Badge>
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewBodegas(p)}
                          disabled={p.num_bodegas === 0}
                          className="p-0 h-auto font-normal"
                        >
                          <Badge 
                            variant={p.num_bodegas > 0 ? "default" : "outline"}
                            className={p.num_bodegas > 0 ? "cursor-pointer hover:bg-primary/80" : ""}
                          >
                            {p.num_bodegas > 0 ? p.num_bodegas : "No"}
                            {p.num_bodegas > 0 && <Warehouse className="ml-1 h-3 w-3" />}
                          </Badge>
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewOffers(p)}
                          disabled={p.num_ofertas === 0}
                          className="p-0 h-auto font-normal"
                        >
                          <Badge 
                            variant={p.num_ofertas > 0 ? "default" : "outline"}
                            className={p.num_ofertas > 0 ? "cursor-pointer hover:bg-primary/80" : ""}
                          >
                            {p.num_ofertas || 0}
                          </Badge>
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewProductOffers(p)}
                          disabled={p.num_ofertas_productos === 0}
                          className="p-0 h-auto font-normal"
                        >
                          <Badge 
                            variant={p.num_ofertas_productos > 0 ? "default" : "outline"}
                            className={p.num_ofertas_productos > 0 ? "cursor-pointer hover:bg-primary/80" : ""}
                          >
                            {p.num_ofertas_productos || 0}
                          </Badge>
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(p.estatus_disponibilidad_nombre)}>
                          {p.estatus_disponibilidad_nombre || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.clabe_stp || '-'}</TableCell>
                      {canGenerateOffer && (
                        <TableCell>
                          {p.estatus_disponibilidad_nombre?.toLowerCase() === 'disponible' ? (
                            <NewOfferDialog
                              propertyId={p.id}
                              propertyNumber={p.numero_departamento}
                              hideManualMode={true}
                              hidePdfOptions={true}
                            />
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Generar Oferta"
                              disabled
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredPropiedades.length)} de {filteredPropiedades.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <EstacionamientosDetailDialog
        open={estacionamientosDialogOpen}
        onClose={() => setEstacionamientosDialogOpen(false)}
        estacionamientos={selectedPropertyEstacionamientos}
        propertyNumber={selectedPropertyForDetail?.numero_departamento || ""}
      />
      
      <BodegasDetailDialog
        open={bodegasDialogOpen}
        onClose={() => setBodegasDialogOpen(false)}
        bodegas={selectedPropertyBodegas}
        propertyNumber={selectedPropertyForDetail?.numero_departamento || ""}
      />

      {/* Offers Dialog */}
      <Dialog open={offersDialogOpen} onOpenChange={setOffersDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Ofertas para propiedad {selectedPropertyForOffers?.numero_departamento} de {selectedPropertyForOffers?.proyecto_nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedPropertyOffers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No se encontraron ofertas para esta propiedad
              </div>
            ) : (
              <TooltipProvider>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Folio</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Fecha</TableHead>
                       <TableHead>Esquema de Pago</TableHead>
                       <TableHead>Estatus Aprob.</TableHead>
                       <TableHead>Cuenta de Cobranza</TableHead>
                       <TableHead>Descarga</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedPropertyOffers.map((offer: any) => {
                      const hasAccount = !!offer.cuenta_cobranza_id;
                      const isAccountActive = hasAccount && offer.cuenta_activo;
                      
                      return (
                        <TableRow key={offer.id}>
                          <TableCell className="font-medium">
                            O-{String(offer.id).padStart(6, '0')}
                          </TableCell>
                          <TableCell>
                            {(offer.agent_name || 'AGENTE POR DEFINIR').toUpperCase()}
                          </TableCell>
                          <TableCell>
                            {(offer.lead_name || 'N/A').toUpperCase()}
                          </TableCell>
                          <TableCell>
                            {new Date(offer.fecha_generacion).toLocaleDateString('es-MX')}
                          </TableCell>
                          <TableCell>
                            {offer.esquema_id ? (
                              <Badge 
                                variant="outline" 
                                className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700"
                              >
                                {offer.esquema_nombre || availableSchemes.find(s => s.id === offer.esquema_id)?.nombre || `ID: ${offer.esquema_id}`}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">Sin esquema</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {offer.esquema_id && offer.id_estatus_aprobacion ? (() => {
                              const estatusColors: Record<number, string> = {
                                1: "bg-yellow-100 text-yellow-800 border-yellow-300",
                                2: "bg-green-100 text-green-800 border-green-300",
                                3: "bg-red-100 text-red-800 border-red-300",
                                4: "bg-blue-100 text-blue-800 border-blue-300",
                              };
                              if (offer.id_estatus_aprobacion === 1) {
                                return (
                                  <Badge 
                                    variant="outline" 
                                    className={`${estatusColors[1]} cursor-pointer hover:opacity-80`}
                                    onClick={() => setCambiarEstatusOfferId(offer.id)}
                                  >
                                    {offer.estatus_aprobacion_nombre || 'Aprobación pendiente'} ✎
                                  </Badge>
                                );
                              }
                              return (
                                <Badge variant="outline" className={estatusColors[offer.id_estatus_aprobacion] || ""}>
                                  {offer.estatus_aprobacion_nombre || `ID: ${offer.id_estatus_aprobacion}`}
                                </Badge>
                              );
                            })() : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {hasAccount ? (
                              <Badge 
                                variant="outline" 
                                className={
                                  isAccountActive 
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" 
                                    : "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
                                }
                              >
                                {formatCuentaCobranzaId(offer.cuenta_cobranza_id, 'Propiedad')}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">Sin cuenta</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => handleDownloadOffer(offer)}
                                  disabled={downloadingOfferId === offer.id}
                                >
                                  {downloadingOfferId === offer.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Descargar PDF de oferta</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TooltipProvider>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Offers Dialog */}
      <Dialog open={productOffersDialogOpen} onOpenChange={setProductOffersDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Ofertas de Productos para propiedad {selectedPropertyForOffers?.numero_departamento} de {selectedPropertyForOffers?.proyecto_nombre}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedPropertyProductOffers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No se encontraron ofertas de productos para esta propiedad
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead>
                    <TableHead>Producto/Servicio</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Fecha</TableHead>
                     <TableHead>Esquema de Pago</TableHead>
                     <TableHead>Estatus Aprob.</TableHead>
                     <TableHead>Cuenta de Cobranza</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedPropertyProductOffers.map((offer: any) => {
                    const hasAccount = !!offer.cuenta_cobranza_id;
                    const isAccountActive = hasAccount && offer.cuenta_activo;
                    
                    return (
                      <TableRow key={offer.id}>
                        <TableCell className="font-medium">
                          OP-{String(offer.id).padStart(6, '0')}
                        </TableCell>
                        <TableCell>
                          {offer.product_name || 'N/A'}
                        </TableCell>
                        <TableCell>
                          {(offer.lead_name || 'N/A').toUpperCase()}
                        </TableCell>
                        <TableCell>
                          {new Date(offer.fecha_generacion).toLocaleDateString('es-MX')}
                        </TableCell>
                        <TableCell>
                          {offer.esquema_nombre ? (
                            <Badge 
                              variant="outline" 
                              className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/50 dark:text-green-200 dark:border-green-700"
                            >
                              {offer.esquema_nombre}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Sin esquema</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {offer.id_esquema_pago_seleccionado && offer.id_estatus_aprobacion ? (() => {
                            const estatusColors: Record<number, string> = {
                              1: "bg-yellow-100 text-yellow-800 border-yellow-300",
                              2: "bg-green-100 text-green-800 border-green-300",
                              3: "bg-red-100 text-red-800 border-red-300",
                              4: "bg-blue-100 text-blue-800 border-blue-300",
                            };
                            if (offer.id_estatus_aprobacion === 1) {
                              return (
                                <Badge 
                                  variant="outline" 
                                  className={`${estatusColors[1]} cursor-pointer hover:opacity-80`}
                                  onClick={() => setCambiarEstatusOfferId(offer.id)}
                                >
                                  {(offer as any).estatus_aprobacion?.nombre || 'Aprobación pendiente'} ✎
                                </Badge>
                              );
                            }
                            return (
                              <Badge variant="outline" className={estatusColors[offer.id_estatus_aprobacion] || ""}>
                                {(offer as any).estatus_aprobacion?.nombre || `ID: ${offer.id_estatus_aprobacion}`}
                              </Badge>
                            );
                          })() : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {hasAccount ? (
                            <Badge 
                              variant="outline" 
                              className={
                                isAccountActive 
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" 
                                  : "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
                              }
                            >
                              {formatCuentaCobranzaId(offer.cuenta_cobranza_id, 'Producto')}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">Sin cuenta</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <CambiarEstatusAprobacionDialog
        open={!!cambiarEstatusOfferId}
        onOpenChange={(open) => { if (!open) setCambiarEstatusOfferId(null); }}
        offerId={cambiarEstatusOfferId || 0}
        onSuccess={() => {
          // Refresh by re-opening the offers dialog data
          window.location.reload();
        }}
      />
    </div>
  );
}
