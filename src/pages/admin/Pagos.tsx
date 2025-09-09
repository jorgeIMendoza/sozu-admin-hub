import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ExternalLink, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Pago {
  id: number;
  clave_rastreo: string | null;
  monto: number;
  metodo_pago: string | null;
  url_cep: string | null;
  fecha_pago: string;
  url_recibo: string | null;
  concepto_pago: string | null;
  nombre_beneficiario: string | null;
}

export default function Pagos() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: pagos, isLoading } = useQuery({
    queryKey: ["pagos"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-pagos');
      
      if (error) {
        console.error('Error fetching pagos:', error);
        return [];
      }
      
      // Sort by id descending
      const sortedData = (data.data as Pago[]).sort((a, b) => b.id - a.id);
      return sortedData;
    },
  });

  const filteredPagos = pagos?.filter(pago =>
    pago.clave_rastreo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pago.metodo_pago?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pago.concepto_pago?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pago.nombre_beneficiario?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pago.monto.toString().includes(searchTerm)
  ) || [];

  const totalMonto = filteredPagos.reduce((sum, pago) => sum + Number(pago.monto), 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cuentas de Cobranza</h1>
        <p className="text-muted-foreground">
          Listado de pagos registrados en el sistema
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Pagos</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredPagos.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalMonto)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Promedio por Pago</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(filteredPagos.length > 0 ? totalMonto / filteredPagos.length : 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pagos</CardTitle>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por clave, método de pago, concepto, beneficiario o monto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Cargando pagos...</div>
          ) : filteredPagos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? "No se encontraron pagos que coincidan con la búsqueda" : "No hay pagos disponibles"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha de Pago</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Método de Pago</TableHead>
                  <TableHead>Clave de Rastreo</TableHead>
                  <TableHead>Concepto de Pago</TableHead>
                  <TableHead>Beneficiario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPagos.map((pago) => (
                  <TableRow key={pago.id}>
                    <TableCell>{formatDate(pago.fecha_pago)}</TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(Number(pago.monto))}
                    </TableCell>
                    <TableCell>
                      {pago.metodo_pago ? (
                        <Badge variant="outline">{pago.metodo_pago}</Badge>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {pago.clave_rastreo || (
                        <span className="text-muted-foreground">Sin clave</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {pago.concepto_pago || (
                        <span className="text-muted-foreground">Sin concepto</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {pago.nombre_beneficiario || (
                        <span className="text-muted-foreground">Sin beneficiario</span>
                      )}
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