export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      actividades: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      acuerdos_pago: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          fecha_pago: string | null
          id: number
          id_concepto: number
          id_cuenta_cobranza: number
          monto: number
          orden: number
          pago_completado: boolean
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_pago?: string | null
          id?: number
          id_concepto: number
          id_cuenta_cobranza: number
          monto: number
          orden: number
          pago_completado?: boolean
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_pago?: string | null
          id?: number
          id_concepto?: number
          id_cuenta_cobranza?: number
          monto?: number
          orden?: number
          pago_completado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "acuerdos_pago_id_concepto_fkey"
            columns: ["id_concepto"]
            isOneToOne: false
            referencedRelation: "conceptos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_acpago_concepto"
            columns: ["id_concepto"]
            isOneToOne: false
            referencedRelation: "conceptos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_acpago_cuenta"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_acuerdos_pago_cuenta_cobranza"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
        ]
      }
      adminte_pago: {
        Row: {
          case: boolean | null
        }
        Insert: {
          case?: boolean | null
        }
        Update: {
          case?: boolean | null
        }
        Relationships: []
      }
      amenidades: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          habilitar_asignar: boolean
          id: number
          nombre: string
          timestamp: string
          url: string | null
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          habilitar_asignar?: boolean
          id?: number
          nombre: string
          timestamp?: string
          url?: string | null
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          habilitar_asignar?: boolean
          id?: number
          nombre?: string
          timestamp?: string
          url?: string | null
        }
        Relationships: []
      }
      amenidades_proyectos: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_amenidad: number
          id_proyecto: number
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_amenidad: number
          id_proyecto: number
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_amenidad?: number
          id_proyecto?: number
        }
        Relationships: [
          {
            foreignKeyName: "amenidades_proyectos_id_amenidad_fkey"
            columns: ["id_amenidad"]
            isOneToOne: false
            referencedRelation: "amenidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "amenidades_proyectos_id_proyecto_fkey"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      aplicaciones_pago: {
        Row: {
          activo: boolean
          es_multa: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_acuerdo_pago: number
          id_pago: number
          monto: number
        }
        Insert: {
          activo?: boolean
          es_multa?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_acuerdo_pago: number
          id_pago: number
          monto: number
        }
        Update: {
          activo?: boolean
          es_multa?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_acuerdo_pago?: number
          id_pago?: number
          monto?: number
        }
        Relationships: [
          {
            foreignKeyName: "aplicaciones_pago_id_acuerdo_pago_fkey"
            columns: ["id_acuerdo_pago"]
            isOneToOne: false
            referencedRelation: "acuerdos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_aplicaciones_pago_pago"
            columns: ["id_pago"]
            isOneToOne: false
            referencedRelation: "pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos_legales: {
        Row: {
          activo: boolean
          contenido: string
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_proyecto: number
          orden: number
        }
        Insert: {
          activo?: boolean
          contenido: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_proyecto: number
          orden: number
        }
        Update: {
          activo?: boolean
          contenido?: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_proyecto?: number
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_avisos_legales_proyecto"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      bancos: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      beneficiarios: {
        Row: {
          activo: boolean
          email: string | null
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_parentesco: number
          id_persona: number
          nombre_beneficiario: string
          porcentaje_participacion: number
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          email?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_parentesco: number
          id_persona: number
          nombre_beneficiario: string
          porcentaje_participacion: number
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          email?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_parentesco?: number
          id_persona?: number
          nombre_beneficiario?: string
          porcentaje_participacion?: number
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beneficiarios_id_parentesco_fkey"
            columns: ["id_parentesco"]
            isOneToOne: false
            referencedRelation: "parentescos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiarios_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_beneficiarios_parentesco"
            columns: ["id_parentesco"]
            isOneToOne: false
            referencedRelation: "parentescos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_beneficiarios_persona"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      bodegas: {
        Row: {
          activo: boolean
          es_incluido: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_producto: number
          id_propiedad: number
          m2: number
          nombre: string
          ubicacion: string | null
        }
        Insert: {
          activo?: boolean
          es_incluido?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_producto: number
          id_propiedad: number
          m2?: number
          nombre: string
          ubicacion?: string | null
        }
        Update: {
          activo?: boolean
          es_incluido?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_producto?: number
          id_propiedad?: number
          m2?: number
          nombre?: string
          ubicacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bodegas_id_producto_fkey"
            columns: ["id_producto"]
            isOneToOne: false
            referencedRelation: "productos_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodegas_id_propiedad_fkey"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bodegas_producto"
            columns: ["id_producto"]
            isOneToOne: false
            referencedRelation: "productos_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bodegas_propiedad"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
        ]
      }
      bodegas_stagin: {
        Row: {
          id: number
          id_producto: number | null
          id_propiedad: number | null
          m2_bodega: string | null
          nombre_bodega: string | null
          nombre_producto: string | null
          nombre_proyecto: string | null
          numero_departamento: string | null
          ubicacion_bodega: string | null
        }
        Insert: {
          id?: number
          id_producto?: number | null
          id_propiedad?: number | null
          m2_bodega?: string | null
          nombre_bodega?: string | null
          nombre_producto?: string | null
          nombre_proyecto?: string | null
          numero_departamento?: string | null
          ubicacion_bodega?: string | null
        }
        Update: {
          id?: number
          id_producto?: number | null
          id_propiedad?: number | null
          m2_bodega?: string | null
          nombre_bodega?: string | null
          nombre_producto?: string | null
          nombre_proyecto?: string | null
          numero_departamento?: string | null
          ubicacion_bodega?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bodegas_stagin_id_producto_fkey"
            columns: ["id_producto"]
            isOneToOne: false
            referencedRelation: "productos_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodegas_stagin_id_propiedad_fkey"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
        ]
      }
      borrar_acuerdos_pago_manto_stagin: {
        Row: {
          fecha_pago: string | null
          id: number
          id_concepto: number | null
          id_cuenta_cobranza: number | null
          m2: number | null
          orden: number | null
          precio_m2: number | null
        }
        Insert: {
          fecha_pago?: string | null
          id?: number
          id_concepto?: number | null
          id_cuenta_cobranza?: number | null
          m2?: number | null
          orden?: number | null
          precio_m2?: number | null
        }
        Update: {
          fecha_pago?: string | null
          id?: number
          id_concepto?: number | null
          id_cuenta_cobranza?: number | null
          m2?: number | null
          orden?: number | null
          precio_m2?: number | null
        }
        Relationships: []
      }
      borrar_acuerdos_pago_productos_stagin: {
        Row: {
          collection_id: number
          concepto: string | null
          fecha_pago: string | null
          id: number
          id_concepto: number | null
          id_cuenta_cobranza: number | null
          monto: number | null
        }
        Insert: {
          collection_id: number
          concepto?: string | null
          fecha_pago?: string | null
          id?: number
          id_concepto?: number | null
          id_cuenta_cobranza?: number | null
          monto?: number | null
        }
        Update: {
          collection_id?: number
          concepto?: string | null
          fecha_pago?: string | null
          id?: number
          id_concepto?: number | null
          id_cuenta_cobranza?: number | null
          monto?: number | null
        }
        Relationships: []
      }
      borrar_acuerdos_pago_stagin: {
        Row: {
          collection_id: number | null
          concepto: string | null
          fecha_pago: string | null
          id: number
          id_concepto: number | null
          id_cuenta_cobranza: number | null
          monto: number | null
        }
        Insert: {
          collection_id?: number | null
          concepto?: string | null
          fecha_pago?: string | null
          id?: number
          id_concepto?: number | null
          id_cuenta_cobranza?: number | null
          monto?: number | null
        }
        Update: {
          collection_id?: number | null
          concepto?: string | null
          fecha_pago?: string | null
          id?: number
          id_concepto?: number | null
          id_cuenta_cobranza?: number | null
          monto?: number | null
        }
        Relationships: []
      }
      borrar_amenidades_proyectos_stagin: {
        Row: {
          amenidad: string | null
          id: number
          proyecto: string | null
        }
        Insert: {
          amenidad?: string | null
          id?: number
          proyecto?: string | null
        }
        Update: {
          amenidad?: string | null
          id?: number
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_aplicacion_pagos_migracion: {
        Row: {
          estatus: string
          fecha_fin: string | null
          fecha_inicio: string | null
          id_cuenta_cobranza: number
          monto_aplicado: number | null
          pagos_aplicados: number | null
        }
        Insert: {
          estatus?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id_cuenta_cobranza: number
          monto_aplicado?: number | null
          pagos_aplicados?: number | null
        }
        Update: {
          estatus?: string
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id_cuenta_cobranza?: number
          monto_aplicado?: number | null
          pagos_aplicados?: number | null
        }
        Relationships: []
      }
      borrar_bodegas_estacionamientos_daiku_stagin: {
        Row: {
          id: number
          metraje: number | null
          nivel: string | null
          nombre: string | null
          num_depa: string | null
          precio: number | null
          tipo: string | null
          tipo_estacionamiento: string | null
        }
        Insert: {
          id?: number
          metraje?: number | null
          nivel?: string | null
          nombre?: string | null
          num_depa?: string | null
          precio?: number | null
          tipo?: string | null
          tipo_estacionamiento?: string | null
        }
        Update: {
          id?: number
          metraje?: number | null
          nivel?: string | null
          nombre?: string | null
          num_depa?: string | null
          precio?: number | null
          tipo?: string | null
          tipo_estacionamiento?: string | null
        }
        Relationships: []
      }
      borrar_bodegas_stagin: {
        Row: {
          edificio: string | null
          id: number
          id_departamento: number | null
          id_edificio: number | null
          id_proyecto: number | null
          metraje: number | null
          nombre_bodega: string | null
          num_depa: string | null
          proyecto: string | null
        }
        Insert: {
          edificio?: string | null
          id?: number
          id_departamento?: number | null
          id_edificio?: number | null
          id_proyecto?: number | null
          metraje?: number | null
          nombre_bodega?: string | null
          num_depa?: string | null
          proyecto?: string | null
        }
        Update: {
          edificio?: string | null
          id?: number
          id_departamento?: number | null
          id_edificio?: number | null
          id_proyecto?: number | null
          metraje?: number | null
          nombre_bodega?: string | null
          num_depa?: string | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_brochures_proyecto_stagin: {
        Row: {
          documento_url: string | null
          id: number
          id_proyecto: number | null
          proyecto: string | null
        }
        Insert: {
          documento_url?: string | null
          id?: number
          id_proyecto?: number | null
          proyecto?: string | null
        }
        Update: {
          documento_url?: string | null
          id?: number
          id_proyecto?: number | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_cuentas_bancarias_stagin: {
        Row: {
          comprador: string | null
          cuenta_de_su_propiedad: string | null
          id: number
          id_comprador: number | null
        }
        Insert: {
          comprador?: string | null
          cuenta_de_su_propiedad?: string | null
          id?: number
          id_comprador?: number | null
        }
        Update: {
          comprador?: string | null
          cuenta_de_su_propiedad?: string | null
          id?: number
          id_comprador?: number | null
        }
        Relationships: []
      }
      borrar_cuentas_cobranza_mantenimientos_stagin: {
        Row: {
          clabe_stp: number | null
          id_collection_padre: number | null
          id_cuenta_cobranza_mantenimiento_nueva: number | null
        }
        Insert: {
          clabe_stp?: number | null
          id_collection_padre?: number | null
          id_cuenta_cobranza_mantenimiento_nueva?: number | null
        }
        Update: {
          clabe_stp?: number | null
          id_collection_padre?: number | null
          id_cuenta_cobranza_mantenimiento_nueva?: number | null
        }
        Relationships: []
      }
      borrar_cuentas_cobranza_productos_stagin: {
        Row: {
          clabe_stp: number | null
          collection_id: number
          comprador: string | null
          edificio: string | null
          fecha_compra: string | null
          id_edificio_modelo: number | null
          id_oferta: string | null
          id_proyecto: number | null
          modelo: string | null
          numero_propiedad: number | null
          porcentaje_comision_venta: number | null
          precio_final: number | null
          proyecto: string | null
          valor_uma: number | null
        }
        Insert: {
          clabe_stp?: number | null
          collection_id: number
          comprador?: string | null
          edificio?: string | null
          fecha_compra?: string | null
          id_edificio_modelo?: number | null
          id_oferta?: string | null
          id_proyecto?: number | null
          modelo?: string | null
          numero_propiedad?: number | null
          porcentaje_comision_venta?: number | null
          precio_final?: number | null
          proyecto?: string | null
          valor_uma?: number | null
        }
        Update: {
          clabe_stp?: number | null
          collection_id?: number
          comprador?: string | null
          edificio?: string | null
          fecha_compra?: string | null
          id_edificio_modelo?: number | null
          id_oferta?: string | null
          id_proyecto?: number | null
          modelo?: string | null
          numero_propiedad?: number | null
          porcentaje_comision_venta?: number | null
          precio_final?: number | null
          proyecto?: string | null
          valor_uma?: number | null
        }
        Relationships: []
      }
      borrar_cuentas_cobranza_stagin: {
        Row: {
          clabe_stp: number
          collection_id: number | null
          comprador: string | null
          edificio: string | null
          fecha_compra: string | null
          id: number
          id_comprador: number | null
          id_edificio_modelo: number | null
          id_oferta: number | null
          id_propiedad: number | null
          id_proyecto: number | null
          modelo: string | null
          numero_propiedad: string | null
          porcentaje_comision_venta: number | null
          precio_final: number | null
          proyecto: string | null
          valor_uma: number | null
        }
        Insert: {
          clabe_stp: number
          collection_id?: number | null
          comprador?: string | null
          edificio?: string | null
          fecha_compra?: string | null
          id?: number
          id_comprador?: number | null
          id_edificio_modelo?: number | null
          id_oferta?: number | null
          id_propiedad?: number | null
          id_proyecto?: number | null
          modelo?: string | null
          numero_propiedad?: string | null
          porcentaje_comision_venta?: number | null
          precio_final?: number | null
          proyecto?: string | null
          valor_uma?: number | null
        }
        Update: {
          clabe_stp?: number
          collection_id?: number | null
          comprador?: string | null
          edificio?: string | null
          fecha_compra?: string | null
          id?: number
          id_comprador?: number | null
          id_edificio_modelo?: number | null
          id_oferta?: number | null
          id_propiedad?: number | null
          id_proyecto?: number | null
          modelo?: string | null
          numero_propiedad?: string | null
          porcentaje_comision_venta?: number | null
          precio_final?: number | null
          proyecto?: string | null
          valor_uma?: number | null
        }
        Relationships: []
      }
      borrar_documentos_stagin: {
        Row: {
          documento_url: string | null
          edificio: string | null
          es_verificado: boolean | null
          id: number
          id_edificio_modelo: number | null
          id_persona: number | null
          id_propiedad: number | null
          id_proyecto: number | null
          id_tipo_documento: number | null
          modelo: string | null
          num_propiedad: string | null
          persona: string | null
          proyecto: string | null
          tipo_documento: string | null
          tipo_persona: string | null
        }
        Insert: {
          documento_url?: string | null
          edificio?: string | null
          es_verificado?: boolean | null
          id?: number
          id_edificio_modelo?: number | null
          id_persona?: number | null
          id_propiedad?: number | null
          id_proyecto?: number | null
          id_tipo_documento?: number | null
          modelo?: string | null
          num_propiedad?: string | null
          persona?: string | null
          proyecto?: string | null
          tipo_documento?: string | null
          tipo_persona?: string | null
        }
        Update: {
          documento_url?: string | null
          edificio?: string | null
          es_verificado?: boolean | null
          id?: number
          id_edificio_modelo?: number | null
          id_persona?: number | null
          id_propiedad?: number | null
          id_proyecto?: number | null
          id_tipo_documento?: number | null
          modelo?: string | null
          num_propiedad?: string | null
          persona?: string | null
          proyecto?: string | null
          tipo_documento?: string | null
          tipo_persona?: string | null
        }
        Relationships: []
      }
      borrar_duenos_desarrolladoras_proyecto_stagin: {
        Row: {
          dueno: string | null
          id: number
          proyecto: string | null
          tipo: number | null
        }
        Insert: {
          dueno?: string | null
          id?: number
          proyecto?: string | null
          tipo?: number | null
        }
        Update: {
          dueno?: string | null
          id?: number
          proyecto?: string | null
          tipo?: number | null
        }
        Relationships: []
      }
      borrar_edificios_stagin: {
        Row: {
          fecha_lanzamiento: string | null
          id: number
          nombre: string
          numero_pisos: string | null
          proyecto: string | null
        }
        Insert: {
          fecha_lanzamiento?: string | null
          id?: number
          nombre: string
          numero_pisos?: string | null
          proyecto?: string | null
        }
        Update: {
          fecha_lanzamiento?: string | null
          id?: number
          nombre?: string
          numero_pisos?: string | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_esquemas_pago_stagin: {
        Row: {
          id: number
          nombre: string
          numero_mensualidades: string | null
          porcentaje_descuento_aumento: string | null
          porcentaje_enganche: string | null
          porcentaje_entrega: string | null
          porcentaje_mensualidades: string | null
          proyecto: string
        }
        Insert: {
          id?: number
          nombre: string
          numero_mensualidades?: string | null
          porcentaje_descuento_aumento?: string | null
          porcentaje_enganche?: string | null
          porcentaje_entrega?: string | null
          porcentaje_mensualidades?: string | null
          proyecto: string
        }
        Update: {
          id?: number
          nombre?: string
          numero_mensualidades?: string | null
          porcentaje_descuento_aumento?: string | null
          porcentaje_enganche?: string | null
          porcentaje_entrega?: string | null
          porcentaje_mensualidades?: string | null
          proyecto?: string
        }
        Relationships: []
      }
      borrar_estacionamientos_stagin: {
        Row: {
          edificio: string | null
          id: number
          id_departamento: number | null
          id_edificio: number | null
          id_proyecto: number | null
          id_tipo_estacionamiento: number | null
          metraje: number | null
          nombre_estacionamiento: string | null
          num_depa: string | null
          proyecto: string | null
        }
        Insert: {
          edificio?: string | null
          id?: number
          id_departamento?: number | null
          id_edificio?: number | null
          id_proyecto?: number | null
          id_tipo_estacionamiento?: number | null
          metraje?: number | null
          nombre_estacionamiento?: string | null
          num_depa?: string | null
          proyecto?: string | null
        }
        Update: {
          edificio?: string | null
          id?: number
          id_departamento?: number | null
          id_edificio?: number | null
          id_proyecto?: number | null
          id_tipo_estacionamiento?: number | null
          metraje?: number | null
          nombre_estacionamiento?: string | null
          num_depa?: string | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_leads_hs_manuel_stagin: {
        Row: {
          clave_pais_telefono: string | null
          email: string | null
          id: number
          id_persona_duena_lead: number | null
          id_proyecto: number | null
          nombre_completo: string | null
          telefono: string | null
        }
        Insert: {
          clave_pais_telefono?: string | null
          email?: string | null
          id?: number
          id_persona_duena_lead?: number | null
          id_proyecto?: number | null
          nombre_completo?: string | null
          telefono?: string | null
        }
        Update: {
          clave_pais_telefono?: string | null
          email?: string | null
          id?: number
          id_persona_duena_lead?: number | null
          id_proyecto?: number | null
          nombre_completo?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      borrar_modelos_caracteristicas_stagin: {
        Row: {
          caracteristica: string | null
          id: number
          modelo: string | null
          proyecto: string | null
        }
        Insert: {
          caracteristica?: string | null
          id?: number
          modelo?: string | null
          proyecto?: string | null
        }
        Update: {
          caracteristica?: string | null
          id?: number
          modelo?: string | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_modelos_stagin: {
        Row: {
          descripcion: string | null
          id: number
          nombre: string | null
          numero_completo_banos: string | null
          numero_medio_bano: string | null
          numero_recamaras: string | null
          proyecto: string | null
        }
        Insert: {
          descripcion?: string | null
          id?: number
          nombre?: string | null
          numero_completo_banos?: string | null
          numero_medio_bano?: string | null
          numero_recamaras?: string | null
          proyecto?: string | null
        }
        Update: {
          descripcion?: string | null
          id?: number
          nombre?: string | null
          numero_completo_banos?: string | null
          numero_medio_bano?: string | null
          numero_recamaras?: string | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_multimedias_modelo_stagin: {
        Row: {
          id: number
          modelo: string | null
          proyecto: string | null
          url: string | null
          ver_como_ubicacion_en_oferta: boolean | null
        }
        Insert: {
          id?: number
          modelo?: string | null
          proyecto?: string | null
          url?: string | null
          ver_como_ubicacion_en_oferta?: boolean | null
        }
        Update: {
          id?: number
          modelo?: string | null
          proyecto?: string | null
          url?: string | null
          ver_como_ubicacion_en_oferta?: boolean | null
        }
        Relationships: []
      }
      borrar_multimedias_todo_stagin: {
        Row: {
          id: number
          proyecto: string | null
          url: string | null
        }
        Insert: {
          id?: number
          proyecto?: string | null
          url?: string | null
        }
        Update: {
          id?: number
          proyecto?: string | null
          url?: string | null
        }
        Relationships: []
      }
      borrar_ofertas_esquemas_pago_productos_stagin: {
        Row: {
          collection_id: number | null
          comprador: string | null
          edificio: string | null
          id: number
          id_edificio_modelo: number | null
          id_persona_lead: number | null
          id_producto_servicio: number | null
          id_propiedad: number | null
          id_proyecto: number | null
          insert_esquemas_pago: string | null
          modelo: string | null
          nombre_esquema_pago: string | null
          numero_propiedad: string | null
          producto: string | null
          proyecto: string | null
        }
        Insert: {
          collection_id?: number | null
          comprador?: string | null
          edificio?: string | null
          id?: number
          id_edificio_modelo?: number | null
          id_persona_lead?: number | null
          id_producto_servicio?: number | null
          id_propiedad?: number | null
          id_proyecto?: number | null
          insert_esquemas_pago?: string | null
          modelo?: string | null
          nombre_esquema_pago?: string | null
          numero_propiedad?: string | null
          producto?: string | null
          proyecto?: string | null
        }
        Update: {
          collection_id?: number | null
          comprador?: string | null
          edificio?: string | null
          id?: number
          id_edificio_modelo?: number | null
          id_persona_lead?: number | null
          id_producto_servicio?: number | null
          id_propiedad?: number | null
          id_proyecto?: number | null
          insert_esquemas_pago?: string | null
          modelo?: string | null
          nombre_esquema_pago?: string | null
          numero_propiedad?: string | null
          producto?: string | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_ofertas_stagin: {
        Row: {
          email_creador: string
          fecha_generacion: string | null
          id: number
          id_esquema_pago_seleccionado: number | null
          id_persona_lead: number | null
          id_propiedad: number | null
          numero_mensualidades: number | null
          numero_propiedad: string | null
          persona: string | null
          porcentaje_descuento_aumento: number | null
          porcentaje_enganche: number | null
          porcentaje_entrega: number | null
          porcentaje_mensualidades: number | null
          proyecto: string | null
        }
        Insert: {
          email_creador: string
          fecha_generacion?: string | null
          id?: number
          id_esquema_pago_seleccionado?: number | null
          id_persona_lead?: number | null
          id_propiedad?: number | null
          numero_mensualidades?: number | null
          numero_propiedad?: string | null
          persona?: string | null
          porcentaje_descuento_aumento?: number | null
          porcentaje_enganche?: number | null
          porcentaje_entrega?: number | null
          porcentaje_mensualidades?: number | null
          proyecto?: string | null
        }
        Update: {
          email_creador?: string
          fecha_generacion?: string | null
          id?: number
          id_esquema_pago_seleccionado?: number | null
          id_persona_lead?: number | null
          id_propiedad?: number | null
          numero_mensualidades?: number | null
          numero_propiedad?: string | null
          persona?: string | null
          porcentaje_descuento_aumento?: number | null
          porcentaje_enganche?: number | null
          porcentaje_entrega?: number | null
          porcentaje_mensualidades?: number | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_pagos_duplicate2: {
        Row: {
          activo: boolean
          clave_rastreo: string | null
          descripcion: string | null
          fecha_actualizacion: string
          fecha_creacion: string
          fecha_pago: string
          id: number
          id_cuenta_cobranza: number
          id_metodos_pago: number
          monto: number
          url_cep: string | null
          url_recibo: string | null
        }
        Insert: {
          activo?: boolean
          clave_rastreo?: string | null
          descripcion?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_pago: string
          id?: number
          id_cuenta_cobranza: number
          id_metodos_pago: number
          monto: number
          url_cep?: string | null
          url_recibo?: string | null
        }
        Update: {
          activo?: boolean
          clave_rastreo?: string | null
          descripcion?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_pago?: string
          id?: number
          id_cuenta_cobranza?: number
          id_metodos_pago?: number
          monto?: number
          url_cep?: string | null
          url_recibo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_duplicate2_id_cuenta_cobranza_fkey"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_duplicate2_id_cuenta_cobranza_fkey1"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_duplicate2_id_metodos_pago_fkey"
            columns: ["id_metodos_pago"]
            isOneToOne: false
            referencedRelation: "metodos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_duplicate2_id_metodos_pago_fkey1"
            columns: ["id_metodos_pago"]
            isOneToOne: false
            referencedRelation: "metodos_pago"
            referencedColumns: ["id"]
          },
        ]
      }
      borrar_pagos_stagin: {
        Row: {
          clave_rastreo: string | null
          collection_id: number | null
          descripcion: string | null
          estatus: string | null
          fecha_pago: string | null
          id: number
          id_cuenta_cobranza: number | null
          id_metodos_pago: number | null
          metodo_pago: string | null
          monto: number | null
          tipo_pago: string
          url_cep: string | null
          url_recibo: string | null
        }
        Insert: {
          clave_rastreo?: string | null
          collection_id?: number | null
          descripcion?: string | null
          estatus?: string | null
          fecha_pago?: string | null
          id?: number
          id_cuenta_cobranza?: number | null
          id_metodos_pago?: number | null
          metodo_pago?: string | null
          monto?: number | null
          tipo_pago?: string
          url_cep?: string | null
          url_recibo?: string | null
        }
        Update: {
          clave_rastreo?: string | null
          collection_id?: number | null
          descripcion?: string | null
          estatus?: string | null
          fecha_pago?: string | null
          id?: number
          id_cuenta_cobranza?: number | null
          id_metodos_pago?: number | null
          metodo_pago?: string | null
          monto?: number | null
          tipo_pago?: string
          url_cep?: string | null
          url_recibo?: string | null
        }
        Relationships: []
      }
      borrar_pagos_stp_cuentas_437_y_445: {
        Row: {
          claveRastreo: string | null
          conceptoPago: string | null
          created_at: string | null
          cuentaBeneficiario: number | null
          cuentaBeneficiario2: string | null
          cuentaOrdenante: number | null
          empresa: string | null
          fechaOperacion: number | null
          folioCodi: string | null
          id: number | null
          institucionBeneficiaria: number | null
          institucionOrdenante: number | null
          monto: number | null
          nombreBeneficiario: string | null
          nombreBeneficiario2: string | null
          nombreOrdenante: string | null
          nueva_cuenta_cobranza: number | null
          referenciaNumerica: number | null
          rfcCurpBeneficiario: string | null
          rfcCurpOrdenante: string | null
          stp_id: number | null
          tipoCuentaBeneficiario: number | null
          tipoCuentaBeneficiario2: string | null
          tipoCuentaOrdenante: number | null
          tipoPago: number | null
          tsLiquidacion: number | null
          updated_at: string | null
        }
        Insert: {
          claveRastreo?: string | null
          conceptoPago?: string | null
          created_at?: string | null
          cuentaBeneficiario?: number | null
          cuentaBeneficiario2?: string | null
          cuentaOrdenante?: number | null
          empresa?: string | null
          fechaOperacion?: number | null
          folioCodi?: string | null
          id?: number | null
          institucionBeneficiaria?: number | null
          institucionOrdenante?: number | null
          monto?: number | null
          nombreBeneficiario?: string | null
          nombreBeneficiario2?: string | null
          nombreOrdenante?: string | null
          nueva_cuenta_cobranza?: number | null
          referenciaNumerica?: number | null
          rfcCurpBeneficiario?: string | null
          rfcCurpOrdenante?: string | null
          stp_id?: number | null
          tipoCuentaBeneficiario?: number | null
          tipoCuentaBeneficiario2?: string | null
          tipoCuentaOrdenante?: number | null
          tipoPago?: number | null
          tsLiquidacion?: number | null
          updated_at?: string | null
        }
        Update: {
          claveRastreo?: string | null
          conceptoPago?: string | null
          created_at?: string | null
          cuentaBeneficiario?: number | null
          cuentaBeneficiario2?: string | null
          cuentaOrdenante?: number | null
          empresa?: string | null
          fechaOperacion?: number | null
          folioCodi?: string | null
          id?: number | null
          institucionBeneficiaria?: number | null
          institucionOrdenante?: number | null
          monto?: number | null
          nombreBeneficiario?: string | null
          nombreBeneficiario2?: string | null
          nombreOrdenante?: string | null
          nueva_cuenta_cobranza?: number | null
          referenciaNumerica?: number | null
          rfcCurpBeneficiario?: string | null
          rfcCurpOrdenante?: string | null
          stp_id?: number | null
          tipoCuentaBeneficiario?: number | null
          tipoCuentaBeneficiario2?: string | null
          tipoCuentaOrdenante?: number | null
          tipoPago?: number | null
          tsLiquidacion?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      borrar_pagos_stp_raw_duplicate: {
        Row: {
          claverastreo: string
          concepto_pago: string | null
          cuenta_beneficiario: string
          cuenta_beneficiario2: string | null
          cuenta_ordenante: string | null
          empresa: string | null
          es_pago_aplicado: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          fecha_operacion: string | null
          folio_codi: string | null
          id: number
          id_tipo_pago: number
          institucion_beneficiaria: string | null
          institucion_ordenante: string | null
          monto: number
          nombre_beneficiario: string | null
          nombre_beneficiario2: string | null
          nombre_ordenante: string | null
          razon_rechazo: string | null
          referencia_numerica: string | null
          rfc_curp_beneficiario: string | null
          rfc_curp_ordenante: string | null
          stp_id: string | null
          tipo_cuenta_beneficiario: string | null
          tipo_cuenta_beneficiario2: string | null
          tipo_cuenta_ordenante: string | null
          tipo_pago: string | null
          ts_liquidacion: string | null
        }
        Insert: {
          claverastreo: string
          concepto_pago?: string | null
          cuenta_beneficiario: string
          cuenta_beneficiario2?: string | null
          cuenta_ordenante?: string | null
          empresa?: string | null
          es_pago_aplicado?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_operacion?: string | null
          folio_codi?: string | null
          id?: number
          id_tipo_pago?: number
          institucion_beneficiaria?: string | null
          institucion_ordenante?: string | null
          monto: number
          nombre_beneficiario?: string | null
          nombre_beneficiario2?: string | null
          nombre_ordenante?: string | null
          razon_rechazo?: string | null
          referencia_numerica?: string | null
          rfc_curp_beneficiario?: string | null
          rfc_curp_ordenante?: string | null
          stp_id?: string | null
          tipo_cuenta_beneficiario?: string | null
          tipo_cuenta_beneficiario2?: string | null
          tipo_cuenta_ordenante?: string | null
          tipo_pago?: string | null
          ts_liquidacion?: string | null
        }
        Update: {
          claverastreo?: string
          concepto_pago?: string | null
          cuenta_beneficiario?: string
          cuenta_beneficiario2?: string | null
          cuenta_ordenante?: string | null
          empresa?: string | null
          es_pago_aplicado?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_operacion?: string | null
          folio_codi?: string | null
          id?: number
          id_tipo_pago?: number
          institucion_beneficiaria?: string | null
          institucion_ordenante?: string | null
          monto?: number
          nombre_beneficiario?: string | null
          nombre_beneficiario2?: string | null
          nombre_ordenante?: string | null
          razon_rechazo?: string | null
          referencia_numerica?: string | null
          rfc_curp_beneficiario?: string | null
          rfc_curp_ordenante?: string | null
          stp_id?: string | null
          tipo_cuenta_beneficiario?: string | null
          tipo_cuenta_beneficiario2?: string | null
          tipo_cuenta_ordenante?: string | null
          tipo_pago?: string | null
          ts_liquidacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "borrar_pagos_stp_raw_duplicate_id_tipo_pago_fkey"
            columns: ["id_tipo_pago"]
            isOneToOne: false
            referencedRelation: "tipos_pago"
            referencedColumns: ["id"]
          },
        ]
      }
      borrar_personas_stagin: {
        Row: {
          clave_pais_telefono: string | null
          conyuge: string | null
          curp: string | null
          direccion_calle: string | null
          direccion_calle_sola: string | null
          direccion_codigo_postal: string | null
          direccion_colonia: string | null
          direccion_estado: string | null
          direccion_fiscal_calle: string | null
          direccion_fiscal_codigo_postal: string | null
          direccion_fiscal_colonia: string | null
          direccion_fiscal_estado: string | null
          direccion_fiscal_municipio: string | null
          direccion_fiscal_num_ext: string | null
          direccion_fiscal_num_int: string | null
          direccion_fiscal_pais: string | null
          direccion_municipio: string | null
          direccion_num_ext: string | null
          direccion_num_int: string | null
          direccion_pais: string | null
          email: string
          estado_civil: string | null
          estado_nacimiento: string | null
          fecha_escritura: string | null
          fecha_nacimiento: string | null
          fecha_registro: string | null
          folio_mercantil: string | null
          id: number
          id_entidad_relacionada_rep_leg: string | null
          id_notario: string | null
          identificador_funcion_persona: number | null
          municipio_nacimiento: string | null
          nombre_comercial: string | null
          nombre_legal: string
          numero_escritura: string | null
          numero_identificacion: string | null
          numero_libro: string | null
          ocupacion: string | null
          pais_nacimiento: string | null
          regimen: string | null
          rfc: string | null
          sexo: string | null
          telefono: string | null
          tipo_identificacion: string | null
          tipo_persona: string
          url_logo: string | null
          uso_cfdi: string | null
        }
        Insert: {
          clave_pais_telefono?: string | null
          conyuge?: string | null
          curp?: string | null
          direccion_calle?: string | null
          direccion_calle_sola?: string | null
          direccion_codigo_postal?: string | null
          direccion_colonia?: string | null
          direccion_estado?: string | null
          direccion_fiscal_calle?: string | null
          direccion_fiscal_codigo_postal?: string | null
          direccion_fiscal_colonia?: string | null
          direccion_fiscal_estado?: string | null
          direccion_fiscal_municipio?: string | null
          direccion_fiscal_num_ext?: string | null
          direccion_fiscal_num_int?: string | null
          direccion_fiscal_pais?: string | null
          direccion_municipio?: string | null
          direccion_num_ext?: string | null
          direccion_num_int?: string | null
          direccion_pais?: string | null
          email: string
          estado_civil?: string | null
          estado_nacimiento?: string | null
          fecha_escritura?: string | null
          fecha_nacimiento?: string | null
          fecha_registro?: string | null
          folio_mercantil?: string | null
          id?: number
          id_entidad_relacionada_rep_leg?: string | null
          id_notario?: string | null
          identificador_funcion_persona?: number | null
          municipio_nacimiento?: string | null
          nombre_comercial?: string | null
          nombre_legal: string
          numero_escritura?: string | null
          numero_identificacion?: string | null
          numero_libro?: string | null
          ocupacion?: string | null
          pais_nacimiento?: string | null
          regimen?: string | null
          rfc?: string | null
          sexo?: string | null
          telefono?: string | null
          tipo_identificacion?: string | null
          tipo_persona: string
          url_logo?: string | null
          uso_cfdi?: string | null
        }
        Update: {
          clave_pais_telefono?: string | null
          conyuge?: string | null
          curp?: string | null
          direccion_calle?: string | null
          direccion_calle_sola?: string | null
          direccion_codigo_postal?: string | null
          direccion_colonia?: string | null
          direccion_estado?: string | null
          direccion_fiscal_calle?: string | null
          direccion_fiscal_codigo_postal?: string | null
          direccion_fiscal_colonia?: string | null
          direccion_fiscal_estado?: string | null
          direccion_fiscal_municipio?: string | null
          direccion_fiscal_num_ext?: string | null
          direccion_fiscal_num_int?: string | null
          direccion_fiscal_pais?: string | null
          direccion_municipio?: string | null
          direccion_num_ext?: string | null
          direccion_num_int?: string | null
          direccion_pais?: string | null
          email?: string
          estado_civil?: string | null
          estado_nacimiento?: string | null
          fecha_escritura?: string | null
          fecha_nacimiento?: string | null
          fecha_registro?: string | null
          folio_mercantil?: string | null
          id?: number
          id_entidad_relacionada_rep_leg?: string | null
          id_notario?: string | null
          identificador_funcion_persona?: number | null
          municipio_nacimiento?: string | null
          nombre_comercial?: string | null
          nombre_legal?: string
          numero_escritura?: string | null
          numero_identificacion?: string | null
          numero_libro?: string | null
          ocupacion?: string | null
          pais_nacimiento?: string | null
          regimen?: string | null
          rfc?: string | null
          sexo?: string | null
          telefono?: string | null
          tipo_identificacion?: string | null
          tipo_persona?: string
          url_logo?: string | null
          uso_cfdi?: string | null
        }
        Relationships: []
      }
      borrar_propiedades_cuenta_stp_stagin: {
        Row: {
          clabe_stp_tmp_apartado: number | null
          edificio: string | null
          id: number
          id_edificio_modelo: number | null
          id_propiedad: number | null
          id_proyecto: number | null
          modelo: string | null
          numero_propiedad: string | null
          proyecto: string | null
        }
        Insert: {
          clabe_stp_tmp_apartado?: number | null
          edificio?: string | null
          id: number
          id_edificio_modelo?: number | null
          id_propiedad?: number | null
          id_proyecto?: number | null
          modelo?: string | null
          numero_propiedad?: string | null
          proyecto?: string | null
        }
        Update: {
          clabe_stp_tmp_apartado?: number | null
          edificio?: string | null
          id?: number
          id_edificio_modelo?: number | null
          id_propiedad?: number | null
          id_proyecto?: number | null
          modelo?: string | null
          numero_propiedad?: string | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_propiedades_imagenes_360_stagin: {
        Row: {
          edificio: string | null
          id: number
          id_depa: number | null
          id_edificio: number | null
          id_proyecto: number | null
          imagen: string | null
          num_depa: string | null
          proyecto: string | null
        }
        Insert: {
          edificio?: string | null
          id?: number
          id_depa?: number | null
          id_edificio?: number | null
          id_proyecto?: number | null
          imagen?: string | null
          num_depa?: string | null
          proyecto?: string | null
        }
        Update: {
          edificio?: string | null
          id?: number
          id_depa?: number | null
          id_edificio?: number | null
          id_proyecto?: number | null
          imagen?: string | null
          num_depa?: string | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_propiedades_imagenes_stagin: {
        Row: {
          edificio: string | null
          id: number
          id_depa: number | null
          id_edificio: number | null
          id_proyecto: number | null
          imagen: string | null
          num_depa: string | null
          proyecto: string | null
        }
        Insert: {
          edificio?: string | null
          id?: number
          id_depa?: number | null
          id_edificio?: number | null
          id_proyecto?: number | null
          imagen?: string | null
          num_depa?: string | null
          proyecto?: string | null
        }
        Update: {
          edificio?: string | null
          id?: number
          id_depa?: number | null
          id_edificio?: number | null
          id_proyecto?: number | null
          imagen?: string | null
          num_depa?: string | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_propiedades_stagin: {
        Row: {
          clabe_stp_tmp_apartado: string | null
          descripcion: string | null
          disponibilidad_original: string | null
          disponibilidad_traducida_texto: string | null
          dueno: string | null
          edificio: string | null
          es_aprobado: boolean | null
          id: number
          id_edificio: number | null
          id_estatus_disponibilidad_nuevo: number | null
          id_modelo: number | null
          id_persona_dueno: number | null
          id_proyecto: number | null
          m2_exteriores: number | null
          m2_interiores: number | null
          m2_loft: number | null
          modelo: string | null
          monto_apartado: string | null
          num_depa: string | null
          piso: string | null
          precio_lista: string | null
          proyecto: string | null
          tipo_propiedad: string | null
          tipo_transaccion: string | null
          url_imagen_portada: string | null
          vista: string | null
        }
        Insert: {
          clabe_stp_tmp_apartado?: string | null
          descripcion?: string | null
          disponibilidad_original?: string | null
          disponibilidad_traducida_texto?: string | null
          dueno?: string | null
          edificio?: string | null
          es_aprobado?: boolean | null
          id?: number
          id_edificio?: number | null
          id_estatus_disponibilidad_nuevo?: number | null
          id_modelo?: number | null
          id_persona_dueno?: number | null
          id_proyecto?: number | null
          m2_exteriores?: number | null
          m2_interiores?: number | null
          m2_loft?: number | null
          modelo?: string | null
          monto_apartado?: string | null
          num_depa?: string | null
          piso?: string | null
          precio_lista?: string | null
          proyecto?: string | null
          tipo_propiedad?: string | null
          tipo_transaccion?: string | null
          url_imagen_portada?: string | null
          vista?: string | null
        }
        Update: {
          clabe_stp_tmp_apartado?: string | null
          descripcion?: string | null
          disponibilidad_original?: string | null
          disponibilidad_traducida_texto?: string | null
          dueno?: string | null
          edificio?: string | null
          es_aprobado?: boolean | null
          id?: number
          id_edificio?: number | null
          id_estatus_disponibilidad_nuevo?: number | null
          id_modelo?: number | null
          id_persona_dueno?: number | null
          id_proyecto?: number | null
          m2_exteriores?: number | null
          m2_interiores?: number | null
          m2_loft?: number | null
          modelo?: string | null
          monto_apartado?: string | null
          num_depa?: string | null
          piso?: string | null
          precio_lista?: string | null
          proyecto?: string | null
          tipo_propiedad?: string | null
          tipo_transaccion?: string | null
          url_imagen_portada?: string | null
          vista?: string | null
        }
        Relationships: []
      }
      borrar_proyectos_stagin: {
        Row: {
          costo_mantenimiento_m2: string | null
          descripcion: string | null
          direccion: string | null
          fecha_entrega: string | null
          fecha_inicio_construccion: string | null
          fecha_lanzamiento: string | null
          id: number
          id_estado: number | null
          id_estatus_proyecto: number | null
          id_municipio: number | null
          id_pais: string | null
          id_tipo_uso: number | null
          latitud: number | null
          longitud: number | null
          nombre: string | null
          nombre_estado: string | null
          nombre_firmante_recibos: string | null
          nombre_municipio: string | null
          nombre_pais: string | null
          tipo_transaccion: string | null
          tipo_uso: string | null
          url_firma_recibos: string | null
          url_imagen_portada: string | null
          url_logo: string | null
        }
        Insert: {
          costo_mantenimiento_m2?: string | null
          descripcion?: string | null
          direccion?: string | null
          fecha_entrega?: string | null
          fecha_inicio_construccion?: string | null
          fecha_lanzamiento?: string | null
          id?: number
          id_estado?: number | null
          id_estatus_proyecto?: number | null
          id_municipio?: number | null
          id_pais?: string | null
          id_tipo_uso?: number | null
          latitud?: number | null
          longitud?: number | null
          nombre?: string | null
          nombre_estado?: string | null
          nombre_firmante_recibos?: string | null
          nombre_municipio?: string | null
          nombre_pais?: string | null
          tipo_transaccion?: string | null
          tipo_uso?: string | null
          url_firma_recibos?: string | null
          url_imagen_portada?: string | null
          url_logo?: string | null
        }
        Update: {
          costo_mantenimiento_m2?: string | null
          descripcion?: string | null
          direccion?: string | null
          fecha_entrega?: string | null
          fecha_inicio_construccion?: string | null
          fecha_lanzamiento?: string | null
          id?: number
          id_estado?: number | null
          id_estatus_proyecto?: number | null
          id_municipio?: number | null
          id_pais?: string | null
          id_tipo_uso?: number | null
          latitud?: number | null
          longitud?: number | null
          nombre?: string | null
          nombre_estado?: string | null
          nombre_firmante_recibos?: string | null
          nombre_municipio?: string | null
          nombre_pais?: string | null
          tipo_transaccion?: string | null
          tipo_uso?: string | null
          url_firma_recibos?: string | null
          url_imagen_portada?: string | null
          url_logo?: string | null
        }
        Relationships: []
      }
      borrar_stp_propiedades: {
        Row: {
          clabe_stp_tmp_apartado: string | null
          edificio: string | null
          id: number
          num_depa: string | null
          proyecto: string | null
        }
        Insert: {
          clabe_stp_tmp_apartado?: string | null
          edificio?: string | null
          id?: number
          num_depa?: string | null
          proyecto?: string | null
        }
        Update: {
          clabe_stp_tmp_apartado?: string | null
          edificio?: string | null
          id?: number
          num_depa?: string | null
          proyecto?: string | null
        }
        Relationships: []
      }
      borrar_videos_youtube_stagin: {
        Row: {
          id: number
          link: string
          nombre: string
          proyecto: string
        }
        Insert: {
          id?: number
          link: string
          nombre: string
          proyecto: string
        }
        Update: {
          id?: number
          link?: string
          nombre?: string
          proyecto?: string
        }
        Relationships: []
      }
      borrar_vistas_stagin: {
        Row: {
          id: number
          nombre: string | null
          proyecto: string | null
          url: string | null
        }
        Insert: {
          id?: number
          nombre?: string | null
          proyecto?: string | null
          url?: string | null
        }
        Update: {
          id?: number
          nombre?: string | null
          proyecto?: string | null
          url?: string | null
        }
        Relationships: []
      }
      caracteristicas: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
          ver_en_oferta: boolean | null
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre: string
          ver_en_oferta?: boolean | null
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre?: string
          ver_en_oferta?: boolean | null
        }
        Relationships: []
      }
      categorias_producto: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
          tiene_metraje: boolean | null
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre: string
          tiene_metraje?: boolean | null
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre?: string
          tiene_metraje?: boolean | null
        }
        Relationships: []
      }
      categorias_tipo_documento: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string
          id: number
          nombre: string | null
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          id?: number
          nombre?: string | null
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          id?: number
          nombre?: string | null
        }
        Relationships: []
      }
      comentarios_verificacion_documento: {
        Row: {
          activo: boolean
          comentario: string
          email_usuario: string | null
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_documento: number
          id_estatus_verificacion: number
        }
        Insert: {
          activo?: boolean
          comentario: string
          email_usuario?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_documento: number
          id_estatus_verificacion: number
        }
        Update: {
          activo?: boolean
          comentario?: string
          email_usuario?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_documento?: number
          id_estatus_verificacion?: number
        }
        Relationships: [
          {
            foreignKeyName: "comentarios_verificacion_documento_id_estatus_verificacion_fkey"
            columns: ["id_estatus_verificacion"]
            isOneToOne: false
            referencedRelation: "estatus_verificacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comentarios_verif_documento"
            columns: ["id_documento"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      comisionistas: {
        Row: {
          activo: boolean
          aprobada: boolean
          email_usuario: string
          fecha_actualizacion: string
          fecha_creacion: string
          id_cuenta_cobranza: number
          pagada: boolean
          porcentaje_comision: number
          url_evidencia_pago: string | null
        }
        Insert: {
          activo?: boolean
          aprobada?: boolean
          email_usuario: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          id_cuenta_cobranza: number
          pagada?: boolean
          porcentaje_comision: number
          url_evidencia_pago?: string | null
        }
        Update: {
          activo?: boolean
          aprobada?: boolean
          email_usuario?: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          id_cuenta_cobranza?: number
          pagada?: boolean
          porcentaje_comision?: number
          url_evidencia_pago?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comisionistas_id_cuenta_cobranza_fkey"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comisionistas_cuenta"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_comisionistas_usuarios"
            columns: ["email_usuario"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["email"]
          },
        ]
      }
      compradores: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id_cuenta_cobranza: number
          id_persona: number
          porcentaje_copropiedad: number
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id_cuenta_cobranza: number
          id_persona: number
          porcentaje_copropiedad: number
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id_cuenta_cobranza?: number
          id_persona?: number
          porcentaje_copropiedad?: number
        }
        Relationships: [
          {
            foreignKeyName: "compradores_id_cuenta_cobranza_fkey"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compradores_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compradores_cuenta"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compradores_persona"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      conceptos_pago: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      cuentas_bancarias: {
        Row: {
          activo: boolean
          cuenta_clabe: string | null
          cuenta_swift: string | null
          es_cuenta_fisica_para_stp: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_banco: number | null
          id_persona: number
          numero_cuenta: string
          url_evidencia: string | null
        }
        Insert: {
          activo?: boolean
          cuenta_clabe?: string | null
          cuenta_swift?: string | null
          es_cuenta_fisica_para_stp?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          id_banco?: number | null
          id_persona: number
          numero_cuenta: string
          url_evidencia?: string | null
        }
        Update: {
          activo?: boolean
          cuenta_clabe?: string | null
          cuenta_swift?: string | null
          es_cuenta_fisica_para_stp?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          id_banco?: number | null
          id_persona?: number
          numero_cuenta?: string
          url_evidencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_bancarias_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ctas_bancarias_persona"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cuentas_bancarias_banco"
            columns: ["id_banco"]
            isOneToOne: false
            referencedRelation: "bancos"
            referencedColumns: ["id"]
          },
        ]
      }
      cuentas_cobranza: {
        Row: {
          activo: boolean
          clabe_stp: string | null
          clave_catastral: string | null
          clave_rastreo_comision_venta: string | null
          collection_id: number | null
          contrato_draft: string | null
          es_aprobado: boolean
          es_comision_venta_efectivo: boolean
          es_pagada_comision_venta: boolean
          fecha_actualizacion: string
          fecha_compra: string | null
          fecha_creacion: string
          fecha_escritura: string | null
          fecha_pago_comision: string | null
          hoja: string | null
          id: number
          id_cuenta_cobranza_padre: number | null
          id_notario: number | null
          id_oferta: number | null
          id_tipo_cancelacion: number | null
          iva_incluido: boolean | null
          libro: string | null
          moneda: string | null
          monto_cobro_cancelacion: number | null
          monto_comision_pagado: number
          numero_escritura: string | null
          numero_unidad_privativa: string | null
          porcentaje_comision_venta: number
          precio_final: number
          url_evidencia_cancelacion: string | null
          valor_uma: number | null
        }
        Insert: {
          activo?: boolean
          clabe_stp?: string | null
          clave_catastral?: string | null
          clave_rastreo_comision_venta?: string | null
          collection_id?: number | null
          contrato_draft?: string | null
          es_aprobado?: boolean
          es_comision_venta_efectivo?: boolean
          es_pagada_comision_venta?: boolean
          fecha_actualizacion?: string
          fecha_compra?: string | null
          fecha_creacion?: string
          fecha_escritura?: string | null
          fecha_pago_comision?: string | null
          hoja?: string | null
          id?: number
          id_cuenta_cobranza_padre?: number | null
          id_notario?: number | null
          id_oferta?: number | null
          id_tipo_cancelacion?: number | null
          iva_incluido?: boolean | null
          libro?: string | null
          moneda?: string | null
          monto_cobro_cancelacion?: number | null
          monto_comision_pagado?: number
          numero_escritura?: string | null
          numero_unidad_privativa?: string | null
          porcentaje_comision_venta?: number
          precio_final?: number
          url_evidencia_cancelacion?: string | null
          valor_uma?: number | null
        }
        Update: {
          activo?: boolean
          clabe_stp?: string | null
          clave_catastral?: string | null
          clave_rastreo_comision_venta?: string | null
          collection_id?: number | null
          contrato_draft?: string | null
          es_aprobado?: boolean
          es_comision_venta_efectivo?: boolean
          es_pagada_comision_venta?: boolean
          fecha_actualizacion?: string
          fecha_compra?: string | null
          fecha_creacion?: string
          fecha_escritura?: string | null
          fecha_pago_comision?: string | null
          hoja?: string | null
          id?: number
          id_cuenta_cobranza_padre?: number | null
          id_notario?: number | null
          id_oferta?: number | null
          id_tipo_cancelacion?: number | null
          iva_incluido?: boolean | null
          libro?: string | null
          moneda?: string | null
          monto_cobro_cancelacion?: number | null
          monto_comision_pagado?: number
          numero_escritura?: string | null
          numero_unidad_privativa?: string | null
          porcentaje_comision_venta?: number
          precio_final?: number
          url_evidencia_cancelacion?: string | null
          valor_uma?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_cobranza_clave_rastreo_comision_venta_fkey"
            columns: ["clave_rastreo_comision_venta"]
            isOneToOne: true
            referencedRelation: "pagos_stp_raw"
            referencedColumns: ["claverastreo"]
          },
          {
            foreignKeyName: "cuentas_cobranza_id_cuenta_cobranza_padre_fkey"
            columns: ["id_cuenta_cobranza_padre"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_cobranza_id_tipo_cancelacion_fkey"
            columns: ["id_tipo_cancelacion"]
            isOneToOne: false
            referencedRelation: "tipos_cancelacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ccob_notario"
            columns: ["id_notario"]
            isOneToOne: false
            referencedRelation: "notarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ccob_oferta"
            columns: ["id_oferta"]
            isOneToOne: false
            referencedRelation: "ofertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_cuentas_cobranza_oferta"
            columns: ["id_oferta"]
            isOneToOne: false
            referencedRelation: "ofertas"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          activo: boolean
          es_draft: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_cuenta_cobranza: number | null
          id_estatus_verificacion: number
          id_persona: number | null
          id_producto: number | null
          id_propiedad: number | null
          id_proyecto: number | null
          id_tipo_documento: number
          numero: string | null
          url: string
        }
        Insert: {
          activo?: boolean
          es_draft?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_cuenta_cobranza?: number | null
          id_estatus_verificacion?: number
          id_persona?: number | null
          id_producto?: number | null
          id_propiedad?: number | null
          id_proyecto?: number | null
          id_tipo_documento: number
          numero?: string | null
          url: string
        }
        Update: {
          activo?: boolean
          es_draft?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_cuenta_cobranza?: number | null
          id_estatus_verificacion?: number
          id_persona?: number | null
          id_producto?: number | null
          id_propiedad?: number | null
          id_proyecto?: number | null
          id_tipo_documento?: number
          numero?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_id_estatus_verificacion_fkey"
            columns: ["id_estatus_verificacion"]
            isOneToOne: false
            referencedRelation: "estatus_verificacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_id_producto_fkey"
            columns: ["id_producto"]
            isOneToOne: false
            referencedRelation: "productos_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_id_propiedad_fkey"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_id_proyecto_fkey"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_id_tipo_documento_fkey"
            columns: ["id_tipo_documento"]
            isOneToOne: false
            referencedRelation: "tipos_documento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_persona"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_producto"
            columns: ["id_producto"]
            isOneToOne: false
            referencedRelation: "productos_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_propiedad"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_documentos_cuenta_cobranza"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
        ]
      }
      edificios: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          fecha_lanzamiento: string | null
          id: number
          id_proyecto: number
          nombre: string
          numero_pisos: string | null
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          fecha_lanzamiento?: string | null
          id?: never
          id_proyecto: number
          nombre: string
          numero_pisos?: string | null
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          fecha_lanzamiento?: string | null
          id?: never
          id_proyecto?: number
          nombre?: string
          numero_pisos?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "edificios_id_proyecto_fkey"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_edificios_proyecto"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      edificios_modelos: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          id_edificio: number
          id_modelo: number
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          id_edificio: number
          id_modelo: number
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          id_edificio?: number
          id_modelo?: number
        }
        Relationships: [
          {
            foreignKeyName: "edificios_modelos_id_edificio_fkey"
            columns: ["id_edificio"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edificios_modelos_id_modelo_fkey"
            columns: ["id_modelo"]
            isOneToOne: false
            referencedRelation: "modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_edificios_modelos_edificio"
            columns: ["id_edificio"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_edificios_modelos_modelo"
            columns: ["id_modelo"]
            isOneToOne: false
            referencedRelation: "modelos"
            referencedColumns: ["id"]
          },
        ]
      }
      entidades_relacionadas: {
        Row: {
          activo: boolean
          cuenta_madre_stp: string | null
          cuenta_stp_comisiones: string | null
          facturar: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_estatus_persona: number | null
          id_persona: number | null
          id_persona_duena_lead: number | null
          id_proyecto: number | null
          id_tipo_entidad: number
          nombre_api_key: string | null
          nombre_api_key_draft: string | null
        }
        Insert: {
          activo?: boolean
          cuenta_madre_stp?: string | null
          cuenta_stp_comisiones?: string | null
          facturar?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_estatus_persona?: number | null
          id_persona?: number | null
          id_persona_duena_lead?: number | null
          id_proyecto?: number | null
          id_tipo_entidad: number
          nombre_api_key?: string | null
          nombre_api_key_draft?: string | null
        }
        Update: {
          activo?: boolean
          cuenta_madre_stp?: string | null
          cuenta_stp_comisiones?: string | null
          facturar?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_estatus_persona?: number | null
          id_persona?: number | null
          id_persona_duena_lead?: number | null
          id_proyecto?: number | null
          id_tipo_entidad?: number
          nombre_api_key?: string | null
          nombre_api_key_draft?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entidades_relacionadas_id_persona_duena_lead_fkey"
            columns: ["id_persona_duena_lead"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entidades_relacionadas_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entidades_relacionadas_id_proyecto_fkey"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entidades_relacionadas_id_tipo_entidad_fkey"
            columns: ["id_tipo_entidad"]
            isOneToOne: false
            referencedRelation: "tipos_entidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_entidades_relacionadas_estatus_persona"
            columns: ["id_estatus_persona"]
            isOneToOne: false
            referencedRelation: "estatus_persona"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_entrel_persona"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_entrel_proyecto"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      es_propiedad_demandada: {
        Row: {
          "?column?": boolean | null
        }
        Insert: {
          "?column?"?: boolean | null
        }
        Update: {
          "?column?"?: boolean | null
        }
        Relationships: []
      }
      espacios_reservables_edificio: {
        Row: {
          activo: boolean
          costo_por_hr: number
          descripcion: string | null
          duracion_reserva: unknown
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          id_edificio: number
          id_tipo_espacio_reservable: number
          permitir_reservas_recurrentes: boolean
          url_imagen: string | null
        }
        Insert: {
          activo?: boolean
          costo_por_hr?: number
          descripcion?: string | null
          duracion_reserva?: unknown
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          id_edificio: number
          id_tipo_espacio_reservable: number
          permitir_reservas_recurrentes?: boolean
          url_imagen?: string | null
        }
        Update: {
          activo?: boolean
          costo_por_hr?: number
          descripcion?: string | null
          duracion_reserva?: unknown
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          id_edificio?: number
          id_tipo_espacio_reservable?: number
          permitir_reservas_recurrentes?: boolean
          url_imagen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "espacios_reservables_edificio_id_edificio_fkey"
            columns: ["id_edificio"]
            isOneToOne: false
            referencedRelation: "edificios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "espacios_reservables_edificio_id_tipo_espacio_reservable_fkey"
            columns: ["id_tipo_espacio_reservable"]
            isOneToOne: false
            referencedRelation: "tipos_espacio_reservables"
            referencedColumns: ["id"]
          },
        ]
      }
      esquemas_pago: {
        Row: {
          activo: boolean
          es_manual: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_producto: number | null
          id_proyecto: number | null
          nombre: string
          numero_mensualidades: number
          numero_pagos_enganche: number
          porcentaje_descuento_aumento: number
          porcentaje_enganche: number
          porcentaje_entrega: number
          porcentaje_mensualidades: number
        }
        Insert: {
          activo?: boolean
          es_manual?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_producto?: number | null
          id_proyecto?: number | null
          nombre: string
          numero_mensualidades: number
          numero_pagos_enganche?: number
          porcentaje_descuento_aumento?: number
          porcentaje_enganche?: number
          porcentaje_entrega?: number
          porcentaje_mensualidades?: number
        }
        Update: {
          activo?: boolean
          es_manual?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_producto?: number | null
          id_proyecto?: number | null
          nombre?: string
          numero_mensualidades?: number
          numero_pagos_enganche?: number
          porcentaje_descuento_aumento?: number
          porcentaje_enganche?: number
          porcentaje_entrega?: number
          porcentaje_mensualidades?: number
        }
        Relationships: [
          {
            foreignKeyName: "esquemas_pago_id_producto_fkey"
            columns: ["id_producto"]
            isOneToOne: false
            referencedRelation: "productos_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "esquemas_pago_id_proyecto_fkey"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_esquema_producto"
            columns: ["id_producto"]
            isOneToOne: false
            referencedRelation: "productos_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_esquema_proyecto"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      estacionamientos: {
        Row: {
          activo: boolean
          es_incluido: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_producto: number | null
          id_propiedad: number
          id_tipo: number
          m2: number
          nombre: string
          ubicacion: string | null
        }
        Insert: {
          activo?: boolean
          es_incluido?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_producto?: number | null
          id_propiedad: number
          id_tipo: number
          m2?: number
          nombre: string
          ubicacion?: string | null
        }
        Update: {
          activo?: boolean
          es_incluido?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_producto?: number | null
          id_propiedad?: number
          id_tipo?: number
          m2?: number
          nombre?: string
          ubicacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estacionamientos_id_producto_fkey"
            columns: ["id_producto"]
            isOneToOne: false
            referencedRelation: "productos_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estacionamientos_id_propiedad_fkey"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estacionamientos_id_tipo_fkey"
            columns: ["id_tipo"]
            isOneToOne: false
            referencedRelation: "tipos_estacionamiento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_estac_producto"
            columns: ["id_producto"]
            isOneToOne: false
            referencedRelation: "productos_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_estac_propiedad"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
        ]
      }
      estacionamientos_stagin: {
        Row: {
          id: number
          id_producto: number | null
          id_propiedad: number | null
          m2_estacionamientos: string | null
          nombre_producto: string | null
          nombre_proyecto: string | null
          nombres_estacionamientos: string | null
          numero_estacionamientos: string | null
          numero_propiedad: string | null
          tipos_estacionamientos: string | null
          ubicaciones_estacionamientos: string | null
        }
        Insert: {
          id?: number
          id_producto?: number | null
          id_propiedad?: number | null
          m2_estacionamientos?: string | null
          nombre_producto?: string | null
          nombre_proyecto?: string | null
          nombres_estacionamientos?: string | null
          numero_estacionamientos?: string | null
          numero_propiedad?: string | null
          tipos_estacionamientos?: string | null
          ubicaciones_estacionamientos?: string | null
        }
        Update: {
          id?: number
          id_producto?: number | null
          id_propiedad?: number | null
          m2_estacionamientos?: string | null
          nombre_producto?: string | null
          nombre_proyecto?: string | null
          nombres_estacionamientos?: string | null
          numero_estacionamientos?: string | null
          numero_propiedad?: string | null
          tipos_estacionamientos?: string | null
          ubicaciones_estacionamientos?: string | null
        }
        Relationships: []
      }
      estados_civil: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          nombre: string
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      estados_mx: {
        Row: {
          activo: boolean
          codigo_estado: string | null
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_pais: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          codigo_estado?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          id_pais: string
          nombre: string
        }
        Update: {
          activo?: boolean
          codigo_estado?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          id_pais?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "estados_mx_id_pais_fkey"
            columns: ["id_pais"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id"]
          },
        ]
      }
      estatus_disponibilidad: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      estatus_persona: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_tipo_entidad: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_tipo_entidad: number
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_tipo_entidad?: number
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_estatus_persona_tipos_entidad"
            columns: ["id_tipo_entidad"]
            isOneToOne: false
            referencedRelation: "tipos_entidad"
            referencedColumns: ["id"]
          },
        ]
      }
      estatus_proyecto: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      estatus_reserva: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      estatus_verificacion: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id: number
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      logs_actividad: {
        Row: {
          actividad_id: number
          ambiente: string | null
          datos_payload: Json | null
          estatus_ejecucion: string
          fecha_creacion: string
          id: number
          id_ejecucion: number | null
          nuevo_valor: Json | null
          primer_nodo: string | null
          ultimo_nodo: string | null
          usuario_id: string
          valor_anterior: Json | null
          workflow: string | null
        }
        Insert: {
          actividad_id: number
          ambiente?: string | null
          datos_payload?: Json | null
          estatus_ejecucion: string
          fecha_creacion?: string
          id?: never
          id_ejecucion?: number | null
          nuevo_valor?: Json | null
          primer_nodo?: string | null
          ultimo_nodo?: string | null
          usuario_id: string
          valor_anterior?: Json | null
          workflow?: string | null
        }
        Update: {
          actividad_id?: number
          ambiente?: string | null
          datos_payload?: Json | null
          estatus_ejecucion?: string
          fecha_creacion?: string
          id?: never
          id_ejecucion?: number | null
          nuevo_valor?: Json | null
          primer_nodo?: string | null
          ultimo_nodo?: string | null
          usuario_id?: string
          valor_anterior?: Json | null
          workflow?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_actividad_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_actividad_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["email"]
          },
        ]
      }
      menus: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          nombre: string
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      menus_roles: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          menu_id: number
          rol_id: number
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          menu_id: number
          rol_id: number
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          menu_id?: number
          rol_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_menus_roles_menus"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_menus_roles_roles"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_roles_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_roles_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      metodos_pago: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      modelos: {
        Row: {
          activo: boolean | null
          descripcion: string | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          id_proyecto: number | null
          nombre: string
          numero_completo_banos: number | null
          numero_medio_bano: number | null
          numero_recamaras: number | null
        }
        Insert: {
          activo?: boolean | null
          descripcion?: string | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          id_proyecto?: number | null
          nombre: string
          numero_completo_banos?: number | null
          numero_medio_bano?: number | null
          numero_recamaras?: number | null
        }
        Update: {
          activo?: boolean | null
          descripcion?: string | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          id_proyecto?: number | null
          nombre?: string
          numero_completo_banos?: number | null
          numero_medio_bano?: number | null
          numero_recamaras?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "modelos_id_proyecto_fkey"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_caracteristicas: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          id_caracteristica: number
          id_modelo: number
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          id_caracteristica: number
          id_modelo: number
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          id_caracteristica?: number
          id_modelo?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_modelos_caracteristicas_modelo"
            columns: ["id_modelo"]
            isOneToOne: false
            referencedRelation: "modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modelos_caracteristicas_id_caracteristica_fkey"
            columns: ["id_caracteristica"]
            isOneToOne: false
            referencedRelation: "caracteristicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modelos_caracteristicas_id_modelo_fkey"
            columns: ["id_modelo"]
            isOneToOne: false
            referencedRelation: "modelos"
            referencedColumns: ["id"]
          },
        ]
      }
      multas: {
        Row: {
          activo: boolean
          descripcion: string
          es_pagada: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_acuerdo_pago: number
          id_tipo_multa: number
          monto: number
        }
        Insert: {
          activo?: boolean
          descripcion: string
          es_pagada?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_acuerdo_pago: number
          id_tipo_multa: number
          monto: number
        }
        Update: {
          activo?: boolean
          descripcion?: string
          es_pagada?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_acuerdo_pago?: number
          id_tipo_multa?: number
          monto?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_multas_acuerdo"
            columns: ["id_acuerdo_pago"]
            isOneToOne: false
            referencedRelation: "acuerdos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multas_id_acuerdo_pago_fkey"
            columns: ["id_acuerdo_pago"]
            isOneToOne: false
            referencedRelation: "acuerdos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multas_id_tipo_multa_fkey"
            columns: ["id_tipo_multa"]
            isOneToOne: false
            referencedRelation: "tipos_multa"
            referencedColumns: ["id"]
          },
        ]
      }
      multimedias_modelo: {
        Row: {
          activo: boolean | null
          descripcion: string | null
          es_imagen: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          id_modelo: number
          url: string
          ver_como_ubicacion_en_oferta: boolean
        }
        Insert: {
          activo?: boolean | null
          descripcion?: string | null
          es_imagen?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          id_modelo: number
          url: string
          ver_como_ubicacion_en_oferta?: boolean
        }
        Update: {
          activo?: boolean | null
          descripcion?: string | null
          es_imagen?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          id_modelo?: number
          url?: string
          ver_como_ubicacion_en_oferta?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_multimedias_modelo_modelo"
            columns: ["id_modelo"]
            isOneToOne: false
            referencedRelation: "modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "multimedias_modelo_id_modelo_fkey"
            columns: ["id_modelo"]
            isOneToOne: false
            referencedRelation: "modelos"
            referencedColumns: ["id"]
          },
        ]
      }
      multimedias_propiedad: {
        Row: {
          activo: boolean
          descripcion: string | null
          es_imagen: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_propiedad: number
          url: string
        }
        Insert: {
          activo?: boolean
          descripcion?: string | null
          es_imagen?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_propiedad: number
          url: string
        }
        Update: {
          activo?: boolean
          descripcion?: string | null
          es_imagen?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_propiedad?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "multimedias_propiedad_id_propiedad_fkey"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
        ]
      }
      multimedias_proyecto: {
        Row: {
          activo: boolean
          es_imagen: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_proyecto: number
          url: string
        }
        Insert: {
          activo?: boolean
          es_imagen?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_proyecto: number
          url: string
        }
        Update: {
          activo?: boolean
          es_imagen?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_proyecto?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_multimedias_proyecto_proyecto"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      municipios_mx: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_estado: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          id_estado: number
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          id_estado?: number
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_municipios_estados"
            columns: ["id_estado"]
            isOneToOne: false
            referencedRelation: "estados_mx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "municipios_mx_id_estado_fkey"
            columns: ["id_estado"]
            isOneToOne: false
            referencedRelation: "estados_mx"
            referencedColumns: ["id"]
          },
        ]
      }
      notarios: {
        Row: {
          activo: boolean
          direccion: string | null
          email: string
          fecha_actualizacion: string
          fecha_creacion: string
          genera_proyecto_escritura: boolean
          id: number
          nombre: string
          notaria: string
          telefono: string | null
          url_template_proyecto_contrato: string | null
        }
        Insert: {
          activo?: boolean
          direccion?: string | null
          email: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          genera_proyecto_escritura?: boolean
          id?: number
          nombre: string
          notaria: string
          telefono?: string | null
          url_template_proyecto_contrato?: string | null
        }
        Update: {
          activo?: boolean
          direccion?: string | null
          email?: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          genera_proyecto_escritura?: boolean
          id?: number
          nombre?: string
          notaria?: string
          telefono?: string | null
          url_template_proyecto_contrato?: string | null
        }
        Relationships: []
      }
      ofertas: {
        Row: {
          activo: boolean
          clabe_stp_tmp_producto: string | null
          email_creador: string
          fecha_actualizacion: string
          fecha_creacion: string
          fecha_generacion: string
          id: number
          id_esquema_pago_seleccionado: number | null
          id_persona_lead: number
          id_producto: number | null
          id_propiedad: number
          mostrar_piso_en_oferta: boolean | null
          mostrar_precio_m2_en_oferta: boolean | null
          mostrar_seccion_efectivo_en_oferta: boolean | null
        }
        Insert: {
          activo?: boolean
          clabe_stp_tmp_producto?: string | null
          email_creador: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_generacion?: string
          id?: number
          id_esquema_pago_seleccionado?: number | null
          id_persona_lead: number
          id_producto?: number | null
          id_propiedad: number
          mostrar_piso_en_oferta?: boolean | null
          mostrar_precio_m2_en_oferta?: boolean | null
          mostrar_seccion_efectivo_en_oferta?: boolean | null
        }
        Update: {
          activo?: boolean
          clabe_stp_tmp_producto?: string | null
          email_creador?: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_generacion?: string
          id?: number
          id_esquema_pago_seleccionado?: number | null
          id_persona_lead?: number
          id_producto?: number | null
          id_propiedad?: number
          mostrar_piso_en_oferta?: boolean | null
          mostrar_precio_m2_en_oferta?: boolean | null
          mostrar_seccion_efectivo_en_oferta?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ofertas_esquema_pago"
            columns: ["id_esquema_pago_seleccionado"]
            isOneToOne: false
            referencedRelation: "esquemas_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ofertas_persona_lead"
            columns: ["id_persona_lead"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ofertas_producto"
            columns: ["id_producto"]
            isOneToOne: false
            referencedRelation: "productos_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_ofertas_propiedad"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_email_creador_fkey"
            columns: ["email_creador"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["email"]
          },
          {
            foreignKeyName: "ofertas_id_esquema_pago_seleccionado_fkey"
            columns: ["id_esquema_pago_seleccionado"]
            isOneToOne: false
            referencedRelation: "esquemas_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_id_persona_lead_fkey"
            columns: ["id_persona_lead"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_id_producto_fkey"
            columns: ["id_producto"]
            isOneToOne: false
            referencedRelation: "productos_servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ofertas_id_propiedad_fkey"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          activo: boolean
          clave_rastreo: string | null
          descripcion: string | null
          fecha_actualizacion: string
          fecha_creacion: string
          fecha_pago: string
          id: number
          id_cuenta_cobranza: number
          id_metodos_pago: number
          monto: number
          url_cep: string | null
          url_recibo: string | null
        }
        Insert: {
          activo?: boolean
          clave_rastreo?: string | null
          descripcion?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_pago: string
          id?: number
          id_cuenta_cobranza: number
          id_metodos_pago: number
          monto: number
          url_cep?: string | null
          url_recibo?: string | null
        }
        Update: {
          activo?: boolean
          clave_rastreo?: string | null
          descripcion?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_pago?: string
          id?: number
          id_cuenta_cobranza?: number
          id_metodos_pago?: number
          monto?: number
          url_cep?: string | null
          url_recibo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pagos_cuenta"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_pagos_metodo"
            columns: ["id_metodos_pago"]
            isOneToOne: false
            referencedRelation: "metodos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_id_cuenta_cobranza_fkey"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_id_metodos_pago_fkey"
            columns: ["id_metodos_pago"]
            isOneToOne: false
            referencedRelation: "metodos_pago"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos_stp_raw: {
        Row: {
          claverastreo: string
          concepto_pago: string | null
          cuenta_beneficiario: string
          cuenta_beneficiario2: string | null
          cuenta_ordenante: string | null
          empresa: string | null
          es_pago_aplicado: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          fecha_operacion: string | null
          folio_codi: string | null
          id: number
          id_tipo_pago: number
          institucion_beneficiaria: string | null
          institucion_ordenante: string | null
          monto: number
          nombre_beneficiario: string | null
          nombre_beneficiario2: string | null
          nombre_ordenante: string | null
          razon_rechazo: string | null
          referencia_numerica: string | null
          rfc_curp_beneficiario: string | null
          rfc_curp_ordenante: string | null
          stp_id: string | null
          tipo_cuenta_beneficiario: string | null
          tipo_cuenta_beneficiario2: string | null
          tipo_cuenta_ordenante: string | null
          tipo_pago: string | null
          ts_liquidacion: string | null
        }
        Insert: {
          claverastreo: string
          concepto_pago?: string | null
          cuenta_beneficiario: string
          cuenta_beneficiario2?: string | null
          cuenta_ordenante?: string | null
          empresa?: string | null
          es_pago_aplicado?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_operacion?: string | null
          folio_codi?: string | null
          id?: number
          id_tipo_pago?: number
          institucion_beneficiaria?: string | null
          institucion_ordenante?: string | null
          monto: number
          nombre_beneficiario?: string | null
          nombre_beneficiario2?: string | null
          nombre_ordenante?: string | null
          razon_rechazo?: string | null
          referencia_numerica?: string | null
          rfc_curp_beneficiario?: string | null
          rfc_curp_ordenante?: string | null
          stp_id?: string | null
          tipo_cuenta_beneficiario?: string | null
          tipo_cuenta_beneficiario2?: string | null
          tipo_cuenta_ordenante?: string | null
          tipo_pago?: string | null
          ts_liquidacion?: string | null
        }
        Update: {
          claverastreo?: string
          concepto_pago?: string | null
          cuenta_beneficiario?: string
          cuenta_beneficiario2?: string | null
          cuenta_ordenante?: string | null
          empresa?: string | null
          es_pago_aplicado?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_operacion?: string | null
          folio_codi?: string | null
          id?: number
          id_tipo_pago?: number
          institucion_beneficiaria?: string | null
          institucion_ordenante?: string | null
          monto?: number
          nombre_beneficiario?: string | null
          nombre_beneficiario2?: string | null
          nombre_ordenante?: string | null
          razon_rechazo?: string | null
          referencia_numerica?: string | null
          rfc_curp_beneficiario?: string | null
          rfc_curp_ordenante?: string | null
          stp_id?: string | null
          tipo_cuenta_beneficiario?: string | null
          tipo_cuenta_beneficiario2?: string | null
          tipo_cuenta_ordenante?: string | null
          tipo_pago?: string | null
          ts_liquidacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pagos_stp_raw_id_tipo_pago_fkey"
            columns: ["id_tipo_pago"]
            isOneToOne: false
            referencedRelation: "tipos_pago"
            referencedColumns: ["id"]
          },
        ]
      }
      paises: {
        Row: {
          activo: boolean
          clave_pais_telefono: string
          fecha_actualizacion: string
          fecha_creacion: string
          id: string
          nacionalidad: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          clave_pais_telefono: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          id: string
          nacionalidad: string
          nombre: string
        }
        Update: {
          activo?: boolean
          clave_pais_telefono?: string
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: string
          nacionalidad?: string
          nombre?: string
        }
        Relationships: []
      }
      parentescos: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      permisos: {
        Row: {
          activo: boolean | null
          descripcion: string | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          descripcion?: string | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          nombre: string
        }
        Update: {
          activo?: boolean | null
          descripcion?: string | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      personas: {
        Row: {
          activo: boolean
          clave_pais_telefono: string | null
          curp: string | null
          direccion_calle: string | null
          direccion_codigo_postal: string | null
          direccion_colonia: string | null
          direccion_fiscal_calle: string | null
          direccion_fiscal_codigo_postal: string | null
          direccion_fiscal_colonia: string | null
          direccion_fiscal_id_estado: number | null
          direccion_fiscal_id_municipio: number | null
          direccion_fiscal_id_pais: string | null
          direccion_fiscal_num_ext: string | null
          direccion_fiscal_num_int: string | null
          direccion_id_estado: number | null
          direccion_id_municipio: number | null
          direccion_id_pais: string | null
          direccion_num_ext: string | null
          direccion_num_int: string | null
          email: string | null
          fecha_actualizacion: string
          fecha_creacion: string
          fecha_escritura: string | null
          fecha_nacimiento: string | null
          fecha_registro: string | null
          folio_mercantil: string | null
          id: number
          id_conyuge: number | null
          id_entidad_relacionada_rep_leg: number | null
          id_estado_civil: number | null
          id_estado_nacimiento: number | null
          id_municipio_nacimiento: number | null
          id_notario: number | null
          id_pais_nacimiento: string | null
          id_tipo_identificacion: number | null
          nombre_comercial: string | null
          nombre_legal: string
          numero_escritura: string | null
          numero_libro: string | null
          ocupacion: string | null
          regimen: string | null
          rfc: string | null
          sexo: string | null
          telefono: string | null
          tipo_persona: string
          url_logo: string | null
          uso_cfdi: string | null
        }
        Insert: {
          activo?: boolean
          clave_pais_telefono?: string | null
          curp?: string | null
          direccion_calle?: string | null
          direccion_codigo_postal?: string | null
          direccion_colonia?: string | null
          direccion_fiscal_calle?: string | null
          direccion_fiscal_codigo_postal?: string | null
          direccion_fiscal_colonia?: string | null
          direccion_fiscal_id_estado?: number | null
          direccion_fiscal_id_municipio?: number | null
          direccion_fiscal_id_pais?: string | null
          direccion_fiscal_num_ext?: string | null
          direccion_fiscal_num_int?: string | null
          direccion_id_estado?: number | null
          direccion_id_municipio?: number | null
          direccion_id_pais?: string | null
          direccion_num_ext?: string | null
          direccion_num_int?: string | null
          email?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_escritura?: string | null
          fecha_nacimiento?: string | null
          fecha_registro?: string | null
          folio_mercantil?: string | null
          id?: number
          id_conyuge?: number | null
          id_entidad_relacionada_rep_leg?: number | null
          id_estado_civil?: number | null
          id_estado_nacimiento?: number | null
          id_municipio_nacimiento?: number | null
          id_notario?: number | null
          id_pais_nacimiento?: string | null
          id_tipo_identificacion?: number | null
          nombre_comercial?: string | null
          nombre_legal: string
          numero_escritura?: string | null
          numero_libro?: string | null
          ocupacion?: string | null
          regimen?: string | null
          rfc?: string | null
          sexo?: string | null
          telefono?: string | null
          tipo_persona: string
          url_logo?: string | null
          uso_cfdi?: string | null
        }
        Update: {
          activo?: boolean
          clave_pais_telefono?: string | null
          curp?: string | null
          direccion_calle?: string | null
          direccion_codigo_postal?: string | null
          direccion_colonia?: string | null
          direccion_fiscal_calle?: string | null
          direccion_fiscal_codigo_postal?: string | null
          direccion_fiscal_colonia?: string | null
          direccion_fiscal_id_estado?: number | null
          direccion_fiscal_id_municipio?: number | null
          direccion_fiscal_id_pais?: string | null
          direccion_fiscal_num_ext?: string | null
          direccion_fiscal_num_int?: string | null
          direccion_id_estado?: number | null
          direccion_id_municipio?: number | null
          direccion_id_pais?: string | null
          direccion_num_ext?: string | null
          direccion_num_int?: string | null
          email?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_escritura?: string | null
          fecha_nacimiento?: string | null
          fecha_registro?: string | null
          folio_mercantil?: string | null
          id?: number
          id_conyuge?: number | null
          id_entidad_relacionada_rep_leg?: number | null
          id_estado_civil?: number | null
          id_estado_nacimiento?: number | null
          id_municipio_nacimiento?: number | null
          id_notario?: number | null
          id_pais_nacimiento?: string | null
          id_tipo_identificacion?: number | null
          nombre_comercial?: string | null
          nombre_legal?: string
          numero_escritura?: string | null
          numero_libro?: string | null
          ocupacion?: string | null
          regimen?: string | null
          rfc?: string | null
          sexo?: string | null
          telefono?: string | null
          tipo_persona?: string
          url_logo?: string | null
          uso_cfdi?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_personas_dir_estado"
            columns: ["direccion_id_estado"]
            isOneToOne: false
            referencedRelation: "estados_mx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personas_dir_municipio"
            columns: ["direccion_id_municipio"]
            isOneToOne: false
            referencedRelation: "municipios_mx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personas_dir_pais"
            columns: ["direccion_id_pais"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personas_dirf_estado"
            columns: ["direccion_fiscal_id_estado"]
            isOneToOne: false
            referencedRelation: "estados_mx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personas_dirf_municipio"
            columns: ["direccion_fiscal_id_municipio"]
            isOneToOne: false
            referencedRelation: "municipios_mx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personas_dirf_pais"
            columns: ["direccion_fiscal_id_pais"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personas_entidad_relacionada_rep_leg"
            columns: ["id_entidad_relacionada_rep_leg"]
            isOneToOne: false
            referencedRelation: "entidades_relacionadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personas_estado_civil"
            columns: ["id_estado_civil"]
            isOneToOne: false
            referencedRelation: "estados_civil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personas_estado_nac"
            columns: ["id_estado_nacimiento"]
            isOneToOne: false
            referencedRelation: "estados_mx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personas_municipio_nac"
            columns: ["id_municipio_nacimiento"]
            isOneToOne: false
            referencedRelation: "municipios_mx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personas_notario"
            columns: ["id_notario"]
            isOneToOne: false
            referencedRelation: "notarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_personas_pais_nac"
            columns: ["id_pais_nacimiento"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_clave_pais_telefono_fkey"
            columns: ["clave_pais_telefono"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_id_conyuge_fkey"
            columns: ["id_conyuge"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_regimen_fkey"
            columns: ["regimen"]
            isOneToOne: false
            referencedRelation: "regimen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_uso_cfdi_fkey"
            columns: ["uso_cfdi"]
            isOneToOne: false
            referencedRelation: "uso_cfdi"
            referencedColumns: ["codigo"]
          },
        ]
      }
      productos_servicios: {
        Row: {
          activo: boolean
          descripcion: string | null
          es_producto: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_categoria: number | null
          id_entidad_relacionada_dueno: number
          id_proyecto: number | null
          id_unidad_sat: string | null
          nombre: string
          precio_lista: number | null
          sat_id: string | null
          stock: number
        }
        Insert: {
          activo?: boolean
          descripcion?: string | null
          es_producto?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_categoria?: number | null
          id_entidad_relacionada_dueno: number
          id_proyecto?: number | null
          id_unidad_sat?: string | null
          nombre: string
          precio_lista?: number | null
          sat_id?: string | null
          stock?: number
        }
        Update: {
          activo?: boolean
          descripcion?: string | null
          es_producto?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_categoria?: number | null
          id_entidad_relacionada_dueno?: number
          id_proyecto?: number | null
          id_unidad_sat?: string | null
          nombre?: string
          precio_lista?: number | null
          sat_id?: string | null
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_prodserv_categoria"
            columns: ["id_categoria"]
            isOneToOne: false
            referencedRelation: "categorias_producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_prodserv_unidad_sat"
            columns: ["id_unidad_sat"]
            isOneToOne: false
            referencedRelation: "unidades_sat"
            referencedColumns: ["clave"]
          },
          {
            foreignKeyName: "productos_servicios_id_categoria_fkey"
            columns: ["id_categoria"]
            isOneToOne: false
            referencedRelation: "categorias_producto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_servicios_id_entidad_relacionada_dueno_fkey"
            columns: ["id_entidad_relacionada_dueno"]
            isOneToOne: false
            referencedRelation: "entidades_relacionadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_servicios_id_proyecto_fkey"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      propiedades: {
        Row: {
          activo: boolean
          clabe_stp_tmp_apartado: string | null
          descripcion: string | null
          es_aprobado: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_edificio_modelo: number
          id_entidad_relacionada_dueno: number | null
          id_estatus_disponibilidad: number
          id_tipo_propiedad: number
          id_tipo_transaccion: number
          id_vista: number | null
          m2_exteriores: number
          m2_interiores: number
          m2_loft: number
          monto_apartado: number | null
          monto_apartado_pagando: number | null
          numero_piso: string | null
          numero_propiedad: string
          precio_lista: number
          rentado_estancia_corta: boolean
          url_imagen_portada: string | null
        }
        Insert: {
          activo?: boolean
          clabe_stp_tmp_apartado?: string | null
          descripcion?: string | null
          es_aprobado?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_edificio_modelo: number
          id_entidad_relacionada_dueno?: number | null
          id_estatus_disponibilidad: number
          id_tipo_propiedad: number
          id_tipo_transaccion: number
          id_vista?: number | null
          m2_exteriores?: number
          m2_interiores?: number
          m2_loft?: number
          monto_apartado?: number | null
          monto_apartado_pagando?: number | null
          numero_piso?: string | null
          numero_propiedad: string
          precio_lista: number
          rentado_estancia_corta?: boolean
          url_imagen_portada?: string | null
        }
        Update: {
          activo?: boolean
          clabe_stp_tmp_apartado?: string | null
          descripcion?: string | null
          es_aprobado?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_edificio_modelo?: number
          id_entidad_relacionada_dueno?: number | null
          id_estatus_disponibilidad?: number
          id_tipo_propiedad?: number
          id_tipo_transaccion?: number
          id_vista?: number | null
          m2_exteriores?: number
          m2_interiores?: number
          m2_loft?: number
          monto_apartado?: number | null
          monto_apartado_pagando?: number | null
          numero_piso?: string | null
          numero_propiedad?: string
          precio_lista?: number
          rentado_estancia_corta?: boolean
          url_imagen_portada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_propiedades_edificio_modelo"
            columns: ["id_edificio_modelo"]
            isOneToOne: false
            referencedRelation: "edificios_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_propiedades_entidad_rel"
            columns: ["id_entidad_relacionada_dueno"]
            isOneToOne: false
            referencedRelation: "entidades_relacionadas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_propiedades_estatus_disp"
            columns: ["id_estatus_disponibilidad"]
            isOneToOne: false
            referencedRelation: "estatus_disponibilidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_propiedades_tipo_transaccion"
            columns: ["id_tipo_transaccion"]
            isOneToOne: false
            referencedRelation: "tipos_transaccion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_propiedades_vista"
            columns: ["id_vista"]
            isOneToOne: false
            referencedRelation: "vistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propiedades_id_edificio_modelo_fkey"
            columns: ["id_edificio_modelo"]
            isOneToOne: false
            referencedRelation: "edificios_modelos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propiedades_id_tipo_propiedad_fkey"
            columns: ["id_tipo_propiedad"]
            isOneToOne: false
            referencedRelation: "tipos_propiedad"
            referencedColumns: ["id"]
          },
        ]
      }
      propiedades_caracteristicas: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_caracteristica: number
          id_propiedad: number
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_caracteristica: number
          id_propiedad: number
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_caracteristica?: number
          id_propiedad?: number
        }
        Relationships: [
          {
            foreignKeyName: "propiedades_caracteristicas_id_caracteristica_fkey"
            columns: ["id_caracteristica"]
            isOneToOne: false
            referencedRelation: "caracteristicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propiedades_caracteristicas_id_propiedad_fkey"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
        ]
      }
      propiedades_stagin: {
        Row: {
          clabe_stp: string | null
          id: number
          id_actual: number | null
          id_edificio: string | null
          id_edificio_modelo: number | null
          id_estatus_disponibilidad: string | null
          id_modelo: string | null
          id_propietario: number | null
          id_proyecto: string | null
          id_tipo_propiedad: string | null
          id_tipo_transaccion: string | null
          id_vista: string | null
          m2_exteriores: string | null
          m2_interiores: string | null
          m2_loft: string | null
          monto_apartado: string | null
          nombre_propietario: string | null
          numero_piso: string | null
          numero_propiedad: string | null
          precio_lista: string | null
        }
        Insert: {
          clabe_stp?: string | null
          id?: number
          id_actual?: number | null
          id_edificio?: string | null
          id_edificio_modelo?: number | null
          id_estatus_disponibilidad?: string | null
          id_modelo?: string | null
          id_propietario?: number | null
          id_proyecto?: string | null
          id_tipo_propiedad?: string | null
          id_tipo_transaccion?: string | null
          id_vista?: string | null
          m2_exteriores?: string | null
          m2_interiores?: string | null
          m2_loft?: string | null
          monto_apartado?: string | null
          nombre_propietario?: string | null
          numero_piso?: string | null
          numero_propiedad?: string | null
          precio_lista?: string | null
        }
        Update: {
          clabe_stp?: string | null
          id?: number
          id_actual?: number | null
          id_edificio?: string | null
          id_edificio_modelo?: number | null
          id_estatus_disponibilidad?: string | null
          id_modelo?: string | null
          id_propietario?: number | null
          id_proyecto?: string | null
          id_tipo_propiedad?: string | null
          id_tipo_transaccion?: string | null
          id_vista?: string | null
          m2_exteriores?: string | null
          m2_interiores?: string | null
          m2_loft?: string | null
          monto_apartado?: string | null
          nombre_propietario?: string | null
          numero_piso?: string | null
          numero_propiedad?: string | null
          precio_lista?: string | null
        }
        Relationships: []
      }
      proyectos: {
        Row: {
          activo: boolean
          costo_mantenimiento_m2: number
          descripcion: string | null
          direccion: string | null
          direccion_id_estado: number | null
          direccion_id_municipio: number | null
          direccion_id_pais: string | null
          fecha_actualizacion: string
          fecha_creacion: string
          fecha_entrega: string | null
          fecha_entrega_proyecto: string | null
          fecha_inicio_construccion: string | null
          fecha_lanzamiento: string | null
          fecha_lanzamiento_proyecto: string | null
          id: number
          id_estatus_proyecto: number | null
          id_tipo_uso: number | null
          latitud: number | null
          longitud: number | null
          monto_garantia_renta: number
          monto_mensual_cuota_extraordinaria: number
          mostrar_piso_en_oferta: boolean
          mostrar_precio_m2_en_oferta: boolean
          mostrar_seccion_efectivo_en_oferta: boolean
          nombre: string
          nombre_firmante_recibos: string | null
          precio_m2_actual: number
          url_firma_recibos: string | null
          url_imagen_portada: string | null
          url_logo: string | null
        }
        Insert: {
          activo?: boolean
          costo_mantenimiento_m2?: number
          descripcion?: string | null
          direccion?: string | null
          direccion_id_estado?: number | null
          direccion_id_municipio?: number | null
          direccion_id_pais?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_entrega?: string | null
          fecha_entrega_proyecto?: string | null
          fecha_inicio_construccion?: string | null
          fecha_lanzamiento?: string | null
          fecha_lanzamiento_proyecto?: string | null
          id?: number
          id_estatus_proyecto?: number | null
          id_tipo_uso?: number | null
          latitud?: number | null
          longitud?: number | null
          monto_garantia_renta?: number
          monto_mensual_cuota_extraordinaria?: number
          mostrar_piso_en_oferta?: boolean
          mostrar_precio_m2_en_oferta?: boolean
          mostrar_seccion_efectivo_en_oferta?: boolean
          nombre: string
          nombre_firmante_recibos?: string | null
          precio_m2_actual?: number
          url_firma_recibos?: string | null
          url_imagen_portada?: string | null
          url_logo?: string | null
        }
        Update: {
          activo?: boolean
          costo_mantenimiento_m2?: number
          descripcion?: string | null
          direccion?: string | null
          direccion_id_estado?: number | null
          direccion_id_municipio?: number | null
          direccion_id_pais?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_entrega?: string | null
          fecha_entrega_proyecto?: string | null
          fecha_inicio_construccion?: string | null
          fecha_lanzamiento?: string | null
          fecha_lanzamiento_proyecto?: string | null
          id?: number
          id_estatus_proyecto?: number | null
          id_tipo_uso?: number | null
          latitud?: number | null
          longitud?: number | null
          monto_garantia_renta?: number
          monto_mensual_cuota_extraordinaria?: number
          mostrar_piso_en_oferta?: boolean
          mostrar_precio_m2_en_oferta?: boolean
          mostrar_seccion_efectivo_en_oferta?: boolean
          nombre?: string
          nombre_firmante_recibos?: string | null
          precio_m2_actual?: number
          url_firma_recibos?: string | null
          url_imagen_portada?: string | null
          url_logo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_proyectos_direccion_id_estado"
            columns: ["direccion_id_estado"]
            isOneToOne: false
            referencedRelation: "estados_mx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_proyectos_direccion_id_municipio"
            columns: ["direccion_id_municipio"]
            isOneToOne: false
            referencedRelation: "municipios_mx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_proyectos_direccion_id_pais"
            columns: ["direccion_id_pais"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_id_estatus_proyecto_fkey"
            columns: ["id_estatus_proyecto"]
            isOneToOne: false
            referencedRelation: "estatus_proyecto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proyectos_id_tipo_uso_fkey"
            columns: ["id_tipo_uso"]
            isOneToOne: false
            referencedRelation: "tipos_uso"
            referencedColumns: ["id"]
          },
        ]
      }
      proyectos_acceso: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          proyecto_id: number
          usuario_id: string
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          proyecto_id: number
          usuario_id: string
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          proyecto_id?: number
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_proyectos_acceso_usuarios"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["email"]
          },
          {
            foreignKeyName: "proyectos_acceso_proyecto_id_fkey"
            columns: ["proyecto_id"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
      queries_reportes: {
        Row: {
          activo: boolean | null
          descripcion: string | null
          fecha_actualizacion: string | null
          fecha_creacion: string
          filtros: Json | null
          id: number
          nombre_reporte: string | null
          query: string | null
          url_reporte: string | null
        }
        Insert: {
          activo?: boolean | null
          descripcion?: string | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          filtros?: Json | null
          id?: number
          nombre_reporte?: string | null
          query?: string | null
          url_reporte?: string | null
        }
        Update: {
          activo?: boolean | null
          descripcion?: string | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          filtros?: Json | null
          id?: number
          nombre_reporte?: string | null
          query?: string | null
          url_reporte?: string | null
        }
        Relationships: []
      }
      regimen: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string
          id: string
          nombre: string | null
          tipo: string | null
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          id: string
          nombre?: string | null
          tipo?: string | null
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          id?: string
          nombre?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      reservas: {
        Row: {
          activo: boolean
          costo_final: number | null
          fecha_actualizacion: string
          fecha_creacion: string
          fecha_reserva: string
          hora_reserva: string
          id: number
          id_acuerdo_pago: number
          id_espacio_reservable_edificio: number
          id_estatus_reserva: number
          id_persona_que_reserva: number
        }
        Insert: {
          activo?: boolean
          costo_final?: number | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_reserva: string
          hora_reserva: string
          id?: number
          id_acuerdo_pago: number
          id_espacio_reservable_edificio: number
          id_estatus_reserva?: number
          id_persona_que_reserva: number
        }
        Update: {
          activo?: boolean
          costo_final?: number | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          fecha_reserva?: string
          hora_reserva?: string
          id?: number
          id_acuerdo_pago?: number
          id_espacio_reservable_edificio?: number
          id_estatus_reserva?: number
          id_persona_que_reserva?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservas_id_acuerdo_pago: int_fkey"
            columns: ["id_acuerdo_pago"]
            isOneToOne: false
            referencedRelation: "acuerdos_pago"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_id_espacio_reservable_edificio_fkey"
            columns: ["id_espacio_reservable_edificio"]
            isOneToOne: false
            referencedRelation: "espacios_reservables_edificio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_id_estatus_reserva_fkey"
            columns: ["id_estatus_reserva"]
            isOneToOne: false
            referencedRelation: "estatus_reserva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservas_id_persona_que_reserva_fkey"
            columns: ["id_persona_que_reserva"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      residentes: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_cuenta_cobranza: number | null
          id_persona: number | null
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_cuenta_cobranza?: number | null
          id_persona?: number | null
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_cuenta_cobranza?: number | null
          id_persona?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "residentes_id_cuenta_cobranza_fkey"
            columns: ["id_cuenta_cobranza"]
            isOneToOne: false
            referencedRelation: "cuentas_cobranza"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "residentes_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          nombre: string
          ver_todos_prospectos_compradores: boolean | null
          ver_todos_proyectos_propiedades: boolean | null
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          nombre: string
          ver_todos_prospectos_compradores?: boolean | null
          ver_todos_proyectos_propiedades?: boolean | null
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          nombre?: string
          ver_todos_prospectos_compradores?: boolean | null
          ver_todos_proyectos_propiedades?: boolean | null
        }
        Relationships: []
      }
      roles_estatus_disponibilidad: {
        Row: {
          activo: boolean
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          id_estatus_disponibilidad: number
          id_rol: number
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          id_estatus_disponibilidad: number
          id_rol: number
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          id_estatus_disponibilidad?: number
          id_rol?: number
        }
        Relationships: [
          {
            foreignKeyName: "roles_estatus_disponibilidad_id_estatus_disponibilidad_fkey"
            columns: ["id_estatus_disponibilidad"]
            isOneToOne: false
            referencedRelation: "estatus_disponibilidad"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_estatus_disponibilidad_id_rol_fkey"
            columns: ["id_rol"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      submenus: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          menu_id: number
          nombre: string
          vista_front_end: string | null
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          menu_id: number
          nombre: string
          vista_front_end?: string | null
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: never
          menu_id?: number
          nombre?: string
          vista_front_end?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_submenus_menus"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      submenus_permisos: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          permiso_id: number
          rol_id: number | null
          submenu_id: number
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          permiso_id: number
          rol_id?: number | null
          submenu_id: number
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          permiso_id?: number
          rol_id?: number | null
          submenu_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_submenus_permisos_permisos"
            columns: ["permiso_id"]
            isOneToOne: false
            referencedRelation: "permisos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submenus_permisos_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      tabla_datos_cep: {
        Row: {
          cadena: string
          claverastreo: string
          fecha_creacion: string
          fecha_operacion: string
          id_tipo_cep: number
        }
        Insert: {
          cadena: string
          claverastreo: string
          fecha_creacion?: string
          fecha_operacion: string
          id_tipo_cep: number
        }
        Update: {
          cadena?: string
          claverastreo?: string
          fecha_creacion?: string
          fecha_operacion?: string
          id_tipo_cep?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_cep_pago_raw"
            columns: ["claverastreo"]
            isOneToOne: true
            referencedRelation: "pagos_stp_raw"
            referencedColumns: ["claverastreo"]
          },
          {
            foreignKeyName: "tabla_datos_cep_id_tipo_cep_fkey"
            columns: ["id_tipo_cep"]
            isOneToOne: false
            referencedRelation: "tipos_cep"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_cancelacion: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string
          id: number
          nombre: string | null
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          id?: number
          nombre?: string | null
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          id?: number
          nombre?: string | null
        }
        Relationships: []
      }
      tipos_cep: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          nombre: string
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      tipos_documento: {
        Row: {
          activo: boolean
          asignado_a: string | null
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_categoria_documento: number
          nombre: string
          padre: string | null
        }
        Insert: {
          activo?: boolean
          asignado_a?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_categoria_documento: number
          nombre: string
          padre?: string | null
        }
        Update: {
          activo?: boolean
          asignado_a?: string | null
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_categoria_documento?: number
          nombre?: string
          padre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tipos_documento_id_categoria_documento_fkey"
            columns: ["id_categoria_documento"]
            isOneToOne: false
            referencedRelation: "categorias_tipo_documento"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_entidad: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
          padre: string | null
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre: string
          padre?: string | null
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre?: string
          padre?: string | null
        }
        Relationships: []
      }
      tipos_espacio_reservables: {
        Row: {
          activo: boolean
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      tipos_estacionamiento: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      tipos_multa: {
        Row: {
          activo: boolean
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      tipos_pago: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string
          id: number
          nombre: string | null
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          id?: number
          nombre?: string | null
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          id?: number
          nombre?: string | null
        }
        Relationships: []
      }
      tipos_propiedad: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre?: string
        }
        Relationships: []
      }
      tipos_relacion: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
          tipo: string | null
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre: string
          tipo?: string | null
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          nombre?: string
          tipo?: string | null
        }
        Relationships: []
      }
      tipos_transaccion: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      tipos_uso: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          nombre: string
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre: string
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: never
          nombre?: string
        }
        Relationships: []
      }
      unidades_sat: {
        Row: {
          activo: boolean
          clave: string
          descripcion: string
          fecha_actualizacion: string
          fecha_creacion: string
        }
        Insert: {
          activo?: boolean
          clave: string
          descripcion: string
          fecha_actualizacion?: string
          fecha_creacion?: string
        }
        Update: {
          activo?: boolean
          clave?: string
          descripcion?: string
          fecha_actualizacion?: string
          fecha_creacion?: string
        }
        Relationships: []
      }
      uso_cfdi: {
        Row: {
          activo: boolean | null
          codigo: string
          fecha_actualizacion: string | null
          fecha_creacion: string
          nombre: string | null
          tipo: string | null
        }
        Insert: {
          activo?: boolean | null
          codigo: string
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          nombre?: string | null
          tipo?: string | null
        }
        Update: {
          activo?: boolean | null
          codigo?: string
          fecha_actualizacion?: string | null
          fecha_creacion?: string
          nombre?: string | null
          tipo?: string | null
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          activo: boolean | null
          auth_user_id: string | null
          clave_pais_telefono: string | null
          debe_cambiar_password: boolean
          email: string
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id_persona: number | null
          nombre: string
          rol_id: number
          telefono: string | null
          ultimo_cambio_password: string | null
        }
        Insert: {
          activo?: boolean | null
          auth_user_id?: string | null
          clave_pais_telefono?: string | null
          debe_cambiar_password?: boolean
          email: string
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id_persona?: number | null
          nombre: string
          rol_id: number
          telefono?: string | null
          ultimo_cambio_password?: string | null
        }
        Update: {
          activo?: boolean | null
          auth_user_id?: string | null
          clave_pais_telefono?: string | null
          debe_cambiar_password?: boolean
          email?: string
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id_persona?: number | null
          nombre?: string
          rol_id?: number
          telefono?: string | null
          ultimo_cambio_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_clave_pais_telefono_fkey"
            columns: ["clave_pais_telefono"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_id_persona_fkey"
            columns: ["id_persona"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuarios_rol_id_fkey"
            columns: ["rol_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      videos_youtube: {
        Row: {
          activo: boolean | null
          fecha_actualizacion: string | null
          fecha_creacion: string | null
          id: number
          id_propiedad: number | null
          id_proyecto: number | null
          link: string
          nombre: string
        }
        Insert: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          id_propiedad?: number | null
          id_proyecto?: number | null
          link: string
          nombre: string
        }
        Update: {
          activo?: boolean | null
          fecha_actualizacion?: string | null
          fecha_creacion?: string | null
          id?: number
          id_propiedad?: number | null
          id_proyecto?: number | null
          link?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_id_proyecto"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_videos_youtube_propiedad"
            columns: ["id_propiedad"]
            isOneToOne: false
            referencedRelation: "propiedades"
            referencedColumns: ["id"]
          },
        ]
      }
      vistas: {
        Row: {
          activo: boolean
          fecha_actualizacion: string
          fecha_creacion: string
          id: number
          id_proyecto: number | null
          nombre: string
          url: string | null
        }
        Insert: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_proyecto?: number | null
          nombre: string
          url?: string | null
        }
        Update: {
          activo?: boolean
          fecha_actualizacion?: string
          fecha_creacion?: string
          id?: number
          id_proyecto?: number | null
          nombre?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vistas_id_proyecto_fkey"
            columns: ["id_proyecto"]
            isOneToOne: false
            referencedRelation: "proyectos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      actualizar_estatus_reservas: { Args: never; Returns: undefined }
      borrar_sp_cargar_amenidades_proyectos_desde_stagin: {
        Args: never
        Returns: undefined
      }
      borrar_sp_cargar_edificio_modelo: { Args: never; Returns: undefined }
      borrar_sp_cargar_edificios_desde_stagin: {
        Args: never
        Returns: undefined
      }
      borrar_sp_cargar_modelos_caracteristicas_desde_stagin: {
        Args: never
        Returns: undefined
      }
      borrar_sp_cargar_modelos_desde_stagin: { Args: never; Returns: undefined }
      borrar_sp_cargar_multimedias_modelo_desde_stagin: {
        Args: never
        Returns: undefined
      }
      borrar_sp_cargar_multimedias_proyecto: { Args: never; Returns: undefined }
      borrar_sp_cargar_proyectos_desde_stagin: {
        Args: never
        Returns: undefined
      }
      borrar_sp_cargar_videos_youtube_proyecto: {
        Args: never
        Returns: undefined
      }
      borrar_sp_esquemas_pago_proyecto: { Args: never; Returns: undefined }
      borrar_sp_vistas: { Args: never; Returns: undefined }
      can_view_all_prospects: { Args: never; Returns: boolean }
      crear_referencia_bancaria: {
        Args: { id_er_dueno: number }
        Returns: string
      }
      etl_bodegas: { Args: never; Returns: boolean }
      etl_estacionamientos: { Args: never; Returns: boolean }
      etl_propiedades: { Args: never; Returns: boolean }
      execute_safe_query: {
        Args: { max_rows?: number; query_text: string }
        Returns: Json
      }
      get_current_user_persona_id: { Args: never; Returns: number }
      get_current_user_profile: {
        Args: never
        Returns: {
          activo: boolean
          debe_cambiar_password: boolean
          email: string
          id_persona: number
          nombre: string
          rol_id: number
          rol_nombre: string
          ver_todos_prospectos_compradores: boolean
        }[]
      }
      get_current_user_role: { Args: never; Returns: number }
      get_offers_with_agent: {
        Args: { property_id: number }
        Returns: {
          activo: boolean
          agent_name: string
          cuenta_clabe_stp: string
          cuenta_es_aprobado: boolean
          cuenta_fecha_compra: string
          cuenta_precio_final: number
          esquema_enganche: number
          esquema_entrega: number
          esquema_es_manual: boolean
          esquema_id: number
          esquema_mensualidades: number
          esquema_nombre: string
          esquema_numero_meses: number
          fecha_generacion: string
          id: number
          id_persona_duena_lead: number
          id_persona_lead: number
          lead_email: string
          lead_name: string
          lead_telefono: string
        }[]
      }
      get_properties_with_details: {
        Args: never
        Returns: {
          activo: boolean
          clabe_stp: string
          disponibilidad: string
          dueño: string
          id: number
          m2_reales: number
          modelo: string
          numero_piso: number
          numero_propiedad: string
          precio_lista: number
          tipo_propiedad: string
          transaccion: string
          vista: string
        }[]
      }
      get_user_menus: {
        Args: never
        Returns: {
          menu_id: number
          menu_nombre: string
        }[]
      }
      get_user_role: { Args: never; Returns: string }
      incrementar_precio_m2_mensual: { Args: never; Returns: undefined }
      insertar_pago_stp: {
        Args: {
          p_claverastreo: string
          p_concepto_pago: string
          p_cuenta_beneficiario: string
          p_cuenta_beneficiario2?: string
          p_cuenta_ordenante: string
          p_empresa: string
          p_fecha_operacion: string
          p_folio_codi?: string
          p_institucion_beneficiaria: string
          p_institucion_ordenante: string
          p_monto: number
          p_nombre_beneficiario: string
          p_nombre_beneficiario2?: string
          p_nombre_ordenante: string
          p_referencia_numerica: string
          p_rfc_curp_beneficiario: string
          p_rfc_curp_ordenante: string
          p_stp_id: string
          p_tipo_cuenta_beneficiario: string
          p_tipo_cuenta_beneficiario2?: string
          p_tipo_cuenta_ordenante: string
          p_tipo_pago: string
          p_ts_liquidacion: string
        }
        Returns: Json
      }
      is_admin_user: { Args: never; Returns: boolean }
      is_super_admin: { Args: { user_id: string }; Returns: boolean }
      mark_password_changed: { Args: never; Returns: undefined }
      sync_conyuge_compradores: {
        Args: { p_id_persona: number }
        Returns: {
          cuentas_procesadas: number
          mensaje: string
        }[]
      }
      user_has_permission: {
        Args: { _permission_name: string; _submenu_path: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
