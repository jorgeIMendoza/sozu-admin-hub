import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EyeOff, CheckCircle2, Circle, AlertCircle, User, Building2, Calendar, DollarSign, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';

interface OfertaCard {
  id: number;
  email_creador: string;
  fecha_generacion: string;
  id_esquema_pago_seleccionado: number | null;
  id_estatus_aprobacion: number | null;
  comentario_justificacion: string | null;
  activo: boolean;
  id_propiedad: number | null;
  id_persona_lead: number | null;
  // Enriched
  propiedad_nombre?: string;
  proyecto_nombre?: string;
  proyecto_id?: number;
  lead_nombre?: string;
  precio?: number | null;
  estatus_disponibilidad?: number;
  cuenta_cobranza_id?: number;
  contrato_draft?: string | null;
  tiene_contrato_firmado?: boolean;
  es_manual?: boolean;
  stage?: string;
}

const STAGES = [
  { key: 'expiradas', label: 'Expiradas', color: 'bg-muted text-muted-foreground', hideable: true },
  { key: 'nuevas', label: 'Nuevas Ofertas', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  { key: 'pendientes', label: 'Pendientes de Aprobación', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  { key: 'aprobadas', label: 'Aprobadas', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  { key: 'rechazadas', label: 'Rechazadas', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  { key: 'revision', label: 'En Revisión', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  { key: 'apartado', label: 'Apartado', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  { key: 'gen_contrato', label: 'Generación de Contrato', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
  { key: 'firma_contrato', label: 'Firma de Contrato', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
  { key: 'cierre', label: 'Cierre de Venta', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
];

const MIN_DATE = '2026-01-01';

function isVigente(fechaGeneracion: string): boolean {
  const fecha = new Date(fechaGeneracion);
  const expira = new Date(fecha);
  expira.setDate(expira.getDate() + 5);
  return expira >= new Date();
}

function classifyOffer(oferta: OfertaCard): string {
  if (oferta.estatus_disponibilidad === 5) return 'cierre';
  if (oferta.tiene_contrato_firmado) return 'firma_contrato';
  if (oferta.contrato_draft) return 'gen_contrato';
  if (oferta.cuenta_cobranza_id && oferta.estatus_disponibilidad === 4) return 'apartado';

  const vigente = isVigente(oferta.fecha_generacion);
  if (!vigente && !oferta.cuenta_cobranza_id) return 'expiradas';

  if (!oferta.id_esquema_pago_seleccionado) return vigente ? 'nuevas' : 'expiradas';

  if (oferta.id_estatus_aprobacion === 1) return vigente ? 'pendientes' : 'expiradas';
  if (oferta.id_estatus_aprobacion === 2) return 'aprobadas';
  if (oferta.id_estatus_aprobacion === 3) return vigente ? 'rechazadas' : 'expiradas';
  if (oferta.id_estatus_aprobacion === 4) return vigente ? 'revision' : 'expiradas';

  return 'nuevas';
}

export default function WorkflowOfertas() {
  const { profile } = useAuth();
  const [ofertas, setOfertas] = useState<OfertaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExpiradas, setShowExpiradas] = useState(false);
  const [selectedOferta, setSelectedOferta] = useState<OfertaCard | null>(null);

  // Filters
  const [inmobiliarias, setInmobiliarias] = useState<{ id: number; nombre: string }[]>([]);
  const [selectedInmobiliaria, setSelectedInmobiliaria] = useState<string>('all');
  const [agentes, setAgentes] = useState<{ email: string; nombre: string }[]>([]);
  const [selectedAgentes, setSelectedAgentes] = useState<string[]>([]);
  const [proyectos, setProyectos] = useState<{ id: number; nombre: string }[]>([]);
  const [selectedProyectos, setSelectedProyectos] = useState<string[]>([]);

  const isSuperAdmin = profile?.rol_nombre === 'Super Administrador';
  const isInmobiliaria = profile?.rol_id === 4;
  const isAgente = profile?.rol_id === 3 || profile?.rol_id === 9;

  // Load filters
  useEffect(() => {
    if (!profile) return;
    const loadFilters = async () => {
      if (isSuperAdmin) {
        const { data } = await (supabase
          .from('personas' as any)
          .select('id, nombre, apellido_paterno')
          .eq('activo', true)
          .eq('id_tipo_persona', 4));
        if (data) setInmobiliarias(data.map((i: any) => ({ id: i.id, nombre: `${i.nombre} ${i.apellido_paterno || ''}`.trim() })));
      }

      if (isSuperAdmin) {
        const { data } = await supabase.from('proyectos').select('id, nombre').eq('activo', true).order('nombre');
        if (data) setProyectos(data);
      } else {
        const { data } = await supabase
          .from('proyectos_acceso')
          .select('proyecto_id')
          .eq('usuario_id', profile.email)
          .eq('activo', true) as any;
        if (data) {
          const projIds = data.map((a: any) => a.proyecto_id).filter(Boolean);
          if (projIds.length > 0) {
            const { data: projs } = await supabase.from('proyectos').select('id, nombre').in('id', projIds).eq('activo', true);
            if (projs) {
              setProyectos(projs);
              if (projs.length === 1) setSelectedProyectos([String(projs[0].id)]);
            }
          }
        }
      }
    };
    loadFilters();
  }, [profile, isSuperAdmin]);

  // Load agentes
  useEffect(() => {
    if (!profile) return;
    const loadAgentes = async () => {
      let personaOwnerId: number | null = null;
      if (isSuperAdmin && selectedInmobiliaria !== 'all') personaOwnerId = Number(selectedInmobiliaria);
      else if (isInmobiliaria) personaOwnerId = profile.id_persona;
      if (!personaOwnerId) { setAgentes([]); return; }

      const { data } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona')
        .eq('id_persona_duena_lead', personaOwnerId)
        .eq('id_tipo_entidad', 19)
        .eq('activo', true) as any;
      if (data) {
        const ids = data.map((d: any) => d.id_persona).filter(Boolean);
        if (ids.length > 0) {
          const { data: usuarios } = await supabase
            .from('usuarios')
            .select('email, id_persona')
            .in('id_persona', ids)
            .eq('activo', true) as any;
          if (usuarios) {
            // Get person names
            const personIds = usuarios.map((u: any) => u.id_persona).filter(Boolean);
            const { data: personas } = await supabase
              .from('personas')
              .select('id, nombre, apellido_paterno')
              .in('id', personIds) as any;
            const personMap = new Map<number, string>();
            (personas || []).forEach((p: any) => personMap.set(p.id, `${p.nombre} ${p.apellido_paterno || ''}`.trim()));

            setAgentes(usuarios.map((u: any) => ({
              email: u.email,
              nombre: personMap.get(u.id_persona) || u.email
            })));
          }
        }
      }
    };
    loadAgentes();
  }, [profile, isSuperAdmin, isInmobiliaria, selectedInmobiliaria]);

  // Load ofertas
  const loadOfertas = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      let query = supabase
        .from('ofertas')
        .select('id, email_creador, fecha_generacion, id_esquema_pago_seleccionado, id_estatus_aprobacion, comentario_justificacion, activo, id_propiedad, id_persona_lead')
        .eq('activo', true)
        .gte('fecha_generacion', MIN_DATE)
        .order('fecha_generacion', { ascending: false });

      if (isAgente) query = query.eq('email_creador', profile.email);
      else if (isInmobiliaria && agentes.length > 0) {
        const emails = selectedAgentes.length > 0 ? selectedAgentes : agentes.map(a => a.email);
        query = query.in('email_creador', emails);
      } else if (isSuperAdmin) {
        if (selectedAgentes.length > 0) query = query.in('email_creador', selectedAgentes);
        else if (selectedInmobiliaria !== 'all' && agentes.length > 0) query = query.in('email_creador', agentes.map(a => a.email));
      }

      const { data: ofertasData, error } = await query;
      if (error) { console.error(error); toast.error('Error al cargar ofertas'); setLoading(false); return; }
      if (!ofertasData || ofertasData.length === 0) { setOfertas([]); setLoading(false); return; }

      const propiedadIds = [...new Set(ofertasData.map((o: any) => o.id_propiedad).filter(Boolean))] as number[];
      const personaLeadIds = [...new Set(ofertasData.map((o: any) => o.id_persona_lead).filter(Boolean))] as number[];

      const [propRes, leadsRes, cuentasRes, cuentasSinDocRes] = await Promise.all([
        propiedadIds.length > 0
          ? (supabase.from('propiedades').select('id, numero, precio_lista, id_estatus_disponibilidad, id_edificio_modelo').in('id', propiedadIds) as any)
          : { data: [] },
        personaLeadIds.length > 0
          ? (supabase.from('personas' as any).select('id, nombre_legal, nombre, apellido_paterno').in('id', personaLeadIds))
          : { data: [] },
        propiedadIds.length > 0
          ? (supabase.from('cuentas_cobranza' as any).select('id, id_propiedad, contrato_draft').in('id_propiedad', propiedadIds).eq('activo', true))
          : { data: [] },
        { data: [] },
      ]);

      // Get edificios_modelos -> edificios -> proyectos
      const edModeloIds = [...new Set((propRes.data || []).map((p: any) => p.id_edificio_modelo).filter(Boolean))] as number[];
      const proyectoMap = new Map<number, { id: number; nombre: string }>();
      const edModeloToProyecto = new Map<number, number>();

      if (edModeloIds.length > 0) {
        const { data: edModelos } = await supabase
          .from('edificios_modelos')
          .select('id, id_edificio')
          .in('id', edModeloIds) as any;
        const edificioIds = [...new Set((edModelos || []).map((em: any) => em.id_edificio).filter(Boolean))] as number[];
        if (edificioIds.length > 0) {
          const { data: edificios } = await supabase
            .from('edificios')
            .select('id, id_proyecto, nombre')
            .in('id', edificioIds) as any;
          const projIds = [...new Set((edificios || []).map((e: any) => e.id_proyecto).filter(Boolean))] as number[];
          if (projIds.length > 0) {
            const { data: projs } = await supabase.from('proyectos').select('id, nombre').in('id', projIds);
            (projs || []).forEach((p: any) => proyectoMap.set(p.id, p));
          }
          const edificioToProy = new Map<number, number>();
          (edificios || []).forEach((e: any) => edificioToProy.set(e.id, e.id_proyecto));
          (edModelos || []).forEach((em: any) => {
            const proyId = edificioToProy.get(em.id_edificio);
            if (proyId) edModeloToProyecto.set(em.id, proyId);
          });
        }
      }

      // Check for signed contracts (tipo_documento=42) on cuentas
      const cuentaIds = (cuentasRes.data || []).map((c: any) => c.id);
      let cuentaContratoFirmado = new Set<number>();
      if (cuentaIds.length > 0) {
        const { data: docs } = await supabase
          .from('documentos')
          .select('id_cuenta_cobranza, id_tipo_documento')
          .in('id_cuenta_cobranza', cuentaIds)
          .eq('id_tipo_documento', 42)
          .eq('activo', true) as any;
        (docs || []).forEach((d: any) => cuentaContratoFirmado.add(d.id_cuenta_cobranza));
      }

      const propMap = new Map<number, any>();
      (propRes.data || []).forEach((p: any) => propMap.set(p.id, p));

       const leadMap = new Map<number, string>();
       (leadsRes.data || []).forEach((l: any) => {
         const nombre = l.nombre_legal || `${l.nombre} ${l.apellido_paterno || ''}`.trim() || 'Sin nombre';
         leadMap.set(l.id, nombre);
       });

      const cuentaByProp = new Map<number, any>();
      (cuentasRes.data || []).forEach((c: any) => {
        if (!cuentaByProp.has(c.id_propiedad)) cuentaByProp.set(c.id_propiedad, c);
      });

      const enriched: OfertaCard[] = ofertasData.map((o: any) => {
        const prop = o.id_propiedad ? propMap.get(o.id_propiedad) : null;
        const cuenta = o.id_propiedad ? cuentaByProp.get(o.id_propiedad) : null;
        const proyId = prop?.id_edificio_modelo ? edModeloToProyecto.get(prop.id_edificio_modelo) : undefined;
        const proy = proyId ? proyectoMap.get(proyId) : undefined;

        const card: OfertaCard = {
          id: o.id,
          email_creador: o.email_creador,
          fecha_generacion: o.fecha_generacion,
          id_esquema_pago_seleccionado: o.id_esquema_pago_seleccionado,
          id_estatus_aprobacion: o.id_estatus_aprobacion,
          comentario_justificacion: o.comentario_justificacion,
          activo: o.activo,
          id_propiedad: o.id_propiedad,
          id_persona_lead: o.id_persona_lead,
          propiedad_nombre: prop ? `${proy?.nombre || ''} - ${prop.numero}` : `Propiedad ${o.id_propiedad}`,
          proyecto_nombre: proy?.nombre || '',
          proyecto_id: proyId,
          lead_nombre: o.id_persona_lead ? (leadMap.get(o.id_persona_lead) || 'Sin nombre') : 'Sin prospecto',
          precio: prop?.precio_lista,
          estatus_disponibilidad: prop?.id_estatus_disponibilidad,
          cuenta_cobranza_id: cuenta?.id,
          contrato_draft: cuenta?.contrato_draft,
          tiene_contrato_firmado: cuenta ? cuentaContratoFirmado.has(cuenta.id) : false,
        };
        card.stage = classifyOffer(card);
        return card;
      });

      let filtered = enriched;
      if (selectedProyectos.length > 0) {
        const projIds = selectedProyectos.map(Number);
        filtered = filtered.filter(o => o.proyecto_id && projIds.includes(o.proyecto_id));
      }

      setOfertas(filtered);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar ofertas');
    } finally {
      setLoading(false);
    }
  }, [profile, isAgente, isInmobiliaria, isSuperAdmin, agentes, selectedAgentes, selectedInmobiliaria, selectedProyectos]);

  useEffect(() => { loadOfertas(); }, [loadOfertas]);

  const ofertasByStage = useMemo(() => {
    const groups: Record<string, OfertaCard[]> = {};
    STAGES.forEach(s => { groups[s.key] = []; });
    ofertas.forEach(o => { if (o.stage && groups[o.stage]) groups[o.stage].push(o); });
    return groups;
  }, [ofertas]);

  const getNextStepChecklist = (oferta: OfertaCard): { text: string; done: boolean }[] => {
    switch (oferta.stage) {
      case 'nuevas':
        if (oferta.es_manual) return [{ text: 'Aprobar la oferta', done: false }];
        return [{ text: 'Seleccionar esquema de pago', done: !!oferta.id_esquema_pago_seleccionado }];
      case 'pendientes': return [{ text: 'Aprobar la oferta', done: false }];
      case 'aprobadas': return [{ text: 'Pagar el apartado', done: false }];
      case 'apartado':
        return [
          { text: 'Documentos de compradores verificados', done: false },
          { text: 'Iniciar generación de contrato', done: !!oferta.contrato_draft },
        ];
      case 'gen_contrato': return [{ text: 'Subir contrato firmado por cliente', done: !!oferta.tiene_contrato_firmado }];
      case 'firma_contrato':
        return [
          { text: 'Subir contrato firmado completamente', done: false },
          { text: 'Pagar el enganche', done: false },
        ];
      default: return [];
    }
  };

  // Build agent label map for filter display
  const agenteOptions = agentes.map(a => a.nombre || a.email);
  const agenteNameToEmail = new Map<string, string>();
  agentes.forEach(a => agenteNameToEmail.set(a.nombre || a.email, a.email));
  const selectedAgenteNames = selectedAgentes.map(email => agentes.find(a => a.email === email)?.nombre || email);

  const proyectoOptions = proyectos.map(p => p.nombre);
  const proyNameToId = new Map<string, string>();
  proyectos.forEach(p => proyNameToId.set(p.nombre, String(p.id)));
  const selectedProyNames = selectedProyectos.map(id => proyectos.find(p => String(p.id) === id)?.nombre || id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Workflow de Ofertas</h1>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            {isSuperAdmin && (
              <div className="min-w-[200px]">
                <label className="text-sm font-medium mb-1 block">Inmobiliaria</label>
                <Select value={selectedInmobiliaria} onValueChange={(v) => { setSelectedInmobiliaria(v); setSelectedAgentes([]); }}>
                  <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {inmobiliarias.map(i => <SelectItem key={i.id} value={String(i.id)}>{i.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(isSuperAdmin || isInmobiliaria) && agentes.length > 0 && (
              <div className="min-w-[200px]">
                <label className="text-sm font-medium mb-1 block">Agentes</label>
                <MultiSelectFilter
                  options={agenteOptions}
                  values={selectedAgenteNames}
                  onValuesChange={(names) => {
                    const emails = names.map(n => agenteNameToEmail.get(n) || n);
                    setSelectedAgentes(emails);
                  }}
                  placeholder="Todos los agentes"
                />
              </div>
            )}

            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-1 block">Proyectos</label>
              {proyectos.length <= 1 ? (
                <Select value={proyectos[0] ? String(proyectos[0].id) : ''} disabled>
                  <SelectTrigger><SelectValue placeholder={proyectos[0]?.nombre || 'Sin proyectos'} /></SelectTrigger>
                  <SelectContent>{proyectos.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.nombre}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <MultiSelectFilter
                  options={proyectoOptions}
                  values={selectedProyNames}
                  onValuesChange={(names) => {
                    const ids = names.map(n => proyNameToId.get(n) || n);
                    setSelectedProyectos(ids);
                  }}
                  placeholder="Todos los proyectos"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Board */}
      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="min-w-[280px] space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <ScrollArea className="w-full">
          <div className="flex gap-4 pb-4 min-w-max">
            {STAGES.map(stage => {
              if (stage.key === 'expiradas' && !showExpiradas) {
                return (
                  <div key={stage.key} className="min-w-[60px]">
                    <Button variant="outline" size="sm" className="h-full min-h-[200px] flex flex-col gap-2"
                      onClick={() => setShowExpiradas(true)} title="Mostrar expiradas">
                      <EyeOff className="h-4 w-4" />
                      <span className="[writing-mode:vertical-lr] text-xs">Expiradas ({ofertasByStage[stage.key]?.length || 0})</span>
                    </Button>
                  </div>
                );
              }
              const stageOfertas = ofertasByStage[stage.key] || [];
              return (
                <div key={stage.key} className="min-w-[300px] max-w-[300px]">
                  <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${stage.color}`}>
                    <span className="font-semibold text-sm">{stage.label}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">{stageOfertas.length}</Badge>
                      {stage.key === 'expiradas' && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowExpiradas(false)}>
                          <EyeOff className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="border border-t-0 rounded-b-lg bg-muted/30 p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-320px)] overflow-y-auto">
                    {stageOfertas.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Sin ofertas</p>
                    ) : (
                      stageOfertas.map(oferta => (
                        <Card key={oferta.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedOferta(oferta)}>
                          <CardContent className="p-3 space-y-1.5">
                            <p className="font-medium text-sm truncate">{oferta.propiedad_nombre}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" /><span className="truncate">{oferta.lead_nombre}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" /><span className="truncate">{oferta.email_creador}</span>
                            </div>
                            {oferta.precio && (
                              <div className="flex items-center gap-1 text-xs font-semibold">
                                <DollarSign className="h-3 w-3" /><span>${oferta.precio.toLocaleString('es-MX')}</span>
                              </div>
                            )}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" /><span>{format(new Date(oferta.fecha_generacion), 'dd MMM yyyy', { locale: es })}</span>
                            </div>
                            {(stage.key === 'rechazadas' || stage.key === 'revision') && oferta.comentario_justificacion && (
                              <div className="mt-1 p-1.5 bg-muted rounded text-xs italic">"{oferta.comentario_justificacion}"</div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedOferta} onOpenChange={(open) => !open && setSelectedOferta(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Oferta #{selectedOferta?.id}</DialogTitle>
            <DialogDescription>{selectedOferta?.propiedad_nombre}</DialogDescription>
          </DialogHeader>
          {selectedOferta && (
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-sm mb-1 flex items-center gap-1"><Building2 className="h-4 w-4" /> Propiedad</h4>
                <div className="text-sm space-y-0.5 pl-5">
                  <p><span className="text-muted-foreground">Nombre:</span> {selectedOferta.propiedad_nombre}</p>
                  <p><span className="text-muted-foreground">Proyecto:</span> {selectedOferta.proyecto_nombre}</p>
                  {selectedOferta.precio && <p><span className="text-muted-foreground">Precio:</span> ${selectedOferta.precio.toLocaleString('es-MX')}</p>}
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-1 flex items-center gap-1"><User className="h-4 w-4" /> Prospecto</h4>
                <p className="text-sm pl-5">{selectedOferta.lead_nombre}</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-1 flex items-center gap-1"><User className="h-4 w-4" /> Agente</h4>
                <p className="text-sm pl-5">{selectedOferta.email_creador}</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-1 flex items-center gap-1"><FileText className="h-4 w-4" /> Deal</h4>
                <div className="text-sm space-y-0.5 pl-5">
                  <p><span className="text-muted-foreground">Esquema:</span> {selectedOferta.id_esquema_pago_seleccionado ? `ID ${selectedOferta.id_esquema_pago_seleccionado}` : 'Ninguno'}</p>
                  <p><span className="text-muted-foreground">Etapa:</span>{' '}
                    <Badge className={STAGES.find(s => s.key === selectedOferta.stage)?.color || ''}>
                      {STAGES.find(s => s.key === selectedOferta.stage)?.label}
                    </Badge>
                  </p>
                  {selectedOferta.comentario_justificacion && <p className="italic text-muted-foreground">"{selectedOferta.comentario_justificacion}"</p>}
                </div>
              </div>
              {selectedOferta.stage !== 'cierre' && selectedOferta.stage !== 'expiradas' && (
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-1"><AlertCircle className="h-4 w-4" /> Para avanzar</h4>
                  <div className="space-y-1.5 pl-5">
                    {getNextStepChecklist(selectedOferta).map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        {item.done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                        <span className={item.done ? 'line-through text-muted-foreground' : ''}>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
