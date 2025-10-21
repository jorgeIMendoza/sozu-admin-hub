import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface BodegaDetalle {
  nombre: string;
  m2: number;
  ubicacion?: string;
  es_incluido: boolean;
}

interface EstacionamientoDetalle {
  nombre: string;
  tipo: string;
  m2: number;
  ubicacion?: string;
  es_incluido: boolean;
}

interface ProductoDetalle {
  nombre: string;
  categoria: string;
  precio: number;
}

interface ComplementosDetailDialogProps {
  open: boolean;
  onClose: () => void;
  bodegas: BodegaDetalle[];
  estacionamientos: EstacionamientoDetalle[];
  productos: ProductoDetalle[];
  propertyNumber: string;
}

export const ComplementosDetailDialog = ({ 
  open, 
  onClose, 
  bodegas, 
  estacionamientos, 
  productos,
  propertyNumber 
}: ComplementosDetailDialogProps) => {
  const totalComplementos = bodegas.length + estacionamientos.length + productos.length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Complementos de la Propiedad {propertyNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Bodegas */}
          {bodegas.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Bodegas ({bodegas.length})</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>M²</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Incluido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bodegas.map((bodega, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{bodega.nombre}</TableCell>
                      <TableCell>{bodega.m2} m²</TableCell>
                      <TableCell>{bodega.ubicacion || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={bodega.es_incluido ? "default" : "secondary"}>
                          {bodega.es_incluido ? "Incluido" : "Adicional"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Estacionamientos */}
          {estacionamientos.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Estacionamientos ({estacionamientos.length})</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>M²</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Incluido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estacionamientos.map((estacionamiento, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{estacionamiento.nombre}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{estacionamiento.tipo}</Badge>
                      </TableCell>
                      <TableCell>{estacionamiento.m2} m²</TableCell>
                      <TableCell>{estacionamiento.ubicacion || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={estacionamiento.es_incluido ? "default" : "secondary"}>
                          {estacionamiento.es_incluido ? "Incluido" : "Adicional"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Otros Productos (Condensadoras, etc.) */}
          {productos.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Otros Productos ({productos.length})</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productos.map((producto, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{producto.nombre}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{producto.categoria}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        ${producto.precio.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {totalComplementos === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No hay complementos asignados a esta propiedad
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
