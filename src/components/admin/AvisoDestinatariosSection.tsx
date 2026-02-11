import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Plus, Loader2, Users, Mail, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Destinatario {
  nombre: string;
  email: string;
}

interface Rol {
  id: number;
  nombre: string;
}

interface Props {
  roles: Rol[];
  selectedRoles: number[];
  onToggleRole: (rolId: number) => void;
  destinatarios: Destinatario[];
  onDestinatariosChange: (destinatarios: Destinatario[]) => void;
}

export function AvisoDestinatariosSection({
  roles,
  selectedRoles,
  onToggleRole,
  destinatarios,
  onDestinatariosChange,
}: Props) {
  const { toast } = useToast();
  const [loadingRolId, setLoadingRolId] = useState<number | null>(null);
  const [manualNombre, setManualNombre] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const handleToggleRole = async (rolId: number) => {
    const wasSelected = selectedRoles.includes(rolId);
    onToggleRole(rolId);

    if (!wasSelected) {
      setLoadingRolId(rolId);
      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("nombre, email")
        .eq("rol_id", rolId)
        .eq("activo", true)
        .not("email", "is", null);

      if (usuarios && usuarios.length > 0) {
        const newDestinatarios = usuarios
          .filter((u) => u.email && !destinatarios.some((d) => d.email === u.email))
          .map((u) => ({
            nombre: u.nombre || u.email,
            email: u.email!,
          }));

        if (newDestinatarios.length > 0) {
          onDestinatariosChange([...destinatarios, ...newDestinatarios]);
          toast({
            title: `${newDestinatarios.length} destinatarios agregados`,
            description: `Se cargaron los usuarios activos del rol seleccionado`,
          });
        }
      }
      setLoadingRolId(null);
    }
  };

  const removeDestinatario = (email: string) => {
    onDestinatariosChange(destinatarios.filter((d) => d.email !== email));
  };

  const addManual = () => {
    if (!manualEmail.trim()) {
      toast({ title: "Error", description: "El email es requerido", variant: "destructive" });
      return;
    }
    if (destinatarios.some((d) => d.email === manualEmail.trim())) {
      toast({ title: "Error", description: "Este email ya está en la lista", variant: "destructive" });
      return;
    }
    onDestinatariosChange([
      ...destinatarios,
      { nombre: manualNombre.trim() || manualEmail.trim(), email: manualEmail.trim() },
    ]);
    setManualNombre("");
    setManualEmail("");
  };

  const VISIBLE_COUNT = 5;
  const filteredDestinatarios = destinatarios.filter(d =>
    d.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const visibleDestinatarios = showAll ? filteredDestinatarios : filteredDestinatarios.slice(0, VISIBLE_COUNT);
  const hasMore = filteredDestinatarios.length > VISIBLE_COUNT;

  return (
    <div className="space-y-4">
      {/* Roles selection */}
      <div>
        <Label>Roles Destinatarios</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Al seleccionar un rol, se precargan sus usuarios activos como destinatarios.
        </p>
        <div className="grid grid-cols-2 gap-1 mt-1 max-h-40 overflow-y-auto border rounded p-2">
          {roles.map((rol) => (
            <label
              key={rol.id}
              className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted p-1 rounded"
            >
              <input
                type="checkbox"
                checked={selectedRoles.includes(rol.id)}
                onChange={() => handleToggleRole(rol.id)}
                className="rounded"
              />
              {rol.nombre}
              {loadingRolId === rol.id && <Loader2 className="h-3 w-3 animate-spin" />}
            </label>
          ))}
        </div>
      </div>

      {/* Manual add */}
      <div>
        <Label>Agregar destinatario manual</Label>
        <div className="flex gap-2 mt-1">
          <Input
            placeholder="Nombre"
            value={manualNombre}
            onChange={(e) => setManualNombre(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Email *"
            type="email"
            value={manualEmail}
            onChange={(e) => setManualEmail(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addManual())}
          />
          <Button type="button" size="icon" variant="outline" onClick={addManual}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Destinatarios list */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Label>Destinatarios</Label>
          <Badge variant="secondary" className="text-xs">
            <Mail className="h-3 w-3 mr-1" />
            {destinatarios.length} correo{destinatarios.length !== 1 ? "s" : ""}
          </Badge>
          {destinatarios.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-destructive hover:text-destructive"
              onClick={() => onDestinatariosChange([])}
            >
              Limpiar todos
            </Button>
          )}
        </div>
        <div className="mb-2">
          <Input
            placeholder="Buscar por nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="border rounded p-2 max-h-64 overflow-y-auto space-y-1">
          {destinatarios.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Selecciona roles o agrega destinatarios manualmente
            </p>
          ) : (
            <>
              {visibleDestinatarios.map((d) => (
                <div
                  key={d.email}
                  className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1 group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Mail className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate">
                      <span className="font-medium">{d.nombre}</span>
                      <span className="text-muted-foreground ml-1 text-xs">({d.email})</span>
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 opacity-50 group-hover:opacity-100"
                    onClick={() => removeDestinatario(d.email)}
                    title="Quitar destinatario"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {hasMore && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs h-7"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? (
                    <>
                   <ChevronUp className="h-3 w-3 mr-1" /> Mostrar menos
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3 mr-1" /> Ver {filteredDestinatarios.length - VISIBLE_COUNT} más
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
