import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { useInmobAgents } from "@/hooks/useInmobAgents";
import { useInmobiliariaPersonaId } from "@/hooks/useInmobiliariaPersonaId";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { MonthMultiSelector, getCurrentMonthKey, getMonthFilterLabel, buildDateRangesFromMonths } from "@/components/ui/month-multi-selector";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DollarSign, Search, CalendarDays, CheckCircle2, Clock, Eye, CalendarCheck, Users,
} from "lucide-react";

/* ───── helpers ───── */
const fmt = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

const fmt2 = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function formatFechaPago(fecha: string | null): string {
  if (!fecha) return "—";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
}

const PAGE_SIZE = 50;

// Estatus badges
function estatusBadge(estatus: string) {
  switch (estatus) {
    case "Pagada":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Pagada</Badge>;
    case "Programada a pago":
      return <Badge variant="outline">Programada a pago</Badge>;
    case "Pendiente factura":
      return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Pendiente factura</Badge>;
    case "En revisión":
      return <Badge variant="outline" className="text-muted-foreground">En revisión</Badge>;
    case "Aprobada":
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">Aprobada</Badge>;
    default:
      return <Badge variant="outline">{estatus}</Badge>;
  }
}

/* ───── Client display component ───── */
type ClienteInfo = { nombre: string; porcentaje: number };

