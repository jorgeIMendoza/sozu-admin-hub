import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, HeartHandshake } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Comprador {
  nombre_legal: string;
  rfc: string | null;
  porcentaje_copropiedad: number;
  id_persona?: number;
}

interface CompradoresDetailDialogProps {
  compradores: Comprador[];
  trigger?: React.ReactNode;
  label?: 'compradores' | 'propietarios';
}

export function CompradoresDetailDialog({ compradores, trigger, label = 'compradores' }: CompradoresDetailDialogProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Fetch personas details to check for spouse relationships
  const { data: personasDetails } = useQuery({
    queryKey: ['compradores-personas', compradores.map(c => c.id_persona)],
    queryFn: async () => {
      const personaIds = compradores.map(c => c.id_persona).filter(Boolean);
      if (personaIds.length === 0) return [];
      
      const { data } = await supabase
        .from('personas')
        .select('id, nombre_legal, id_conyuge')
        .in('id', personaIds);
      
      return data || [];
    },
    enabled: open && compradores.some(c => c.id_persona),
  });

  // Check if any compradores are spouses
  const areSpouses = personasDetails && personasDetails.length >= 2 && personasDetails.some((persona) => {
    const spouseId = persona.id_conyuge;
    return spouseId && personasDetails.some(p => p.id === spouseId);
  });

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
      Ver {compradores.length} {label}
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
          <DialogTitle>Detalle de {label === 'propietarios' ? 'Propietarios' : 'Compradores'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Total de {label}: {compradores.length}</span>
            {areSpouses && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HeartHandshake className="h-5 w-5 text-pink-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Hay {label} cónyuges</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
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
              {compradores.map((comprador, index) => {
                // Find persona details for this comprador
                const personaDetail = personasDetails?.find(p => p.id === comprador.id_persona);
                const hasSpouse = personaDetail?.id_conyuge != null;
                const spouseName = hasSpouse ? personasDetails?.find(p => p.id === personaDetail.id_conyuge)?.nombre_legal : null;
                
                return (
                  <TableRow key={index} className="hover:bg-muted/50 cursor-pointer transition-colors">
                    <TableCell 
                      className="font-medium hover:text-primary cursor-pointer"
                      onClick={() => handleNavigateToCompradores(comprador.rfc || undefined)}
                    >
                      <div className="flex items-center gap-2">
                        <span>{comprador.nombre_legal}</span>
                        {hasSpouse && spouseName && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HeartHandshake className="h-4 w-4 text-pink-500 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">Cónyuge: {spouseName}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
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
                );
              })}
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