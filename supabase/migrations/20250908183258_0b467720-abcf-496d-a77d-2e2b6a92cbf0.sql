-- Create all tables for the real estate administration system

-- Actividades table
CREATE TABLE public.actividades (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Conceptos de pago table
CREATE TABLE public.conceptos_pago (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Acuerdos de pago table
CREATE TABLE public.acuerdos_pago (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_cuenta_cobranza integer NOT NULL,
    id_concepto integer NOT NULL REFERENCES public.conceptos_pago(id),
    fecha_pago timestamp without time zone NOT NULL,
    monto numeric(16,2) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_acpago_fecha_valida CHECK (fecha_pago IS NOT NULL),
    CONSTRAINT chk_acpago_monto_positivo CHECK (monto > 0::numeric AND monto = round(monto, 2))
);

-- Proyectos table (needed for foreign keys)
CREATE TABLE public.proyectos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    descripcion text,
    direccion text,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Amenidades table
CREATE TABLE public.amenidades (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    id_proyecto integer NOT NULL REFERENCES public.proyectos(id),
    url text,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "timestamp" timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Aplicaciones de pago table
CREATE TABLE public.aplicaciones_pago (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_acuerdo_pago integer NOT NULL REFERENCES public.acuerdos_pago(id),
    id_pago integer NOT NULL,
    monto numeric(16,2) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_apppago_monto_positivo CHECK (monto > 0::numeric AND monto = round(monto, 2))
);

-- Parentescos table
CREATE TABLE public.parentescos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Personas table
CREATE TABLE public.personas (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_persona text NOT NULL,
    email text NOT NULL,
    telefono text,
    nombre_legal text NOT NULL,
    nombre_comercial text,
    id_representente_legal integer,
    sexo text,
    fecha_nacimiento timestamp without time zone,
    numero_escritura character(50),
    numero_libro character(50),
    fecha_escritura timestamp without time zone,
    id_notario integer,
    folio_mercantil character(50),
    fecha_registro timestamp without time zone,
    direccion_calle_numero character(100),
    direccion_colonia text,
    direccion_codigo_postal character(10),
    direccion_id_pais character(2),
    direccion_id_estado integer,
    direccion_id_municipio integer,
    direccion_fiscal_calle_numero character(100),
    direccion_fiscal_colonia text,
    direccion_fiscal_codigo_postal character(10),
    direccion_fiscal_id_pais character(2),
    direccion_fiscal_id_estado integer,
    direccion_fiscal_id_municipio integer,
    curp text,
    rfc text,
    regimen bigint,
    uso_cfdi text,
    id_pais_nacimiento character(2),
    id_estado_nacimiento integer,
    id_municipio_nacimiento integer,
    id_estado_civil integer,
    ocupacion text,
    id_tipo_identificacion integer,
    id_tipo_relacion integer,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    clave_pais_telefono character(2),
    CONSTRAINT chk_personas_cp_dir CHECK (direccion_codigo_postal IS NULL OR btrim(direccion_codigo_postal::text) ~ '^[0-9]{4,10}$'::text),
    CONSTRAINT chk_personas_cp_dir_fiscal CHECK (direccion_fiscal_codigo_postal IS NULL OR btrim(direccion_fiscal_codigo_postal::text) ~ '^[0-9]{4,10}$'::text),
    CONSTRAINT chk_personas_curp_formato CHECK (curp IS NULL OR (upper(curp) = curp AND curp ~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9]{2}$'::text)),
    CONSTRAINT chk_personas_email_formato CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'::text),
    CONSTRAINT chk_personas_fecha_nacimiento_no_futuro CHECK (fecha_nacimiento IS NULL OR fecha_nacimiento <= CURRENT_TIMESTAMP),
    CONSTRAINT chk_personas_rfc_formato CHECK (rfc IS NULL OR (upper(rfc) = rfc AND rfc ~ '^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$'::text)),
    CONSTRAINT chk_personas_sexo CHECK (sexo IS NULL OR sexo = ANY (ARRAY['M'::text, 'F'::text, 'O'::text])),
    CONSTRAINT chk_personas_telefono_formato CHECK (telefono IS NULL OR telefono ~ '^[0-9 ()+\-]{5,20}$'::text)
);

-- Beneficiarios table
CREATE TABLE public.beneficiarios (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_persona integer NOT NULL REFERENCES public.personas(id),
    nombre_beneficiario text NOT NULL,
    id_parentesco integer NOT NULL REFERENCES public.parentescos(id),
    porcentaje_participacion numeric(5,2) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_beneficiarios_nombre_no_vacio CHECK (btrim(nombre_beneficiario) <> ''::text),
    CONSTRAINT chk_beneficiarios_porcentaje_rango CHECK (porcentaje_participacion > 0::numeric AND porcentaje_participacion <= 100::numeric)
);

-- Categorias producto table
CREATE TABLE public.categorias_producto (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Productos servicios table
CREATE TABLE public.productos_servicios (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_persona integer NOT NULL REFERENCES public.personas(id),
    id_categoria integer NOT NULL REFERENCES public.categorias_producto(id),
    nombre text NOT NULL,
    descripcion text,
    es_producto boolean DEFAULT true NOT NULL,
    sat_id text,
    id_unidad_sat text NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_prodserv_nombre_no_vacio CHECK (btrim(nombre) <> ''::text),
    CONSTRAINT chk_prodserv_sat_id_formato CHECK (sat_id IS NULL OR sat_id ~ '^[0-9]{8}$'::text),
    CONSTRAINT chk_prodserv_stock_por_tipo CHECK ((es_producto = false AND stock = 0) OR (es_producto = true AND stock >= 0))
);

-- Propiedades table
CREATE TABLE public.propiedades (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    id_entidad_relacionada_dueno bigint,
    id_vista integer,
    id_tipo_transaccion integer NOT NULL,
    id_edificio_modelo integer NOT NULL,
    id_tipo_propiedad integer NOT NULL,
    id_estatus_disponibilidad integer NOT NULL,
    numero_propiedad text NOT NULL,
    numero_piso integer,
    m2_reales numeric(12,2),
    m2_escriturables numeric(12,2),
    precio_lista numeric(16,2) NOT NULL,
    monto_apartado numeric(16,2),
    monto_apartado_pagando numeric(16,2),
    clabe_stp_tmp_apartado text,
    es_aprobado boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_prop_m2_no_negativos CHECK ((m2_reales IS NULL OR m2_reales >= 0::numeric) AND (m2_escriturables IS NULL OR m2_escriturables >= 0::numeric)),
    CONSTRAINT chk_prop_precios_montos CHECK (precio_lista >= 0::numeric AND (monto_apartado IS NULL OR monto_apartado >= 0::numeric) AND (monto_apartado_pagando IS NULL OR monto_apartado_pagando >= 0::numeric) AND (monto_apartado IS NULL OR monto_apartado_pagando IS NULL OR monto_apartado_pagando <= monto_apartado))
);

-- Bodegas table
CREATE TABLE public.bodegas (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_propiedad integer NOT NULL REFERENCES public.propiedades(id),
    id_producto integer REFERENCES public.productos_servicios(id),
    nombre text NOT NULL,
    descripcion text,
    m2 numeric(12,2) NOT NULL,
    es_incluido boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_bodegas_m2_no_negativo CHECK (m2 >= 0::numeric AND m2 = round(m2, 2)),
    CONSTRAINT chk_bodegas_nombre_no_vacio CHECK (btrim(nombre) <> ''::text),
    CONSTRAINT chk_bodegas_producto_si_no_incluida CHECK (es_incluido OR id_producto IS NOT NULL)
);

-- Caracteristicas table
CREATE TABLE public.caracteristicas (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Cuentas cobranza table
CREATE TABLE public.cuentas_cobranza (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    id_oferta integer NOT NULL,
    id_notario integer,
    porcentaje_comision_venta numeric(5,2) DEFAULT 0.00 NOT NULL,
    es_comision_venta_efectivo boolean DEFAULT false NOT NULL,
    es_pagada_comision_venta boolean DEFAULT false NOT NULL,
    clave_rastreo_comision_venta text,
    valor_uma numeric(10,2),
    fecha_compra timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    moneda text,
    precio_final numeric(16,2) DEFAULT 0::numeric NOT NULL,
    clabe_stp text,
    es_aprobado boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_ccob_clabe_formato CHECK (clabe_stp IS NULL OR clabe_stp ~ '^[0-9]{18}$'::text),
    CONSTRAINT chk_ccob_coherencia_pago_comision CHECK (es_pagada_comision_venta = false OR (es_pagada_comision_venta = true AND ((es_comision_venta_efectivo = true AND clave_rastreo_comision_venta IS NULL) OR (es_comision_venta_efectivo = false AND clave_rastreo_comision_venta IS NOT NULL)))),
    CONSTRAINT chk_ccob_fecha_compra CHECK (fecha_compra <= CURRENT_TIMESTAMP),
    CONSTRAINT chk_ccob_moneda CHECK (moneda ~ '^[A-Z]{3}$'::text),
    CONSTRAINT chk_ccob_porcentaje_comision CHECK (porcentaje_comision_venta >= 0.00 AND porcentaje_comision_venta <= 100.00 AND porcentaje_comision_venta = round(porcentaje_comision_venta, 2)),
    CONSTRAINT chk_ccob_precio_final CHECK (precio_final >= 0::numeric AND precio_final = round(precio_final, 2)),
    CONSTRAINT chk_ccob_valor_uma CHECK (valor_uma > 0::numeric AND valor_uma = round(valor_uma, 2))
);

-- Update acuerdos_pago foreign key
ALTER TABLE public.acuerdos_pago ADD CONSTRAINT fk_acuerdos_pago_cuenta_cobranza 
FOREIGN KEY (id_cuenta_cobranza) REFERENCES public.cuentas_cobranza(id);

-- Comisionistas table
CREATE TABLE public.comisionistas (
    id_cuenta_cobranza integer NOT NULL REFERENCES public.cuentas_cobranza(id),
    email_usuario text NOT NULL,
    porcentaje_comision numeric(5,2) NOT NULL,
    aprobada boolean DEFAULT false NOT NULL,
    pagada boolean DEFAULT false NOT NULL,
    url_evidencia_pago text,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id_cuenta_cobranza),
    CONSTRAINT chk_comisionistas_pagos_coherencia CHECK ((pagada = false AND true) OR (pagada = true AND aprobada = true AND url_evidencia_pago IS NOT NULL)),
    CONSTRAINT chk_comisionistas_porcentaje CHECK (porcentaje_comision >= 0::numeric AND porcentaje_comision <= 100::numeric AND porcentaje_comision = round(porcentaje_comision, 2)),
    CONSTRAINT chk_comisionistas_url CHECK (url_evidencia_pago IS NULL OR url_evidencia_pago ~* '^(https?|/).+'::text)
);

-- Compradores table
CREATE TABLE public.compradores (
    id_cuenta_cobranza integer NOT NULL REFERENCES public.cuentas_cobranza(id),
    id_persona integer NOT NULL REFERENCES public.personas(id),
    porcentaje_copropiedad numeric(5,2) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    PRIMARY KEY (id_cuenta_cobranza, id_persona),
    CONSTRAINT chk_compradores_porcentaje_precision CHECK (porcentaje_copropiedad = round(porcentaje_copropiedad, 2)),
    CONSTRAINT chk_compradores_porcentaje_rango CHECK (porcentaje_copropiedad > 0::numeric AND porcentaje_copropiedad <= 100::numeric)
);

-- Cuentas bancarias table
CREATE TABLE public.cuentas_bancarias (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_persona integer NOT NULL REFERENCES public.personas(id),
    nombre_banco text NOT NULL,
    numero_cuenta text NOT NULL,
    url_evidencia text,
    es_cuenta_fisica_para_stp boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_ctas_bancarias_banco_no_vacio CHECK (btrim(nombre_banco) <> ''::text),
    CONSTRAINT chk_ctas_bancarias_longitud CHECK ((es_cuenta_fisica_para_stp = true AND length(numero_cuenta) = 18) OR (es_cuenta_fisica_para_stp = false AND length(numero_cuenta) >= 8 AND length(numero_cuenta) <= 34)),
    CONSTRAINT chk_ctas_bancarias_numero_formato CHECK (numero_cuenta ~ '^[0-9]+'::text),
    CONSTRAINT chk_ctas_bancarias_url CHECK (url_evidencia IS NULL OR url_evidencia ~* '^(https?|/).+'::text)
);

-- Cuentas STP pago comision table
CREATE TABLE public.cuentas_stp_pago_comision (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_persona integer NOT NULL REFERENCES public.personas(id),
    id_proyecto integer REFERENCES public.proyectos(id),
    clabe_stp text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_cta_stpcom_clabe_formato CHECK (clabe_stp ~ '^[0-9]{18}$'::text),
    CONSTRAINT chk_cta_stpcom_id_proyecto CHECK (id_proyecto IS NULL OR id_proyecto > 0)
);

-- Documentos table
CREATE TABLE public.documentos (
    id_persona integer REFERENCES public.personas(id),
    id_propiedad integer REFERENCES public.propiedades(id),
    id_producto integer REFERENCES public.productos_servicios(id),
    id_tipo_documento integer NOT NULL,
    numero integer NOT NULL,
    url text NOT NULL,
    es_verificado boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_doc_numero_positivo CHECK (numero > 0),
    CONSTRAINT chk_doc_url_formato CHECK (url ~* '^(https?|/).+'::text)
);

-- Edificios table
CREATE TABLE public.edificios (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_proyecto integer NOT NULL REFERENCES public.proyectos(id),
    nombre text NOT NULL,
    numero_pisos character(5),
    fecha_lanzamiento timestamp without time zone,
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Modelos table
CREATE TABLE public.modelos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    descripcion text,
    numero_medio_bano integer,
    numero_completo_banos integer,
    numero_recamaras integer,
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT now(),
    fecha_actualizacion timestamp without time zone DEFAULT now()
);

-- Edificios modelos table
CREATE TABLE public.edificios_modelos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_edificio integer NOT NULL REFERENCES public.edificios(id),
    id_modelo integer NOT NULL REFERENCES public.modelos(id),
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Continue with remaining tables...

-- Estados civil table
CREATE TABLE public.estados_civil (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Paises table
CREATE TABLE public.paises (
    id character(2) PRIMARY KEY,
    nombre text NOT NULL,
    nacionalidad text NOT NULL,
    clave_pais_telefono character(6) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Estados MX table
CREATE TABLE public.estados_mx (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pais character(2) NOT NULL REFERENCES public.paises(id),
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    codigo_estado character varying
);

-- Municipios MX table
CREATE TABLE public.municipios_mx (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_estado integer NOT NULL REFERENCES public.estados_mx(id),
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Entidades relacionadas table
CREATE TABLE public.entidades_relacionadas (
    id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    id_proyecto integer NOT NULL REFERENCES public.proyectos(id),
    id_persona integer NOT NULL REFERENCES public.personas(id),
    id_tipo_entidad integer NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cuenta_madre_stp text,
    CONSTRAINT chk_entrel_id_proyecto_val CHECK (id_proyecto IS NULL OR id_proyecto > 0)
);

-- Esquemas pago table
CREATE TABLE public.esquemas_pago (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_proyecto integer REFERENCES public.proyectos(id),
    id_producto integer REFERENCES public.productos_servicios(id),
    nombre text NOT NULL,
    porcentaje_descuento_aumento numeric(5,2) DEFAULT 0.00 NOT NULL,
    porcentaje_enganche numeric(5,2) NOT NULL,
    porcentaje_mensualidades numeric(5,2) NOT NULL,
    numero_mensualidades integer NOT NULL,
    porcentaje_entrega numeric(5,2) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_esq_desc_au_rango CHECK (porcentaje_descuento_aumento >= -100.00::numeric AND porcentaje_descuento_aumento <= 100.00),
    CONSTRAINT chk_esq_enganche_rango CHECK (porcentaje_enganche >= 0::numeric AND porcentaje_enganche <= 100::numeric),
    CONSTRAINT chk_esq_entrega_rango CHECK (porcentaje_entrega >= 0::numeric AND porcentaje_entrega <= 100::numeric),
    CONSTRAINT chk_esq_mensualidades_rango CHECK (porcentaje_mensualidades >= 0::numeric AND porcentaje_mensualidades <= 100::numeric),
    CONSTRAINT chk_esq_nombre_no_vacio CHECK (btrim(nombre) <> ''::text),
    CONSTRAINT chk_esq_num_mensualidades CHECK ((porcentaje_mensualidades = 0::numeric AND numero_mensualidades = 0) OR (porcentaje_mensualidades > 0::numeric AND numero_mensualidades > 0)),
    CONSTRAINT chk_esq_suma_100 CHECK ((porcentaje_enganche + porcentaje_mensualidades + porcentaje_entrega) = 100.00)
);

-- Estacionamientos table
CREATE TABLE public.estacionamientos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_propiedad integer NOT NULL REFERENCES public.propiedades(id),
    id_producto integer REFERENCES public.productos_servicios(id),
    nombre text NOT NULL,
    descripcion text,
    id_tipo integer NOT NULL,
    m2 numeric(12,2) NOT NULL,
    es_incluido boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_estac_m2 CHECK (m2 >= 0::numeric AND m2 = round(m2, 2)),
    CONSTRAINT chk_estac_nombre_no_vacio CHECK (btrim(nombre) <> ''::text),
    CONSTRAINT chk_estac_producto_si_no_incluido CHECK (es_incluido OR id_producto IS NOT NULL)
);

-- Estatus disponibilidad table
CREATE TABLE public.estatus_disponibilidad (
    id integer GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Logs actividad table
CREATE TABLE public.logs_actividad (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id text NOT NULL,
    actividad_id integer NOT NULL REFERENCES public.actividades(id),
    valor_anterior json,
    nuevo_valor json,
    estatus_ejecucion text NOT NULL,
    datos_payload json,
    workflow text,
    primer_nodo text,
    ultimo_nodo text,
    ambiente text,
    id_ejecucion integer,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Menus table
CREATE TABLE public.menus (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Roles table (needed for menus_roles)
CREATE TABLE public.roles (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- Menus roles table
CREATE TABLE public.menus_roles (
    rol_id integer NOT NULL REFERENCES public.roles(id),
    menu_id integer NOT NULL REFERENCES public.menus(id),
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (rol_id, menu_id)
);

-- Metodos pago table
CREATE TABLE public.metodos_pago (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Modelos caracteristicas table
CREATE TABLE public.modelos_caracteristicas (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_modelo integer NOT NULL REFERENCES public.modelos(id),
    id_caracteristica integer NOT NULL REFERENCES public.caracteristicas(id),
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT now(),
    fecha_actualizacion timestamp without time zone DEFAULT now()
);

-- Multas table
CREATE TABLE public.multas (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_acuerdo_pago integer NOT NULL REFERENCES public.acuerdos_pago(id),
    monto numeric(16,2) NOT NULL,
    descripcion text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_multas_descripcion_no_vacia CHECK (btrim(descripcion) <> ''::text),
    CONSTRAINT chk_multas_monto_positivo CHECK (monto > 0::numeric AND monto = round(monto, 2))
);

-- Multimedias modelo table
CREATE TABLE public.multimedias_modelo (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_modelo integer NOT NULL REFERENCES public.modelos(id),
    es_imagen boolean DEFAULT true,
    url text NOT NULL,
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT now(),
    fecha_actualizacion timestamp without time zone DEFAULT now()
);

-- Notarios table
CREATE TABLE public.notarios (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    notaria text NOT NULL,
    telefono text,
    email text NOT NULL,
    direccion text,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_notarios_contacto_minimo CHECK (telefono IS NOT NULL OR email IS NOT NULL),
    CONSTRAINT chk_notarios_email_formato CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'::text),
    CONSTRAINT chk_notarios_tel_formato CHECK (telefono IS NULL OR telefono ~ '^[0-9 ()+\-]{5,20}$'::text)
);

-- Ofertas table
CREATE TABLE public.ofertas (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_persona_lead integer NOT NULL REFERENCES public.personas(id),
    id_propiedad integer REFERENCES public.propiedades(id),
    id_producto integer REFERENCES public.productos_servicios(id),
    fecha_generacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id_esquema_pago_seleccionado integer REFERENCES public.esquemas_pago(id),
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_ofertas_fecha_no_futuro CHECK (fecha_generacion <= CURRENT_TIMESTAMP)
);

-- Update cuentas_cobranza foreign key
ALTER TABLE public.cuentas_cobranza ADD CONSTRAINT fk_cuentas_cobranza_oferta 
FOREIGN KEY (id_oferta) REFERENCES public.ofertas(id);

-- Pagos table
CREATE TABLE public.pagos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_cuenta_cobranza integer NOT NULL REFERENCES public.cuentas_cobranza(id),
    id_metodos_pago integer NOT NULL REFERENCES public.metodos_pago(id),
    clave_rastreo text,
    monto numeric(16,2) NOT NULL,
    fecha_pago timestamp without time zone NOT NULL,
    url_recibo text,
    url_cep text,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_pagos_fecha_no_futuro CHECK (fecha_pago <= CURRENT_TIMESTAMP),
    CONSTRAINT chk_pagos_monto CHECK (monto > 0::numeric AND monto = round(monto, 2)),
    CONSTRAINT chk_pagos_url_cep CHECK (url_cep IS NULL OR url_cep ~* '^(https?|/).+'::text),
    CONSTRAINT chk_pagos_url_recibo CHECK (url_recibo IS NULL OR url_recibo ~* '^(https?|/).+'::text)
);

-- Update aplicaciones_pago foreign key
ALTER TABLE public.aplicaciones_pago ADD CONSTRAINT fk_aplicaciones_pago_pago 
FOREIGN KEY (id_pago) REFERENCES public.pagos(id);

-- Pagos STP raw table
CREATE TABLE public.pagos_stp_raw (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    claverastreo text NOT NULL,
    stp_id text,
    fecha_operacion timestamp without time zone NOT NULL,
    monto numeric(16,2) NOT NULL,
    cuenta_beneficiario text NOT NULL,
    institucion_ordenante text,
    institucion_beneficiaria text,
    nombre_ordenante text,
    tipo_cuenta_ordenante text,
    cuenta_ordenante text,
    rfc_curp_ordenante text,
    nombre_beneficiario text,
    tipo_cuenta_beneficiario text,
    nombre_beneficiario2 text,
    tipo_cuenta_beneficiario2 text,
    cuenta_beneficiario2 text,
    rfc_curp_beneficiario text,
    concepto_pago text,
    referencia_numerica text,
    empresa text,
    tipo_pago text,
    ts_liquidacion text,
    folio_codi text,
    es_pago_aplicado boolean DEFAULT false NOT NULL,
    razon_rechazo text,
    activo boolean DEFAULT true NOT NULL,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_pagos_aplicado_rechazo CHECK (es_pago_aplicado = false OR razon_rechazo IS NULL),
    CONSTRAINT chk_pagos_cuenta_benef_formato CHECK (cuenta_beneficiario ~ '^[0-9]{10,18}$'::text),
    CONSTRAINT chk_pagos_cuenta_ord_formato CHECK (cuenta_ordenante IS NULL OR cuenta_ordenante ~ '^[0-9]{10,18}$'::text),
    CONSTRAINT chk_pagos_fecha_no_futuro CHECK (fecha_operacion <= CURRENT_TIMESTAMP),
    CONSTRAINT chk_pagos_inst_benef CHECK (institucion_beneficiaria IS NULL OR institucion_beneficiaria ~ '^[0-9]{3}$'::text),
    CONSTRAINT chk_pagos_inst_ordenante CHECK (institucion_ordenante IS NULL OR institucion_ordenante ~ '^[0-9]{3}$'::text),
    CONSTRAINT chk_pagos_monto_nonneg CHECK (monto >= 0::numeric AND monto = round(monto, 2)),
    CONSTRAINT chk_pagos_referencia_numerica CHECK (referencia_numerica IS NULL OR referencia_numerica ~ '^[0-9]{1,20}$'::text),
    CONSTRAINT chk_pagos_rfc_benef CHECK (rfc_curp_beneficiario IS NULL OR (upper(rfc_curp_beneficiario) = rfc_curp_beneficiario AND rfc_curp_beneficiario ~ '^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$'::text)),
    CONSTRAINT chk_pagos_rfc_ordenante CHECK (rfc_curp_ordenante IS NULL OR (upper(rfc_curp_ordenante) = rfc_curp_ordenante AND rfc_curp_ordenante ~ '^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$'::text))
);

-- Permisos table
CREATE TABLE public.permisos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL,
    descripcion text,
    activo boolean DEFAULT true,
    fecha_creacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);