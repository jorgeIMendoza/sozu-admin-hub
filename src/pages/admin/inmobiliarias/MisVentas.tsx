 import { useState, useMemo, useRef } from "react";
 import { useQuery, useQueryClient } from "@tanstack/react-query";
 import { Search, FileSpreadsheet, Upload, FileText, Check } from "lucide-react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
 import { Badge } from "@/components/ui/badge";
 import { usePagePermissions } from "@/hooks/usePagePermissions";
 import { useExportToExcel } from "@/hooks/useExportToExcel";
 import { supabase } from "@/integrations/supabase/client";
 import { Loader2 } from "lucide-react";
 import { InmobiliariaHeader } from "@/components/admin/InmobiliariaHeader";
 import { toast } from "sonner";
 
 const ITEMS_PER_PAGE = 50;
 
type Venta = {
  id: number;
  cuenta_cobranza_id: number;
  proyecto_nombre: string;
  edificio_nombre: string;
  modelo_nombre: string;
  numero_propiedad: string;
  producto_nombre: string;
  precio_final: number;
  porcentaje_comision: number;
  monto_comision: number;
  iva_incluido: boolean;
  agente_vendedor_nombre: string;
  agente_vendedor_email: string;
  tiene_factura: boolean;
  factura_url: string | null;
};
 
 export default function MisVentas() {
   const [searchTerm, setSearchTerm] = useState("");
   const [currentPage, setCurrentPage] = useState(1);
   const [selectedInmobiliariaId, setSelectedInmobiliariaId] = useState<number | null>(null);
   const [uploadingForCuenta, setUploadingForCuenta] = useState<number | null>(null);
   const fileInputRef = useRef<HTMLInputElement>(null);
   const { canExport } = usePagePermissions('/admin/inmobiliarias/mis-ventas');
   const { exportToExcel, isExporting } = useExportToExcel();
   const queryClient = useQueryClient();
 
   // Get agents linked to the inmobiliaria (tipo 19 = Agente, id_persona_duena_lead = inmobiliaria)
   const { data: agentEmails = [], isLoading: loadingAgents } = useQuery({
     queryKey: ['inmobiliaria-agents', selectedInmobiliariaId],
     queryFn: async () => {
       if (!selectedInmobiliariaId) return [];
 
       const { data, error } = await supabase
         .from('entidades_relacionadas')
         .select(`
           id_persona,
           personas!entidades_relacionadas_id_persona_fkey (
             id,
             nombre_legal,
             email
           )
         `)
         .eq('id_tipo_entidad', 19)
         .eq('id_persona_duena_lead', selectedInmobiliariaId)
         .eq('activo', true);
 
       if (error) throw error;
       
       return (data || []).map((item: any) => ({
         id: item.personas?.id,
         nombre: item.personas?.nombre_legal,
         email: item.personas?.email?.toLowerCase(),
       })).filter((a: any) => a.email);
     },
     enabled: !!selectedInmobiliariaId,
   });
 
   // Fetch sales where ofertas.email_creador matches agent emails
   const { data: ventas = [], isLoading: loadingVentas } = useQuery({
     queryKey: ['mis-ventas-agentes', agentEmails],
     queryFn: async () => {
       if (agentEmails.length === 0) return [];
 
       const emails = agentEmails.map((a: any) => a.email);
 
       // Get ofertas created by these agents
       const { data: ofertasData, error: ofertasError } = await supabase
         .from('ofertas')
         .select('id, email_creador, id_propiedad, id_producto')
         .in('email_creador', emails)
         .eq('activo', true);
 
       if (ofertasError) throw ofertasError;
       if (!ofertasData || ofertasData.length === 0) return [];
 
       const ofertaIds = ofertasData.map((o: any) => o.id);
 
       // Get cuentas_cobranza for these ofertas
       const { data: cuentasData, error: cuentasError } = await supabase
         .from('cuentas_cobranza')
         .select(`
           id,
           id_oferta,
           precio_final,
           porcentaje_comision_venta,
           iva_incluido
         `)
         .in('id_oferta', ofertaIds)
         .eq('activo', true);
 
       if (cuentasError) throw cuentasError;
       if (!cuentasData || cuentasData.length === 0) return [];
 
       // Get property info for all ofertas
       const propiedadIds = ofertasData
         .filter((o: any) => o.id_propiedad)
         .map((o: any) => o.id_propiedad);
 
       let propiedadesMap: Record<number, any> = {};
       if (propiedadIds.length > 0) {
          // First get properties with their edificio_modelo ids
          const { data: propiedadesData } = await (supabase as any)
           .from('propiedades')
           .select(`
             id,
             numero_propiedad,
              id_edificio_modelo
           `)
           .in('id', propiedadIds);
 
          // Get unique edificio_modelo ids
          const edificioModeloIds = [...new Set(
            (propiedadesData || [])
              .map((p: any) => p.id_edificio_modelo)
              .filter(Boolean)
          )] as number[];
 
          // Get edificios_modelos with their relationships
          let edificioModelosMap: Record<number, any> = {};
          if (edificioModeloIds.length > 0) {
            const { data: edificioModelosData } = await supabase
              .from('edificios_modelos')
              .select('id, id_edificio, id_modelo')
              .in('id', edificioModeloIds);
 
            // Get edificio ids and modelo ids
            const edificioIds = [...new Set((edificioModelosData || []).map((em: any) => em.id_edificio).filter(Boolean))] as number[];
            const modeloIds = [...new Set((edificioModelosData || []).map((em: any) => em.id_modelo).filter(Boolean))] as number[];
 
            // Fetch edificios with proyectos
            let edificiosMap: Record<number, any> = {};
            if (edificioIds.length > 0) {
              const { data: edificiosData } = await supabase
                .from('edificios')
                .select('id, nombre, id_proyecto')
                .in('id', edificioIds);
 
              const proyectoIds = [...new Set((edificiosData || []).map((e: any) => e.id_proyecto).filter(Boolean))] as number[];
              
              let proyectosMap: Record<number, string> = {};
              if (proyectoIds.length > 0) {
                const { data: proyectosData } = await supabase
                  .from('proyectos')
                  .select('id, nombre')
                  .in('id', proyectoIds);
                proyectosMap = (proyectosData || []).reduce((acc: any, p: any) => {
                  acc[p.id] = p.nombre;
                  return acc;
                }, {});
              }
 
              edificiosMap = (edificiosData || []).reduce((acc: any, e: any) => {
                acc[e.id] = {
                  nombre: e.nombre,
                  proyecto_nombre: proyectosMap[e.id_proyecto] || '-',
                };
                return acc;
              }, {});
            }
 
            // Fetch modelos
            let modelosMap: Record<number, string> = {};
            if (modeloIds.length > 0) {
              const { data: modelosData } = await supabase
                .from('modelos')
                .select('id, nombre')
                .in('id', modeloIds);
              modelosMap = (modelosData || []).reduce((acc: any, m: any) => {
                acc[m.id] = m.nombre;
                return acc;
              }, {});
            }
 
            // Build edificioModelosMap
            edificioModelosMap = (edificioModelosData || []).reduce((acc: any, em: any) => {
              const edificio = edificiosMap[em.id_edificio] || {};
              acc[em.id] = {
                edificio_nombre: edificio.nombre || '-',
                proyecto_nombre: edificio.proyecto_nombre || '-',
                modelo_nombre: modelosMap[em.id_modelo] || '-',
              };
              return acc;
            }, {});
          }
 
          // Build propiedadesMap
          propiedadesMap = (propiedadesData || []).reduce((acc: any, p: any) => {
            const emInfo = edificioModelosMap[p.id_edificio_modelo] || {};
            acc[p.id] = {
              numero_propiedad: p.numero_propiedad,
              modelo_nombre: emInfo.modelo_nombre || '-',
              edificio_nombre: emInfo.edificio_nombre || '-',
              proyecto_nombre: emInfo.proyecto_nombre || '-',
            };
            return acc;
          }, {});
       }
 
       // Get product info for product-based ofertas
       const productoIds = ofertasData
         .filter((o: any) => o.id_producto)
         .map((o: any) => o.id_producto);
 
       let productosMap: Record<number, any> = {};
       if (productoIds.length > 0) {
         const { data: productosData } = await supabase
           .from('productos_servicios')
           .select('id, nombre')
           .in('id', productoIds);
 
         productosMap = (productosData || []).reduce((acc: any, p: any) => {
           acc[p.id] = { nombre: p.nombre };
           return acc;
         }, {});
       }
 
       // Get specific bodega/estacionamiento names for product-based sales
       // We need to find the bodega linked to the property AND the product
       const propiedadProductoLinks = ofertasData
         .filter((o: any) => o.id_producto && o.id_propiedad)
         .map((o: any) => ({ id_propiedad: o.id_propiedad, id_producto: o.id_producto, oferta_id: o.id }));
 
       let bodegasNombresMap: Record<string, string> = {};
       let estacionamientosNombresMap: Record<string, string> = {};
 
       if (propiedadProductoLinks.length > 0) {
         // Get bodegas linked to these properties/products
         const propiedadIdsForProducts = [...new Set(propiedadProductoLinks.map((l: any) => l.id_propiedad))] as number[];
         const productoIdsForLinks = [...new Set(propiedadProductoLinks.map((l: any) => l.id_producto))] as number[];
 
         const { data: bodegasData } = await supabase
           .from('bodegas')
           .select('id, nombre, id_propiedad, id_producto')
           .in('id_propiedad', propiedadIdsForProducts)
           .in('id_producto', productoIdsForLinks)
           .eq('activo', true);
 
         // Map: "propiedadId-productoId" -> bodega nombre
         (bodegasData || []).forEach((b: any) => {
           const key = `${b.id_propiedad}-${b.id_producto}`;
           bodegasNombresMap[key] = b.nombre;
         });
 
         // Get estacionamientos linked to these properties/products
         const { data: estacionamientosData } = await supabase
           .from('estacionamientos')
           .select('id, nombre, id_propiedad, id_producto')
           .in('id_propiedad', propiedadIdsForProducts)
           .in('id_producto', productoIdsForLinks)
           .eq('activo', true);
 
         (estacionamientosData || []).forEach((e: any) => {
           const key = `${e.id_propiedad}-${e.id_producto}`;
           estacionamientosNombresMap[key] = e.nombre;
         });
       }
 
        // Get existing invoices (documento tipo 46) for these cuentas
        const cuentaIds = cuentasData.map((c: any) => c.id);
        const { data: documentosData } = await supabase
          .from('documentos')
          .select('id, id_cuenta_cobranza, url')
          .in('id_cuenta_cobranza', cuentaIds)
          .eq('id_tipo_documento', 46)
          .eq('activo', true);

        const facturasMap = (documentosData || []).reduce((acc: any, d: any) => {
          acc[d.id_cuenta_cobranza] = d.url;
          return acc;
        }, {});

        // Get the inmobiliaria's email to find their commission in comisionistas table
        const { data: inmobiliariaData } = await supabase
          .from('personas')
          .select('email')
          .eq('id', selectedInmobiliariaId)
          .single();
        
        const inmobiliariaEmail = inmobiliariaData?.email?.toLowerCase();

        // Get comisionistas for these cuentas where the commissionist is the inmobiliaria
        let comisionistasMap: Record<number, { porcentaje: number; monto: number }> = {};
        if (inmobiliariaEmail) {
          const { data: comisionistasData } = await (supabase as any)
            .from('comisionistas')
            .select('id_cuenta_cobranza, porcentaje_comision')
            .in('id_cuenta_cobranza', cuentaIds)
            .eq('email_usuario', inmobiliariaEmail)
            .eq('activo', true);

          comisionistasMap = (comisionistasData || []).reduce((acc: any, c: any) => {
            // Get precio_final from cuenta to calculate monto
            const cuenta = cuentasData.find((cc: any) => cc.id === c.id_cuenta_cobranza);
            const precioFinal = cuenta?.precio_final || 0;
            const porcentaje = Number(c.porcentaje_comision) || 0;
            acc[c.id_cuenta_cobranza] = {
              porcentaje: porcentaje,
              monto: precioFinal * (porcentaje / 100),
            };
            return acc;
          }, {});
        }

        // Get agent names from usuarios table for email_creador
        const creadorEmails = [...new Set(ofertasData.map((o: any) => o.email_creador).filter(Boolean))];
        let usuariosNombresMap: Record<string, string> = {};
        if (creadorEmails.length > 0) {
          const { data: usuariosData } = await supabase
            .from('usuarios')
            .select('email, nombre')
            .in('email', creadorEmails);
          
          usuariosNombresMap = (usuariosData || []).reduce((acc: any, u: any) => {
            acc[u.email?.toLowerCase()] = u.nombre;
            return acc;
          }, {});
        }

        // Build ofertas map
        const ofertasMap = ofertasData.reduce((acc: any, o: any) => {
          acc[o.id] = o;
          return acc;
        }, {});

        return cuentasData.map((cuenta: any) => {
          const oferta = ofertasMap[cuenta.id_oferta];
          const propInfo = oferta?.id_propiedad ? propiedadesMap[oferta.id_propiedad] : null;
          const prodInfo = oferta?.id_producto ? productosMap[oferta.id_producto] : null;

          // For product sales linked to a property, get the specific bodega/estacionamiento name
          let specificProductName = null;
          if (oferta?.id_producto && oferta?.id_propiedad) {
            const key = `${oferta.id_propiedad}-${oferta.id_producto}`;
            specificProductName = bodegasNombresMap[key] || estacionamientosNombresMap[key] || null;
          }

          const precioFinal = cuenta.precio_final || 0;
          // Use the commission from comisionistas table for this inmobiliaria
          const comisionistaInfo = comisionistasMap[cuenta.id];
          const porcentaje = comisionistaInfo?.porcentaje || 0;
          const montoComision = comisionistaInfo?.monto || 0;

          // Get agent vendedor name from usuarios table
          const emailCreador = oferta?.email_creador?.toLowerCase();
          const agenteVendedorNombre = usuariosNombresMap[emailCreador] || oferta?.email_creador || '-';

         return {
            id: cuenta.id,
            cuenta_cobranza_id: cuenta.id,
            proyecto_nombre: propInfo?.proyecto_nombre || '-',
            edificio_nombre: propInfo?.edificio_nombre || '-',
            modelo_nombre: propInfo?.modelo_nombre || '-',
            numero_propiedad: propInfo?.numero_propiedad || '-',
            producto_nombre: specificProductName || prodInfo?.nombre || '-',
            precio_final: precioFinal,
            porcentaje_comision: porcentaje,
            monto_comision: montoComision,
            iva_incluido: cuenta.iva_incluido || false,
            agente_vendedor_nombre: agenteVendedorNombre,
            agente_vendedor_email: oferta?.email_creador || '-',
            tiene_factura: !!facturasMap[cuenta.id],
            factura_url: facturasMap[cuenta.id] || null,
          } as Venta;
        });
      },
      enabled: agentEmails.length > 0 && !!selectedInmobiliariaId,
    });
 
    const filteredVentas = useMemo(() => {
     if (!searchTerm) return ventas;
     const term = searchTerm.toLowerCase();
     return ventas.filter((v: Venta) =>
       v.proyecto_nombre?.toLowerCase().includes(term) ||
       v.edificio_nombre?.toLowerCase().includes(term) ||
       v.modelo_nombre?.toLowerCase().includes(term) ||
       v.numero_propiedad?.toLowerCase().includes(term) ||
       v.producto_nombre?.toLowerCase().includes(term) ||
       v.agente_vendedor_nombre?.toLowerCase().includes(term) ||
       String(v.cuenta_cobranza_id).includes(term)
     );
    }, [ventas, searchTerm]);
 
   const totalPages = Math.ceil(filteredVentas.length / ITEMS_PER_PAGE);
   const paginatedVentas = filteredVentas.slice(
     (currentPage - 1) * ITEMS_PER_PAGE,
     currentPage * ITEMS_PER_PAGE
   );
 
   const formatCurrency = (value: number | null) => {
     if (value === null || value === undefined) return '-';
     return new Intl.NumberFormat('es-MX', {
       style: 'currency',
       currency: 'MXN',
       minimumFractionDigits: 2,
       maximumFractionDigits: 2,
     }).format(value);
   };
 
   const formatPercent = (value: number) => {
     return `${value.toFixed(2)}%`;
   };
 
    const handleExport = async () => {
     const exportData = filteredVentas.map((v: Venta) => ({
       'Cuenta': v.cuenta_cobranza_id,
       'Proyecto': v.proyecto_nombre,
       'Edificio': v.edificio_nombre,
       'Modelo': v.modelo_nombre,
       'Producto': v.producto_nombre,
       'No. Depto': v.numero_propiedad,
       'Agente Vendedor': v.agente_vendedor_nombre,
       'Precio Final': v.precio_final,
       'Comisión %': v.porcentaje_comision,
       'Comisión $': v.monto_comision,
       'IVA Incluido': v.iva_incluido ? 'Sí' : 'No',
       'Factura Subida': v.tiene_factura ? 'Sí' : 'No',
     }));

      await exportToExcel({ data: exportData, filename: 'Mis_Ventas_Comisiones' });
    };
 
   // Calculate totals
   const totals = useMemo(() => {
     return filteredVentas.reduce((acc, v) => ({
       precioFinal: acc.precioFinal + (v.precio_final || 0),
       comision: acc.comision + (v.monto_comision || 0),
     }), { precioFinal: 0, comision: 0 });
   }, [filteredVentas]);
 
   const handleUploadClick = (cuentaId: number) => {
     setUploadingForCuenta(cuentaId);
     fileInputRef.current?.click();
   };
 
   const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
     const file = event.target.files?.[0];
     if (!file || !uploadingForCuenta) {
       setUploadingForCuenta(null);
       return;
     }
 
     try {
       const fileExt = file.name.split('.').pop();
       const fileName = `factura_comision_${uploadingForCuenta}_${Date.now()}.${fileExt}`;
       const filePath = `facturas-comision/${fileName}`;
 
       // Upload file to storage
       const { error: uploadError } = await supabase.storage
         .from('documentos')
         .upload(filePath, file);
 
       if (uploadError) throw uploadError;
 
       // Get public URL
       const { data: urlData } = supabase.storage
         .from('documentos')
         .getPublicUrl(filePath);
 
       // Create document record
       const { error: docError } = await supabase
         .from('documentos')
         .insert({
           id_cuenta_cobranza: uploadingForCuenta,
           id_tipo_documento: 46, // Factura de comisión externa
           url: urlData.publicUrl,
           activo: true,
         });
 
       if (docError) throw docError;
 
       toast.success('Factura subida correctamente');
       queryClient.invalidateQueries({ queryKey: ['mis-ventas-agentes'] });
     } catch (error: any) {
       console.error('Error uploading invoice:', error);
       toast.error('Error al subir la factura: ' + (error.message || 'Error desconocido'));
     } finally {
       setUploadingForCuenta(null);
       if (fileInputRef.current) {
         fileInputRef.current.value = '';
       }
     }
   };
 
   const isLoading = loadingAgents || loadingVentas;
 
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
 
       <input
         type="file"
         ref={fileInputRef}
         onChange={handleFileChange}
         accept=".pdf,.xml"
         className="hidden"
       />
 
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
         <div>
           <h1 className="text-3xl font-bold tracking-tight">Mis Ventas</h1>
           <p className="text-muted-foreground">
             Ventas realizadas por agentes de tu inmobiliaria
           </p>
         </div>
         {canExport && (
           <Button
             variant="outline"
             onClick={handleExport}
             disabled={isExporting || filteredVentas.length === 0}
           >
             <FileSpreadsheet className="mr-2 h-4 w-4" />
             {isExporting ? 'Exportando...' : 'Exportar'}
           </Button>
         )}
       </div>
 
       {/* Summary Cards */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <Card>
           <CardContent className="pt-6">
             <div className="text-2xl font-bold">{filteredVentas.length}</div>
             <p className="text-sm text-muted-foreground">Total Ventas</p>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-6">
             <div className="text-2xl font-bold">{formatCurrency(totals.precioFinal)}</div>
             <p className="text-sm text-muted-foreground">Valor Total Ventas</p>
           </CardContent>
         </Card>
         <Card>
           <CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary">{formatCurrency(totals.comision)}</div>
             <p className="text-sm text-muted-foreground">Total Comisiones</p>
           </CardContent>
         </Card>
       </div>
 
       <Card>
         <CardHeader>
           <CardTitle>Ventas ({filteredVentas.length})</CardTitle>
         </CardHeader>
         <CardContent>
           <div className="flex items-center gap-4 mb-6">
             <div className="relative flex-1">
               <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
               <Input
                 placeholder="Buscar por cuenta, proyecto, agente..."
                 value={searchTerm}
                 onChange={(e) => {
                   setSearchTerm(e.target.value);
                   setCurrentPage(1);
                 }}
                 className="pl-10"
               />
             </div>
           </div>
 
           <div className="rounded-md border overflow-x-auto">
             <Table>
                <TableHeader>
                 <TableRow>
                     <TableHead>Cuenta</TableHead>
                     <TableHead>Proyecto</TableHead>
                     <TableHead>Edificio</TableHead>
                     <TableHead>Modelo</TableHead>
                     <TableHead>Producto</TableHead>
                     <TableHead>No. Depto</TableHead>
                     <TableHead>Agente Vendedor</TableHead>
                     <TableHead>Precio Final</TableHead>
                     <TableHead>Comisión</TableHead>
                     <TableHead>Acciones</TableHead>
                   </TableRow>
                </TableHeader>
               <TableBody>
                  {paginatedVentas.length === 0 ? (
                     <TableRow>
                       <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                         {selectedInmobiliariaId 
                           ? (isLoading ? 'Cargando ventas...' : 'No se encontraron ventas de agentes de esta inmobiliaria')
                           : 'Selecciona una inmobiliaria para ver sus ventas'
                         }
                       </TableCell>
                     </TableRow>
                 ) : (
                   paginatedVentas.map((v: Venta) => (
                       <TableRow key={v.id}>
                         <TableCell className="font-mono font-medium">{v.cuenta_cobranza_id}</TableCell>
                         <TableCell className="font-medium">{v.proyecto_nombre}</TableCell>
                         <TableCell>{v.edificio_nombre}</TableCell>
                         <TableCell>{v.modelo_nombre}</TableCell>
                         <TableCell>{v.producto_nombre}</TableCell>
                         <TableCell>{v.numero_propiedad}</TableCell>
                         <TableCell>
                           <div className="flex flex-col">
                             <span className="font-medium">{v.agente_vendedor_nombre}</span>
                             <span className="text-xs text-muted-foreground">{v.agente_vendedor_email}</span>
                           </div>
                         </TableCell>
                        <TableCell>{formatCurrency(v.precio_final)}</TableCell>
                       <TableCell>
                         <div className="flex flex-col gap-1">
                           <span className="font-medium">{formatCurrency(v.monto_comision)}</span>
                           <div className="flex items-center gap-1">
                             <span className="text-xs text-muted-foreground">{formatPercent(v.porcentaje_comision)}</span>
                             <Badge 
                               variant={v.iva_incluido ? "default" : "secondary"} 
                               className="text-[10px] px-1 py-0"
                             >
                               {v.iva_incluido ? '+IVA' : 'Sin IVA'}
                             </Badge>
                           </div>
                         </div>
                       </TableCell>
                       <TableCell>
                         {v.tiene_factura ? (
                           <Button
                             variant="ghost"
                             size="sm"
                             className="text-primary hover:text-primary/80"
                             onClick={() => v.factura_url && window.open(v.factura_url, '_blank')}
                           >
                             <Check className="h-4 w-4 mr-1" />
                             <FileText className="h-4 w-4" />
                           </Button>
                         ) : (
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => handleUploadClick(v.cuenta_cobranza_id)}
                             disabled={uploadingForCuenta === v.cuenta_cobranza_id}
                           >
                             {uploadingForCuenta === v.cuenta_cobranza_id ? (
                               <Loader2 className="h-4 w-4 animate-spin" />
                             ) : (
                               <>
                                 <Upload className="h-4 w-4 mr-1" />
                                 Factura
                               </>
                             )}
                           </Button>
                         )}
                       </TableCell>
                     </TableRow>
                   ))
                 )}
               </TableBody>
             </Table>
           </div>
 
           {totalPages > 1 && (
             <div className="flex items-center justify-between mt-4">
               <p className="text-sm text-muted-foreground">
                 Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredVentas.length)} de {filteredVentas.length}
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
     </div>
   );
 }