function ClienteCell({ clientes }: { clientes: ClienteInfo[] }) {
  const [open, setOpen] = useState(false);

  if (!clientes || clientes.length === 0) return <span>-</span>;

  if (clientes.length === 1) {
    return (
      <span>
        {clientes[0].nombre}
        {clientes[0].porcentaje < 100 && (
          <span className="text-muted-foreground text-xs ml-1">({clientes[0].porcentaje}%)</span>
        )}
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm font-medium"
      >
        <Users className="h-3.5 w-3.5" />
        {clientes.length} clientes
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clientes de la operación</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {clientes.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                <span className="text-sm font-medium text-foreground">{c.nombre}</span>
                <Badge variant="outline" className="text-xs">{c.porcentaje}%</Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function InmobComisiones() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { data: agents = [] } = useInmobAgents();
  const { personaId } = useInmobiliariaPersonaId();
  const [search, setSearch] = useState("");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([getCurrentMonthKey()]);
  const [currentPage, setCurrentPage] = useState(1);
  const [estatusFilter, setEstatusFilter] = useState<string>("todos");

  const monthFilterLabel = useMemo(() => getMonthFilterLabel(selectedMonths), [selectedMonths]);
  const dateRanges = useMemo(() => buildDateRangesFromMonths(selectedMonths), [selectedMonths]);

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/comisiones");
    track({ page: "inmob_comisiones", elementId: "page_view", elementType: "page" });
  }, []);

  // Determine if this inmobiliaria is Sozu
  const { data: isSozu = false } = useQuery({
    queryKey: ["inmob-comisiones-is-sozu", personaId],
    queryFn: async () => {
      if (!personaId) return false;
      const { data } = await supabase
        .from("personas")
        .select("nombre_legal")
        .eq("id", personaId)
        .single() as any;
      return (data?.nombre_legal || "").toLowerCase().includes("real estate ventures");
    },
    enabled: !!personaId,
    staleTime: 10 * 60_000,
  });

  const agentEmails = useMemo(() => agents.map(a => a.email), [agents]);
  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach(a => m.set(a.email, a.nombre));
    return m;
  }, [agents]);

  // Get inmobiliaria email for comisionistas lookup
  const { data: inmobEmail } = useQuery({
    queryKey: ["inmob-comisiones-email", personaId],
    queryFn: async () => {
      if (!personaId) return null;
      const { data } = await supabase
        .from("personas")
        .select("email")
        .eq("id", personaId)
        .single() as any;
      return data?.email?.toLowerCase() || null;
    },
    enabled: !!personaId && !isSozu,
    staleTime: 10 * 60_000,
  });

  // ─── Main data query ───
  const { data: comisionesData, isLoading } = useQuery({
    queryKey: ["inmob-comisiones-detail", isSozu, agentEmails, inmobEmail, dateRanges],
    queryFn: async () => {
      if (isSozu) {
        return fetchSozuComisiones(agentEmails, dateRanges);
      } else {
        return fetchExternalComisiones(agentEmails, inmobEmail || "", dateRanges);
      }
    },
    enabled: agentEmails.length > 0 && (isSozu || !!inmobEmail),
    staleTime: 3 * 60_000,
  });

  const rows = comisionesData?.rows || [];
  const kpis = comisionesData?.kpis || { totalGenerada: 0, pagadas: 0, pendientes: 0, enRevision: 0, programadas: 0 };

  // Unique statuses for filter
  const estatusOptions = useMemo(() => {
    const set = new Set<string>(rows.map((r: any) => r.estatus));
    return Array.from(set).sort();
  }, [rows]);

  // Filter by search + estatus
  const filteredRows = useMemo(() => {
    let filtered = rows;
    if (estatusFilter !== "todos") {
      filtered = filtered.filter((r: any) => r.estatus === estatusFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter((r: any) =>
        r.proyecto?.toLowerCase().includes(s) ||
        r.clientes?.some((c: ClienteInfo) => c.nombre.toLowerCase().includes(s)) ||
        r.agente?.toLowerCase().includes(s) ||
        r.unidad?.toLowerCase().includes(s)
      );
    }
    return filtered;
  }, [rows, search, estatusFilter]);

  // Reset page when search or data changes
  useEffect(() => { setCurrentPage(1); }, [search, rows.length, selectedMonths, estatusFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const paginatedRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function getPaginationPages() {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("ellipsis");
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comisiones</h1>
          <p className="text-sm text-muted-foreground">Control de comisiones e ingresos</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              {monthFilterLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <MonthMultiSelector value={selectedMonths} onChange={setSelectedMonths} />
          </PopoverContent>
        </Popover>
      </div>

      {/* KPI Cards */}
      <div className={`grid gap-4 ${isSozu ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-5'}`}>
        <KPICard icon={DollarSign} iconColor="text-emerald-600 bg-emerald-100" label="Total generada" value={fmt(kpis.totalGenerada)} />
        <KPICard icon={CheckCircle2} iconColor="text-emerald-600 bg-emerald-100" label="Pagada" value={fmt(kpis.pagadas)} />
        <KPICard icon={Clock} iconColor="text-amber-600 bg-amber-100" label="Pendiente" value={fmt(kpis.pendientes)} />
        {!isSozu && (
          <KPICard icon={Eye} iconColor="text-blue-600 bg-blue-100" label="En revisión" value={fmt(kpis.enRevision)} />
        )}
        <KPICard icon={CalendarCheck} iconColor="text-violet-600 bg-violet-100" label="Programada" value={fmt(kpis.programadas)} />
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por proyecto, cliente, agente..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <select
          value={estatusFilter}
          onChange={e => setEstatusFilter(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="todos">Todos los estatus</option>
          {estatusOptions.map(est => (
            <option key={est} value={est}>{est}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Cargando comisiones...</p>
      ) : filteredRows.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No se encontraron comisiones.</p>
        </CardContent></Card>
      ) : (
        <>
          <Card className="sozu-card">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="sozu-table-header">
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead className="text-right">Venta</TableHead>
                      <TableHead className="text-right">Comisión</TableHead>
                      <TableHead>Estatus</TableHead>
                      <TableHead>Fecha Pago</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((r: any, idx: number) => (
                      <TableRow key={`${r.cuentaId}-${idx}`}>
                        <TableCell className="font-medium">{r.proyecto}</TableCell>
                        <TableCell><ClienteCell clientes={r.clientes} /></TableCell>
                        <TableCell>{r.unidad}</TableCell>
                        <TableCell>{r.agente}</TableCell>
                        <TableCell className="text-right">{fmt2(r.venta)}</TableCell>
                        <TableCell className="text-right">
                          <span className="font-semibold">{fmt2(r.comision)}</span>
                          <span className={`ml-1.5 inline-flex items-center rounded px-1.5 py-0 text-[10px] leading-4 font-medium border ${r.ivaIncluido ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "text-muted-foreground border-border"}`}>
                            {r.ivaIncluido ? "+IVA" : "Sin IVA"}
                          </span>
                        </TableCell>
                        <TableCell>{estatusBadge(r.estatus)}</TableCell>
                        <TableCell>{formatFechaPago(r.fechaPago)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRows.length)} de {filteredRows.length}
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {getPaginationPages().map((p, i) =>
                    p === "ellipsis" ? (
                      <PaginationItem key={`e-${i}`}><PaginationEllipsis /></PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={p === currentPage}
                          onClick={() => setCurrentPage(p as number)}
                          className="cursor-pointer"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ───── KPI Card component ───── */
function KPICard({ icon: Icon, iconColor, label, value }: { icon: any; iconColor: string; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconColor}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-xl font-bold text-foreground">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ───── Helper to fetch compradores by cuenta IDs ───── */
async function fetchCompradores(cuentaIds: number[]): Promise<Map<number, ClienteInfo[]>> {
  const result = new Map<number, ClienteInfo[]>();
  if (cuentaIds.length === 0) return result;

  const { data } = await (supabase as any)
    .from("compradores")
    .select("id_cuenta_cobranza, porcentaje_copropiedad, id_persona")
    .in("id_cuenta_cobranza", cuentaIds)
    .eq("activo", true);

  if (!data || data.length === 0) return result;

  const personaIds = [...new Set(data.map((d: any) => d.id_persona).filter(Boolean))] as number[];
  const { data: personas } = personaIds.length > 0
    ? await supabase.from("personas").select("id, nombre_legal").in("id", personaIds)
    : { data: [] };

  const personaMap = new Map<number, string>((personas || []).map((p: any) => [p.id, p.nombre_legal || ""]));

  data.forEach((d: any) => {
    const arr = result.get(d.id_cuenta_cobranza) || [];
    arr.push({
      nombre: personaMap.get(d.id_persona) || "-",
      porcentaje: Number(d.porcentaje_copropiedad) || 0,
    });
    result.set(d.id_cuenta_cobranza, arr);
  });

  return result;
}

/* ───── Sozu data fetcher ───── */
async function fetchSozuComisiones(agentEmails: string[], dateRanges: { start: string; end: string }[]) {
  let query = (supabase as any)
    .from("ofertas")
    .select("id, email_creador, id_propiedad, id_producto, fecha_creacion")
    .in("email_creador", agentEmails)
    .eq("activo", true);

  if (dateRanges.length > 0) {
    const orClauses = dateRanges.map(r => `and(fecha_creacion.gte.${r.start},fecha_creacion.lte.${r.end})`).join(",");
    query = query.or(orClauses);
  }

  const { data: ofertas } = await query;
  if (!ofertas || ofertas.length === 0) return { rows: [], kpis: { totalGenerada: 0, pagadas: 0, pendientes: 0, enRevision: 0, programadas: 0 } };

  const ofertaIds = ofertas.map((o: any) => o.id);

  const { data: cuentas } = await (supabase as any)
    .from("cuentas_cobranza")
    .select("id, id_oferta, precio_final, porcentaje_comision_venta, iva_incluido, es_pagada_comision_venta, fecha_pago_comision, activo")
    .in("id_oferta", ofertaIds)
    .is("id_cuenta_cobranza_padre", null);

  if (!cuentas || cuentas.length === 0) return { rows: [], kpis: { totalGenerada: 0, pagadas: 0, pendientes: 0, enRevision: 0, programadas: 0 } };

  const propIds = [...new Set(ofertas.filter((o: any) => o.id_propiedad).map((o: any) => o.id_propiedad))] as number[];
  const { data: propiedades } = propIds.length > 0 ? await supabase
    .from("propiedades")
    .select("id, numero_propiedad, id_edificio_modelo, id_estatus_disponibilidad")
    .in("id", propIds) : { data: [] };

  const emIds = [...new Set((propiedades || []).map((p: any) => p.id_edificio_modelo).filter(Boolean))] as number[];
  const { data: ems } = emIds.length > 0 ? await supabase
    .from("edificios_modelos")
    .select("id, id_edificio, modelos!edificios_modelos_id_modelo_fkey(nombre)")
    .in("id", emIds) : { data: [] };

  const edifIds = [...new Set((ems || []).map((e: any) => e.id_edificio).filter(Boolean))] as number[];
  const { data: edificios } = edifIds.length > 0 ? await supabase
    .from("edificios")
    .select("id, nombre, id_proyecto")
    .in("id", edifIds) : { data: [] };

  const projIds = [...new Set((edificios || []).map((e: any) => e.id_proyecto).filter(Boolean))] as number[];
  const { data: proyectos } = projIds.length > 0 ? await supabase
    .from("proyectos")
    .select("id, nombre")
    .in("id", projIds) : { data: [] };

  const cuentaIds = cuentas.map((c: any) => c.id);

  // Fetch compradores
  const compradoresMap = await fetchCompradores(cuentaIds);

  // Check enganche
  const { data: acuerdos } = await supabase
    .from("acuerdos_pago")
    .select("id_cuenta_cobranza, pago_completado, id_concepto")
    .in("id_cuenta_cobranza", cuentaIds)
    .eq("id_concepto", 2)
    .eq("activo", true);

  const enganchePagadoSet = new Set<number>();
  const enganchePendienteSet = new Set<number>();
  (acuerdos || []).forEach((a: any) => {
    if (a.pago_completado) enganchePagadoSet.add(a.id_cuenta_cobranza);
    else enganchePendienteSet.add(a.id_cuenta_cobranza);
  });

  const ofertaMap = new Map<number, any>(ofertas.map((o: any) => [o.id, o]));
  const propMap = new Map((propiedades || []).map((p: any) => [p.id, p]));
  const emMap = new Map((ems || []).map((e: any) => [e.id, e]));
  const edifMap = new Map((edificios || []).map((e: any) => [e.id, e]));
  const projMap = new Map((proyectos || []).map((p: any) => [p.id, p]));

  let totalGenerada = 0, pagadas = 0, programadas = 0;
  const rows: any[] = [];

  for (const cuenta of cuentas) {
    if (!cuenta.activo) continue;
    const oferta = ofertaMap.get(cuenta.id_oferta);
    if (!oferta) continue;

    const porcentaje = cuenta.porcentaje_comision_venta || 0;
    if (porcentaje === 0) continue;

    const hasEnganche = enganchePagadoSet.has(cuenta.id) || enganchePendienteSet.has(cuenta.id);
    if (!hasEnganche) continue;
    const engancheCompleto = enganchePagadoSet.has(cuenta.id) && !enganchePendienteSet.has(cuenta.id);
    if (!engancheCompleto) continue;

    const montoBase = (cuenta.precio_final * porcentaje) / 100;
    const comision = cuenta.iva_incluido ? montoBase * 1.16 : montoBase;

    totalGenerada += comision;
    const esPagada = cuenta.es_pagada_comision_venta === true;
    if (esPagada) pagadas += comision;
    else programadas += comision;

    const prop = propMap.get(oferta.id_propiedad);
    const em = prop ? emMap.get(prop.id_edificio_modelo) : null;
    const edif = em ? edifMap.get(em.id_edificio) : null;
    const proj = edif ? projMap.get(edif.id_proyecto) : null;

    let estatus = "En revisión";
    if (esPagada) estatus = "Pagada";
    else estatus = "Programada a pago";

    rows.push({
      cuentaId: cuenta.id,
      proyecto: proj?.nombre || "-",
      clientes: compradoresMap.get(cuenta.id) || [],
      unidad: prop?.numero_propiedad || "-",
      agente: oferta.email_creador,
      venta: cuenta.precio_final || 0,
      comision,
      ivaIncluido: !!cuenta.iva_incluido,
      estatus,
      fechaPago: cuenta.fecha_pago_comision || null,
    });
  }

  // Resolve agent names
  const emailsToResolve = [...new Set(rows.map(r => r.agente))];
  if (emailsToResolve.length > 0) {
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("email, nombre")
      .in("email", emailsToResolve);
    const nameMap = new Map((usuarios || []).map((u: any) => [u.email, u.nombre]));
    rows.forEach(r => { r.agente = nameMap.get(r.agente) || r.agente; });
  }

  return {
    rows,
    kpis: {
      totalGenerada,
      pagadas,
      pendientes: totalGenerada - pagadas,
      enRevision: 0,
      programadas,
    },
  };
}

/* ───── External inmobiliaria data fetcher ───── */
async function fetchExternalComisiones(agentEmails: string[], inmobEmail: string, dateRanges: { start: string; end: string }[]) {
  if (!inmobEmail) return { rows: [], kpis: { totalGenerada: 0, pagadas: 0, pendientes: 0, enRevision: 0, programadas: 0 } };

  let query = (supabase as any)
    .from("ofertas")
    .select("id, email_creador, id_propiedad, id_producto, fecha_creacion")
    .in("email_creador", agentEmails)
    .eq("activo", true);

  if (dateRanges.length > 0) {
    const orClauses = dateRanges.map(r => `and(fecha_creacion.gte.${r.start},fecha_creacion.lte.${r.end})`).join(",");
    query = query.or(orClauses);
  }

  const { data: ofertas } = await query;
  if (!ofertas || ofertas.length === 0) return { rows: [], kpis: { totalGenerada: 0, pagadas: 0, pendientes: 0, enRevision: 0, programadas: 0 } };

  const ofertaIds = ofertas.map((o: any) => o.id);

  const { data: cuentas } = await (supabase as any)
    .from("cuentas_cobranza")
    .select("id, id_oferta, precio_final, activo")
    .in("id_oferta", ofertaIds)
    .is("id_cuenta_cobranza_padre", null);

  if (!cuentas || cuentas.length === 0) return { rows: [], kpis: { totalGenerada: 0, pagadas: 0, pendientes: 0, enRevision: 0, programadas: 0 } };

  const cuentaIds = cuentas.map((c: any) => c.id);

  // Get comisionistas for this inmobiliaria
  const { data: comisionistas } = await (supabase as any)
    .from("comisionistas")
    .select("id_cuenta_cobranza, porcentaje_comision, aprobada, pagada")
    .in("id_cuenta_cobranza", cuentaIds)
    .eq("email_usuario", inmobEmail)
    .eq("activo", true);

  if (!comisionistas || comisionistas.length === 0) return { rows: [], kpis: { totalGenerada: 0, pagadas: 0, pendientes: 0, enRevision: 0, programadas: 0 } };

  const comMap = new Map<number, any>(comisionistas.map((c: any) => [c.id_cuenta_cobranza, c]));

  // Get property info
  const propIds = [...new Set(ofertas.filter((o: any) => o.id_propiedad).map((o: any) => o.id_propiedad))] as number[];
  const { data: propiedades } = propIds.length > 0 ? await supabase
    .from("propiedades")
    .select("id, numero_propiedad, id_edificio_modelo, id_estatus_disponibilidad")
    .in("id", propIds) : { data: [] };

  const emIds = [...new Set((propiedades || []).map((p: any) => p.id_edificio_modelo).filter(Boolean))] as number[];
  const { data: ems } = emIds.length > 0 ? await supabase
    .from("edificios_modelos")
    .select("id, id_edificio, modelos!edificios_modelos_id_modelo_fkey(nombre)")
    .in("id", emIds) : { data: [] };

  const edifIds = [...new Set((ems || []).map((e: any) => e.id_edificio).filter(Boolean))] as number[];
  const { data: edificios } = edifIds.length > 0 ? await supabase
    .from("edificios")
    .select("id, nombre, id_proyecto")
    .in("id", edifIds) : { data: [] };

  const projIds = [...new Set((edificios || []).map((e: any) => e.id_proyecto).filter(Boolean))] as number[];
  const { data: proyectos } = projIds.length > 0 ? await supabase
    .from("proyectos")
    .select("id, nombre")
    .in("id", projIds) : { data: [] };

  // Fetch compradores
  const compradoresMap = await fetchCompradores(cuentaIds);

  // Get facturas
  const { data: facturasData } = await (supabase as any)
    .from("documentos")
    .select("id_cuenta_cobranza, numero")
    .in("id_cuenta_cobranza", cuentaIds)
    .eq("id_tipo_documento", 46)
    .eq("activo", true);

  const facturaSet = new Set((facturasData || []).filter((f: any) => f.numero === inmobEmail).map((f: any) => f.id_cuenta_cobranza));

  // Build maps
  const ofertaMap = new Map<number, any>(ofertas.map((o: any) => [o.id, o]));
  const cuentaMap = new Map<number, any>(cuentas.map((c: any) => [c.id, c]));
  const propMap = new Map((propiedades || []).map((p: any) => [p.id, p]));
  const emMap = new Map((ems || []).map((e: any) => [e.id, e]));
  const edifMap = new Map((edificios || []).map((e: any) => [e.id, e]));
  const projMap = new Map((proyectos || []).map((p: any) => [p.id, p]));

  const VENDIDO_ID = 5;
  let totalGenerada = 0, pagadasMonto = 0, enRevision = 0, programadasMonto = 0;
  const rows: any[] = [];

  for (const [cuentaId, com] of comMap) {
    const cuenta = cuentaMap.get(cuentaId);
    if (!cuenta) continue;

    const comision = (cuenta.precio_final * com.porcentaje_comision) / 100;
    if (comision <= 0) continue;

    const oferta = ofertaMap.get(cuenta.id_oferta);
    const prop = oferta?.id_propiedad ? propMap.get(oferta.id_propiedad) : null;
    const estatusPropId = prop?.id_estatus_disponibilidad;

    if (estatusPropId && estatusPropId >= VENDIDO_ID) {
      totalGenerada += comision;
    } else {
      continue;
    }

    const em = prop ? emMap.get(prop.id_edificio_modelo) : null;
    const edif = em ? edifMap.get(em.id_edificio) : null;
    const proj = edif ? projMap.get(edif.id_proyecto) : null;

    let estatus: string;
    let fechaPago: string | null = null;

    if (com.pagada) {
      estatus = "Pagada";
      pagadasMonto += comision;
    } else if (com.aprobada && facturaSet.has(cuentaId)) {
      estatus = "Programada a pago";
      programadasMonto += comision;
    } else if (com.aprobada) {
      estatus = "Pendiente factura";
    } else if (estatusPropId === VENDIDO_ID) {
      estatus = "En revisión";
      enRevision += comision;
    } else {
      estatus = "En revisión";
    }

    rows.push({
      cuentaId,
      proyecto: proj?.nombre || "-",
      clientes: compradoresMap.get(cuentaId) || [],
      unidad: prop?.numero_propiedad || "-",
      agente: oferta?.email_creador || "-",
      venta: cuenta.precio_final || 0,
      comision,
      ivaIncluido: false,
      estatus,
      fechaPago,
    });
  }

  // Resolve agent names
  const emailsToResolve = [...new Set(rows.map(r => r.agente).filter(e => e !== "-"))];
  if (emailsToResolve.length > 0) {
    const { data: usuarios } = await supabase
      .from("usuarios")
      .select("email, nombre")
      .in("email", emailsToResolve);
    const nameMap = new Map((usuarios || []).map((u: any) => [u.email, u.nombre]));
    rows.forEach(r => { if (r.agente !== "-") r.agente = nameMap.get(r.agente) || r.agente; });
  }

  return {
    rows,
    kpis: {
      totalGenerada,
      pagadas: pagadasMonto,
      pendientes: totalGenerada - pagadasMonto,
      enRevision,
      programadas: programadasMonto,
    },
  };
}
