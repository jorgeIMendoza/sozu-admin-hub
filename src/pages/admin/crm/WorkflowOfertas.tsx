import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, AlertCircle, User, Building2, Calendar, DollarSign, FileText, Mail, Phone, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';

interface OfertaCard {
  id: number;
  email_creador: string;
  fecha_generacion: string;
  fecha_creacion: string;
  id_esquema_pago_seleccionado: number | null;
  id_estatus_aprobacion: number | null;
  comentario_justificacion: string | null;
  activo: boolean;
  id_propiedad: number | null;
  id_producto: number | null;
  id_persona_lead: number | null;
  // Enriched
  propiedad_nombre?: string;
  producto_nombre?: string;
  proyecto_nombre?: string;
  proyecto_id?: number;
  lead_nombre?: string;
  lead_email?: string;
  lead_telefono?: string;
  agente_nombre?: string;
  agente_telefono?: string;
  inmobiliaria_nombre?: string;
  precio?: number | null;
  estatus_disponibilidad?: number;
  cuenta_cobranza_id?: number;
  contrato_draft?: string | null;
  tiene_contrato_firmado?: boolean;
  es_manual?: boolean;
  stage?: string;
  // Esquema details
  esquema_nombre?: string;
  esquema_es_manual?: boolean;
  porcentaje_enganche?: number;
  porcentaje_mensualidades?: number;
  porcentaje_entrega?: number;
  porcentaje_descuento_aumento?: number;
  numero_mensualidades?: number;
}

