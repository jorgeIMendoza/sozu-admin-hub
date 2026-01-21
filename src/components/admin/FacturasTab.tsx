import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { FileText, FileCheck, Eye, RefreshCw, FileEdit, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { N8N_WEBHOOK_BASE_URL, ENVIRONMENT } from '@/lib/config';
import { format } from 'date-fns';

interface FacturasTabProps {
  cuentaCobranzaId: number;
  compradores: Array<{ 
    id_persona: number; 
    nombre_legal: string;
    rfc?: string;
  }>;
  propiedadId?: number;
  apiKeyDraft?: string;
  onGenerateFinalInvoice?: (idPersona: number, idDocumento: number) => Promise<void>;
  duenoPuedeFacturar?: boolean; // Indica si la entidad dueña tiene habilitada la opción de facturar
  isReadOnly?: boolean; // Nueva prop para modo solo lectura
}

interface FacturaDocument {
  id: number;
  url: string;
  es_draft: boolean;
  numero: string | null;
  id_persona: number | null;
}

interface FacturaInfo {
  id_persona: number;
  nombre_legal: string;
  rfc?: string;
  facturas_pdf: FacturaDocument[];
  factura_pdf?: {
    id: number;
    url: string;
    es_draft: boolean;
    numero: string | null;
  } | null;
  factura_xml?: {
    id: number;
    url: string;
    es_draft: boolean;
    numero: string | null;
  } | null;
}

export function FacturasTab({ 
  cuentaCobranzaId, 
  compradores,
  propiedadId,
  apiKeyDraft,
  onGenerateFinalInvoice,
  duenoPuedeFacturar = false,
  isReadOnly = false
}: FacturasTabProps) {
  const [facturas, setFacturas] = useState<FacturaInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [viewerDialog, setViewerDialog] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: ''
  });
  const [generatingForPersona, setGeneratingForPersona] = useState<number | null>(null);
  const [confirmFinalDialog, setConfirmFinalDialog] = useState<{ isOpen: boolean; idPersona: number | null; idDocumento: number | null }>({
    isOpen: false,
    idPersona: null,
    idDocumento: null
  });
  const [validationData, setValidationData] = useState<{
    cuentaPagadaCompletamente: boolean;
    datosEscrituracionCompletos: boolean;
    datosFiscalesCompradores: Record<number, boolean>;
  } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load facturas para cada comprador
  const loadFacturas = async () => {
    setIsLoading(true);
    try {
      // Get all documents for this cuenta_cobranza
      const { data: documentos, error } = await supabase
        .from('documentos')
        .select('id, url, es_draft, numero, id_persona, id_tipo_documento, tipos_documento!documentos_id_tipo_documento_fkey(nombre)')
        .eq('id_cuenta_cobranza', cuentaCobranzaId)
        .eq('activo', true);

      if (error) throw error;

      // Get all PDF facturas
      const allFacturasPdf = documentos?.filter(
        doc => doc.tipos_documento?.nombre?.toLowerCase().includes('factura') &&
               doc.tipos_documento?.nombre?.toLowerCase().includes('pdf')
      ) || [];

      // Map compradores to their facturas
      const facturasInfo: FacturaInfo[] = compradores.map(comprador => {
        // Buscar todas las facturas PDF con id_persona que coincida
        let facturasPdfComprador = allFacturasPdf.filter(
          doc => doc.id_persona === comprador.id_persona
        );
        
        // Si no hay facturas con id_persona y solo hay 1 comprador, usar facturas sin asignar
        if (facturasPdfComprador.length === 0 && compradores.length === 1) {
          facturasPdfComprador = allFacturasPdf.filter(
            doc => doc.id_persona === null
          );
        }
        
        // La factura principal (la más reciente o la primera)
        const facturaPdf = facturasPdfComprador[0];
        
        let facturaXml = documentos?.find(
          doc => doc.id_persona === comprador.id_persona && 
                 doc.tipos_documento?.nombre?.toLowerCase().includes('factura') &&
                 doc.tipos_documento?.nombre?.toLowerCase().includes('xml')
        );
        
        // Si no hay factura XML con id_persona y solo hay 1 comprador, usar facturas sin asignar
        if (!facturaXml && compradores.length === 1) {
          facturaXml = documentos?.find(
            doc => doc.id_persona === null && 
                   doc.tipos_documento?.nombre?.toLowerCase().includes('factura') &&
                   doc.tipos_documento?.nombre?.toLowerCase().includes('xml')
          );
        }

        return {
          id_persona: comprador.id_persona,
          nombre_legal: comprador.nombre_legal,
          rfc: comprador.rfc,
          facturas_pdf: facturasPdfComprador.map(doc => ({
            id: doc.id,
            url: doc.url,
            es_draft: doc.es_draft,
            numero: doc.numero,
            id_persona: doc.id_persona
          })),
          factura_pdf: facturaPdf ? {
            id: facturaPdf.id,
            url: facturaPdf.url,
            es_draft: facturaPdf.es_draft,
            numero: facturaPdf.numero
          } : null,
          factura_xml: facturaXml ? {
            id: facturaXml.id,
            url: facturaXml.url,
            es_draft: facturaXml.es_draft,
            numero: facturaXml.numero
          } : null
        };
      });

      setFacturas(facturasInfo);
    } catch (error) {
      console.error('Error loading facturas:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error al cargar las facturas"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Función para validar datos fiscales de un comprador
  const validateDatosFiscalesComprador = async (idPersona: number): Promise<boolean> => {
    try {
      const { data: persona, error } = await supabase
        .from('personas')
        .select('rfc, regimen, uso_cfdi, direccion_fiscal_calle, direccion_fiscal_num_ext, direccion_fiscal_colonia, direccion_fiscal_codigo_postal, direccion_fiscal_id_pais, direccion_fiscal_id_estado, direccion_fiscal_id_municipio')
        .eq('id', idPersona)
        .single();

      if (error || !persona) return false;

      // Verificar que todos los campos fiscales estén completos
      return !!(
        persona.rfc &&
        persona.regimen &&
        persona.uso_cfdi &&
        persona.direccion_fiscal_calle &&
        persona.direccion_fiscal_num_ext &&
        persona.direccion_fiscal_colonia &&
        persona.direccion_fiscal_codigo_postal &&
        persona.direccion_fiscal_id_pais &&
        persona.direccion_fiscal_id_estado &&
        persona.direccion_fiscal_id_municipio
      );
    } catch (error) {
      console.error('Error validando datos fiscales:', error);
      return false;
    }
  };

  // Función para validar si la cuenta está pagada completamente
  const validateCuentaPagada = async (): Promise<boolean> => {
    try {
      const { data: cuenta, error: cuentaError } = await supabase
        .from('cuentas_cobranza')
        .select('precio_final')
        .eq('id', cuentaCobranzaId)
        .single();

      if (cuentaError || !cuenta) return false;

      const { data: pagos, error: pagosError } = await supabase
        .from('pagos')
        .select('monto')
        .eq('id_cuenta_cobranza', cuentaCobranzaId)
        .eq('activo', true);

      if (pagosError) return false;

      const totalPagado = pagos?.reduce((sum, pago) => sum + Number(pago.monto || 0), 0) || 0;
      
      return totalPagado >= Number(cuenta.precio_final);
    } catch (error) {
      console.error('Error validando pagos:', error);
      return false;
    }
  };

  // Función para validar datos de escrituración
  const validateDatosEscrituracion = async (): Promise<boolean> => {
    try {
      const { data: cuenta, error } = await supabase
        .from('cuentas_cobranza')
        .select('numero_escritura, fecha_escritura, libro, hoja, clave_catastral, numero_unidad_privativa, id_notario')
        .eq('id', cuentaCobranzaId)
        .single();

      if (error || !cuenta) return false;

      // Verificar que todos los campos de escrituración estén completos
      return !!(
        cuenta.numero_escritura &&
        cuenta.fecha_escritura &&
        cuenta.libro &&
        cuenta.hoja &&
        cuenta.clave_catastral &&
        cuenta.numero_unidad_privativa &&
        cuenta.id_notario
      );
    } catch (error) {
      console.error('Error validando datos de escrituración:', error);
      return false;
    }
  };

  // Función para cargar todas las validaciones
  const loadValidations = async () => {
    const cuentaPagada = await validateCuentaPagada();
    const datosEscrituracion = await validateDatosEscrituracion();
    
    const datosFiscales: Record<number, boolean> = {};
    for (const comprador of compradores) {
      datosFiscales[comprador.id_persona] = await validateDatosFiscalesComprador(comprador.id_persona);
    }

    setValidationData({
      cuentaPagadaCompletamente: cuentaPagada,
      datosEscrituracionCompletos: datosEscrituracion,
      datosFiscalesCompradores: datosFiscales
    });
  };

  useEffect(() => {
    loadFacturas();
    loadValidations();
  }, [cuentaCobranzaId, compradores]);

  // Helper function to build complete payload
  const buildInvoicePayload = async (idPersona: number, idDocumento: number | null, apiKey: string, esDraft: boolean = true) => {
    if (!propiedadId) {
      throw new Error('No se encontró el ID de la propiedad');
    }

    // 1. Obtener datos completos del comprador y su porcentaje de copropiedad
    const { data: compradorData, error: compradorError } = await supabase
      .from('personas')
      .select('*')
      .eq('id', idPersona)
      .single();

    // Obtener porcentaje de copropiedad del comprador
    const { data: compradorCuentaData } = await supabase
      .from('compradores')
      .select('porcentaje_copropiedad')
      .eq('id_persona', idPersona)
      .eq('id_cuenta_cobranza', cuentaCobranzaId)
      .single();

    // Obtener datos de pais, estado y municipio fiscal por separado
    let paisFiscal = null;
    let estadoFiscal = null;
    let municipioFiscal = null;

    if (compradorData?.direccion_fiscal_id_pais) {
      const { data } = await supabase
        .from('paises')
        .select('nombre')
        .eq('id', compradorData.direccion_fiscal_id_pais)
        .single();
      paisFiscal = data;
    }

    if (compradorData?.direccion_fiscal_id_estado) {
      const { data } = await supabase
        .from('estados_mx')
        .select('nombre')
        .eq('id', compradorData.direccion_fiscal_id_estado)
        .single();
      estadoFiscal = data;
    }

    if (compradorData?.direccion_fiscal_id_municipio) {
      const { data } = await supabase
        .from('municipios_mx')
        .select('nombre')
        .eq('id', compradorData.direccion_fiscal_id_municipio)
        .single();
      municipioFiscal = data;
    }

    if (compradorError || !compradorData) {
      throw new Error('No se encontraron los datos del comprador');
    }

    // 2. Obtener datos de la propiedad
    const { data: propiedadData, error: propError } = await supabase
      .from('propiedades')
      .select('*')
      .eq('id', propiedadId)
      .single();

    if (propError || !propiedadData) {
      throw new Error('No se encontraron los datos de la propiedad');
    }

    // Obtener el id_proyecto desde entidades_relacionadas
    let idProyecto = null;
    if (propiedadData.id_entidad_relacionada_dueno) {
      const { data: entidadData } = await supabase
        .from('entidades_relacionadas')
        .select('id_proyecto')
        .eq('id', propiedadData.id_entidad_relacionada_dueno)
        .single();
      
      idProyecto = entidadData?.id_proyecto;
    }

    // Obtener datos del proyecto
    let direccionProyecto = '';
    
    if (idProyecto) {
      const { data: proyecto } = await supabase
        .from('proyectos')
        .select('direccion')
        .eq('id', idProyecto)
        .single();
      
      if (proyecto) {
        direccionProyecto = proyecto.direccion || '';
      }
    }

    // 3. Obtener estacionamientos
    const { data: estacionamientosData } = await supabase
      .from('estacionamientos')
      .select(`
        *,
        tipos_estacionamiento!estacionamientos_id_tipo_fkey(nombre)
      `)
      .eq('id_propiedad', propiedadId)
      .eq('activo', true);

    // 4. Obtener bodegas
    const { data: bodegasData } = await supabase
      .from('bodegas')
      .select('*')
      .eq('id_propiedad', propiedadId)
      .eq('activo', true);

    // 5. Obtener datos de escrituración
    const { data: cuentaData, error: cuentaError } = await supabase
      .from('cuentas_cobranza')
      .select('*')
      .eq('id', cuentaCobranzaId)
      .single();

    if (cuentaError || !cuentaData) {
      throw new Error('No se encontraron los datos de la cuenta');
    }

    // 6. Obtener datos del notario si existe
    let notarioData = null;
    if (cuentaData.id_notario) {
      const { data: notario } = await supabase
        .from('notarios')
        .select('nombre, notaria, direccion, email, telefono')
        .eq('id', cuentaData.id_notario)
        .single();
      
      if (notario) {
        notarioData = {
          nombre: notario.nombre?.trim() || '',
          notaria: notario.notaria?.trim() || '',
          direccion: notario.direccion?.trim() || '',
          email: notario.email?.trim() || '',
          telefono: notario.telefono?.trim() || ''
        };
      }
    }

    // Construir payload
    return {
      api_key: apiKey,
      environment: ENVIRONMENT,
      tipo_factura: "propiedad",
      id_propiedad: propiedadId,
      id_cuenta_cobranza: cuentaCobranzaId,
      ...(idDocumento && { id_documento: idDocumento }),
      es_draft: esDraft,
      id_estatus_verificacion: esDraft ? 1 : 2, // 1=Pendiente, 2=Validado
      propiedad: {
        numero_propiedad: propiedadData.numero_propiedad,
        metraje_escriturable: ((propiedadData.m2_interiores || 0) + (propiedadData.m2_exteriores || 0)),
        direccion: direccionProyecto,
        precio_final: cuentaData.precio_final,
        piso: propiedadData.numero_piso
      },
      estacionamientos: (estacionamientosData || []).map(e => ({
        nombre: e.nombre,
        tipo: e.tipos_estacionamiento?.nombre || '',
        m2: e.m2,
        ubicacion: e.ubicacion || '',
        es_incluido: e.es_incluido
      })),
      bodegas: (bodegasData || []).map(b => ({
        nombre: b.nombre,
        m2: b.m2,
        ubicacion: b.ubicacion || '',
        es_incluido: b.es_incluido
      })),
      escrituracion: {
        numero_escritura: cuentaData.numero_escritura || '',
        fecha_escritura: cuentaData.fecha_escritura ? format(new Date(cuentaData.fecha_escritura), 'yyyy-MM-dd') : '',
        libro: cuentaData.libro || '',
        hoja: cuentaData.hoja || '',
        clave_catastral: cuentaData.clave_catastral || '',
        numero_unidad_privativa: cuentaData.numero_unidad_privativa || '',
        notario: notarioData
      },
      compradores: [
        {
          id_persona: compradorData.id,
          nombre_completo: compradorData.nombre_legal,
          porcentaje_propiedad: compradorCuentaData?.porcentaje_copropiedad || 0,
          email: compradorData.email,
          telefono: compradorData.telefono || '',
          rfc: compradorData.rfc || '',
          curp: compradorData.curp || '',
          regimen: compradorData.regimen || '',
          uso_cfdi: compradorData.uso_cfdi || '',
          direccion_fiscal: {
            calle: compradorData.direccion_fiscal_calle || '',
            numero_exterior: compradorData.direccion_fiscal_num_ext || '',
            numero_interior: compradorData.direccion_fiscal_num_int || '',
            colonia: compradorData.direccion_fiscal_colonia || '',
            codigo_postal: compradorData.direccion_fiscal_codigo_postal || '',
            municipio: municipioFiscal?.nombre || '',
            estado: estadoFiscal?.nombre || '',
            pais: paisFiscal?.nombre || ''
          }
        }
      ]
    };
  };

  // Mutation para generar/regenerar factura draft
  const regenerarFacturaMutation = useMutation({
    mutationFn: async ({ idPersona, idDocumento }: { idPersona: number; idDocumento: number | null }) => {
      if (!apiKeyDraft) {
        throw new Error('No hay API key configurada para generar facturas');
      }

      // Construir payload completo (draft)
      const payload = await buildInvoicePayload(idPersona, idDocumento, apiKeyDraft, true);

      const webhookUrl = `${N8N_WEBHOOK_BASE_URL}/generaFactura`;
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error al regenerar la factura');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Éxito",
        description: "Factura generada correctamente"
      });
      loadFacturas();
    },
    onError: (error: Error) => {
      console.error('Error regenerando factura:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Error al regenerar la factura"
      });
    },
    onSettled: () => {
      setGeneratingForPersona(null);
    }
  });

  // Mutation para generar factura definitiva
  const generarFacturaFinalMutation = useMutation({
    mutationFn: async ({ idPersona, idDocumento }: { idPersona: number; idDocumento: number }) => {
      if (!propiedadId) {
        throw new Error('No se encontró el ID de la propiedad');
      }

      // Obtener la API key de la entidad dueña (nombre_api_key, NO draft)
      const { data: propiedadData, error: propError } = await supabase
        .from('propiedades')
        .select('id_entidad_relacionada_dueno')
        .eq('id', propiedadId)
        .single();

      if (propError || !propiedadData) {
        throw new Error('No se encontró la propiedad');
      }

      const { data: entidadData, error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .select('nombre_api_key')
        .eq('id', propiedadData.id_entidad_relacionada_dueno)
        .single();

      if (entidadError || !entidadData?.nombre_api_key) {
        throw new Error('No se encontró la API key del dueño');
      }

      // Construir payload completo (definitiva con es_draft=false y es_verificado=true)
      const payload = await buildInvoicePayload(idPersona, idDocumento, entidadData.nombre_api_key, false);

      const webhookUrl = `${N8N_WEBHOOK_BASE_URL}/generaFactura`;
      
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Error al generar la factura definitiva');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Éxito",
        description: "Factura definitiva generada correctamente"
      });
      loadFacturas();
      setConfirmFinalDialog({ isOpen: false, idPersona: null, idDocumento: null });
    },
    onError: (error: Error) => {
      console.error('Error generando factura final:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Error al generar la factura definitiva"
      });
      setConfirmFinalDialog({ isOpen: false, idPersona: null, idDocumento: null });
    },
    onSettled: () => {
      setGeneratingForPersona(null);
    }
  });

  const handleRegenerarDraft = (idPersona: number, idDocumento: number | null) => {
    setGeneratingForPersona(idPersona);
    regenerarFacturaMutation.mutate({ idPersona, idDocumento });
  };

  const handleGenerarFinal = () => {
    if (confirmFinalDialog.idPersona && confirmFinalDialog.idDocumento) {
      setGeneratingForPersona(confirmFinalDialog.idPersona);
      generarFacturaFinalMutation.mutate({ 
        idPersona: confirmFinalDialog.idPersona, 
        idDocumento: confirmFinalDialog.idDocumento 
      });
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Cargando facturas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Facturas por Comprador
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
              <TableHead>Comprador</TableHead>
              <TableHead>RFC</TableHead>
              <TableHead>ID de factura</TableHead>
              <TableHead>Factura PDF</TableHead>
              <TableHead>Estado de la factura</TableHead>
              {duenoPuedeFacturar && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {facturas
                  .filter(factura => {
                    // Si el dueño no puede facturar, solo mostrar compradores con facturas subidas
                    if (!duenoPuedeFacturar) {
                      return factura.facturas_pdf.length > 0 || factura.factura_xml;
                    }
                    return true;
                  })
                  .flatMap((factura) => {
                    // Si tiene múltiples facturas, mostrar una fila por cada una
                    if (factura.facturas_pdf.length > 1) {
                      return factura.facturas_pdf.map((pdf, index) => ({
                        ...factura,
                        factura_pdf: pdf,
                        rowKey: `${factura.id_persona}-${pdf.id}`,
                        isFirstRow: index === 0,
                        totalFacturas: factura.facturas_pdf.length
                      }));
                    }
                    // Si tiene 0 o 1 factura, mostrar una fila normal
                    return [{
                      ...factura,
                      rowKey: `${factura.id_persona}`,
                      isFirstRow: true,
                      totalFacturas: factura.facturas_pdf.length
                    }];
                  })
                  .map((factura) => {
                  const tienePdf = !!factura.factura_pdf;
                  const isDraft = factura.factura_pdf?.es_draft;
                  
                  return (
                    <TableRow key={factura.rowKey}>
                      <TableCell className="font-medium">
                        {factura.isFirstRow ? (
                          <>
                            {factura.nombre_legal}
                            {factura.totalFacturas > 1 && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({factura.totalFacturas} facturas)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground text-sm italic">↳ {factura.nombre_legal}</span>
                        )}
                      </TableCell>
                      <TableCell>{factura.isFirstRow ? (factura.rfc || '-') : ''}</TableCell>
                      <TableCell>
                        {tienePdf && factura.factura_pdf?.numero ? (
                          factura.factura_pdf.numero
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tienePdf ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setViewerDialog({
                                isOpen: true,
                                url: factura.factura_pdf!.url,
                                title: `Factura PDF - ${factura.nombre_legal}${factura.factura_pdf?.numero ? ` (${factura.factura_pdf.numero})` : ''}`
                              });
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tienePdf ? (
                          <Badge variant={isDraft ? "secondary" : "default"}>
                            {isDraft ? "Draft" : "Timbrada"}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Sin factura</Badge>
                        )}
                      </TableCell>
                      {duenoPuedeFacturar && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Botón para generar primera factura draft */}
                            {!tienePdf && (() => {
                              const datosFiscalesCompletos = validationData?.datosFiscalesCompradores[factura.id_persona] ?? false;
                              const cuentaPagada = validationData?.cuentaPagadaCompletamente ?? false;
                              const escrituracionCompleta = validationData?.datosEscrituracionCompletos ?? false;
                              
                              const isDisabled = generatingForPersona === factura.id_persona || 
                                                !datosFiscalesCompletos || 
                                                !cuentaPagada || 
                                                !escrituracionCompleta;

                              const getTooltipMessage = () => {
                                if (generatingForPersona === factura.id_persona) return "Generando...";
                                const issues = [];
                                if (!datosFiscalesCompletos) issues.push("datos fiscales incompletos");
                                if (!cuentaPagada) issues.push("cuenta sin pagar completamente");
                                if (!escrituracionCompleta) issues.push("datos de escrituración incompletos");
                                
                                if (issues.length === 0) return "Generar draft de factura";
                                return `No se puede generar: ${issues.join(", ")}`;
                              };

                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleRegenerarDraft(factura.id_persona, null)}
                                          disabled={isDisabled || isReadOnly}
                                        >
                                          {generatingForPersona === factura.id_persona ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <FileEdit className="h-4 w-4" />
                                          )}
                                        </Button>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>{getTooltipMessage()}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                            
                            {/* Botón para regenerar draft */}
                            {tienePdf && isDraft && factura.factura_pdf && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleRegenerarDraft(factura.id_persona, factura.factura_pdf!.id)}
                                      disabled={generatingForPersona === factura.id_persona || isReadOnly}
                                    >
                                      {generatingForPersona === factura.id_persona ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <RefreshCw className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Regenerar draft de factura</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            
                            {/* Botón para generar factura definitiva */}
                            {tienePdf && isDraft && factura.factura_pdf && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => setConfirmFinalDialog({ 
                                        isOpen: true, 
                                        idPersona: factura.id_persona, 
                                        idDocumento: factura.factura_pdf!.id 
                                      })}
                                      disabled={generatingForPersona === factura.id_persona || isReadOnly}
                                    >
                                      {generatingForPersona === factura.id_persona ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <FileCheck className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Timbrar factura (acción definitiva)</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Document Viewer Dialog */}
      <Dialog open={viewerDialog.isOpen} onOpenChange={(open) => setViewerDialog({ ...viewerDialog, isOpen: open })}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-3 border-b shrink-0">
            <DialogTitle>{viewerDialog.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <iframe
              src={`${viewerDialog.url}#page=1&view=FitH`}
              className="w-full h-full border-0"
              title={viewerDialog.title}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog for Final Invoice */}
      <AlertDialog open={confirmFinalDialog.isOpen} onOpenChange={(open) => !open && setConfirmFinalDialog({ isOpen: false, idPersona: null, idDocumento: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Generar Factura Definitiva?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es <strong>irrevocable</strong>. Se generará la factura definitiva y no podrá modificarse posteriormente. 
              ¿Está seguro de continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerarFinal}>
              Generar Factura Definitiva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
