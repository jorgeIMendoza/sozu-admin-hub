import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Discrepancia {
  proyecto: string;
  tipo: string;
  num_departamento: string;
  cuenta_cobranza_id: number;
  collection_id: number | null;
  precio_final: number;
  suma_acuerdos: number;
  diferencia: number;
  producto_nombre: string | null;
}

export default function ReporteDiscrepancias() {
  const [loading, setLoading] = useState(false);
  const [discrepancias, setDiscrepancias] = useState<Discrepancia[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchDiscrepancias = async () => {
    setLoading(true);
    try {
      // First get all cuentas_cobranza with their offers
      const { data: cuentasData, error: cuentasError } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          collection_id,
          precio_final,
          id_oferta,
          ofertas!fk_ccob_oferta (
            id_propiedad,
            id_producto,
            propiedades!fk_ofertas_propiedad (
              numero_propiedad,
              edificios_modelos!fk_propiedades_edificio_modelo (
                edificios (
                  nombre,
                  proyectos (nombre)
                )
              )
            ),
            productos_servicios (nombre)
          )
        `)
        .eq('activo', true);

      if (cuentasError) throw cuentasError;

      // Get all acuerdos_pago sums
      const { data: acuerdosData, error: acuerdosError } = await supabase
        .from('acuerdos_pago')
        .select('id_cuenta_cobranza, monto')
        .eq('activo', true);

      if (acuerdosError) throw acuerdosError;

      // Calculate sums per cuenta
      const sumasPorCuenta: Record<number, number> = {};
      acuerdosData?.forEach(a => {
        const cuentaId = a.id_cuenta_cobranza;
        sumasPorCuenta[cuentaId] = (sumasPorCuenta[cuentaId] || 0) + Number(a.monto);
      });

      // Find discrepancies
      const discrepanciasResult: Discrepancia[] = [];
      
      cuentasData?.forEach(cuenta => {
        const sumaAcuerdos = sumasPorCuenta[cuenta.id] || 0;
        const precioFinal = Number(cuenta.precio_final);
        const diferencia = precioFinal - sumaAcuerdos;

        if (Math.abs(diferencia) > 0.01) {
          const oferta = cuenta.ofertas as any;
          const propiedad = oferta?.propiedades;
          const producto = oferta?.productos_servicios;
          
          let proyecto = 'Sin proyecto';
          let numDepa = '';
          let tipo = 'Sin tipo';
          
          if (propiedad) {
            tipo = 'Propiedad';
            numDepa = propiedad.numero_propiedad || '';
            proyecto = propiedad.edificios_modelos?.edificios?.proyectos?.nombre || 'Sin proyecto';
          } else if (producto) {
            tipo = 'Producto';
            numDepa = producto.nombre || '';
          }

          discrepanciasResult.push({
            proyecto,
            tipo,
            num_departamento: numDepa,
            cuenta_cobranza_id: cuenta.id,
            collection_id: cuenta.collection_id,
            precio_final: precioFinal,
            suma_acuerdos: sumaAcuerdos,
            diferencia,
            producto_nombre: producto?.nombre || null
          });
        }
      });

      // Sort by absolute difference descending
      discrepanciasResult.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia));
      
      setDiscrepancias(discrepanciasResult);
      setLoaded(true);
      toast.success(`Se encontraron ${discrepanciasResult.length} cuentas con discrepancias`);
    } catch (error) {
      console.error('Error fetching discrepancies:', error);
      toast.error('Error al obtener los datos');
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = () => {
    if (discrepancias.length === 0) {
      toast.error('No hay datos para descargar');
      return;
    }

    // Create CSV content
    const headers = [
      'Proyecto',
      'Tipo',
      'Num Departamento / Producto',
      'Cuenta Cobranza ID',
      'Collection ID (Plataforma Anterior)',
      'Precio Final',
      'Suma Acuerdos',
      'Diferencia'
    ];

    const rows = discrepancias.map(d => [
      d.proyecto,
      d.tipo,
      d.num_departamento,
      d.cuenta_cobranza_id,
      d.collection_id || '',
      d.precio_final.toFixed(2),
      d.suma_acuerdos.toFixed(2),
      d.diferencia.toFixed(2)
    ]);

    // Build CSV with BOM for Excel UTF-8 compatibility
    const BOM = '\uFEFF';
    const csvContent = BOM + [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `discrepancias_precio_acuerdos_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Archivo descargado exitosamente');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(value);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6" />
              Reporte de Discrepancias: Precio Final vs Suma de Acuerdos
            </CardTitle>
            <CardDescription>
              Este reporte muestra todas las cuentas de cobranza donde existe una diferencia entre el precio final y la suma de los acuerdos de pago.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button onClick={fetchDiscrepancias} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cargando...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    Buscar Discrepancias
                  </>
                )}
              </Button>
              
              {loaded && discrepancias.length > 0 && (
                <Button onClick={downloadExcel} variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Descargar Excel ({discrepancias.length} registros)
                </Button>
              )}
            </div>

            {loaded && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Total de cuentas con discrepancias: <strong>{discrepancias.length}</strong>
                </p>
                
                {discrepancias.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-[500px] overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left">Proyecto</th>
                            <th className="px-4 py-2 text-left">Tipo</th>
                            <th className="px-4 py-2 text-left">Num Depa / Producto</th>
                            <th className="px-4 py-2 text-right">Cuenta ID</th>
                            <th className="px-4 py-2 text-right">Collection ID</th>
                            <th className="px-4 py-2 text-right">Precio Final</th>
                            <th className="px-4 py-2 text-right">Suma Acuerdos</th>
                            <th className="px-4 py-2 text-right">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {discrepancias.slice(0, 100).map((d, idx) => (
                            <tr key={idx} className="border-t hover:bg-muted/50">
                              <td className="px-4 py-2">{d.proyecto}</td>
                              <td className="px-4 py-2">{d.tipo}</td>
                              <td className="px-4 py-2">{d.num_departamento}</td>
                              <td className="px-4 py-2 text-right">{d.cuenta_cobranza_id}</td>
                              <td className="px-4 py-2 text-right">{d.collection_id || '-'}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(d.precio_final)}</td>
                              <td className="px-4 py-2 text-right">{formatCurrency(d.suma_acuerdos)}</td>
                              <td className={`px-4 py-2 text-right font-medium ${d.diferencia > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(d.diferencia)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {discrepancias.length > 100 && (
                      <div className="px-4 py-2 bg-muted text-sm text-muted-foreground">
                        Mostrando 100 de {discrepancias.length} registros. Descarga el Excel para ver todos.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
