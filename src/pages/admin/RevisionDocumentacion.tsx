import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Upload, Users, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { CompradoresConDocumentosDialog } from "@/components/admin/CompradoresConDocumentosDialog";
import SubirProyectoEscrituraDialog from "@/components/admin/SubirProyectoEscrituraDialog";

interface CuentaEscrituracion {
  cuenta_id: number;
  proyecto: string;
  proyecto_id: number;
  edificio: string;
  modelo: string;
  numero_propiedad: string;
  dueno: string;
  precio_final: number;
  propiedad_id: number;
  oferta_id: number;
  tiene_proyecto_escritura: boolean;
}

export default function RevisionDocumentacion() {
  const [filtroProyecto, setFiltroProyecto] = useState<string>("");
  const [filtroEdificio, setFiltroEdificio] = useState<string>("");
  const [filtroModelo, setFiltroModelo] = useState<string>("");
  const [filtroPropiedad, setFiltroPropiedad] = useState<string>("");
  const [filtroDueno, setFiltroDueno] = useState<string>("");
  const [filtroCuenta, setFiltroCuenta] = useState<string>("");

  const [selectedCuentaId, setSelectedCuentaId] = useState<number | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  // Función para obtener compradores con documentos
  const fetchCompradores = async (cuentaId: number) => {
    const { data, error } = await supabase
      .from('compradores')
      .select(`
        id_persona,
        porcentaje_copropiedad,
        personas!compradores_id_persona_fkey(
          nombre_legal,
          rfc,
          curp,
          tipo_persona,
          email,
          telefono
        )
      `)
      .eq('id_cuenta_cobranza', cuentaId)
      .eq('activo', true);

    if (error) throw error;

    const compradoresConDocs = await Promise.all(
      (data || []).map(async (c: any) => {
        const { data: docs } = await supabase
          .from('documentos')
          .select(`
            id,
            url,
            fecha_creacion,
            tipos_documento!inner(nombre)
          `)
          .eq('id_persona', c.id_persona)
          .is('id_cuenta_cobranza', null)
          .eq('activo', true);

        return {
          id_persona: c.id_persona,
          nombre_legal: c.personas.nombre_legal,
          rfc: c.personas.rfc,
          curp: c.personas.curp,
          tipo_persona: c.personas.tipo_persona,
          porcentaje_copropiedad: c.porcentaje_copropiedad,
          email: c.personas.email,
          telefono: c.personas.telefono,
          documentos: (docs || []).map((d: any) => ({
            id: d.id,
            tipo: d.tipos_documento.nombre,
            url: d.url,
            fecha: d.fecha_creacion,
          })),
        };
      })
    );

    return compradoresConDocs;
  };

  // Query para obtener cuentas en escrituración
  const { data: cuentas, isLoading, refetch } = useQuery({
    queryKey: ['cuentas-escrituracion', filtroProyecto, filtroEdificio, filtroModelo, filtroPropiedad, filtroDueno, filtroCuenta],
    queryFn: async () => {
      let query = supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          precio_final,
          ofertas!fk_cuentas_cobranza_oferta!inner (
            id,
            propiedades!ofertas_id_propiedad_fkey!inner (
              id,
              numero_propiedad,
              id_estatus_disponibilidad,
              edificios_modelos!inner (
                modelos!inner (
                  nombre
                ),
                edificios!inner (
                  nombre,
                  proyectos!inner (
                    id,
                    nombre
                  )
                )
              ),
              id_entidad_relacionada_dueno
            )
          )
        `)
        .eq('activo', true)
        .eq('ofertas.activo', true)
        .eq('ofertas.propiedades.activo', true)
        .eq('ofertas.propiedades.id_estatus_disponibilidad', 7); // Solo Escrituración

      // Aplicar filtros
      if (filtroPropiedad) {
        query = query.ilike('ofertas.propiedades.numero_propiedad', `%${filtroPropiedad}%`);
      }
      if (filtroCuenta) {
        query = query.eq('id', parseInt(filtroCuenta));
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching cuentas:', error);
        throw error;
      }

      if (!data) return [];

      // Procesar resultados para obtener datos adicionales
      const cuentasConDetalles = await Promise.all(
        data.map(async (cuenta: any) => {
          const propiedad = cuenta.ofertas.propiedades;
          const edificioModelo = propiedad.edificios_modelos;
          const edificio = edificioModelo.edificios;
          const proyecto = edificio.proyectos;
          const modelo = edificioModelo.modelos;

          // Obtener información del dueño
          const { data: entidadDueno } = await supabase
            .from('entidades_relacionadas')
            .select('personas!entidades_relacionadas_id_persona_fkey(nombre_legal)')
            .eq('id', propiedad.id_entidad_relacionada_dueno)
            .single();

          // Verificar si tiene proyecto de escritura (id_tipo_documento = 29)
          const { data: docEscritura } = await supabase
            .from('documentos')
            .select('id')
            .eq('id_cuenta_cobranza', cuenta.id)
            .eq('id_tipo_documento', 29)
            .eq('activo', true)
            .maybeSingle();

          return {
            cuenta_id: cuenta.id,
            proyecto: proyecto.nombre,
            proyecto_id: proyecto.id,
            edificio: edificio.nombre,
            modelo: modelo.nombre,
            numero_propiedad: propiedad.numero_propiedad,
            dueno: entidadDueno?.personas?.nombre_legal || 'N/A',
            precio_final: cuenta.precio_final,
            propiedad_id: propiedad.id,
            oferta_id: cuenta.ofertas.id,
            tiene_proyecto_escritura: !!docEscritura,
          } as CuentaEscrituracion;
        })
      );

      // Aplicar filtros adicionales
      let cuentasFiltradas = cuentasConDetalles;

      if (filtroProyecto) {
        cuentasFiltradas = cuentasFiltradas.filter(c => 
          c.proyecto.toLowerCase().includes(filtroProyecto.toLowerCase())
        );
      }
      if (filtroEdificio) {
        cuentasFiltradas = cuentasFiltradas.filter(c => 
          c.edificio.toLowerCase().includes(filtroEdificio.toLowerCase())
        );
      }
      if (filtroModelo) {
        cuentasFiltradas = cuentasFiltradas.filter(c => 
          c.modelo.toLowerCase().includes(filtroModelo.toLowerCase())
        );
      }
      if (filtroDueno) {
        cuentasFiltradas = cuentasFiltradas.filter(c => 
          c.dueno.toLowerCase().includes(filtroDueno.toLowerCase())
        );
      }

      return cuentasFiltradas;
    },
  });

  const handleSubirProyecto = (cuentaId: number) => {
    setSelectedCuentaId(cuentaId);
    setShowUploadDialog(true);
  };

  const limpiarFiltros = () => {
    setFiltroProyecto("");
    setFiltroEdificio("");
    setFiltroModelo("");
    setFiltroPropiedad("");
    setFiltroDueno("");
    setFiltroCuenta("");
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Revisión de Documentación - Escrituración
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Proyecto</label>
              <Input
                placeholder="Filtrar por proyecto..."
                value={filtroProyecto}
                onChange={(e) => setFiltroProyecto(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Edificio</label>
              <Input
                placeholder="Filtrar por edificio..."
                value={filtroEdificio}
                onChange={(e) => setFiltroEdificio(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Modelo</label>
              <Input
                placeholder="Filtrar por modelo..."
                value={filtroModelo}
                onChange={(e) => setFiltroModelo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Propiedad</label>
              <Input
                placeholder="Filtrar por número..."
                value={filtroPropiedad}
                onChange={(e) => setFiltroPropiedad(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Dueño</label>
              <Input
                placeholder="Filtrar por dueño..."
                value={filtroDueno}
                onChange={(e) => setFiltroDueno(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Cuenta ID</label>
              <Input
                placeholder="ID de cuenta..."
                value={filtroCuenta}
                onChange={(e) => setFiltroCuenta(e.target.value)}
                type="number"
              />
            </div>
          </div>

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={limpiarFiltros} size="sm">
              Limpiar Filtros
            </Button>
            <Badge variant="secondary">
              {cuentas?.length || 0} cuenta(s) en escrituración
            </Badge>
          </div>

          {/* Tabla */}
          <div className="border rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !cuentas || cuentas.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No hay cuentas en estatus de Escrituración</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Proyecto</TableHead>
                    <TableHead>Edificio</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Propiedad</TableHead>
                    <TableHead>Dueño</TableHead>
                    <TableHead className="text-right">Precio Final</TableHead>
                    <TableHead className="text-center">Proyecto Escritura</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuentas.map((cuenta) => (
                    <TableRow key={cuenta.cuenta_id}>
                      <TableCell className="font-medium">{cuenta.cuenta_id}</TableCell>
                      <TableCell>{cuenta.proyecto}</TableCell>
                      <TableCell>{cuenta.edificio}</TableCell>
                      <TableCell>{cuenta.modelo}</TableCell>
                      <TableCell>{cuenta.numero_propiedad}</TableCell>
                      <TableCell>{cuenta.dueno}</TableCell>
                      <TableCell className="text-right">
                        ${cuenta.precio_final.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        {cuenta.tiene_proyecto_escritura ? (
                          <CheckCircle className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <XCircle className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-center">
                          <CompradoresConDocumentosDialog
                            cuentaCobranzaId={cuenta.cuenta_id}
                            fetchCompradores={fetchCompradores}
                          />
                          <Button
                            size="sm"
                            onClick={() => handleSubirProyecto(cuenta.cuenta_id)}
                            disabled={cuenta.tiene_proyecto_escritura}
                          >
                            <Upload className="h-4 w-4" />
                            {cuenta.tiene_proyecto_escritura ? 'Ya subido' : 'Subir Proyecto'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      {selectedCuentaId && (
        <SubirProyectoEscrituraDialog
            open={showUploadDialog}
            onOpenChange={setShowUploadDialog}
            cuentaCobranzaId={selectedCuentaId}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
