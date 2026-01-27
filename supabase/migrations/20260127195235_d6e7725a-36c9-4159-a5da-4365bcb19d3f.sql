-- Eliminar permisos de "generar_oferta" y "exportar" del submenú Comisiones Externas (id=45) para TODOS los roles
-- Esto evita que aparezcan como opciones configurables en la UI

DELETE FROM public.submenus_permisos
WHERE submenu_id = 45
  AND permiso_id IN (
    SELECT id FROM public.permisos WHERE nombre IN ('generar_oferta', 'exportar')
  );