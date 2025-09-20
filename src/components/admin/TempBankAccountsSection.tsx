import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageUploadField } from "@/components/admin/ImageUploadField";

interface TempBankAccount {
  tempId: string;
  id_banco: string;
  numero_cuenta: string;
  cuenta_clabe: string;
  cuenta_swift: string;
  url_evidencia: string;
  es_cuenta_fisica_para_stp: boolean;
}

interface TempBankAccountsSectionProps {
  bankAccounts: TempBankAccount[];
  onBankAccountsChange: (accounts: TempBankAccount[]) => void;
  showStpCheckbox?: boolean;
  entityTypeId?: number;
}

export function TempBankAccountsSection({ bankAccounts, onBankAccountsChange, showStpCheckbox = false, entityTypeId }: TempBankAccountsSectionProps) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [newAccount, setNewAccount] = useState({
    id_banco: "",
    numero_cuenta: "",
    cuenta_clabe: "",
    cuenta_swift: "",
    url_evidencia: "",
    es_cuenta_fisica_para_stp: false
  });

  // Fetch available banks
  const { data: banks = [] } = useQuery({
    queryKey: ['banks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bancos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      
      if (error) throw error;
      return data || [];
    }
  });

  const shouldShowStpCheckbox = showStpCheckbox && 
    entityTypeId && 
    (entityTypeId === 4 || entityTypeId === 15); // "Dueño Vendedor" or "Aportante"

  const existingStpAccount = bankAccounts.find(account => account.es_cuenta_fisica_para_stp);

  const handleAdd = () => {
    if (!newAccount.id_banco || !newAccount.numero_cuenta) {
      toast({ title: "Por favor completa los campos requeridos", variant: "destructive" });
      return;
    }

    // Validate account number length based on STP checkbox
    const accountLength = newAccount.numero_cuenta.length;
    if (newAccount.es_cuenta_fisica_para_stp) {
      if (accountLength !== 18) {
        toast({ 
          title: "Error de validación", 
          description: "Las cuentas STP deben tener exactamente 18 dígitos",
          variant: "destructive" 
        });
        return;
      }
    } else {
      if (accountLength < 8 || accountLength > 34) {
        toast({ 
          title: "Error de validación", 
          description: "El número de cuenta debe tener entre 8 y 34 caracteres",
          variant: "destructive" 
        });
        return;
      }
    }

    // If trying to set STP account, check if another exists
    if (newAccount.es_cuenta_fisica_para_stp && existingStpAccount) {
      toast({ title: "Solo puede haber una cuenta STP por proyecto", variant: "destructive" });
      return;
    }

    const tempAccount: TempBankAccount = {
      tempId: Date.now().toString(),
      ...newAccount,
      url_evidencia: newAccount.url_evidencia || "",
      cuenta_clabe: newAccount.cuenta_clabe || "",
      cuenta_swift: newAccount.cuenta_swift || ""
    };

    onBankAccountsChange([...bankAccounts, tempAccount]);
    
    setNewAccount({
      id_banco: "",
      numero_cuenta: "",
      cuenta_clabe: "",
      cuenta_swift: "",
      url_evidencia: "",
      es_cuenta_fisica_para_stp: false
    });
    setIsAdding(false);
    toast({ title: "Cuenta bancaria agregada temporalmente" });
  };

  const handleRemove = (tempId: string) => {
    onBankAccountsChange(bankAccounts.filter(acc => acc.tempId !== tempId));
    toast({ title: "Cuenta bancaria eliminada" });
  };

  const getBankName = (bankId: string) => {
    const bank = banks.find(b => b.id.toString() === bankId);
    return bank?.nombre || 'N/A';
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Cuentas Bancarias</h3>
        <Button
          onClick={() => setIsAdding(true)}
          disabled={isAdding}
          type="button"
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
            <div className="space-y-4">
              <div>
                <Label htmlFor="id_banco">Banco *</Label>
                <Select 
                  value={newAccount.id_banco} 
                  onValueChange={(value) => setNewAccount(prev => ({ ...prev, id_banco: value }))}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((bank) => (
                      <SelectItem key={bank.id} value={bank.id.toString()}>
                        {bank.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="numero_cuenta">Número de Cuenta *</Label>
                <Input
                  id="numero_cuenta"
                  value={newAccount.numero_cuenta}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, numero_cuenta: e.target.value }))}
                  placeholder={newAccount.es_cuenta_fisica_para_stp ? "18 dígitos exactos" : "Entre 8 y 34 caracteres"}
                  maxLength={18}
                  required
                />
              </div>

              <div>
                <Label htmlFor="cuenta_clabe">CLABE</Label>
                <Input
                  id="cuenta_clabe"
                  value={newAccount.cuenta_clabe}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, cuenta_clabe: e.target.value }))}
                  placeholder="18 dígitos (opcional)"
                  maxLength={18}
                />
              </div>

              <div>
                <Label htmlFor="cuenta_swift">Código SWIFT</Label>
                <Input
                  id="cuenta_swift"
                  value={newAccount.cuenta_swift}
                  onChange={(e) => setNewAccount(prev => ({ ...prev, cuenta_swift: e.target.value }))}
                  placeholder="8 u 11 caracteres (opcional)"
                />
              </div>

              <ImageUploadField
                label="Evidencia"
                value={newAccount.url_evidencia}
                onChange={(url) => setNewAccount(prev => ({ ...prev, url_evidencia: url }))}
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              />

              {shouldShowStpCheckbox && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="es_cuenta_fisica_para_stp"
                    checked={newAccount.es_cuenta_fisica_para_stp}
                    onCheckedChange={(checked) => 
                      setNewAccount(prev => ({ ...prev, es_cuenta_fisica_para_stp: checked as boolean }))
                    }
                    disabled={!!existingStpAccount}
                  />
                  <Label htmlFor="es_cuenta_fisica_para_stp">
                    Es cuenta física para STP
                    {existingStpAccount && (
                      <span className="text-xs text-muted-foreground block">
                        (Solo puede haber una cuenta STP por proyecto)
                      </span>
                    )}
                  </Label>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" onClick={handleAdd}>
                  Agregar
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAdding(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {bankAccounts.map((account) => (
          <Card key={account.tempId}>
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <p><strong>Banco:</strong> {getBankName(account.id_banco)}</p>
                  <p><strong>Número de Cuenta:</strong> {account.numero_cuenta}</p>
                  {account.cuenta_clabe && (
                    <p><strong>CLABE:</strong> {account.cuenta_clabe}</p>
                  )}
                  {account.cuenta_swift && (
                    <p><strong>SWIFT:</strong> {account.cuenta_swift}</p>
                  )}
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
                   {shouldShowStpCheckbox && account.es_cuenta_fisica_para_stp && (
                    <p className="text-sm text-green-600 font-medium">✓ Cuenta física para STP</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleRemove(account.tempId)}
                  type="button"
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