const STAGES = [
  { key: 'expiradas', label: 'Expiradas', color: 'bg-muted text-muted-foreground' },
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

const MIN_DATE = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
})();

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
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set(['expiradas']));
  const [manuallyToggled, setManuallyToggled] = useState<Set<string>>(new Set());
  const [selectedOferta, setSelectedOferta] = useState<OfertaCard | null>(null);

  // Filters
  const [inmobiliarias, setInmobiliarias] = useState<{ id: number; nombre: string }[]>([]);
  const [selectedInmobiliaria, setSelectedInmobiliaria] = useState<string>('all');
  const [agentes, setAgentes] = useState<{ email: string; nombre: string }[]>([]);
  const [selectedAgentes, setSelectedAgentes] = useState<string[]>([]);
  const [proyectos, setProyectos] = useState<{ id: number; nombre: string }[]>([]);
  const [selectedProyectos, setSelectedProyectos] = useState<string[]>([]);
  const [selectedTipoOferta, setSelectedTipoOferta] = useState<string>('all');
  const inmobIdByEmailRef = useRef(new Map<string, number>());

  const isSuperAdmin = profile?.rol_nombre === 'Super Administrador';
  const isInmobiliaria = profile?.rol_id === 4;
  const isAgente = profile?.rol_id === 3 || profile?.rol_id === 9;

  // Load project access for non-super-admin roles
  useEffect(() => {
    if (!profile || isSuperAdmin) return;
    const loadProjectAccess = async () => {
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
    };
    loadProjectAccess();
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
              .select('id, nombre_legal, nombre_comercial')
              .in('id', personIds) as any;
            const personMap = new Map<number, string>();
            (personas || []).forEach((p: any) => personMap.set(p.id, p.nombre_legal || p.nombre_comercial || ''));

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
        .select('id, email_creador, fecha_generacion, fecha_creacion, id_esquema_pago_seleccionado, id_estatus_aprobacion, comentario_justificacion, activo, id_propiedad, id_persona_lead, id_producto')
        .eq('activo', true)
        .gte('fecha_generacion', MIN_DATE)
        .order('fecha_generacion', { ascending: false });

      if (isAgente) query = query.eq('email_creador', profile.email);
      else if (isInmobiliaria && agentes.length > 0) {
        query = query.in('email_creador', agentes.map(a => a.email));
      }
      // Super admin: load all ofertas, filter client-side

      const { data: ofertasData, error } = await query;
      if (error) { console.error(error); toast.error('Error al cargar ofertas'); setLoading(false); return; }
      if (!ofertasData || ofertasData.length === 0) { setOfertas([]); setLoading(false); return; }

      const propiedadIds = [...new Set(ofertasData.map((o: any) => o.id_propiedad).filter(Boolean))] as number[];
      const personaLeadIds = [...new Set(ofertasData.map((o: any) => o.id_persona_lead).filter(Boolean))] as number[];
      const productoIds = [...new Set(ofertasData.map((o: any) => o.id_producto).filter(Boolean))] as number[];

      const [propRes, leadsRes, productosRes] = await Promise.all([
        propiedadIds.length > 0
          ? (supabase.from('propiedades').select('id, numero_propiedad, precio_lista, id_estatus_disponibilidad, id_edificio_modelo').in('id', propiedadIds) as any)
          : { data: [] },
        personaLeadIds.length > 0
          ? (supabase.from('personas' as any).select('id, nombre_legal, nombre_comercial, email, telefono').in('id', personaLeadIds))
          : { data: [] },
        productoIds.length > 0
          ? (supabase.from('productos_servicios').select('id, nombre, precio_lista, id_proyecto').in('id', productoIds) as any)
          : { data: [] },
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

      // Also fetch projects for products that aren't already in proyectoMap
      const productoProjIds = [...new Set((productosRes.data || []).map((p: any) => p.id_proyecto).filter(Boolean))] as number[];
      const missingProjIds = productoProjIds.filter(id => !proyectoMap.has(id));
      if (missingProjIds.length > 0) {
        const { data: projs } = await supabase.from('proyectos').select('id, nombre').in('id', missingProjIds);
        (projs || []).forEach((p: any) => proyectoMap.set(p.id, p));
      }

      // Fetch cuentas_cobranza by id_oferta (the actual FK)
      const ofertaIds = ofertasData.map((o: any) => o.id);
      let cuentaByOferta = new Map<number, any>();
      let cuentaContratoFirmado = new Set<number>();
      if (ofertaIds.length > 0) {
        const { data: cuentasData } = await supabase
          .from('cuentas_cobranza')
          .select('id, id_oferta, contrato_draft')
          .in('id_oferta', ofertaIds)
          .eq('activo', true) as any;
        (cuentasData || []).forEach((c: any) => {
          if (c.id_oferta) cuentaByOferta.set(c.id_oferta, c);
        });

        // Check for signed contracts (tipo_documento=42)
        const cuentaIds = (cuentasData || []).map((c: any) => c.id);
        if (cuentaIds.length > 0) {
          const { data: docs } = await supabase
            .from('documentos')
            .select('id_cuenta_cobranza, id_tipo_documento')
            .in('id_cuenta_cobranza', cuentaIds)
            .eq('id_tipo_documento', 42)
            .eq('activo', true) as any;
          (docs || []).forEach((d: any) => cuentaContratoFirmado.add(d.id_cuenta_cobranza));
        }
      }

      const propMap = new Map<number, any>();
      (propRes.data || []).forEach((p: any) => propMap.set(p.id, p));

      const productoMap = new Map<number, any>();
      (productosRes.data || []).forEach((p: any) => productoMap.set(p.id, p));

      const leadMap = new Map<number, { nombre: string; email: string; telefono: string }>();
      (leadsRes.data || []).forEach((l: any) => {
        const nombre = l.nombre_legal || l.nombre_comercial || 'Sin nombre';
        leadMap.set(l.id, { nombre, email: l.email || '', telefono: l.telefono || '' });
      });

      // Get inmobiliaria and agent name for each email_creador
      const uniqueEmails = [...new Set(ofertasData.map((o: any) => o.email_creador).filter(Boolean))] as string[];
      const inmobByEmail = new Map<string, string>();
      const inmobIdByEmail = new Map<string, number>();
      const agentNameByEmail = new Map<string, { nombre: string; telefono: string }>();
      if (uniqueEmails.length > 0) {
        const { data: usrData } = await supabase
          .from('usuarios')
          .select('email, id_persona')
          .in('email', uniqueEmails)
          .eq('activo', true) as any;
        if (usrData && usrData.length > 0) {
          const emailToPersona = new Map<string, number>();
          usrData.forEach((u: any) => { if (u.id_persona) emailToPersona.set(u.email, u.id_persona); });
          const agentPersonaIds = [...new Set(usrData.map((u: any) => u.id_persona).filter(Boolean))] as number[];
          if (agentPersonaIds.length > 0) {
            // Fetch agent persona details (name + phone)
            const { data: agentPersonas } = await supabase
              .from('personas')
              .select('id, nombre_legal, nombre_comercial, telefono')
              .in('id', agentPersonaIds) as any;
            const agentPersonaMap = new Map<number, any>();
            (agentPersonas || []).forEach((p: any) => agentPersonaMap.set(p.id, p));
            emailToPersona.forEach((personaId, email) => {
              const persona = agentPersonaMap.get(personaId);
              if (persona) {
                agentNameByEmail.set(email, {
                  nombre: persona.nombre_legal || persona.nombre_comercial || email,
                  telefono: persona.telefono || ''
                });
              }
            });

            const { data: erData } = await supabase
              .from('entidades_relacionadas')
              .select('id_persona, id_persona_duena_lead')
              .in('id_persona', agentPersonaIds)
              .eq('id_tipo_entidad', 19)
              .eq('activo', true) as any;
            if (erData && erData.length > 0) {
              const personaToOwner = new Map<number, number>();
              erData.forEach((er: any) => { personaToOwner.set(er.id_persona, er.id_persona_duena_lead); });
              const ownerIds = [...new Set(erData.map((er: any) => er.id_persona_duena_lead).filter(Boolean))] as number[];
              if (ownerIds.length > 0) {
                const { data: inmobPersonas } = await supabase
                  .from('personas')
                  .select('id, nombre_comercial, nombre_legal')
                  .in('id', ownerIds) as any;
                const ownerMap = new Map<number, string>();
                (inmobPersonas || []).forEach((p: any) => ownerMap.set(p.id, p.nombre_comercial || p.nombre_legal || ''));
                emailToPersona.forEach((personaId, email) => {
                  const ownerId = personaToOwner.get(personaId);
                  if (ownerId) {
                    inmobIdByEmail.set(email, ownerId);
                    const inmobNombre = ownerMap.get(ownerId);
                    if (inmobNombre) inmobByEmail.set(email, inmobNombre);
                  }
                });
              }
            }
          }
        }
      }

      // cuentaByOferta already built above

      // Fetch esquemas_pago details
      const esquemaIds = [...new Set(ofertasData.map((o: any) => o.id_esquema_pago_seleccionado).filter(Boolean))] as number[];
      const esquemaMap = new Map<number, any>();
      if (esquemaIds.length > 0) {
        const { data: esquemas } = await supabase
          .from('esquemas_pago')
          .select('id, nombre, es_manual, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, porcentaje_descuento_aumento, numero_mensualidades')
          .in('id', esquemaIds) as any;
        (esquemas || []).forEach((e: any) => esquemaMap.set(e.id, e));
      }

      const enriched: OfertaCard[] = ofertasData.map((o: any) => {
        const prop = o.id_propiedad ? propMap.get(o.id_propiedad) : null;
        const producto = o.id_producto ? productoMap.get(o.id_producto) : null;
        const cuenta = cuentaByOferta.get(o.id) || null;
        const proyId = prop?.id_edificio_modelo ? edModeloToProyecto.get(prop.id_edificio_modelo) : (producto?.id_proyecto || undefined);
        const proy = proyId ? proyectoMap.get(proyId) : undefined;
        const esquema = o.id_esquema_pago_seleccionado ? esquemaMap.get(o.id_esquema_pago_seleccionado) : null;
        const isProducto = !!o.id_producto;

        const card: OfertaCard = {
          id: o.id,
          email_creador: o.email_creador,
          fecha_generacion: o.fecha_generacion,
          fecha_creacion: o.fecha_creacion || o.fecha_generacion,
          id_esquema_pago_seleccionado: o.id_esquema_pago_seleccionado,
          id_estatus_aprobacion: o.id_estatus_aprobacion,
          comentario_justificacion: o.comentario_justificacion,
          activo: o.activo,
          id_propiedad: o.id_propiedad,
          id_producto: o.id_producto || null,
          id_persona_lead: o.id_persona_lead,
          propiedad_nombre: prop ? prop.numero_propiedad : (o.id_propiedad ? `${o.id_propiedad}` : ''),
          producto_nombre: producto?.nombre || undefined,
          proyecto_nombre: proy?.nombre || '',
          proyecto_id: proyId,
          lead_nombre: o.id_persona_lead ? (leadMap.get(o.id_persona_lead)?.nombre || 'Sin nombre') : 'Sin prospecto',
          lead_email: o.id_persona_lead ? (leadMap.get(o.id_persona_lead)?.email || '') : '',
          lead_telefono: o.id_persona_lead ? (leadMap.get(o.id_persona_lead)?.telefono || '') : '',
          agente_nombre: agentNameByEmail.get(o.email_creador)?.nombre || o.email_creador,
          agente_telefono: agentNameByEmail.get(o.email_creador)?.telefono || '',
          inmobiliaria_nombre: inmobByEmail.get(o.email_creador) || 'Interno',
          precio: isProducto ? (producto?.precio_lista || null) : (prop?.precio_lista || null),
          estatus_disponibilidad: prop?.id_estatus_disponibilidad,
          cuenta_cobranza_id: cuenta?.id,
          contrato_draft: cuenta?.contrato_draft,
          tiene_contrato_firmado: cuenta ? cuentaContratoFirmado.has(cuenta.id) : false,
          // Esquema details
          esquema_nombre: esquema?.nombre,
          esquema_es_manual: esquema?.es_manual,
          porcentaje_enganche: esquema?.porcentaje_enganche,
          porcentaje_mensualidades: esquema?.porcentaje_mensualidades,
          porcentaje_entrega: esquema?.porcentaje_entrega,
          porcentaje_descuento_aumento: esquema?.porcentaje_descuento_aumento,
          numero_mensualidades: esquema?.numero_mensualidades,
        };
        card.stage = classifyOffer(card);
        return card;
      });

      // Store inmob mapping for client-side filtering
      inmobIdByEmailRef.current = inmobIdByEmail;

      // Derive available inmobiliarias from enriched data (super admin)
      if (isSuperAdmin) {
        const inmobSet = new Map<number, { id: number; nombre: string }>();
        enriched.forEach(o => {
          const ownerId = inmobIdByEmail.get(o.email_creador);
          if (ownerId && o.inmobiliaria_nombre && o.inmobiliaria_nombre !== 'Interno') {
            inmobSet.set(ownerId, { id: ownerId, nombre: o.inmobiliaria_nombre });
          }
        });
        setInmobiliarias(Array.from(inmobSet.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }

      // Derive available proyectos from enriched data
      if (isSuperAdmin) {
        const proySet = new Map<number, { id: number; nombre: string }>();
        enriched.forEach(o => {
          if (o.proyecto_id && o.proyecto_nombre) {
            proySet.set(o.proyecto_id, { id: o.proyecto_id, nombre: o.proyecto_nombre });
          }
        });
        setProyectos(Array.from(proySet.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      }

      setOfertas(enriched);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar ofertas');
    } finally {
      setLoading(false);
    }
  }, [profile, isAgente, isInmobiliaria, isSuperAdmin, agentes]);

  const hasLoadedRef = useRef(false);
  const prevDepsRef = useRef<string>('');
  useEffect(() => {
    const depsKey = JSON.stringify({ isAgente, isInmobiliaria, isSuperAdmin, agentesLen: agentes.length });
    if (hasLoadedRef.current && depsKey === prevDepsRef.current) return;
    prevDepsRef.current = depsKey;
    hasLoadedRef.current = true;
    loadOfertas();
  }, [loadOfertas]);

  // Derive available agentes from loaded ofertas (super admin)
  const availableAgentes = useMemo(() => {
    if (!isSuperAdmin) return agentes;
    let source = ofertas;
    if (selectedInmobiliaria !== 'all') {
      const inmobId = Number(selectedInmobiliaria);
      source = source.filter(o => inmobIdByEmailRef.current.get(o.email_creador) === inmobId);
    }
    const map = new Map<string, string>();
    source.forEach(o => {
      if (!map.has(o.email_creador)) {
        map.set(o.email_creador, o.agente_nombre || o.email_creador);
      }
    });
    return Array.from(map.entries()).map(([email, nombre]) => ({ email, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [ofertas, isSuperAdmin, selectedInmobiliaria, agentes]);

  // Client-side filtering
  const filteredOfertas = useMemo(() => {
    let result = ofertas;
    if (isSuperAdmin && selectedInmobiliaria !== 'all') {
      const inmobId = Number(selectedInmobiliaria);
      result = result.filter(o => inmobIdByEmailRef.current.get(o.email_creador) === inmobId);
    }
    if (selectedAgentes.length > 0) {
      result = result.filter(o => selectedAgentes.includes(o.email_creador));
    }
    if (selectedProyectos.length > 0) {
      const projIds = selectedProyectos.map(Number);
      result = result.filter(o => o.proyecto_id && projIds.includes(o.proyecto_id));
    }
    if (selectedTipoOferta === 'propiedad') {
      result = result.filter(o => !o.id_producto);
    } else if (selectedTipoOferta === 'producto') {
      result = result.filter(o => !!o.id_producto);
    }
    return result;
  }, [ofertas, isSuperAdmin, selectedInmobiliaria, selectedAgentes, selectedProyectos, selectedTipoOferta]);

  const ofertasByStage = useMemo(() => {
    const groups: Record<string, OfertaCard[]> = {};
    STAGES.forEach(s => { groups[s.key] = []; });
    filteredOfertas.forEach(o => { if (o.stage && groups[o.stage]) groups[o.stage].push(o); });

    // Deduplicate "cierre": only offers with cuenta_cobranza, one per property/product
    if (groups['cierre'] && groups['cierre'].length > 0) {
      const seen = new Set<string>();
      groups['cierre'] = groups['cierre']
        .filter(o => !!o.cuenta_cobranza_id)
        .filter(o => {
          const key = o.id_producto
            ? `prod-${o.id_producto}-${o.id_propiedad || 'none'}`
            : `prop-${o.id_propiedad}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    return groups;
  }, [filteredOfertas]);

  // Auto-collapse empty columns, auto-expand when they get offers
  useEffect(() => {
    setCollapsedStages(prev => {
      const next = new Set(prev);
      STAGES.forEach(stage => {
        if (manuallyToggled.has(stage.key)) return; // respect manual toggle
        const count = ofertasByStage[stage.key]?.length || 0;
        if (count === 0) next.add(stage.key);
        else if (stage.key !== 'expiradas') next.delete(stage.key);
      });
      return next;
    });
  }, [ofertasByStage, manuallyToggled]);

  const toggleStage = (key: string) => {
    setManuallyToggled(prev => new Set(prev).add(key));
    setCollapsedStages(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

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
  const agenteOptions = availableAgentes.map(a => a.nombre || a.email);
  const agenteNameToEmail = new Map<string, string>();
  availableAgentes.forEach(a => agenteNameToEmail.set(a.nombre || a.email, a.email));
  const selectedAgenteNames = selectedAgentes.map(email => availableAgentes.find(a => a.email === email)?.nombre || email);

  const proyectoOptions = proyectos.map(p => p.nombre);
  const proyNameToId = new Map<string, string>();
  proyectos.forEach(p => proyNameToId.set(p.nombre, String(p.id)));
  const selectedProyNames = selectedProyectos.map(id => proyectos.find(p => String(p.id) === id)?.nombre || id);

  const hasActiveFilters = selectedInmobiliaria !== 'all' || selectedAgentes.length > 0 || selectedProyectos.length > 0 || selectedTipoOferta !== 'all';

  const clearAllFilters = () => {
    setSelectedInmobiliaria('all');
    setSelectedAgentes([]);
    setSelectedProyectos([]);
    setSelectedTipoOferta('all');
  };

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

            {(isSuperAdmin || isInmobiliaria) && availableAgentes.length > 0 && (
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

            <div className="min-w-[160px]">
              <label className="text-sm font-medium mb-1 block">Tipo de Oferta</label>
              <Select value={selectedTipoOferta} onValueChange={setSelectedTipoOferta}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="propiedad">Propiedades</SelectItem>
                  <SelectItem value="producto">Productos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs h-10">
                <X className="h-3 w-3 mr-1" />
                Limpiar filtros
              </Button>
            )}
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
              const stageOfertas = ofertasByStage[stage.key] || [];
              const isCollapsed = collapsedStages.has(stage.key);

              if (isCollapsed) {
                return (
                  <div key={stage.key} className="min-w-[48px]">
                    <button
                      className={`h-full min-h-[200px] w-12 rounded-lg border flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors hover:opacity-80 ${stage.color}`}
                      onClick={() => toggleStage(stage.key)}
                      title={`Mostrar ${stage.label}`}
                    >
                      <ChevronRight className="h-4 w-4 shrink-0" />
                      <span className="[writing-mode:vertical-lr] text-xs font-semibold whitespace-nowrap">{stage.label}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{stageOfertas.length}</Badge>
                    </button>
                  </div>
                );
              }

              return (
                <div key={stage.key} className="min-w-[300px] max-w-[300px]">
                  <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${stage.color}`}>
                    <span className="font-semibold text-sm">{stage.label}</span>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">{stageOfertas.length}</Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleStage(stage.key)} title="Contraer columna">
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="border border-t-0 rounded-b-lg bg-muted/30 p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-320px)] overflow-y-auto">
                    {stageOfertas.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-8">Sin ofertas</p>
                    ) : (
                      stageOfertas.map(oferta => (
                        <Card key={oferta.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedOferta(oferta)}>
                          <CardContent className="p-3 space-y-1.5">
                            <p className="text-[10px] text-muted-foreground font-mono">
                              Oferta: {oferta.id_producto ? `OP-${String(oferta.id).padStart(6, '0')}` : `O-${String(oferta.id).padStart(6, '0')}`}
                            </p>
                            <p className="font-medium text-sm truncate">
                              {oferta.id_producto
                                ? `${oferta.producto_nombre || 'Producto'} (${oferta.propiedad_nombre})`
                                : (oferta.proyecto_nombre ? `${oferta.proyecto_nombre} - ${oferta.propiedad_nombre}` : oferta.propiedad_nombre)}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" /><span className="truncate">{oferta.lead_nombre}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Building2 className="h-3 w-3" /><span className="truncate">Agente: {oferta.agente_nombre || oferta.email_creador}</span>
                            </div>
                            {oferta.inmobiliaria_nombre && (
                              <div className="flex items-center gap-1 text-xs">
                                <Building2 className="h-3 w-3" />
                                <span className={`truncate font-medium ${
                                  oferta.inmobiliaria_nombre === 'Interno'
                                    ? 'text-orange-600 dark:text-orange-400'
                                    : 'text-primary'
                                }`}>
                                  {oferta.inmobiliaria_nombre}
                                </span>
                              </div>
                            )}
                            {oferta.precio != null && oferta.precio > 0 && (
                              <div className="flex items-center gap-1 text-xs font-semibold">
                                <span>{oferta.precio.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span>
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
            <div className="flex items-center gap-2 mb-1">
              <Badge className={STAGES.find(s => s.key === selectedOferta?.stage)?.color || ''}>
                {STAGES.find(s => s.key === selectedOferta?.stage)?.label}
              </Badge>
            </div>
            <DialogTitle>
              Oferta: {selectedOferta?.id_producto
                ? `OP-${String(selectedOferta?.id).padStart(6, '0')}`
                : `O-${String(selectedOferta?.id).padStart(6, '0')}`}
            </DialogTitle>
            <DialogDescription className="sr-only">Detalle de oferta</DialogDescription>
          </DialogHeader>
          {selectedOferta && (() => {
            const fechaCreacion = new Date(selectedOferta.fecha_creacion);
            const fechaVigencia = new Date(fechaCreacion);
            fechaVigencia.setDate(fechaVigencia.getDate() + 5);
            const precioFinal = selectedOferta.precio || 0;
            const descAumento = selectedOferta.porcentaje_descuento_aumento || 0;
            const precioConAjuste = precioFinal * (1 + descAumento / 100);
            const isProducto = !!selectedOferta.id_producto;

            return (
              <div className="space-y-4">
                {/* Dates */}
                <div className="flex gap-4 text-sm bg-muted/50 rounded-md px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Creación:</span>{' '}
                    {format(fechaCreacion, 'dd MMM yyyy', { locale: es })}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Vigencia:</span>{' '}
                    {format(fechaVigencia, 'dd MMM yyyy', { locale: es })}
                  </div>
                </div>

                {/* Property / Product info */}
                <div className="border rounded-md p-3 space-y-1">
                  <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-1">
                    <Building2 className="h-4 w-4 text-primary" />
                    {isProducto ? 'Producto' : 'Propiedad'}
                  </h4>
                  <div className="text-sm space-y-0.5 pl-5">
                    {isProducto ? (
                      <>
                        <p><span className="text-muted-foreground">Nombre:</span> {selectedOferta.producto_nombre || '—'}</p>
                        <p><span className="text-muted-foreground">Propiedad:</span> {selectedOferta.propiedad_nombre}</p>
                      </>
                    ) : (
                      <p><span className="text-muted-foreground">No. Propiedad:</span> {selectedOferta.propiedad_nombre}</p>
                    )}
                    <p><span className="text-muted-foreground">Proyecto:</span> {selectedOferta.proyecto_nombre || '—'}</p>
                    {precioFinal > 0 && <p><span className="text-muted-foreground">Precio de lista:</span> ${precioFinal.toLocaleString('es-MX')}</p>}
                  </div>
                </div>

                {/* Prospecto & Agente */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="border rounded-md p-3">
                    <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-1">
                      <User className="h-4 w-4 text-primary" /> Prospecto
                    </h4>
                    <div className="text-sm pl-5 space-y-0.5">
                      <p className="truncate font-medium">{selectedOferta.lead_nombre}</p>
                      {selectedOferta.lead_email && (
                        <a href={`mailto:${selectedOferta.lead_email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                          <Mail className="h-3 w-3" />{selectedOferta.lead_email}
                        </a>
                      )}
                      {selectedOferta.lead_telefono && (
                        <a href={`tel:${selectedOferta.lead_telefono}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                          <Phone className="h-3 w-3" />{selectedOferta.lead_telefono}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="border rounded-md p-3">
                    <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-1">
                      <User className="h-4 w-4 text-primary" /> Agente
                    </h4>
                    <div className="text-sm pl-5 space-y-0.5">
                      <p className="truncate font-medium">{selectedOferta.agente_nombre || selectedOferta.email_creador}</p>
                      <a href={`mailto:${selectedOferta.email_creador}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                        <Mail className="h-3 w-3" />{selectedOferta.email_creador}
                      </a>
                      {selectedOferta.agente_telefono && (
                        <a href={`tel:${selectedOferta.agente_telefono}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                          <Phone className="h-3 w-3" />{selectedOferta.agente_telefono}
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Esquema de Pago */}
                <div className="border rounded-md p-3">
                  <h4 className="font-semibold text-sm flex items-center gap-1.5 mb-2">
                    <DollarSign className="h-4 w-4 text-primary" /> Esquema de Pago
                  </h4>
                  <div className="text-sm space-y-1 pl-5">
                    {!selectedOferta.id_esquema_pago_seleccionado ? (
                      <p className="text-muted-foreground italic">Sin esquema seleccionado</p>
                    ) : (
                      <>
                        {selectedOferta.esquema_nombre && !selectedOferta.esquema_es_manual && (
                          <p className="font-medium mb-1">{selectedOferta.esquema_nombre}</p>
                        )}
                        <div className="space-y-1 bg-muted/30 rounded-md p-2">
                          {selectedOferta.porcentaje_enganche != null && selectedOferta.porcentaje_enganche > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Enganche ({selectedOferta.porcentaje_enganche}%)</span>
                              <span className="font-medium">${(precioConAjuste * selectedOferta.porcentaje_enganche / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span>
                            </div>
                          )}
                          {selectedOferta.porcentaje_mensualidades != null && selectedOferta.porcentaje_mensualidades > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Mensualidades ({selectedOferta.porcentaje_mensualidades}%) · {selectedOferta.numero_mensualidades} meses</span>
                              <span className="font-medium">${(precioConAjuste * selectedOferta.porcentaje_mensualidades / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span>
                            </div>
                          )}
                          {selectedOferta.porcentaje_entrega != null && selectedOferta.porcentaje_entrega > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground">Entrega ({selectedOferta.porcentaje_entrega}%)</span>
                              <span className="font-medium">${(precioConAjuste * selectedOferta.porcentaje_entrega / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span>
                            </div>
                          )}
                          {descAumento !== 0 && (
                            <div className="flex justify-between items-center border-t pt-1 mt-1">
                              <span className={descAumento < 0 ? 'text-green-600' : 'text-destructive'}>{descAumento > 0 ? 'Incremento' : 'Descuento'} ({Math.abs(descAumento)}%)</span>
                              <span className={`font-medium ${descAumento < 0 ? 'text-green-600' : 'text-destructive'}`}>{descAumento < 0 ? '-' : '+'}${Math.abs(precioFinal * descAumento / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {selectedOferta.comentario_justificacion && (
                      <p className="italic text-muted-foreground mt-2 text-xs border-l-2 pl-2">"{selectedOferta.comentario_justificacion}"</p>
                    )}
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
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
