-- Update Pago Proveedores submenu with correct vista_front_end
UPDATE public.submenus 
SET vista_front_end = '/admin/pago-proveedores'
WHERE id = 50;