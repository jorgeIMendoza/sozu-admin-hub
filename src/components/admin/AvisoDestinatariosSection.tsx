import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Users, Mail, ChevronDown, ChevronUp, Search, CheckSquare, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Destinatario {
  nombre: string;
  email: string;
}

interface PoolItem {
  nombre: string;
  email: string;
  rolIds: number[]; // roles this recipient belongs to ("manual" = empty)
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
  const [statusFilter, setStatusFilter] = useState<"all" | "selected" | "unselected">("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [pool, setPool] = useState<PoolItem[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());

  // Sync from parent on mount
  useEffect(() => {
    if (destinatarios.length > 0) {
      setPool(prev => {
        const merged = [...prev];
        for (const d of destinatarios) {
          if (!merged.some(p => p.email === d.email)) {
            merged.push({ ...d, rolIds: [] });
          }
        }
        return merged;
      });
      setSelectedEmails(new Set(destinatarios.map(d => d.email)));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const notifyParent = useCallback((newSelected: Set<string>, currentPool: PoolItem[]) => {
    const selected = currentPool
      .filter(d => newSelected.has(d.email))
      .map(d => ({ nombre: d.nombre, email: d.email }));
    onDestinatariosChange(selected);
  }, [onDestinatariosChange]);

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
        let addedCount = 0;
        const updatedPool = [...pool];

        for (const u of usuarios) {
          if (!u.email) continue;
          const existing = updatedPool.find(p => p.email === u.email);
          if (existing) {
            if (!existing.rolIds.includes(rolId)) existing.rolIds.push(rolId);
          } else {
            updatedPool.push({ nombre: u.nombre || u.email, email: u.email, rolIds: [rolId] });
            addedCount++;
          }
        }

        setPool(updatedPool);

        const newSelected = new Set(selectedEmails);
        for (const u of usuarios) {
          if (u.email) newSelected.add(u.email);
        }
        setSelectedEmails(newSelected);
        notifyParent(newSelected, updatedPool);

        if (addedCount > 0) {
          toast({
            title: `${addedCount} destinatarios agregados`,
            description: `Se cargaron los usuarios activos del rol seleccionado`,
          });
        }
      }
      setLoadingRolId(null);
    }
  };

  const toggleEmail = (email: string) => {
    const newSelected = new Set(selectedEmails);
    if (newSelected.has(email)) newSelected.delete(email);
    else newSelected.add(email);
    setSelectedEmails(newSelected);
    notifyParent(newSelected, pool);
  };

  const selectAll = () => {
    const all = new Set(pool.map(d => d.email));
    setSelectedEmails(all);
    notifyParent(all, pool);
  };

  const deselectAll = () => {
    setSelectedEmails(new Set());
    onDestinatariosChange([]);
  };

  const addManual = () => {
    if (!manualEmail.trim()) {
      toast({ title: "Error", description: "El email es requerido", variant: "destructive" });
      return;
    }
    if (pool.some((d) => d.email === manualEmail.trim())) {
      toast({ title: "Error", description: "Este email ya está en la lista", variant: "destructive" });
      return;
    }
    const newItem: PoolItem = { nombre: manualNombre.trim() || manualEmail.trim(), email: manualEmail.trim(), rolIds: [] };
    const updatedPool = [...pool, newItem];
    setPool(updatedPool);
    const newSelected = new Set(selectedEmails);
    newSelected.add(newItem.email);
    setSelectedEmails(newSelected);
    notifyParent(newSelected, updatedPool);
    setManualNombre("");
    setManualEmail("");
  };

  // Roles that have items in the pool (for filter dropdown)
  const rolesInPool = roles.filter(r => pool.some(p => p.rolIds.includes(r.id)));
  const hasManualItems = pool.some(p => p.rolIds.length === 0);

  const VISIBLE_COUNT = 10;
  const filteredPool = pool.filter(d => {
    const matchesSearch = d.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "selected" && selectedEmails.has(d.email)) ||
      (statusFilter === "unselected" && !selectedEmails.has(d.email));
    const matchesRole = roleFilter === "all" ||
      (roleFilter === "manual" && d.rolIds.length === 0) ||
      d.rolIds.includes(Number(roleFilter));
    return matchesSearch && matchesStatus && matchesRole;
  });
  const visibleItems = showAll ? filteredPool : filteredPool.slice(0, VISIBLE_COUNT);
  const hasMore = filteredPool.length > VISIBLE_COUNT;
  const selectedCount = selectedEmails.size;

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
          <Input placeholder="Nombre" value={manualNombre} onChange={(e) => setManualNombre(e.target.value)} className="flex-1" />
          <Input placeholder="Email *" type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addManual())} />
          <Button type="button" size="icon" variant="outline" onClick={addManual}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Destinatarios list */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Label>Destinatarios</Label>
          <Badge variant="secondary" className="text-xs">
            <Mail className="h-3 w-3 mr-1" />
            {selectedCount} de {pool.length} seleccionado{selectedCount !== 1 ? "s" : ""}
          </Badge>
          {pool.length > 0 && (
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={selectAll}>
                <CheckSquare className="h-3 w-3 mr-1" /> Todos
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:text-destructive" onClick={deselectAll}>
                <Square className="h-3 w-3 mr-1" /> Ninguno
              </Button>
            </div>
          )}
        </div>
        {pool.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o email..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setShowAll(false); }}
                className="text-sm pl-8 h-8"
              />
            </div>
            {(rolesInPool.length > 0 || hasManualItems) && (
              <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setShowAll(false); }}>
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue placeholder="Filtrar rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los roles</SelectItem>
                  {rolesInPool.map(r => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.nombre}</SelectItem>
                  ))}
                  {hasManualItems && <SelectItem value="manual">Manual</SelectItem>}
                </SelectContent>
              </Select>
            )}
            <div className="flex border rounded-md overflow-hidden shrink-0">
              {([
                { value: "all" as const, label: "Todos" },
                { value: "selected" as const, label: "✓" },
                { value: "unselected" as const, label: "✗" },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setStatusFilter(opt.value); setShowAll(false); }}
                  className={`px-2 h-8 text-xs transition-colors ${
                    statusFilter === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="border rounded p-2 max-h-72 overflow-y-auto space-y-0.5">
          {pool.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Selecciona roles o agrega destinatarios manualmente
            </p>
          ) : filteredPool.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              No se encontraron resultados
            </p>
          ) : (
            <>
              {visibleItems.map((d) => {
                const isSelected = selectedEmails.has(d.email);
                const rolNames = d.rolIds.length > 0
                  ? d.rolIds.map(rid => roles.find(r => r.id === rid)?.nombre).filter(Boolean).join(", ")
                  : "Manual";
                return (
                  <label
                    key={d.email}
                    className={`flex items-center gap-2 text-sm rounded px-2 py-1.5 cursor-pointer transition-colors ${
                      isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox checked={isSelected} onCheckedChange={() => toggleEmail(d.email)} className="shrink-0" />
                    <span className="truncate flex-1">
                      <span className="font-medium">{d.nombre}</span>
                      <span className="text-muted-foreground ml-1 text-xs">({d.email})</span>
                    </span>
                    <Badge variant="outline" className="text-[10px] shrink-0 h-5">{rolNames}</Badge>
                  </label>
                );
              })}
              {hasMore && (
                <Button type="button" variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => setShowAll(!showAll)}>
                  {showAll ? (
                    <><ChevronUp className="h-3 w-3 mr-1" /> Mostrar menos</>
                  ) : (
                    <><ChevronDown className="h-3 w-3 mr-1" /> Ver {filteredPool.length - VISIBLE_COUNT} más</>
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
