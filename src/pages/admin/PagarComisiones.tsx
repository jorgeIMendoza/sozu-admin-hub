import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import ComisionesPorPagarTab from "@/components/admin/ComisionesPorPagarTab";
import ComisionesPagadasTab from "@/components/admin/ComisionesPagadasTab";
import { useActivityLogger } from "@/hooks/useActivityLogger";

// ID del rol "Agente Inmobiliario"
const AGENTE_INMOBILIARIO_ROL_ID = 3;

// Helper para obtener el tipo de documento de factura de comisión externa
async function getTipoDocumentoFactura() {
  const { data, error } = await supabase
    .from('tipos_documento')
    .select('id')
    .eq('nombre', 'Factura de comisión externa')
    .eq('activo', true)
    .single();
  
  if (error) return null;
  return data?.id;
}

// Helper para obtener todos los registros de comisionistas sin límite de 1000
async function fetchAllComisionistas() {
  const batchSize = 1000;
  let allData: any[] = [];
  let from = 0;
  let hasMore = true;

  // Obtener emails de agentes externos (agentes inmobiliarios e inmobiliarias)
  const { data: agentesInmobiliarios } = await supabase
    .from('usuarios')
    .select('email')
    .eq('rol_id', AGENTE_INMOBILIARIO_ROL_ID)
    .eq('activo', true);

  const emailsAgentesInmobiliarios = new Set(agentesInmobiliarios?.map(a => a.email) || []);

  const { data: inmobiliarias } = await supabase
    .from('personas')
    .select('email')
    .eq('tipo_persona', 'pm')
    .eq('activo', true)
    .not('email', 'is', null);

  const emailsInmobiliarias = new Set(inmobiliarias?.map(i => i.email).filter(Boolean) || []);

  // Obtener facturas de comisiones externas (con URL)
  const tipoDocFactura = await getTipoDocumentoFactura();
  const facturasExternasMap = new Map<string, string | boolean>();

  if (tipoDocFactura) {
    const { data: facturas } = await supabase
      .from('documentos')
      .select('id_cuenta_cobranza, numero, url')
      .eq('id_tipo_documento', tipoDocFactura)
      .eq('activo', true);
    
    facturas?.forEach(f => {
      if (f.numero && f.id_cuenta_cobranza) {
        const key = `${f.numero}_${f.id_cuenta_cobranza}`;
        facturasExternasMap.set(key, f.url || true);
      }
    });
  }

  // Obtener facturas de comisión Sozu (tipo 47)
  const facturasComisionSozuMap = new Map<number, { id: number; es_draft: boolean; url: string | null }>();
  const { data: facturasSozu } = await supabase
    .from('documentos')
    .select('id, id_cuenta_cobranza, es_draft, url')
    .eq('id_tipo_documento', 47)
    .eq('activo', true);

  facturasSozu?.forEach(f => {
    if (f.id_cuenta_cobranza) {
      facturasComisionSozuMap.set(f.id_cuenta_cobranza, {
        id: f.id,
        es_draft: f.es_draft ?? true,
        url: f.url,
      });
    }
  });

  while (hasMore) {
    const { data, error } = await supabase
      .from("comisionistas")
      .select(`
        email_usuario,
        porcentaje_comision,
        pagada,
        url_evidencia_pago,
        aprobada,
        id_cuenta_cobranza,
        cuentas_cobranza!comisionistas_id_cuenta_cobranza_fkey(
          id,
          precio_final,
          url_factura_comision,
          acuerdos_pago!fk_acpago_cuenta(
            id_concepto,
            pago_completado,
            conceptos_pago!fk_acpago_concepto(nombre),
            aplicaciones_pago(
              activo,
              pagos!fk_aplicaciones_pago_pago(fecha_pago)
            )
          ),
          ofertas!fk_cuentas_cobranza_oferta!inner(
            id_propiedad,
            id_producto,
            propiedades!fk_ofertas_propiedad(
              numero_propiedad,
              edificios_modelos!propiedades_id_edificio_modelo_fkey(
                edificios!edificios_modelos_id_edificio_fkey(
                  nombre,
                  proyectos!edificios_id_proyecto_fkey(nombre)
                ),
                modelos!edificios_modelos_id_modelo_fkey(nombre)
              )
            ),
            productos_servicios!ofertas_id_producto_fkey(
              id,
              categorias_producto!productos_servicios_id_categoria_fkey(nombre)
            )
          )
        )
      `)
      .eq("activo", true)
      .eq("aprobada", true)
      .range(from, from + batchSize - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      // Filtrar agentes externos: solo incluir si tienen factura cargada
      // También agregar info de si es externo y URL de factura
      const processedData = data.map((com: any) => {
        const esAgenteExterno = emailsAgentesInmobiliarios.has(com.email_usuario) || 
                                emailsInmobiliarias.has(com.email_usuario);
        const facturaKey = `${com.email_usuario}_${com.id_cuenta_cobranza}`;
        const facturaUrl = facturasExternasMap.get(facturaKey);
        const facturaComisionSozu = facturasComisionSozuMap.get(com.id_cuenta_cobranza) || null;
        
        return {
          ...com,
          esExterno: esAgenteExterno,
          urlFacturaExterna: typeof facturaUrl === 'string' ? facturaUrl : null,
          facturaComisionSozu,
        };
      }).filter((com: any) => {
        if (com.esExterno) {
          // Solo incluir externos si tienen factura cargada
          const facturaKey = `${com.email_usuario}_${com.id_cuenta_cobranza}`;
          return facturasExternasMap.has(facturaKey);
        }
        // Para internos: verificar que TODOS los externos de esa cuenta ya tengan factura
        // Si hay algún externo sin factura en la misma cuenta, no mostrar la cuenta
        const externosDeEstaCuenta = data.filter((other: any) => {
          const otherEsExterno = emailsAgentesInmobiliarios.has(other.email_usuario) || 
                                  emailsInmobiliarias.has(other.email_usuario);
          return otherEsExterno && other.id_cuenta_cobranza === com.id_cuenta_cobranza;
        });
        // Si hay externos en esta cuenta, verificar que todos tengan factura
        if (externosDeEstaCuenta.length > 0) {
          const todosExternosConFactura = externosDeEstaCuenta.every((ext: any) => {
            const facturaKey = `${ext.email_usuario}_${ext.id_cuenta_cobranza}`;
            return facturasExternasMap.has(facturaKey);
          });
          return todosExternosConFactura;
        }
        // Si no hay externos en esta cuenta, incluir normalmente
        return true;
      });

      allData = [...allData, ...processedData];
      from += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allData;
}

export default function PagarComisiones() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarPago } = useActivityLogger();
  const [filtroGeneral, setFiltroGeneral] = useState("");
  const [evidenciaFile, setEvidenciaFile] = useState<File | null>(null);
  const [selectedComisionista, setSelectedComisionista] = useState<{ email: string; idCuenta: number } | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [pagarTodas, setPagarTodas] = useState<{ type: 'comisionista' | 'cuenta', data: any } | null>(null);

  const pagarComisionMutation = useMutation({
    mutationFn: async ({ email, idCuenta, file }: { email: string; idCuenta: number; file?: File }) => {
      let publicUrl: string | null = null;
      
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${email}_${idCuenta}_${Date.now()}.${fileExt}`;
        const filePath = `evidencias-pago-comision/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('documentos')
          .getPublicUrl(filePath);
        publicUrl = data.publicUrl;
      }

      const updatePayload: { pagada: boolean; url_evidencia_pago?: string } = { 
        pagada: true
      };
      if (publicUrl) {
        updatePayload.url_evidencia_pago = publicUrl;
      }
      
      const { data: updateData, error: updateError } = await supabase
        .from("comisionistas")
        .update(updatePayload)
        .eq("email_usuario", email)
        .eq("id_cuenta_cobranza", idCuenta)
        .eq("activo", true)
        .select();
      
      if (updateError) throw updateError;
      
      if (!updateData || updateData.length === 0) {
        throw new Error("No se encontró la comisión para actualizar");
      }
      
      return updateData;
    },
    onSuccess: async (data, variables) => {
      // Log the payment
      await registrarPago({
        tipo: 'comision_interna',
        email_comisionista: variables.email,
        id_cuenta_cobranza: variables.idCuenta,
        url_evidencia: data?.[0]?.url_evidencia_pago || null
      });

      queryClient.invalidateQueries({ queryKey: ["pagar-comisiones"] });
      queryClient.invalidateQueries({ queryKey: ["totales-comisiones"] });
      toast({
        title: "Comisión pagada",
        description: `La comisión ha sido marcada como pagada exitosamente. ${data?.length || 0} registro(s) actualizado(s).`
      });
      setUploadDialogOpen(false);
      setEvidenciaFile(null);
      setSelectedComisionista(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al procesar el pago",
        variant: "destructive"
      });
      console.error("Error al pagar comisión:", error);
    }
  });

  const pagarTodasMutation = useMutation({
    mutationFn: async ({ cuentas, file }: { cuentas: Array<{ email: string; idCuenta: number }>, file?: File }) => {
      let publicUrl: string | null = null;
      
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `pago_multiple_${Date.now()}.${fileExt}`;
        const filePath = `evidencias-pago-comision/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('documentos')
          .getPublicUrl(filePath);
        publicUrl = data.publicUrl;
      }

      const resultados = [];
      for (const cuenta of cuentas) {
        const updatePayload: { pagada: boolean; url_evidencia_pago?: string } = { 
          pagada: true
        };
        if (publicUrl) {
          updatePayload.url_evidencia_pago = publicUrl;
        }
        
        const { data: updateData, error: updateError } = await supabase
          .from("comisionistas")
          .update(updatePayload)
          .eq("email_usuario", cuenta.email)
          .eq("id_cuenta_cobranza", cuenta.idCuenta)
          .eq("activo", true)
          .select();
        
        if (updateError) throw updateError;
        
        if (!updateData || updateData.length === 0) {
          console.warn(`No se encontró comisión para ${cuenta.email} - cuenta ${cuenta.idCuenta}`);
        } else {
          resultados.push(updateData[0]);
        }
      }
      
      if (resultados.length === 0) {
        throw new Error("No se actualizó ninguna comisión");
      }
      
      return resultados;
    },
    onSuccess: async (data, variables) => {
      // Log each payment
      for (const cuenta of variables.cuentas) {
        await registrarPago({
          tipo: 'comision_interna_multiple',
          email_comisionista: cuenta.email,
          id_cuenta_cobranza: cuenta.idCuenta,
          url_evidencia: data?.find(d => d.id_cuenta_cobranza === cuenta.idCuenta)?.url_evidencia_pago || null
        });
      }

      queryClient.invalidateQueries({ queryKey: ["pagar-comisiones"] });
      queryClient.invalidateQueries({ queryKey: ["totales-comisiones"] });
      toast({
        title: "Comisiones pagadas",
        description: `Todas las comisiones han sido marcadas como pagadas exitosamente. ${data?.length || 0} registro(s) actualizado(s).`
      });
      setUploadDialogOpen(false);
      setEvidenciaFile(null);
      setPagarTodas(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al procesar los pagos",
        variant: "destructive"
      });
      console.error("Error al pagar comisiones:", error);
    }
  });

  // Query para comisionistas agrupados - SIN filtro de fecha
  const { data: comisionistasAgrupados, isLoading: loadingComisionistas } = useQuery({
    queryKey: ["pagar-comisiones", "por-comisionista"],
    queryFn: async () => {
      const comisionistas = await fetchAllComisionistas();

      const emails = [...new Set(comisionistas.map((c: any) => c.email_usuario))];
      const { data: usuarios } = await supabase
        .rpc('get_usuarios_by_emails', { _emails: emails });

      const usuariosMap = new Map(usuarios?.map((u: { email: string; nombre: string }) => [u.email, { nombre: u.nombre, esInmobiliaria: false }]) || []);

      // Find emails not in usuarios and fetch from personas (inmobiliarias)
      const emailsNotInUsuarios = emails.filter(email => !usuariosMap.has(email));
      
      if (emailsNotInUsuarios.length > 0) {
        const { data: personasData } = await supabase
          .from('personas')
          .select('email, nombre_legal, tipo_persona')
          .in('email', emailsNotInUsuarios)
          .eq('activo', true);
        
        personasData?.forEach(p => {
          usuariosMap.set(p.email, { 
            nombre: p.nombre_legal, 
            esInmobiliaria: p.tipo_persona === 'pm' 
          });
        });
      }

      const grouped = comisionistas.reduce((acc: any, com: any) => {
        if (!acc[com.email_usuario]) {
          const userData = usuariosMap.get(com.email_usuario);
          acc[com.email_usuario] = {
            email: com.email_usuario,
            nombre: userData?.nombre || 'N/A',
            esInmobiliaria: userData?.esInmobiliaria || false,
            montoTotal: 0,
            cuentas: []
          };
        }

        const cuenta = com.cuentas_cobranza;
        const oferta = cuenta.ofertas;
        const propiedad = oferta?.propiedades;
        const producto = oferta?.productos_servicios;
        const montoComision = (cuenta.precio_final * com.porcentaje_comision) / 100;
        
        // Obtener fecha de pago del enganche
        const engancheAcuerdo = cuenta.acuerdos_pago?.find((ap: any) => 
          ap.pago_completado && ap.conceptos_pago?.nombre?.toLowerCase() === 'enganche'
        );
        const aplicacionActiva = engancheAcuerdo?.aplicaciones_pago?.find((app: any) => app.activo);
        const fechaPagoEnganche = aplicacionActiva?.pagos?.fecha_pago || null;

        acc[com.email_usuario].montoTotal += montoComision;
        // Set esExterno at commissionista level based on first record
        if (!acc[com.email_usuario].esExternoSet) {
          acc[com.email_usuario].esExterno = com.esExterno || false;
          acc[com.email_usuario].esExternoSet = true;
        }
        acc[com.email_usuario].cuentas.push({
          idCuenta: cuenta.id,
          numeroCuenta: formatCuentaCobranzaId(cuenta.id),
          tipo: producto ? producto.categorias_producto?.nombre : 'Propiedad',
          proyecto: propiedad?.edificios_modelos?.edificios?.proyectos?.nombre || 'N/A',
          edificio: propiedad?.edificios_modelos?.edificios?.nombre || 'N/A',
          modelo: propiedad?.edificios_modelos?.modelos?.nombre || 'N/A',
          numeroDepartamento: propiedad?.numero_propiedad || 'N/A',
          precioFinal: cuenta.precio_final,
          porcentajeComision: com.porcentaje_comision,
          montoComision,
          pagada: com.pagada,
          urlEvidencia: com.url_evidencia_pago,
          urlFacturaExterna: com.urlFacturaExterna,
          facturaComisionSozu: com.facturaComisionSozu,
          fechaPagoEnganche
        });

        return acc;
      }, {});

      return Object.values(grouped);
    }
  });

  // Query para cuentas agrupadas - SIN filtro de fecha
  const { data: cuentasAgrupadas, isLoading: loadingCuentas } = useQuery({
    queryKey: ["pagar-comisiones", "por-cuenta"],
    queryFn: async () => {
      const comisionistas = await fetchAllComisionistas();

      const emails = [...new Set(comisionistas.map((c: any) => c.email_usuario))];
      const { data: usuarios } = await supabase
        .rpc('get_usuarios_by_emails', { _emails: emails });

      const usuariosMap = new Map(usuarios?.map(u => [u.email, { nombre: u.nombre, esInmobiliaria: false }]) || []);

      // Find emails not in usuarios and fetch from personas (inmobiliarias)
      const emailsNotInUsuarios = emails.filter(email => !usuariosMap.has(email));
      
      if (emailsNotInUsuarios.length > 0) {
        const { data: personasData } = await supabase
          .from('personas')
          .select('email, nombre_legal, tipo_persona')
          .in('email', emailsNotInUsuarios)
          .eq('activo', true);
        
        personasData?.forEach(p => {
          usuariosMap.set(p.email, { 
            nombre: p.nombre_legal, 
            esInmobiliaria: p.tipo_persona === 'pm' 
          });
        });
      }

      const grouped = comisionistas.reduce((acc: any, com: any) => {
        const cuentaId = com.id_cuenta_cobranza;
        if (!acc[cuentaId]) {
          const cuenta = com.cuentas_cobranza;
          const oferta = cuenta.ofertas;
          const propiedad = oferta?.propiedades;
          const producto = oferta?.productos_servicios;

          acc[cuentaId] = {
            idCuenta: cuenta.id,
            numeroCuenta: formatCuentaCobranzaId(cuenta.id),
            tipo: producto ? producto.categorias_producto?.nombre : 'Propiedad',
            proyecto: propiedad?.edificios_modelos?.edificios?.proyectos?.nombre || 'N/A',
            edificio: propiedad?.edificios_modelos?.edificios?.nombre || 'N/A',
            modelo: propiedad?.edificios_modelos?.modelos?.nombre || 'N/A',
            numeroDepartamento: propiedad?.numero_propiedad || 'N/A',
            precioFinal: cuenta.precio_final,
            montoTotalComision: 0,
            porcentajeTotalComision: 0,
            facturaComisionSozu: com.facturaComisionSozu || null,
            comisionistas: []
          };
        }

        const montoComision = (com.cuentas_cobranza.precio_final * com.porcentaje_comision) / 100;
        const userData = usuariosMap.get(com.email_usuario);

        acc[cuentaId].montoTotalComision += montoComision;
        acc[cuentaId].porcentajeTotalComision += com.porcentaje_comision;

        acc[cuentaId].comisionistas.push({
          email: com.email_usuario,
          nombre: userData?.nombre || 'N/A',
          esInmobiliaria: userData?.esInmobiliaria || false,
          esExterno: com.esExterno || false,
          urlFacturaExterna: com.urlFacturaExterna,
          porcentajeComision: com.porcentaje_comision,
          montoComision,
          pagada: com.pagada,
          urlEvidencia: com.url_evidencia_pago
        });

        return acc;
      }, {});

      return Object.values(grouped);
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setEvidenciaFile(e.target.files[0]);
    }
  };

  const handlePagar = () => {
    if (pagarTodas) {
      const cuentas = pagarTodas.type === 'comisionista'
        ? pagarTodas.data.cuentas
            .filter((c: any) => !c.pagada)
            .map((c: any) => ({ email: pagarTodas.data.email, idCuenta: c.idCuenta }))
        : pagarTodas.data.comisionistas
            .filter((c: any) => !c.pagada)
            .map((c: any) => ({ email: c.email, idCuenta: pagarTodas.data.idCuenta }));

      pagarTodasMutation.mutate({ cuentas, file: evidenciaFile || undefined });
    } else if (selectedComisionista) {
      pagarComisionMutation.mutate({
        email: selectedComisionista.email,
        idCuenta: selectedComisionista.idCuenta,
        file: evidenciaFile || undefined
      });
    }
  };

  const openPagarDialog = (email: string, idCuenta: number) => {
    setSelectedComisionista({ email, idCuenta });
    setPagarTodas(null);
    setUploadDialogOpen(true);
  };

  const openPagarTodasDialog = (type: 'comisionista' | 'cuenta', data: any) => {
    setPagarTodas({ type, data });
    setSelectedComisionista(null);
    setUploadDialogOpen(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value);
  };

  const formatCompactCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}K`;
    }
    return formatCurrency(value);
  };

  // Calcular totales para las cards de resumen
  const { data: totalesComisiones } = useQuery({
    queryKey: ["totales-comisiones"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_totales_comisionistas');

      if (error) throw error;

      return {
        montoTotal: Number(data?.[0]?.monto_total || 0),
        montoDispersado: Number(data?.[0]?.monto_dispersado || 0),
        montoPendiente: Number(data?.[0]?.monto_pendiente || 0)
      };
    }
  });

  const { data: totalesComisionesSozu } = useQuery({
    queryKey: ["totales-comisiones-sozu"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_totales_comisiones_sozu');

      if (error) throw error;

      return {
        montoTotalSozu: Number(data?.[0]?.monto_total_sozu || 0),
        montoYaCobrado: Number(data?.[0]?.monto_ya_cobrado || 0),
        montoPorCobrar: Number(data?.[0]?.monto_por_cobrar || 0)
      };
    }
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Pagar Comisiones</h1>
          <p className="text-muted-foreground">Gestión de pagos de comisiones aprobadas</p>
        </div>
      </div>

      {/* Cards de resumen */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Comisiones a Cobrar por Sozu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {totalesComisionesSozu ? formatCompactCurrency(totalesComisionesSozu.montoPorCobrar) : <Skeleton className="h-8 w-32" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Comisión general pendiente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Comisiones Ya Cobradas por Sozu
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totalesComisionesSozu ? formatCompactCurrency(totalesComisionesSozu.montoYaCobrado) : <Skeleton className="h-8 w-32" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Comisión general cobrada
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Monto Total de Comisiones Aprobadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalesComisiones ? formatCompactCurrency(totalesComisiones.montoTotal) : <Skeleton className="h-8 w-32" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total de comisiones aprobadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Monto Dispersado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {totalesComisiones ? formatCompactCurrency(totalesComisiones.montoDispersado) : <Skeleton className="h-8 w-32" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Comisiones ya pagadas
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Buscar..."
          value={filtroGeneral}
          onChange={(e) => setFiltroGeneral(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {/* Pestañas principales: Por Pagar / Pagadas */}
      <Tabs defaultValue="por-pagar" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="por-pagar">Comisiones por Pagar</TabsTrigger>
          <TabsTrigger value="pagadas">Comisiones Pagadas</TabsTrigger>
        </TabsList>

        <TabsContent value="por-pagar" className="space-y-4">
          <ComisionesPorPagarTab
            comisionistasAgrupados={comisionistasAgrupados || []}
            cuentasAgrupadas={cuentasAgrupadas || []}
            loadingComisionistas={loadingComisionistas}
            loadingCuentas={loadingCuentas}
            filtroGeneral={filtroGeneral}
            formatCurrency={formatCurrency}
            openPagarDialog={openPagarDialog}
            openPagarTodasDialog={openPagarTodasDialog}
          />
        </TabsContent>

        <TabsContent value="pagadas" className="space-y-4">
          <ComisionesPagadasTab
            comisionistasAgrupados={comisionistasAgrupados || []}
            cuentasAgrupadas={cuentasAgrupadas || []}
            loadingComisionistas={loadingComisionistas}
            loadingCuentas={loadingCuentas}
            filtroGeneral={filtroGeneral}
            formatCurrency={formatCurrency}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pagarTodas ? 'Pagar Todas las Comisiones' : 'Subir Evidencia de Pago'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {pagarTodas && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">
                  Se pagarán {pagarTodas.type === 'comisionista' 
                    ? `${pagarTodas.data.cuentas.filter((c: any) => !c.pagada).length} comisiones pendientes del comisionista ${pagarTodas.data.nombre}`
                    : `${pagarTodas.data.comisionistas.filter((c: any) => !c.pagada).length} comisiones pendientes de la cuenta ${pagarTodas.data.numeroCuenta}`
                  }
                </p>
              </div>
            )}
            <div>
              <Label>Archivo de evidencia</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="mt-2"
              />
              {evidenciaFile && (
                <p className="text-sm text-muted-foreground mt-2">
                  Archivo seleccionado: {evidenciaFile.name}
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setUploadDialogOpen(false);
                  setEvidenciaFile(null);
                  setSelectedComisionista(null);
                  setPagarTodas(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handlePagar}
                disabled={pagarComisionMutation.isPending || pagarTodasMutation.isPending}
              >
                {(pagarComisionMutation.isPending || pagarTodasMutation.isPending) ? "Procesando..." : "Confirmar Pago"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
