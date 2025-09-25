import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Comprador {
  nombre_legal: string;
  rfc: string | null;
  porcentaje_copropiedad: number;
}

interface CompradoresDetailDialogProps {
  compradores: Comprador[];
  trigger?: React.ReactNode;
}

export function CompradoresDetailDialog({ compradores, trigger }: CompradoresDetailDialogProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleNavigateToCompradores = (rfc?: string) => {
    if (rfc) {
      navigate(`/admin/compradores?search=${encodeURIComponent(rfc)}`);
    } else {
      navigate('/admin/compradores');
    }
    setOpen(false);
  };

  const defaultTrigger = (
    <Button variant="outline" size="sm">
      <Users className="h-4 w-4 mr-1" />
      Ver {compradores.length} compradores
    </Button>
  );

  const formatPercentage = (percentage: number) => {
    return `${percentage.toFixed(2)}%`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalle de Compradores</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Total de compradores: {compradores.length}
          </div>
          
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>RFC</TableHead>
                <TableHead className="text-right">% Copropiedad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compradores.map((comprador, index) => (
                <TableRow key={index} className="hover:bg-muted/50 cursor-pointer transition-colors">
                  <TableCell 
                    className="font-medium hover:text-primary cursor-pointer"
                    onClick={() => handleNavigateToCompradores(comprador.rfc || undefined)}
                  >
                    {comprador.nombre_legal}
                  </TableCell>
                  <TableCell 
                    className="cursor-pointer"
                    onClick={() => handleNavigateToCompradores(comprador.rfc || undefined)}
                  >
                    {comprador.rfc ? (
                      <Badge variant="outline" className="hover:bg-primary/10">{comprador.rfc}</Badge>
                    ) : (
                      <span className="text-muted-foreground">Sin RFC</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatPercentage(comprador.porcentaje_copropiedad)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Verificación del 100% */}
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm font-medium">Total:</span>
            <span className="font-bold">
              {formatPercentage(compradores.reduce((sum, c) => sum + c.porcentaje_copropiedad, 0))}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}