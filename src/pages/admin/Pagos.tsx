import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, CreditCard } from "lucide-react";

interface CuentaCobranza {
  id: number;
  clabe_stp: string | null;
  precio_final: number;
  compradores: string[];
  dueno: string;
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
}

export default function Pagos() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: cuentasCobranza, isLoading } = useQuery({
    queryKey: ["cuentas_cobranza"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          clabe_stp,
          precio_final,
          ofertas!fk_cuentas_cobranza_oferta(
            propiedades!ofertas_id_propiedad_fkey(
              numero_propiedad,
              entidades_relacionadas!id_entidad_relacionada_dueno(
                personas!id_persona(nombre_legal),
                proyectos!id_proyecto(nombre)
              ),
              edificios_modelos!id_edificio_modelo(
                edificios!id_edificio(nombre),
                modelos!id_modelo(nombre)
              )
            )
          ),
          compradores!id_cuenta_cobranza(
            personas!id_persona(nombre_legal)
          )
        `)
        .eq('activo', true);
      
      if (error) {
        console.error('Error fetching cuentas cobranza:', error);
        return [];
      }
      
      // Transform the data to match our interface
      const transformedData: CuentaCobranza[] = (data || []).map(cuenta => {
        const oferta = cuenta.ofertas as any;
        const propiedad = oferta?.propiedades;
        const entidadRelacionada = propiedad?.entidades_relacionadas;
        const edificioModelo = propiedad?.edificios_modelos;
        
        return {
          id: cuenta.id,
          clabe_stp: cuenta.clabe_stp,
          precio_final: cuenta.precio_final || 0,
          compradores: (cuenta.compradores as any)?.map((c: any) => c.personas?.nombre_legal).filter(Boolean) || [],
          dueno: entidadRelacionada?.personas?.nombre_legal || 'Sin dueño',
          proyecto: entidadRelacionada?.proyectos?.nombre || 'Sin proyecto',
          edificio: edificioModelo?.edificios?.nombre || 'Sin edificio',
          numero_propiedad: propiedad?.numero_propiedad || 'Sin número',
          modelo: edificioModelo?.modelos?.nombre || 'Sin modelo'
        };
      });
      
      return transformedData.sort((a, b) => b.id - a.id);
    },
  });

  const filteredCuentas = cuentasCobranza?.filter(cuenta =>
    cuenta.id.toString().includes(searchTerm) ||
    cuenta.compradores.some(c => c.toLowerCase().includes(searchTerm.toLowerCase())) ||
    cuenta.dueno.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.clabe_stp?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.proyecto.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.edificio.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.numero_propiedad.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cuenta.precio_final.toString().includes(searchTerm)
  ) || [];

  const totalMonto = filteredCuentas.reduce((sum, cuenta) => sum + Number(cuenta.precio_final), 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cuentas de Cobranza</h1>
        <p className="text-muted-foreground">
          Listado de cuentas de cobranza registradas en el sistema
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Cuentas</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredCuentas.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalMonto)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Promedio por Cuenta</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(filteredCuentas.length > 0 ? totalMonto / filteredCuentas.length : 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por ID, compradores, dueño, CLABE, proyecto, edificio, propiedad o modelo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Cargando cuentas de cobranza...</div>
          ) : filteredCuentas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? "No se encontraron cuentas que coincidan con la búsqueda" : "No hay cuentas de cobranza disponibles"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Cuenta</TableHead>
                  <TableHead>Compradores</TableHead>
                  <TableHead>Dueño</TableHead>
                  <TableHead>CLABE</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Edificio</TableHead>
                  <TableHead>No. Propiedad</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Precio Final</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCuentas.map((cuenta) => (
                  <TableRow key={cuenta.id}>
                    <TableCell className="font-semibold">{cuenta.id}</TableCell>
                    <TableCell>
                      {cuenta.compradores.length > 0 ? (
                        <div className="space-y-1">
                          {cuenta.compradores.map((comprador, index) => (
                            <Badge key={index} variant="secondary" className="block w-fit">
                              {comprador}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Sin compradores</span>
                      )}
                    </TableCell>
                    <TableCell>{cuenta.dueno}</TableCell>
                    <TableCell>
                      {cuenta.clabe_stp ? (
                        <Badge variant="outline">{cuenta.clabe_stp}</Badge>
                      ) : (
                        <span className="text-muted-foreground">Sin CLABE</span>
                      )}
                    </TableCell>
                    <TableCell>{cuenta.proyecto}</TableCell>
                    <TableCell>{cuenta.edificio}</TableCell>
                    <TableCell>{cuenta.numero_propiedad}</TableCell>
                    <TableCell>{cuenta.modelo}</TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(Number(cuenta.precio_final))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}