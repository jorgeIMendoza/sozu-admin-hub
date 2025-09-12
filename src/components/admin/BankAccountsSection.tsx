import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BankAccountsSectionProps {
  personId: number;
  showStpCheckbox?: boolean;
}

export function BankAccountsSection({ personId, showStpCheckbox = false }: BankAccountsSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newAccount, setNewAccount] = useState({
    nombre_banco: "",
    numero_cuenta: "",
    url_evidencia: "",
    es_cuenta_fisica_para_stp: false
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ['bankAccounts', personId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cuentas_bancarias')
        .select('*')
        .eq('id_persona', personId)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  const addMutation = useMutation({
    mutationFn: async (accountData: typeof newAccount) => {
      const { data, error } = await supabase
        .from('cuentas_bancarias')
        .insert([{
          ...accountData,
          id_persona: personId
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts', personId] });
      setNewAccount({
        nombre_banco: "",
        numero_cuenta: "",
        url_evidencia: "",
        es_cuenta_fisica_para_stp: false
      });
      setIsAdding(false);
      toast({ title: "Cuenta bancaria agregada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al agregar cuenta bancaria", variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const { error } = await supabase
        .from('cuentas_bancarias')
        .update({ activo: false })
        .eq('id', accountId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bankAccounts', personId] });
      toast({ title: "Cuenta bancaria eliminada exitosamente" });
    },
    onError: () => {
      toast({ title: "Error al eliminar cuenta bancaria", variant: "destructive" });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccount.nombre_banco || !newAccount.numero_cuenta) {
      toast({ title: "Por favor completa los campos requeridos", variant: "destructive" });
      return;
    }
    addMutation.mutate(newAccount);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Cuentas Bancarias</h3>
        <Button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Cuenta
        </Button>
      </div>

      {isAdding && (
        <Card>
          <CardHeader>
            <CardTitle>Nueva Cuenta Bancaria</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="nombre_banco">Nombre del Banco *</Label>
                <Input
                  id="nombre_banco"
                  value={newAccount.nombre_banco}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, nombre_banco: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="numero_cuenta">Número de Cuenta *</Label>
                <Input
                  id="numero_cuenta"
                  value={newAccount.numero_cuenta}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, numero_cuenta: e.target.value }))}
                  required
                />
              </div>

              <div>
                <Label htmlFor="url_evidencia">URL de Evidencia</Label>
                <Input
                  id="url_evidencia"
                  type="url"
                  value={newAccount.url_evidencia}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, url_evidencia: e.target.value }))}
                />
              </div>

              {showStpCheckbox && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="es_cuenta_fisica_para_stp"
                    checked={newAccount.es_cuenta_fisica_para_stp}
                    onCheckedChange={(checked) => 
                      setNewAccount(prev => ({ ...prev, es_cuenta_fisica_para_stp: checked as boolean }))
                    }
                  />
                  <Label htmlFor="es_cuenta_fisica_para_stp">Es cuenta física para STP</Label>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={addMutation.isPending}>
                  {addMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAdding(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {bankAccounts.map((account) => (
          <Card key={account.id}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <p><strong>Banco:</strong> {account.nombre_banco}</p>
                  <p><strong>Número de Cuenta:</strong> {account.numero_cuenta}</p>
                  {account.url_evidencia && (
                    <p>
                      <strong>Evidencia:</strong>{" "}
                      <a 
                        href={account.url_evidencia} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Ver documento
                      </a>
                    </p>
                  )}
                  {showStpCheckbox && account.es_cuenta_fisica_para_stp && (
                    <p className="text-sm text-muted-foreground">✓ Cuenta física para STP</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => deleteMutation.mutate(account.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {bankAccounts.length === 0 && !isAdding && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-muted-foreground">No hay cuentas bancarias registradas</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}