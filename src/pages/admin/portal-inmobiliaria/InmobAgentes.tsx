import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { useInmobiliariaPersonaId } from "@/hooks/useInmobiliariaPersonaId";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PhoneDisplay } from "@/components/admin/PhoneDisplay";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Users, TrendingUp, FileText, ShoppingCart, MoreHorizontal, Eye, Pencil, Power, KeyRound, FolderOpen, HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(v);

const NAV_PREFIX = "/admin/portal-inmobiliaria";

export default function InmobAgentes() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { profile } = useAuth();
  const { data: agents = [], isLoading: agentsLoading } = useInmobAgents();
  const { personaId } = useInmobiliariaPersonaId();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [activeTab, setActiveTab] = useState<"activos" | "desactivados">("activos");
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const currentUserEmail = (profile?.email || "").toLowerCase();

  const { data: isSozu = false } = useQuery({
    queryKey: ["inmob-agentes-is-sozu", personaId],
    queryFn: async () => {
      if (!personaId) return false;
      const { data } = await supabase
        .from("personas")
        .select("nombre_legal")
        .eq("id", personaId)
        .maybeSingle() as any;
      const nombreLegal = (data?.nombre_legal || "").toLowerCase();
      return nombreLegal.includes("real estate ventures");
    },
    enabled: !!personaId,
    staleTime: 10 * 60_000,
  });

  // Edit dialog state
  const [editAgent, setEditAgent] = useState<any | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Project access dialog state
  const [projectAccessAgent, setProjectAccessAgent] = useState<any | null>(null);

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/agentes");
    track({ page: "inmob_agentes", elementId: "page_view", elementType: "page" });
  }, []);

  useEffect(() => {
    const q = searchParams.get("q") || "";
    setSearch(q);
  }, [searchParams]);

  const { data: sozuExtraUsers = [] } = useQuery({
    queryKey: ["inmob-agentes-sozu-extra-users", personaId, agents.map(a => a.email).join(",")],
    queryFn: async () => {
      if (!personaId || !isSozu) return [];

      const baseAgentEmailSet = new Set(agents.map(a => a.email.toLowerCase()));

      const { data: inmobUsers } = await supabase
        .from("usuarios")
        .select("email")
        .eq("id_persona", personaId)
        .eq("activo", true) as any;

      const inmobEmails = (inmobUsers || []).map((u: any) => u.email).filter(Boolean);
      if (!inmobEmails.length) return [];

      const { data: paRows } = await supabase
        .from("proyectos_acceso")
        .select("proyecto_id")
        .in("usuario_id", inmobEmails)
        .eq("activo", true) as any;

      const projectIds = [...new Set((paRows || []).map((r: any) => r.proyecto_id).filter(Boolean))] as number[];
      if (!projectIds.length) return [];

      const { data: edificios } = await supabase
        .from("edificios")
        .select("id")
        .in("id_proyecto", projectIds)
        .eq("activo", true) as any;

      const edificioIds = (edificios || []).map((e: any) => e.id);
      if (!edificioIds.length) return [];

      const { data: edifModelos } = await supabase
        .from("edificios_modelos")
        .select("id")
        .in("id_edificio", edificioIds)
        .eq("activo", true) as any;

      const emIds = (edifModelos || []).map((m: any) => m.id);
      if (!emIds.length) return [];

      const propIds: number[] = [];
      for (let i = 0; i < emIds.length; i += 200) {
        const batch = emIds.slice(i, i + 200);
        const { data: props } = await supabase
          .from("propiedades")
          .select("id")
          .in("id_edificio_modelo", batch)
          .eq("activo", true) as any;
        if (props?.length) propIds.push(...props.map((p: any) => p.id));
      }

      if (!propIds.length) return [];

      const creatorEmails = new Set<string>();
      for (let i = 0; i < propIds.length; i += 200) {
        const batch = propIds.slice(i, i + 200);
        const { data: offers } = await supabase
          .from("ofertas")
          .select("email_creador")
          .in("id_propiedad", batch)
          .eq("activo", true) as any;

        (offers || []).forEach((o: any) => {
          const email = (o.email_creador || "").toLowerCase();
          if (email) creatorEmails.add(email);
        });
      }

      const unknownEmails = [...creatorEmails].filter((e) => !baseAgentEmailSet.has(e));
      if (!unknownEmails.length) return [];

      const { data: usuarios } = await supabase
        .from("usuarios")
        .select("email, id_persona, activo, rol_id")
        .in("email", unknownEmails) as any;

      if (!usuarios?.length) return [];

      const personaIds = [...new Set(usuarios.map((u: any) => u.id_persona).filter(Boolean))] as number[];
      const personaMap = new Map<number, any>();
      if (personaIds.length) {
        const [{ data: personas }, { data: rels }] = await Promise.all([
          supabase
            .from("personas")
            .select("id, nombre_legal, nombre_comercial, telefono, clave_pais_telefono")
            .in("id", personaIds) as any,
          supabase
            .from("entidades_relacionadas")
            .select("id_persona, id_persona_duena_lead")
            .in("id_persona", personaIds)
            .eq("id_tipo_entidad", 19)
            .eq("activo", true) as any,
        ]);
        (personas || []).forEach((p: any) => personaMap.set(p.id, p));

        const ownerByPersona = new Map<number, number | null>();
        (rels || []).forEach((r: any) => ownerByPersona.set(r.id_persona, r.id_persona_duena_lead ?? null));

        return usuarios
          .filter((u: any) => {
            if (u.rol_id === 3) {
              const ownerId = ownerByPersona.get(u.id_persona);
              // Only include if linked to this inmobiliaria (Sozu)
              return ownerId === personaId;
            }
            if (u.rol_id === 9) {
              // Include agentes internos only if linked to this inmobiliaria
              const ownerId = ownerByPersona.get(u.id_persona);
              return ownerId === personaId;
            }
            // Other roles (staff) - include as internal users
            return true;
          })
          .map((u: any) => {
            const p = personaMap.get(u.id_persona);
            return {
              email: u.email,
              personaId: u.id_persona,
              nombre: p?.nombre_legal || p?.nombre_comercial || u.email,
              telefono: p?.telefono || "",
              clavePaisTelefono: p?.clave_pais_telefono || "",
              activo: u.activo ?? true,
              roleId: u.rol_id,
              isInternal: u.rol_id !== 3 && u.rol_id !== 9,
            };
          });
      }

      return [];
    },
    enabled: !!personaId && isSozu,
    staleTime: 5 * 60_000,
  });

  // Fetch inmobiliaria info for base agents to show their inmobiliaria name or "independent"
  const { data: agentInmobMap = new Map() } = useQuery({
    queryKey: ["inmob-agentes-inmob-info", agents.map(a => a.personaId).join(",")],
    queryFn: async () => {
      const pIds = agents.map(a => a.personaId).filter(Boolean);
      if (!pIds.length) return new Map<number, string | null>();

      const { data: rels } = await supabase
        .from("entidades_relacionadas")
        .select("id_persona, id_persona_duena_lead")
        .in("id_persona", pIds)
        .eq("id_tipo_entidad", 19)
        .eq("activo", true) as any;

      const ownerIds = [...new Set((rels || []).map((r: any) => r.id_persona_duena_lead).filter(Boolean))] as number[];
      const ownerNames = new Map<number, string>();
      if (ownerIds.length) {
        const { data: personas } = await supabase
          .from("personas")
          .select("id, nombre_comercial, nombre_legal")
          .in("id", ownerIds) as any;
        (personas || []).forEach((p: any) => ownerNames.set(p.id, p.nombre_comercial || p.nombre_legal || ""));
      }

      const result = new Map<number, string | null>();
      (rels || []).forEach((r: any) => {
        const name = r.id_persona_duena_lead ? (ownerNames.get(r.id_persona_duena_lead) || null) : null;
        result.set(r.id_persona, name);
      });
      // Mark agents without a relation as independent
      pIds.forEach(pid => {
        if (!result.has(pid)) result.set(pid, null);
      });
      return result;
    },
    enabled: agents.length > 0,
    staleTime: 5 * 60_000,
  });

  const filteredBaseAgents = useMemo(() => agents, [agents]);

  const allAgents = useMemo(() => {
    const byEmail = new Map<string, any>();
    // For base agents, enrich with inmobiliaria info
    filteredBaseAgents.forEach((a) => {
      const inmobName = agentInmobMap.get(a.personaId);
      const isIndependent = agentInmobMap.has(a.personaId) && inmobName === null;
      // For non-Sozu inmobiliarias, exclude agents that belong to a DIFFERENT inmobiliaria
      if (!isSozu && inmobName && inmobName !== "" && agentInmobMap.get(a.personaId) !== undefined) {
        // The agent has an inmobiliaria - only include if it matches current inmobiliaria
        // Base agents from useInmobAgents are already filtered, so include all
      }
      byEmail.set(a.email.toLowerCase(), {
        ...a,
        inmobiliariaName: inmobName || null,
        isIndependent,
      });
    });
    sozuExtraUsers.forEach((u: any) => {
      const key = (u.email || "").toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, u);
    });
    return [...byEmail.values()].filter((a: any) => (a.email || "").toLowerCase() !== currentUserEmail);
  }, [filteredBaseAgents, sozuExtraUsers, currentUserEmail, agentInmobMap, isSozu]);

  const agentEmails = useMemo(() => allAgents.map((a) => a.email), [allAgents]);

  const fetchAllPaginated = async <T,>(buildQuery: () => any, pageSize = 1000): Promise<T[]> => {
    let from = 0;
    const allRows: T[] = [];

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await buildQuery().range(from, to);
      if (error) throw error;

      const rows = (data || []) as T[];
      if (!rows.length) break;
      allRows.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return allRows;
  };

  // ───── Fetch all ofertas with fields needed for stage classification ─────
  const { data: allOfertas = [], isLoading: ofertasLoading } = useQuery({
    queryKey: ["inmob-agentes-ofertas-full", agentEmails],
    queryFn: async () => {
      if (!agentEmails.length) return [];
      return fetchAllPaginated<any>(() =>
        supabase
          .from("ofertas")
          .select("id, email_creador, id_estatus_aprobacion, id_propiedad, id_producto, id_esquema_pago_seleccionado, fecha_generacion")
          .in("email_creador", agentEmails)
          .eq("activo", true)
      );
    },
    enabled: agentEmails.length > 0,
    staleTime: 3 * 60_000,
  });

  // Property data for stage classification
  const ofertaPropIds = useMemo(() => [...new Set(allOfertas.map((o: any) => o.id_propiedad).filter(Boolean))] as number[], [allOfertas]);
  const { data: propMap = new Map() } = useQuery({
    queryKey: ["inmob-agentes-props", ofertaPropIds],
    queryFn: async () => {
      if (!ofertaPropIds.length) return new Map<number, any>();
      const m = new Map<number, any>();
      for (let i = 0; i < ofertaPropIds.length; i += 200) {
        const batch = ofertaPropIds.slice(i, i + 200);
        const { data } = await supabase
          .from("propiedades")
          .select("id, id_estatus_disponibilidad")
          .in("id", batch) as any;
        (data || []).forEach((p: any) => m.set(p.id, p));
      }
      return m;
    },
    enabled: ofertaPropIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Cuentas cobranza for stage classification
  const allOfertaIds = useMemo(() => allOfertas.map((o: any) => o.id), [allOfertas]);
  const { data: cuentasMap = new Map() } = useQuery({
    queryKey: ["inmob-agentes-cuentas", allOfertaIds],
    queryFn: async () => {
      if (!allOfertaIds.length) return new Map<number, any>();
      const m = new Map<number, any>();
      for (let i = 0; i < allOfertaIds.length; i += 200) {
        const batch = allOfertaIds.slice(i, i + 200);
        const { data } = await (supabase as any)
          .from("cuentas_cobranza")
          .select("id, id_oferta, precio_final, contrato_draft")
          .in("id_oferta", batch)
          .eq("activo", true);
        (data || []).forEach((c: any) => { if (c.id_oferta) m.set(c.id_oferta, c); });
      }
      // Check signed contracts (tipo_documento 42)
      const cuentaIds = [...m.values()].map((c: any) => c.id);
      if (cuentaIds.length > 0) {
        const firmadoSet = new Set<number>();
        for (let i = 0; i < cuentaIds.length; i += 200) {
          const batch = cuentaIds.slice(i, i + 200);
          const { data: docs } = await supabase
            .from("documentos")
            .select("id_cuenta_cobranza")
            .in("id_cuenta_cobranza", batch)
            .eq("id_tipo_documento", 42)
            .eq("activo", true) as any;
          (docs || []).forEach((d: any) => firmadoSet.add(d.id_cuenta_cobranza));
        }
        m.forEach((c, key) => { c.tiene_contrato_firmado = firmadoSet.has(c.id); });
      }
      return m;
    },
    enabled: allOfertaIds.length > 0,
    staleTime: 3 * 60_000,
  });

  // Fetch comisionistas to compute commission per agent
  const allCuentaIds = useMemo(() => {
    const ids: number[] = [];
    cuentasMap.forEach((c: any) => { if (c?.id) ids.push(c.id); });
    return ids;
  }, [cuentasMap]);

  // Build reverse map: cuentaId → email_creador (agent who made the offer)
  const cuentaToCreator = useMemo(() => {
    const m = new Map<number, string>();
    allOfertas.forEach((o: any) => {
      const cuenta = cuentasMap.get(o.id);
      if (cuenta?.id) {
        m.set(cuenta.id, (o.email_creador || "").toLowerCase());
      }
    });
    return m;
  }, [allOfertas, cuentasMap]);

  const { data: comisionistasResult = { byEmail: new Map<string, number>(), byCuenta: new Map<number, number>() } } = useQuery({
    queryKey: ["inmob-agentes-comisionistas", allCuentaIds],
    queryFn: async () => {
      if (!allCuentaIds.length) return { byEmail: new Map<string, number>(), byCuenta: new Map<number, number>() };
      const allCom: any[] = [];
      for (let i = 0; i < allCuentaIds.length; i += 200) {
        const batch = allCuentaIds.slice(i, i + 200);
        const { data } = await (supabase as any)
          .from("comisionistas")
          .select("email_usuario, porcentaje_comision, id_cuenta_cobranza")
          .in("id_cuenta_cobranza", batch)
          .eq("activo", true);
        if (data) allCom.push(...data);
      }
      const precioMap = new Map<number, number>();
      cuentasMap.forEach((c: any) => { precioMap.set(c.id, Number(c.precio_final) || 0); });
      const byEmail = new Map<string, number>();
      const byCuenta = new Map<number, number>();
      allCom.forEach((c: any) => {
        const precio = precioMap.get(c.id_cuenta_cobranza) || 0;
        const monto = (Number(c.porcentaje_comision) || 0) / 100 * precio;
        const creatorEmail = cuentaToCreator.get(c.id_cuenta_cobranza) || "";
        if (creatorEmail) {
          byEmail.set(creatorEmail, (byEmail.get(creatorEmail) || 0) + monto);
        }
        byCuenta.set(c.id_cuenta_cobranza, (byCuenta.get(c.id_cuenta_cobranza) || 0) + monto);
      });
      return { byEmail, byCuenta };
    },
    enabled: allCuentaIds.length > 0,
    staleTime: 3 * 60_000,
  });
  const comisionistasByEmail = comisionistasResult.byEmail;
  const comisionByCuenta = comisionistasResult.byCuenta;

  // ───── Stage classification (same logic as Dashboard) ─────
  const classifyOffer = (o: any) => {
    const p = propMap.get(o.id_propiedad);
    const cuenta = cuentasMap.get(o.id);
    if (p?.id_estatus_disponibilidad === 5) return "cierre";
    if (cuenta?.tiene_contrato_firmado) return "firma_contrato";
    if (cuenta?.contrato_draft) return "gen_contrato";
    if (cuenta && p?.id_estatus_disponibilidad === 4) return "apartado";
    const fecha = new Date(o.fecha_generacion);
    const expira = new Date(fecha); expira.setDate(expira.getDate() + 5);
    const vigente = expira >= new Date();
    if (!vigente && !cuenta) return "expiradas";
    if (!o.id_esquema_pago_seleccionado) return vigente ? "nuevas" : "expiradas";
    if (o.id_estatus_aprobacion === 1) return vigente ? "pendientes" : "expiradas";
    if (o.id_estatus_aprobacion === 2) return "aprobadas";
    if (o.id_estatus_aprobacion === 3) return vigente ? "rechazadas" : "expiradas";
    if (o.id_estatus_aprobacion === 4) return vigente ? "revision" : "expiradas";
    return "nuevas";
  };

  // Classify and deduplicate ventas (cierre stage) per agent
  const { ofertasByAgent, ingresoByAgent, comisionByAgent } = useMemo(() => {
    const ofMap = new Map<string, { total: number; vendidas: number }>();
    // Classify all offers
    const classified = allOfertas.map((o: any) => ({ ...o, stage: classifyOffer(o) }));

    // Count total offers per agent (excluding expiradas to match dashboard)
    classified.forEach((o: any) => {
      const emailKey = (o.email_creador || "").toLowerCase();
      const cur = ofMap.get(emailKey) || { total: 0, vendidas: 0 };
      cur.total++;
      ofMap.set(emailKey, cur);
    });

    // Dedup cierre by property/product key (same as Dashboard)
    const cierreOffers = classified.filter((o: any) => o.stage === "cierre" && cuentasMap.has(o.id));
    const seenByAgent = new Map<string, Set<string>>();

    cierreOffers.forEach((o: any) => {
      const emailKey = (o.email_creador || "").toLowerCase();
      const key = o.id_producto
        ? `prod-${o.id_producto}-${o.id_propiedad || "none"}`
        : `prop-${o.id_propiedad}`;

      if (!seenByAgent.has(emailKey)) seenByAgent.set(emailKey, new Set());
      const seen = seenByAgent.get(emailKey)!;
      if (seen.has(key)) return;
      seen.add(key);

      // Count as venta
      const cur = ofMap.get(emailKey) || { total: 0, vendidas: 0 };
      cur.vendidas++;
      ofMap.set(emailKey, cur);
    });

    // Ingreso = sum of precio_final from cuentas for cierre offers
    const ingMap = new Map<string, number>();
    // Comisión = commission per agent from comisionistas
    const comMap = new Map<string, number>();

    // Build ingreso from cierre offers (deduped)
    seenByAgent.forEach((_, emailKey) => {
      const agentCierres = cierreOffers.filter((o: any) => (o.email_creador || "").toLowerCase() === emailKey);
      const seenKeys = new Set<string>();
      let totalIngreso = 0;
      agentCierres.forEach((o: any) => {
        const k = o.id_producto
          ? `prod-${o.id_producto}-${o.id_propiedad || "none"}`
          : `prop-${o.id_propiedad}`;
        if (seenKeys.has(k)) return;
        seenKeys.add(k);
        const cuenta = cuentasMap.get(o.id);
        totalIngreso += Number(cuenta?.precio_final) || 0;
      });
      ingMap.set(emailKey, totalIngreso);
    });

    comisionistasByEmail.forEach((monto, email) => {
      comMap.set(email, monto);
    });

    return { ofertasByAgent: ofMap, ingresoByAgent: ingMap, comisionByAgent: comMap };
  }, [allOfertas, propMap, cuentasMap, comisionistasByEmail]);

  // Build commission details per agent for expandable rows
  const commissionDetailsByAgent = useMemo(() => {
    const map = new Map<string, Array<{ ofertaId: number; cuentaId: number; precioFinal: number; montoComision: number; isProduct: boolean; propiedadId?: number; productoId?: number }>>();
    const classified = allOfertas.map((o: any) => ({ ...o, stage: classifyOffer(o) }));
    const cierres = classified.filter((o: any) => o.stage === "cierre" && cuentasMap.has(o.id));
    const seenByAgent = new Map<string, Set<string>>();

    cierres.forEach((o: any) => {
      const email = (o.email_creador || "").toLowerCase();
      const key = o.id_producto
        ? `prod-${o.id_producto}-${o.id_propiedad || "none"}`
        : `prop-${o.id_propiedad}`;
      if (!seenByAgent.has(email)) seenByAgent.set(email, new Set());
      if (seenByAgent.get(email)!.has(key)) return;
      seenByAgent.get(email)!.add(key);

      const cuenta = cuentasMap.get(o.id);
      if (!cuenta) return;

      if (!map.has(email)) map.set(email, []);
      map.get(email)!.push({
        ofertaId: o.id,
        cuentaId: cuenta.id,
        precioFinal: Number(cuenta.precio_final) || 0,
        montoComision: comisionByCuenta.get(cuenta.id) || 0,
        isProduct: !!o.id_producto,
        propiedadId: o.id_propiedad || undefined,
        productoId: o.id_producto || undefined,
      });
    });
    return map;
  }, [allOfertas, classifyOffer, cuentasMap, comisionByCuenta]);

  // Fetch property/project/product info for commission details
  const detailPropIds = useMemo(() => {
    const ids = new Set<number>();
    commissionDetailsByAgent.forEach((details) => details.forEach((d) => { if (d.propiedadId) ids.add(d.propiedadId); }));
    return [...ids];
  }, [commissionDetailsByAgent]);

  const detailProductIds = useMemo(() => {
    const ids = new Set<number>();
    commissionDetailsByAgent.forEach((details) => details.forEach((d) => { if (d.productoId) ids.add(d.productoId); }));
    return [...ids];
  }, [commissionDetailsByAgent]);

  const { data: propDetailMap = new Map<number, { numero: string; proyecto: string }>() } = useQuery({
    queryKey: ["inmob-agentes-prop-details", detailPropIds],
    queryFn: async () => {
      const m = new Map<number, { numero: string; proyecto: string }>();
      if (!detailPropIds.length) return m;
      const props: any[] = [];
      for (let i = 0; i < detailPropIds.length; i += 200) {
        const batch = detailPropIds.slice(i, i + 200);
        const { data } = await supabase
          .from("propiedades")
          .select("id, numero_propiedad, id_edificio_modelo")
          .in("id", batch) as any;
        if (data) props.push(...data);
      }

      const emIds = [...new Set(props.map((p: any) => p.id_edificio_modelo).filter(Boolean))] as number[];
      const emToEdificio = new Map<number, number>();
      for (let i = 0; i < emIds.length; i += 200) {
        const batch = emIds.slice(i, i + 200);
        const { data } = await supabase
          .from("edificios_modelos")
          .select("id, id_edificio")
          .in("id", batch) as any;
        (data || []).forEach((em: any) => emToEdificio.set(em.id, em.id_edificio));
      }

      const edificioIds = [...new Set([...emToEdificio.values()].filter(Boolean))] as number[];
      const edificioToProyecto = new Map<number, number>();
      for (let i = 0; i < edificioIds.length; i += 200) {
        const batch = edificioIds.slice(i, i + 200);
        const { data } = await supabase
          .from("edificios")
          .select("id, id_proyecto")
          .in("id", batch) as any;
        (data || []).forEach((ed: any) => edificioToProyecto.set(ed.id, ed.id_proyecto));
      }

      const proyectoIds = [...new Set([...edificioToProyecto.values()].filter(Boolean))] as number[];
      const proyectoMap = new Map<number, string>();
      for (let i = 0; i < proyectoIds.length; i += 200) {
        const batch = proyectoIds.slice(i, i + 200);
        const { data } = await supabase
          .from("proyectos")
          .select("id, nombre")
          .in("id", batch) as any;
        (data || []).forEach((proyecto: any) => proyectoMap.set(proyecto.id, proyecto.nombre || ""));
      }

      props.forEach((p: any) => {
        const edificioId = emToEdificio.get(p.id_edificio_modelo);
        const proyectoId = edificioId ? edificioToProyecto.get(edificioId) : undefined;
        m.set(p.id, {
          numero: String(p.numero_propiedad || ""),
          proyecto: proyectoId ? (proyectoMap.get(proyectoId) || "") : "",
        });
      });

      return m;
    },
    enabled: detailPropIds.length > 0,
    staleTime: 10 * 60_000,
  });

  const { data: productDetailMap = new Map<number, string>() } = useQuery({
    queryKey: ["inmob-agentes-product-details", detailProductIds],
    queryFn: async () => {
      const m = new Map<number, string>();
      if (!detailProductIds.length) return m;
      const { data } = await supabase.from("productos_servicios").select("id, nombre").in("id", detailProductIds) as any;
      (data || []).forEach((p: any) => m.set(p.id, p.nombre || "Producto"));
      return m;
    },
    enabled: detailProductIds.length > 0,
    staleTime: 10 * 60_000,
  });

  const ingresoLoading = false; // ingreso is now computed inline

  // Fetch prospectos históricos por agente (únicos por persona prospecto)
  const { data: prospectosByAgent = new Map(), isLoading: prospectosLoading } = useQuery({
    queryKey: ["inmob-agentes-prospectos", agentEmails],
    queryFn: async () => {
      if (!allAgents.length) return new Map<string, number>();
      const personaIds = allAgents.map((a) => a.personaId).filter(Boolean);
      if (!personaIds.length) return new Map<string, number>();

      const data = await fetchAllPaginated<any>(() =>
        supabase
          .from("entidades_relacionadas")
          .select("id_persona, id_persona_duena_lead")
          .in("id_persona_duena_lead", personaIds)
          .eq("id_tipo_entidad", 7)
          .eq("activo", true)
      );

      const personaToEmail = new Map<number, string>();
      allAgents.forEach((a) => {
        if (a.personaId) personaToEmail.set(Number(a.personaId), (a.email || "").toLowerCase());
      });

      const uniqueProspectsByEmail = new Map<string, Set<number>>();
      (data || []).forEach((d: any) => {
        const ownerPersonaId = Number(d.id_persona_duena_lead);
        const prospectPersonaId = Number(d.id_persona);
        if (!ownerPersonaId || !prospectPersonaId) return;

        const email = personaToEmail.get(ownerPersonaId);
        if (!email) return;

        if (!uniqueProspectsByEmail.has(email)) uniqueProspectsByEmail.set(email, new Set<number>());
        uniqueProspectsByEmail.get(email)!.add(prospectPersonaId);
      });

      const map = new Map<string, number>();
      uniqueProspectsByEmail.forEach((prospectSet, email) => {
        map.set(email, prospectSet.size);
      });
      return map;
    },
    enabled: agentEmails.length > 0 && allAgents.length > 0,
    staleTime: 3 * 60_000,
  });

  const isLoading = agentsLoading || ofertasLoading || prospectosLoading || ingresoLoading;

  // Separate active vs inactive
  const activeAgents = useMemo(() => allAgents.filter(a => a.activo), [allAgents]);
  const inactiveAgents = useMemo(() => allAgents.filter(a => !a.activo), [allAgents]);

  const filteredActiveAgents = useMemo(() => {
    if (!search) return activeAgents;
    const q = search.toLowerCase();
    return activeAgents.filter((a) => a.nombre.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [activeAgents, search]);

  const filteredInactiveAgents = useMemo(() => {
    if (!search) return inactiveAgents;
    const q = search.toLowerCase();
    return inactiveAgents.filter((a) => a.nombre.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [inactiveAgents, search]);

  const filteredAgents = activeTab === "activos" ? filteredActiveAgents : filteredInactiveAgents;

  // Summary KPIs (all agents)
  const totalAgentes = activeAgents.length;
  const totalOfertas = Array.from(ofertasByAgent.values()).reduce((s, v) => s + v.total, 0);
  const totalVendidas = Array.from(ofertasByAgent.values()).reduce((s, v) => s + v.vendidas, 0);
  const totalProspectos = Array.from(prospectosByAgent.values()).reduce((s, v) => s + v, 0);

  // Edit agent handlers
  const openEditDialog = (agent: any) => {
    setEditAgent(agent);
    setEditName(agent.nombre);
    setEditEmail(agent.email);
    setEditPhone(agent.telefono);
  };

  const handleSaveEdit = async () => {
    if (!editAgent) return;
    setSaving(true);
    try {
      const { error: personaError } = await supabase
        .from("personas")
        .update({ nombre_legal: editName, telefono: editPhone })
        .eq("id", editAgent.personaId) as any;
      if (personaError) throw personaError;

      const { error: userError } = await supabase
        .from("usuarios")
        .update({ nombre: editName })
        .eq("email", editAgent.email) as any;
      if (userError) throw userError;

      if (editEmail !== editAgent.email) {
        const { error: emailError } = await supabase
          .from("usuarios")
          .update({ email: editEmail })
          .eq("email", editAgent.email) as any;
        if (emailError) throw emailError;
      }

      toast.success("Agente actualizado correctamente");
      setEditAgent(null);
      queryClient.invalidateQueries({ queryKey: ["inmob-agents-full"] });
    } catch (err: any) {
      toast.error("Error al guardar: " + (err.message || "Intenta de nuevo"));
    } finally {
      setSaving(false);
    }
  };

  const resolveAgentEmails = async (agent: any): Promise<string[]> => {
    const normalizedEmail = (agent.email || "").trim().toLowerCase();
    const emails = new Set<string>();

    // First try by personaId (most reliable)
    if (agent.personaId) {
      const { data: byPersona } = await supabase
        .from("usuarios")
        .select("email")
        .eq("id_persona", agent.personaId) as any;
      (byPersona || []).forEach((u: any) => {
        if (u.email) emails.add(String(u.email).toLowerCase());
      });
    }

    // Fallback: try exact email match
    if (emails.size === 0 && normalizedEmail) {
      const { data: byEmail } = await supabase
        .from("usuarios")
        .select("email")
        .eq("email", normalizedEmail) as any;
      (byEmail || []).forEach((u: any) => {
        if (u.email) emails.add(String(u.email).toLowerCase());
      });
    }

    // Last resort: the agent email itself (for sozu extra users that may not resolve via persona)
    if (emails.size === 0 && normalizedEmail) {
      emails.add(normalizedEmail);
    }

    return [...emails];
  };

  const handleDeactivate = async (agent: any) => {
    try {
      const emails = await resolveAgentEmails(agent);
      if (!emails.length) throw new Error("No se encontró el usuario");

      const { error, count } = await supabase
        .from("usuarios")
        .update({ activo: false, fecha_actualizacion: new Date().toISOString() }, { count: "exact" })
        .in("email", emails) as any;

      if (error) throw error;
      if (!count) throw new Error("No se encontró el usuario o no tienes permisos para desactivarlo");

      toast.success("Agente desactivado. Ya no tendrá acceso al sistema.");
      queryClient.invalidateQueries({ queryKey: ["inmob-agents-full"] });
      queryClient.invalidateQueries({ queryKey: ["inmob-agentes-sozu-extra-users"] });
    } catch (err: any) {
      toast.error("Error al desactivar agente: " + (err.message || "Intenta de nuevo"));
    }
  };

  const handleReactivate = async (agent: any) => {
    try {
      const directEmail = (agent.email || "").trim();
      if (!directEmail) throw new Error("No se encontró el email del agente");

      const { data: reactivateData, error: reactivateError } = await supabase.functions.invoke("reactivate-inmob-agent", {
        body: { email: directEmail },
      });

      if (reactivateError) throw reactivateError;
      if (reactivateData?.error) throw new Error(reactivateData.error);

      try {
        const { data: resetData, error: resetError } = await supabase.functions.invoke("reset-user-password", {
          body: { email: directEmail },
        });
        if (resetError) throw resetError;
        if (resetData?.error) {
          toast.success("Agente reactivado.");
          toast.warning("Para resetear la contraseña de este usuario tienes que solicitar al administrador.");
        } else {
          toast.success("Agente reactivado. Se envió correo de confirmación para resetear contraseña.");
        }
      } catch {
        toast.success("Agente reactivado.");
        toast.warning("Para resetear la contraseña de este usuario tienes que solicitar al administrador.");
      }

      queryClient.invalidateQueries({ queryKey: ["inmob-agents-full"] });
      queryClient.invalidateQueries({ queryKey: ["inmob-agentes-sozu-extra-users"] });
    } catch (err: any) {
      toast.error("Error al reactivar agente: " + (err.message || "Intenta de nuevo"));
    }
  };

  const handleResetPassword = async (agent: any) => {
    setResetTarget(agent);
  };

  const confirmResetPassword = async () => {
    if (!resetTarget) return;
    try {
      const emails = await resolveAgentEmails(resetTarget);
      if (!emails.length) throw new Error("No se encontró el usuario");

      const { data: resetData, error } = await supabase.functions.invoke("reset-user-password", {
        body: { email: emails[0] },
      });
      if (error) throw error;
      if (resetData?.error) {
        toast.error("Para resetear la contraseña de este usuario tienes que solicitar al administrador.");
      } else {
        toast.success("Se envió un correo de confirmación. Una vez confirmado, recibirá sus credenciales temporales.");
      }
    } catch {
      toast.error("Para resetear la contraseña de este usuario tienes que solicitar al administrador.");
    } finally {
      setResetTarget(null);
    }
  };

  const getInitials = (name: string) => {
    return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  };

  // ─── Inmobiliaria projects (for agent project access) ───
  const { data: inmobProjects = [] } = useQuery({
    queryKey: ["inmob-config-proyectos-list", personaId],
    queryFn: async () => {
      if (!personaId) return [];

      const { data: persona } = await supabase
        .from("personas")
        .select("email")
        .eq("id", personaId)
        .maybeSingle() as any;

      const { data: inmobUsers } = await supabase
        .from("usuarios")
        .select("email")
        .eq("id_persona", personaId)
        .eq("rol_id", 4) as any;

      if (!inmobUsers?.length) return [];

      const personaEmail = (persona?.email || "").toLowerCase();
      const principalUser = inmobUsers.find((u: any) => (u.email || "").toLowerCase() === personaEmail);
      const sourceEmail = principalUser?.email || inmobUsers[0].email;

      const { data, error } = await supabase
        .from("proyectos_acceso")
        .select("proyecto_id, activo, proyectos(id, nombre)")
        .eq("usuario_id", sourceEmail) as any;

      if (error) throw error;

      return (data || []).map((d: any) => ({
        id: d.proyectos?.id,
        nombre: d.proyectos?.nombre || `Proyecto ${d.proyecto_id}`,
        activo: d.activo ?? true,
      })).filter((p: any) => p.id);
    },
    enabled: !!personaId,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Agentes</h1>
        <p className="text-sm text-muted-foreground">Gestión y rendimiento de los agentes de tu inmobiliaria</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniKpi icon={Users} label="Agentes Activos" value={totalAgentes} loading={isLoading} />
        <MiniKpi icon={FileText} label="Ofertas Totales" value={totalOfertas} loading={isLoading} />
        <MiniKpi icon={ShoppingCart} label="Ventas Cerradas" value={totalVendidas} loading={isLoading} />
        <MiniKpi icon={TrendingUp} label="Prospectos" value={totalProspectos} loading={isLoading} />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar agente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="activos" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Activos <Badge variant="secondary" className="ml-1 text-[10px]">{filteredActiveAgents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="desactivados" className="gap-1.5">
            <Power className="h-3.5 w-3.5" /> Desactivados <Badge variant="secondary" className="ml-1 text-[10px]">{filteredInactiveAgents.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activos">
          <AgentTable
            agents={filteredAgents}
            isLoading={isLoading}
            search={search}
            ofertasByAgent={ofertasByAgent}
            prospectosByAgent={prospectosByAgent}
            ingresoByAgent={ingresoByAgent}
            comisionByAgent={comisionByAgent}
            commissionDetails={commissionDetailsByAgent}
            propDetailMap={propDetailMap}
            productDetailMap={productDetailMap}
            getInitials={getInitials}
            onEdit={openEditDialog}
            onDeactivate={handleDeactivate}
            onResetPassword={handleResetPassword}
            onProjectAccess={setProjectAccessAgent}
            navigate={navigate}
            isActiveTab
          />
        </TabsContent>

        <TabsContent value="desactivados">
          <AgentTable
            agents={filteredAgents}
            isLoading={isLoading}
            search={search}
            ofertasByAgent={ofertasByAgent}
            prospectosByAgent={prospectosByAgent}
            ingresoByAgent={ingresoByAgent}
            comisionByAgent={comisionByAgent}
            commissionDetails={commissionDetailsByAgent}
            propDetailMap={propDetailMap}
            productDetailMap={productDetailMap}
            getInitials={getInitials}
            onReactivate={handleReactivate}
            onEdit={openEditDialog}
            onResetPassword={handleResetPassword}
            onProjectAccess={setProjectAccessAgent}
            navigate={navigate}
            isActiveTab={false}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Agent Dialog */}
      <Dialog open={!!editAgent} onOpenChange={(open) => { if (!open) setEditAgent(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar agente</DialogTitle>
            <DialogDescription>Modifica los datos del agente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Correo electrónico</Label>
              <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" />
            </div>
            <div className="space-y-2">
              <Label>Teléfono</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditAgent(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Access Dialog */}
      <AgentProjectAccessDialog
        agent={projectAccessAgent}
        inmobProjects={inmobProjects}
        onClose={() => setProjectAccessAgent(null)}
      />

      <AlertDialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Resetear contraseña?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Confirmas resetear la contraseña de <strong>{resetTarget?.email}</strong>? La nueva contraseña será <strong>Temporal123!</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResetPassword}>Confirmar reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───── Agent Table ───── */
function AgentTable({
  agents, isLoading, search, ofertasByAgent, prospectosByAgent, ingresoByAgent, comisionByAgent,
  commissionDetails, propDetailMap, productDetailMap, getInitials, onEdit, onDeactivate, onReactivate, onResetPassword, onProjectAccess,
  navigate, isActiveTab,
}: {
  agents: any[]; isLoading: boolean; search: string;
  ofertasByAgent: Map<string, any>; prospectosByAgent: Map<string, number>; ingresoByAgent: Map<string, number>; comisionByAgent: Map<string, number>;
  commissionDetails: Map<string, Array<{ ofertaId: number; cuentaId: number; precioFinal: number; montoComision: number; isProduct: boolean; propiedadId?: number; productoId?: number }>>;
  propDetailMap: Map<number, { numero: string; proyecto: string }>;
  productDetailMap: Map<number, string>;
  getInitials: (name: string) => string;
  onEdit: (a: any) => void; onDeactivate?: (a: any) => void; onReactivate?: (a: any) => void;
  onResetPassword: (a: any) => void; onProjectAccess: (a: any) => void;
  navigate: any; isActiveTab: boolean;
}) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Compute global conversion for color thresholds
  const conversionGlobal = useMemo(() => {
    let totalOfertas = 0;
    let totalVentas = 0;
    agents.forEach((agent) => {
      const emailKey = (agent.email || "").toLowerCase();
      const stats = ofertasByAgent.get(emailKey) || { total: 0, vendidas: 0 };
      totalOfertas += stats.total;
      totalVentas += stats.vendidas;
    });
    return totalOfertas > 0 ? (totalVentas / totalOfertas) * 100 : 0;
  }, [agents, ofertasByAgent]);
  return (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="sozu-table-header">
                <TableHead className="w-[30px]"></TableHead>
                <TableHead>Agente</TableHead>
                <TableHead className="text-center">Prospectos</TableHead>
                <TableHead className="text-center">Ofertas</TableHead>
                <TableHead className="text-center">Ventas</TableHead>
                <TableHead className="text-right">Ingreso</TableHead>
                <TableHead className="text-right">Comisión</TableHead>
                <TableHead className="text-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help inline-flex items-center gap-1">
                          Conversión <HelpCircle className="h-3 w-3 text-muted-foreground" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                        <p className="font-semibold mb-1">Conversión = (Ventas / Ofertas) × 100</p>
                        <p><span className="inline-block w-2 h-2 rounded-full bg-primary mr-1" />Verde: superior al promedio</p>
                        <p><span className="inline-block w-2 h-2 rounded-full bg-destructive mr-1" />Rojo: inferior al promedio</p>
                        <p><span className="inline-block w-2 h-2 rounded-full bg-secondary mr-1" />Gris: en el promedio</p>
                        <p className="mt-1 text-muted-foreground">Promedio actual: {conversionGlobal.toFixed(1)}%</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {search ? "Sin resultados" : isActiveTab ? "No hay agentes activos" : "No hay agentes desactivados"}
                  </TableCell>
                </TableRow>
              ) : (
                agents.map((agent) => {
                  const emailKey = (agent.email || "").toLowerCase();
                  const stats = ofertasByAgent.get(emailKey) || { total: 0, vendidas: 0 };
                  const prospectos = prospectosByAgent.get(emailKey) || 0;
                  const ingreso = ingresoByAgent.get(emailKey) || 0;
                  const comision = comisionByAgent.get(emailKey) || 0;
                  const conversion = stats.total > 0 ? ((stats.vendidas / stats.total) * 100) : 0;
                  const details = commissionDetails.get(emailKey) || [];
                  const isExpanded = expandedAgent === emailKey;
                  const hasDetails = details.length > 0;
                  return (
                    <React.Fragment key={agent.email}>
                      <TableRow className={cn(hasDetails && "cursor-pointer")} onClick={() => hasDetails && setExpandedAgent(isExpanded ? null : emailKey)}>
                        <TableCell className="w-[30px] px-2">
                          {hasDetails && (
                            isExpanded
                              ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                                {getInitials(agent.nombre)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-sm truncate">{agent.nombre}</p>
                                {agent.isInternal && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-amber-500/50 text-amber-700 dark:text-amber-400">
                                    Usuario interno
                                  </Badge>
                                )}
                                {agent.isIndependent && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-green-500/50 text-green-700 dark:text-green-400">
                                    Agente independiente
                                  </Badge>
                                )}
                                {agent.inmobiliariaName && !agent.isInternal && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-purple-500/50 text-purple-700 dark:text-purple-400">
                                    {agent.inmobiliariaName}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{agent.email}</p>
                              <PhoneDisplay telefono={agent.telefono} clavePaisTelefono={agent.clavePaisTelefono} className="text-xs" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{prospectos}</TableCell>
                        <TableCell className="text-center">{stats.total}</TableCell>
                        <TableCell className="text-center font-semibold">{stats.vendidas}</TableCell>
                        <TableCell className="text-right font-medium">{fmtCurrency(ingreso)}</TableCell>
                        <TableCell className="text-right font-medium">{fmtCurrency(comision)}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={conversion > conversionGlobal * 1.1 ? "default" : conversion < conversionGlobal * 0.8 ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {conversion.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`${NAV_PREFIX}/agentes/${encodeURIComponent(agent.email)}`)}>
                                <Eye className="h-4 w-4 mr-2" /> Ver perfil 360°
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onEdit(agent)}>
                                <Pencil className="h-4 w-4 mr-2" /> Editar información
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onProjectAccess(agent)}>
                                <FolderOpen className="h-4 w-4 mr-2" /> Acceso a proyectos
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {isActiveTab && onDeactivate && (
                                <DropdownMenuItem onClick={() => onDeactivate(agent)} className="text-destructive">
                                  <Power className="h-4 w-4 mr-2" /> Desactivar
                                </DropdownMenuItem>
                              )}
                              {!isActiveTab && onReactivate && (
                                <DropdownMenuItem onClick={() => onReactivate(agent)} className="text-emerald-600">
                                  <Power className="h-4 w-4 mr-2" /> Reactivar
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => onResetPassword(agent)}>
                                <KeyRound className="h-4 w-4 mr-2" /> Resetear contraseña
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {isExpanded && details.length > 0 && (
                        <TableRow className="bg-muted/30 hover:bg-muted/40">
                          <TableCell colSpan={9} className="py-3 px-6">
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">Detalle de comisiones</p>
                              {details.map((d) => {
                                const propInfo = d.propiedadId ? propDetailMap.get(d.propiedadId) : undefined;
                                const productName = d.productoId ? productDetailMap.get(d.productoId) : undefined;
                                const propLabel = [propInfo?.proyecto, propInfo?.numero].filter(Boolean).join(" ");
                                const label = d.isProduct
                                  ? [propLabel || "—", productName || "Producto"].filter(Boolean).join(" - ")
                                  : propLabel || "—";
                                return (
                                <div key={d.cuentaId} className="flex items-center justify-between text-sm rounded-lg border border-border bg-card px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px]">
                                      {d.isProduct ? "Producto" : "Propiedad"}
                                    </Badge>
                                    <span className="font-medium">{label}</span>
                                  </div>
                                  <div className="flex items-center gap-6">
                                    <span className="text-muted-foreground text-xs">Precio: <span className="text-foreground font-medium">{fmtCurrency(d.precioFinal)}</span></span>
                                    <span className="text-xs">Comisión: <span className="text-primary font-semibold">{fmtCurrency(d.montoComision)}</span> <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">+ IVA</Badge></span>
                                  </div>
                                </div>
                                );
                              })}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ───── Agent Project Access Dialog ───── */
function AgentProjectAccessDialog({ agent, inmobProjects, onClose }: {
  agent: any | null; inmobProjects: { id: number; nombre: string }[]; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [agentProjects, setAgentProjects] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  // Fetch agent's current project access
  const { data: currentAccess, isLoading } = useQuery({
    queryKey: ["agent-project-access", agent?.email],
    queryFn: async () => {
      if (!agent?.email) return [];
      const { data } = await supabase
        .from("proyectos_acceso")
        .select("proyecto_id")
        .eq("usuario_id", agent.email)
        .eq("activo", true) as any;
      return (data || []).map((d: any) => d.proyecto_id as number);
    },
    enabled: !!agent?.email,
  });

  useEffect(() => {
    if (currentAccess) {
      setAgentProjects(new Set(currentAccess));
    }
  }, [currentAccess]);

  const handleToggle = async (projectId: number, enabled: boolean) => {
    setLoading(true);
    try {
      if (enabled) {
        // Try to update existing record first (may have been set to activo=false)
        const { data: existing } = await supabase
          .from("proyectos_acceso")
          .select("proyecto_id")
          .eq("usuario_id", agent.email)
          .eq("proyecto_id", projectId) as any;
        if (existing && existing.length > 0) {
          const { error } = await supabase
            .from("proyectos_acceso")
            .update({ activo: true } as any)
            .eq("usuario_id", agent.email)
            .eq("proyecto_id", projectId) as any;
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("proyectos_acceso")
            .insert({ usuario_id: agent.email, proyecto_id: projectId } as any) as any;
          if (error && !error.message?.includes("duplicate")) throw error;
        }
        setAgentProjects(prev => new Set([...prev, projectId]));
        toast.success("Acceso al proyecto habilitado");
      } else {
        // Set activo to false instead of deleting
        const { error } = await supabase
          .from("proyectos_acceso")
          .update({ activo: false } as any)
          .eq("usuario_id", agent.email)
          .eq("proyecto_id", projectId) as any;
        if (error) throw error;
        setAgentProjects(prev => { const next = new Set(prev); next.delete(projectId); return next; });
        toast.success("Acceso al proyecto removido");
      }
      queryClient.invalidateQueries({ queryKey: ["agent-project-access", agent.email] });
    } catch (err: any) {
      toast.error("Error: " + (err.message || "Intenta de nuevo"));
    } finally {
      setLoading(false);
    }
  };

  if (!agent) return null;

  const isIndependent = agent.isIndependent === true;

  return (
    <Dialog open={!!agent} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acceso a Proyectos</DialogTitle>
          <DialogDescription>{agent.nombre} ({agent.email})</DialogDescription>
        </DialogHeader>
        <div className={`rounded-lg border p-3 text-sm ${isIndependent ? 'border-green-500/20 bg-green-500/5' : 'border-primary/20 bg-primary/5'}`}>
          <p className={`font-medium ${isIndependent ? 'text-green-700 dark:text-green-400' : 'text-primary'}`}>
            {isIndependent ? 'Agente independiente' : 'El acceso a proyectos se hereda del usuario principal'}
          </p>
          <p className="text-muted-foreground mt-1">
            {isIndependent
              ? 'Este agente no tiene una Inmobiliaria asignada, por lo que se le otorga acceso automático a los proyectos publicados en Sozu. Puedes habilitar o deshabilitar proyectos individualmente.'
              : 'Los Agentes Inmobiliarios heredan automáticamente el acceso a proyectos de su Inmobiliaria padre. Puedes habilitar o deshabilitar proyectos individualmente.'}
          </p>
        </div>
        <div className="space-y-2 mt-2">
          <p className="text-sm font-medium">Proyectos disponibles:</p>
          {isLoading ? (
            <p className="text-muted-foreground text-sm py-4">Cargando...</p>
          ) : inmobProjects.length === 0 ? (
            <p className="text-muted-foreground text-center py-6">No hay proyectos asignados</p>
          ) : (
            inmobProjects.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{p.nombre}</span>
                </div>
                <Switch
                  checked={agentProjects.has(p.id)}
                  onCheckedChange={(checked) => handleToggle(p.id, checked)}
                  disabled={loading}
                />
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniKpi({ icon: Icon, label, value, loading }: { icon: any; label: string; value: number; loading: boolean }) {
  return (
    <Card className="sozu-card">
      <CardContent className="p-4 flex items-center gap-3">
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <>
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
