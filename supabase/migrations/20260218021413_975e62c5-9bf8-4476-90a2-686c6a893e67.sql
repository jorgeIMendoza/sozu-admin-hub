-- Update submenu routes from mis-proyectos to proyectos
UPDATE submenus SET vista_front_end = '/admin/inmobiliarias/proyectos' WHERE vista_front_end = '/admin/inmobiliarias/mis-proyectos';
UPDATE submenus SET vista_front_end = REPLACE(vista_front_end, '/inmobiliarias/mis-proyectos/', '/inmobiliarias/proyectos/') WHERE vista_front_end LIKE '%/inmobiliarias/mis-proyectos/%';