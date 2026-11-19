-- Descripciones propias por producto, nombres prolijos y familias corregidas.
--
-- Contexto: cada vez que el sistema de gestión toca un producto (una venta, un
-- cambio de precio), la sincronización vuelve a escribir la descripción a partir
-- del nombre interno y cae en el texto genérico del rubro. Por eso 123 de los 185
-- productos publicados compartían la misma descripción que otros.
--
-- Qué hace esta migración:
--   1. Guarda una copia de los textos, nombres y familias actuales.
--   2. Crea una tabla de descripciones propias por SKU, con las mismas reglas
--      que ya rigen para los textos automáticos (15 a 45 palabras, hasta dos
--      oraciones, sin indicaciones al comprador).
--   3. Agrega un disparador en storefront_products que hace valer esa
--      descripción (o, si no hay, la que corresponde al nombre revisado) cada
--      vez que la sincronización intenta pisarla. Lo que el dueño edita a mano
--      en el Admin siempre gana y nunca se toca.
--   4. Corrige los 34 nombres que seguían en crudo y seis familias mal ubicadas.
--
-- No modifica tablas del sistema de gestión.

begin;

-- ---------------------------------------------------------------------------
-- 1. Copias de seguridad
-- ---------------------------------------------------------------------------

insert into private.storefront_description_backups (
  migration_key,
  storefront_product_id,
  sku,
  old_short_description,
  old_description,
  old_seo_description,
  old_description_status,
  old_description_generated_at,
  old_description_reviewed_at
)
select
  '20261119_curated_descriptions_v1',
  product.id,
  product.sku,
  coalesce(product.short_description, ''),
  coalesce(product.description, ''),
  coalesce(product.seo_description, ''),
  product.description_status,
  product.description_generated_at,
  product.description_reviewed_at
from public.storefront_products as product
where product.description_status <> 'manually_reviewed'
on conflict (migration_key, storefront_product_id) do nothing;

create table if not exists private.storefront_name_backups (
  id bigint generated always as identity primary key,
  migration_key text not null,
  storefront_product_id uuid not null,
  sku text not null,
  old_name text not null,
  old_name_status text not null,
  old_family_override text,
  backed_up_at timestamptz not null default now(),
  unique (migration_key, storefront_product_id)
);

alter table private.storefront_name_backups enable row level security;
revoke all on table private.storefront_name_backups from public, anon, authenticated;
revoke all on sequence private.storefront_name_backups_id_seq from public, anon, authenticated;

insert into private.storefront_name_backups (
  migration_key,
  storefront_product_id,
  sku,
  old_name,
  old_name_status,
  old_family_override
)
select
  '20261119_curated_descriptions_v1',
  product.id,
  product.sku,
  product.name,
  product.name_status,
  product.family_override
from public.storefront_products as product
where product.sku in ('ADA-005', 'ADA-007', 'AUR-022', 'AUR-023', 'CAB-030', 'CAB-042', 'CAB-043', 'CAB-044', 'CAB-045', 'CAB-046', 'CAB-047', 'CAR-022', 'CAR-023', 'CAR-024', 'CAR-025', 'CAR-026', 'ILU-007', 'ILU-008', 'ILU-009', 'TEC-001', 'TEC-002', 'TEC-003', 'TEL-002', 'VAR-038', 'VAR-045', 'VAR-046', 'VAR-047', 'VAR-048', 'VAR-049', 'VAR-050', 'VAR-051', 'VAR-052', 'VAR-053', 'VAR-054', 'VAR-055', 'VAR-056', 'VAR-057', 'VAR-058', 'VAR-059')
on conflict (migration_key, storefront_product_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Reglas de redacción y tabla de descripciones propias
-- ---------------------------------------------------------------------------

create or replace function private.storefront_description_is_valid(description_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select description_text is not null
    and cardinality(regexp_split_to_array(btrim(description_text), E'\\s+')) between 15 and 45
    and cardinality(regexp_split_to_array(btrim(description_text), E'[.!?]+[[:space:]]+')) between 1 and 2
    and lower(description_text) !~ E'base de datos|cat[aá]logo|categor[ií]a|chetech|producto agregado|incorporad[oa]|forma parte|pertenece a|\\m(verific[aá]|revis[aá]|confirm[aá]|asegurate|consultanos|consult[aá]|comprob[aá]|compar[aá]|corrobor[aá]|cheque[aá]|control[aá]|le[eé]|envi[aá]|mandanos|record[aá]|compatibilidad)\\M|antes de (comprar|completar la compra)|ten[eé] en cuenta|es necesario verificar|whatsapp';
$$;

revoke all on function private.storefront_description_is_valid(text) from public, anon, authenticated;

create table if not exists private.storefront_curated_descriptions (
  sku text primary key,
  description text not null
    constraint storefront_curated_descriptions_valid
    check (private.storefront_description_is_valid(description)),
  -- Nombre interno del producto al momento de escribir el texto. Si en gestión
  -- ese código pasa a ser otro artículo, la descripción deja de aplicarse.
  source_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.storefront_curated_descriptions enable row level security;
revoke all on table private.storefront_curated_descriptions from public, anon, authenticated;

comment on table private.storefront_curated_descriptions is
  'Descripción propia por SKU. Tiene prioridad sobre el texto automático mientras el dueño no edite la descripción a mano en el Admin.';

with curated(sku, description) as (
  values
    ('ADA-001', 'Adaptador de viaje con clavijas para tomacorrientes de distintos países y puertos USB y USB-C. Permite enchufar cargadores y recargar celulares o tablets durante un viaje con un solo accesorio.'),
    ('ADA-002', 'Receptor Bluetooth Jahro para sumar conexión inalámbrica a parlantes, equipos de música o estéreos que no la tienen. Permite reproducir desde el celular sin cables de por medio.'),
    ('ADA-007', 'Adaptador OTG que convierte el puerto USB-C del celular o la tablet en una entrada USB. Sirve para conectar pendrives, teclados, mouse o joysticks directamente al dispositivo.'),
    ('AUR-003', 'Auricular Bluetooth Noga Aris NG-920BT para escuchar música y atender llamadas sin cables desde el celular, la tablet o la computadora. Acompaña en casa, en el trabajo o de viaje.'),
    ('AUR-004', 'Auricular Samsung AKG presentado en su caja, para escuchar música, videos y llamadas desde el celular. Su formato liviano resulta cómodo para llevar todos los días en el bolsillo o la mochila.'),
    ('AUR-005', 'Auriculares Bluetooth InPods 12 con estuche que los guarda y recarga. Sirven para escuchar música y atender llamadas desde el celular sin cables.'),
    ('AUR-006', 'Auriculares Bluetooth E9S Pro para escuchar música, videos y llamadas sin cables. Se vinculan con el celular, la tablet o la computadora y acompañan en la calle, el trabajo o el gimnasio.'),
    ('AUR-007', 'Auricular Samsung Dolby en color blanco para escuchar música, videos y llamadas desde el celular. Una opción simple y liviana para tener siempre a mano en el bolsillo, la mochila o el escritorio.'),
    ('AUR-008', 'Auricular Bluetooth pensado para chicos, con funda para guardarlo y transportarlo. Permite escuchar música, cuentos y videos sin cables desde el celular o la tablet.'),
    ('AUR-009', 'Auricular Bluetooth de diseño transparente para escuchar música y atender llamadas sin cables. Se vincula con el celular, la tablet o la computadora y suma un detalle distinto a la vista.'),
    ('AUR-010', 'Auricular Bluetooth de vincha con diseño de personajes, pensado para escuchar música y videos sin cables. Su formato apoya sobre la cabeza y resulta cómodo para chicos y fanáticos.'),
    ('AUR-012', 'Auricular Samsung AKG con conector USB-C para celulares y tablets que no tienen entrada de 3,5 mm. Permite escuchar música, videos y llamadas enchufándolo directo al puerto de carga.'),
    ('AUR-013', 'Auricular Bluetooth Y08 para escuchar música, videos y llamadas sin cables. Se vincula con el celular, la tablet o la computadora y acompaña en casa, en el trabajo o de viaje.'),
    ('AUR-014', 'Auricular Karsen Mars con conector USB-C, para celulares y tablets que usan ese puerto como salida de audio. Sirve para escuchar música, videos y llamadas sin adaptadores.'),
    ('AUR-015', 'Auricular Malibu M4 para escuchar música, videos y llamadas desde el celular, la tablet o la computadora. Un modelo simple y liviano para el uso de todos los días.'),
    ('AUR-016', 'Auricular Noga NG-1600 para escuchar música, videos y llamadas en el celular, la tablet o la computadora. Liviano y fácil de guardar, acompaña en el bolsillo o la mochila.'),
    ('AUR-017', 'Auriculares inalámbricos Samsung Galaxy Buds2 Pro con estuche que los guarda y recarga. Sirven para escuchar música y atender llamadas por Bluetooth desde el celular.'),
    ('AUR-019', 'Auricular Foxbox Boost Pulse para escuchar música, videos y llamadas desde el celular, la tablet o la computadora. Un modelo liviano y práctico para el uso diario.'),
    ('AUR-020', 'Auricular Foxbox Link 2 con conector USB-C, pensado para celulares y tablets sin entrada de 3,5 mm. Se enchufa directo al puerto de carga para escuchar música y atender llamadas.'),
    ('AUR-022', 'Auricular Xienan Auralis para escuchar música, videos y llamadas desde el celular, la tablet o la computadora. Acompaña en casa, en el trabajo o de viaje.'),
    ('AUR-023', 'Auricular Foxbox Run para escuchar música, podcasts y llamadas desde el celular, la tablet o la computadora. Acompaña en casa, en la calle o durante el entrenamiento.'),
    ('CAB-003', 'Adaptador Karsen que convierte un cable Micro-USB en uno USB-C. Permite seguir usando cables y cargadores anteriores con celulares y accesorios que traen el puerto nuevo.'),
    ('CAB-004', 'Adaptador universal de viaje con clavijas para tomacorrientes de distintos países. Suma puertos USB y USB-C para recargar celulares, tablets y auriculares sin llevar otro cargador.'),
    ('CAB-010', 'Cable de red Noga de 2 metros para conectar la computadora, la consola o el televisor al router por puerto Ethernet. Brinda una conexión por cable estable para navegar, jugar y ver contenido.'),
    ('CAB-012', 'Cable HDMI de 1,5 metros con recubrimiento mallado, más resistente a dobleces y tirones. Lleva imagen y sonido de la consola, la notebook o el decodificador al televisor o monitor.'),
    ('CAB-014', 'Cable HDMI Seisa de 10 metros para llevar imagen y sonido a un televisor, monitor o proyector alejado de la fuente. Útil en instalaciones de pared, salas y aulas.'),
    ('CAB-015', 'Cable Micro-USB Otawa preparado para cargas de hasta 30 W. Sirve para cargar y sincronizar celulares, parlantes, joysticks y otros equipos que usan ese conector.'),
    ('CAB-020', 'Cable Hytoshy con conector USB-C en ambos extremos, preparado para cargas de hasta 60 W. Sirve para celulares, tablets y notebooks que cargan por USB-C con cargadores de ese tipo.'),
    ('CAB-021', 'Cable con conector USB-C en ambos extremos para equipos Apple que cargan por ese puerto, como iPhone 15 en adelante, iPad y MacBook. Sirve para cargar y pasar datos.'),
    ('CAB-022', 'Cable Samsung con conector Micro-USB para cargar y sincronizar celulares, parlantes, auriculares y otros equipos que usan ese puerto. Un repuesto simple para tener en casa o en el auto.'),
    ('CAB-024', 'Cable USB a Lightning certificado de 1 metro para iPhone 5 y modelos posteriores con ese conector. Sirve para cargar el teléfono y sincronizarlo con la computadora.'),
    ('CAB-028', 'Cable Karsen con conector USB-C en ambos extremos para cargar y pasar datos entre celulares, tablets, notebooks y cargadores con ese puerto. Un repuesto práctico para el uso diario.'),
    ('CAB-029', 'Cable Samsung de USB a USB-C para cargar el celular desde un cargador tradicional, la computadora o el auto. También sirve para pasar fotos y archivos.'),
    ('CAB-032', 'Cable Alo de USB a USB-C para cargar celulares, auriculares y parlantes desde un cargador tradicional, la computadora o el auto. También permite pasar archivos.'),
    ('CAB-035', 'Cable Foxbox Prism con conector USB-C y 1,5 metros de largo, cómodo para usar el celular mientras carga. Sirve también para pasar fotos y archivos.'),
    ('CAB-036', 'Cable Foxbox Pixel USB-C con pantalla LCD que muestra la potencia de carga en tiempo real. Soporta hasta 100 W, apto para celulares, tablets y notebooks que cargan por USB-C.'),
    ('CAB-037', 'Cable Foxbox Loop USB-C con diseño magnético y carga de hasta 60 W. Sirve para cargar celulares, tablets y otros equipos con puerto USB-C y se guarda fácil en la mochila.'),
    ('CAB-039', 'Cable de red Jahro de 15 metros para llevar internet por cable a una computadora, consola o televisor lejos del router. Brinda una conexión estable para jugar, trabajar y ver contenido.'),
    ('CAB-040', 'Cable Spring de USB a USB-C para cargar celulares y accesorios desde un cargador tradicional, la computadora o el auto. También permite pasar fotos y archivos.'),
    ('CAB-042', 'Cable de USB-C a Lightning certificado para iPhone y iPad con ese conector. Combinado con un cargador USB-C permite carga rápida en los modelos que la admiten y también sincroniza datos.'),
    ('CAB-043', 'Cable RCA a RCA para llevar audio o video analógico entre televisores, equipos de música, reproductores y consolas con esas fichas. Un repuesto clásico para instalaciones de sonido e imagen.'),
    ('CAB-044', 'Cable VGA para conectar una computadora a un monitor, televisor o proyector con esa entrada. Transmite imagen analógica y resulta útil en equipos de oficina, aulas y salas.'),
    ('CAB-045', 'Cable Foxbox Round de USB a Micro-USB para cargar y sincronizar celulares, parlantes, joysticks y otros equipos con ese conector. Un repuesto práctico para casa, la oficina o el auto.'),
    ('CAB-046', 'Cable Spring con conector USB-C en ambos extremos para cargar celulares, tablets y notebooks desde cargadores con salida USB-C. También permite pasar datos entre equipos.'),
    ('CAB-047', 'Cable HDMI Maxxa de 3 metros para llevar imagen y sonido de la consola, la notebook o el decodificador al televisor, monitor o proyector. Su largo da margen para ubicar los equipos.'),
    ('CAR-001', 'Cargador universal para notebook con varias puntas intercambiables, apto para equipos de distintas marcas. Reemplaza al cargador original cuando se pierde o deja de funcionar.'),
    ('CAR-002', 'Fuente de alimentación Jahro con salida de 9 V y 1 A para equipos que requieren esa tensión, como routers, módems y pedales de efectos. Se enchufa directo al tomacorriente.'),
    ('CAR-005', 'Cargador de pared USB certificado para equipos Apple. Viene solo la base, sin cable, para usar con el cable USB que ya tenés para tu iPhone o iPad.'),
    ('CAR-006', 'Fuente de alimentación Jahro con salida de 5 V y 2 A para equipos que usan esa tensión, como cámaras, conversores y pequeños dispositivos electrónicos. Se enchufa directo al tomacorriente.'),
    ('CAR-007', 'Cargador de pared USB-C de 20 W certificado para Apple. Brinda carga rápida a los iPhone y iPad que la admiten usando un cable USB-C.'),
    ('CAR-009', 'Cargador de pared Bulltec con salida USB-C y carga rápida para celulares y tablets que la admiten. Compacto, entra fácil en la mochila o el bolso de viaje.'),
    ('CAR-010', 'Cargador de pared USB-C con Power Delivery 3.0 y PPS, capaz de entregar hasta 25 W. Brinda carga rápida a celulares Samsung y otros dispositivos que admiten esos protocolos.'),
    ('CAR-011', 'Cargador de pared Motorola de 68 W que viene con cable USB-C. Brinda carga rápida a los celulares Motorola que admiten esa potencia y también carga otros equipos USB-C.'),
    ('CAR-012', 'Cargador Karsen Atomic para el encendedor del auto, con salida USB-C y hasta 38 W de potencia. Carga el celular durante el viaje, incluso con el navegador en uso.'),
    ('CAR-014', 'Cargador de pared Otawa con salida USB-C de hasta 30 W. Viene solo la base, sin cable, lista para usar con el cable USB-C que ya tenés.'),
    ('CAR-015', 'Fuente de alimentación Jahro con salida de 12 V y 2 A para routers, tiras LED, cámaras de seguridad y otros equipos que trabajan con esa tensión. Se enchufa directo al tomacorriente.'),
    ('CAR-016', 'Batería externa pensada para iPhone, para recargar el teléfono cuando no hay un enchufe cerca. Su tamaño permite llevarla en el bolsillo, la cartera o la mochila.'),
    ('CAR-017', 'Batería externa Xiaomi para recargar el celular, los auriculares y otros dispositivos lejos de un enchufe. Acompaña en viajes, jornadas largas y cortes de luz.'),
    ('CAR-018', 'Batería portátil Lambotech de 10.000 mAh para recargar el celular y otros dispositivos sin depender de un enchufe. Entra en la mochila y acompaña en viajes, jornadas largas y cortes de luz.'),
    ('CAR-019', 'Cargador de pared Alo Pocket de 15 W, de tamaño reducido para llevar en el bolsillo o la mochila. Carga celulares, auriculares y otros accesorios de bajo consumo.'),
    ('CAR-022', 'Cargador de pared Hytoshy de hasta 100 W, con potencia suficiente para notebooks, tablets y celulares que cargan por USB-C. Viene solo la base, sin cable.'),
    ('CAR-023', 'Cargador de pared Foxbox Mega 3 de 45 W, con potencia para cargar rápido los celulares y tablets que la admiten. Su tamaño compacto resulta cómodo en casa, la oficina y los viajes.'),
    ('CAR-024', 'Cargador de pared Foxbox Mega 3 de 20 W para la carga diaria de celulares, auriculares y otros accesorios. Su tamaño compacto resulta cómodo en casa, la oficina y los viajes.'),
    ('CAR-025', 'Cargador Karsen Estruendo para el encendedor del auto, con conector Micro-USB. Mantiene cargados durante el viaje el celular, el GPS y otros equipos que usan ese conector.'),
    ('CAR-026', 'Cargador de pared Xienan Auro de 15 W con un puerto USB y otro USB-C. Permite cargar celulares, auriculares y otros accesorios con cualquiera de los dos tipos de cable.'),
    ('ILU-004', 'Tira de luz tipo neón en color blanco para iluminación decorativa continua en habitaciones, muebles, estantes y vidrieras. Su formato flexible permite seguir bordes y formar líneas o figuras.'),
    ('ILU-005', 'Tira de luz tipo neón multicolor para ambientar habitaciones, escritorios, muebles y vidrieras. Su formato flexible permite seguir bordes y formar líneas o figuras con luz de distintos colores.'),
    ('ILU-006', 'Linterna de vincha que se sujeta a la cabeza y deja las manos libres. Útil para reparaciones, cortes de luz, campamento y cualquier tarea con poca luz.'),
    ('ILU-007', 'Foco LED con parlante integrado que ilumina y reproduce música al mismo tiempo. Se coloca en un portalámparas común y suma luz y sonido a habitaciones, quinchos y reuniones.'),
    ('ILU-008', 'Lámpara pequeña con forma de capibara para decorar y dar luz tenue en la mesa de luz, el escritorio o el cuarto de los chicos. Un regalo simpático para fanáticos del animal.'),
    ('ILU-009', 'Aro de luz blanca con trípode para iluminar el rostro de manera pareja en videos, fotos, videollamadas y maquillaje. Útil para crear contenido, dar clases en línea y transmitir en vivo.'),
    ('PAR-001', 'Parlante Bluetooth Malibu MS-1954BT con dos parlantes de 6,5 pulgadas para ponerle música a reuniones, fiestas y patios. Reproduce de forma inalámbrica desde el celular.'),
    ('PAR-003', 'Parlante Bluetooth Noga NG-BT620 para reproducir música sin cables desde el celular, la tablet o la computadora. Suma sonido en casa, en el trabajo o en una juntada.'),
    ('PAR-004', 'Parlante Bluetooth SH-309 para reproducir música sin cables desde el celular, la tablet o la computadora. Una opción accesible para sumar sonido en casa, el trabajo o una salida.'),
    ('PAR-007', 'Parlante mini Noga NG-106 para darle sonido a la computadora de escritorio o la notebook. Ocupa poco lugar y sirve para música, videos, clases y videollamadas.'),
    ('PAR-009', 'Parlante portátil JD E300 con Bluetooth y 30 W de potencia para escuchar música con volumen en casa, el patio o una reunión. Reproduce de forma inalámbrica desde el celular.'),
    ('PAR-010', 'Parlante portátil LDNIO BTS12 para llevar la música a cualquier parte. Su tamaño facilita guardarlo en la mochila y usarlo en casa, al aire libre o de viaje.'),
    ('PIL-001', 'Par de pilas recargables Noga tamaño AA para controles, juguetes, cámaras, mouse y linternas. Se reutilizan muchas veces con un cargador de pilas y reducen el gasto en descartables.'),
    ('PIL-002', 'Par de pilas recargables Noga tamaño AAA para controles remotos, mouse, juguetes y linternas pequeñas. Se reutilizan muchas veces con un cargador de pilas y reducen el gasto en descartables.'),
    ('PIL-003', 'Pila botón de litio Energizer CR2016 de 3 V para llaves de auto, relojes, calculadoras y controles pequeños. El precio corresponde a una unidad.'),
    ('PIL-004', 'Pila botón de litio Energizer CR2025 de 3 V para llaves de auto, controles remotos, relojes, balanzas y calculadoras. El precio corresponde a una unidad.'),
    ('PIL-005', 'Pila botón de litio Maxell CR2032 de 3 V para motherboards, llaves de auto, balanzas, controles y relojes. El precio corresponde a una unidad.'),
    ('PIL-007', 'Pila alcalina Energizer A23 de 12 V para controles de portón, alarmas, timbres inalámbricos y llaveros a distancia. El precio corresponde a una unidad.'),
    ('PIL-008', 'Pila alcalina Energizer A27 de 12 V, más delgada que la A23, para controles de portón, alarmas, encendedores y llaveros a distancia que usan ese tamaño.'),
    ('PIL-009', 'Pila alcalina Energizer AA (E91) de 1,5 V para controles, juguetes, relojes de pared, mouse y linternas. El precio corresponde a una unidad.'),
    ('PIL-010', 'Pila alcalina Energizer AAA (E92) de 1,5 V para controles remotos, mouse, teclados inalámbricos, juguetes y linternas pequeñas. El precio corresponde a una unidad.'),
    ('PIL-011', 'Pila Energizer AZ13 de zinc-aire para audífonos que usan el tamaño 13, identificado con el color naranja. El precio corresponde a una unidad.'),
    ('PIL-012', 'Pila Energizer AZ312 de zinc-aire para audífonos que usan el tamaño 312, identificado con el color marrón. Su formato pequeño alimenta audífonos de tamaño reducido.'),
    ('PIL-013', 'Pila alcalina Energizer tamaño C (E93) de 1,5 V para linternas, radios, juguetes y equipos de mayor consumo. El precio corresponde a una unidad.'),
    ('PIL-014', 'Pila alcalina Energizer tamaño D (E95) de 1,5 V para linternas grandes, radios, calefones y equipos de alto consumo. El precio corresponde a una unidad.'),
    ('PIL-017', 'Sellador adhesivo Fastix transparente de 25 g para pegar y sellar en arreglos del hogar. Su presentación en pomo resulta práctica para tener a mano en casa o en el taller.'),
    ('PIL-018', 'Adhesivo instantáneo La Gotita de 2 ml para pegar en segundos piezas pequeñas de plástico, metal, cerámica, madera o goma. Rinde en arreglos rápidos de casa y del taller.'),
    ('PIL-019', 'Adhesivo de contacto Poxirán de 23 ml para pegar cuero, goma, madera, corcho y laminados. Clásico para arreglar calzado, tapizados y trabajos de carpintería liviana.'),
    ('PIL-020', 'Pila botón alcalina Vinnic LR44 de 1,5 V para relojes, calculadoras, termómetros, punteros láser y juguetes pequeños. Un formato muy usado en dispositivos de bajo consumo.'),
    ('TEC-002', 'Micrófono corbatero inalámbrico K8 que se engancha en la ropa y transmite la voz sin cables al celular. Mejora el audio de videos, entrevistas, clases y transmisiones en vivo.'),
    ('TEC-016', 'Joystick para consola PlayStation 3, para sumar un segundo mando o reemplazar uno que ya no responde. Mantiene la distribución clásica de botones, gatillos y palancas analógicas.'),
    ('TEL-002', 'Televisor Philips de 32 pulgadas, un tamaño cómodo para dormitorios, cocinas y ambientes chicos. Permite ver televisión y conectar consolas, decodificadores y otros equipos.'),
    ('VAR-010', 'Ventilador Hytoshy de diseño retráctil que se pliega para guardarlo o trasladarlo ocupando poco lugar. Ayuda a mover el aire en dormitorios, oficinas y espacios al aire libre.'),
    ('VAR-012', 'Sellador manual de tamaño mini que cierra bolsas plásticas con calor para conservar mejor los alimentos. Práctico para paquetes de snacks, galletitas, cereales y congelados.'),
    ('VAR-013', 'Ventilador Hytoshy 3 en 1 que admite tres formas de uso según el espacio. Ayuda a mover el aire en dormitorios, livings y oficinas durante los días de calor.'),
    ('VAR-014', 'Dispositivo de streaming ONN con Google TV para ver películas, series y aplicaciones en resolución Full HD. Se conecta al televisor por HDMI y usa la red Wi-Fi de casa.'),
    ('VAR-015', 'Control remoto de reemplazo para televisor, útil cuando el original se pierde, se rompe o deja de responder. Reúne las funciones habituales de encendido, volumen, canales y menú.'),
    ('VAR-018', 'Adaptador multipuerto para ampliar la cantidad de conexiones disponibles a partir de una sola. Su tamaño reducido permite tenerlo en casa, la oficina o el bolso de viaje.'),
    ('VAR-025', 'Joystick para consola PlayStation 4, para sumar un segundo mando o reemplazar uno gastado. Mantiene la distribución habitual de botones, gatillos y palancas analógicas.'),
    ('VAR-028', 'Soporte fijo de pared para televisores de 40 a 80 pulgadas. Mantiene la pantalla firme y pegada a la pared, con una instalación prolija que libera espacio en el mueble.'),
    ('VAR-029', 'Funda para iPhone que protege el teléfono de golpes, rayones y caídas del día a día. Cubre el dorso y los bordes sin tapar los botones, la cámara ni el puerto de carga.'),
    ('VAR-032', 'Soporte Bracket Anchor para llevar el celular a la vista dentro del auto. Mantiene el teléfono sujeto y facilita seguir el navegador durante el viaje.'),
    ('VAR-036', 'Linterna minera con cinco lámparas y sujeción para la cabeza, que ilumina dejando las manos libres. Útil para reparaciones, pesca, campamento y cortes de luz.'),
    ('VAR-045', 'Consola portátil Sup Game Box con 400 juegos clásicos en memoria. Tiene pantalla propia y batería recargable para jugar en cualquier lado, sin cartuchos ni descargas.'),
    ('VAR-046', 'Funda de TPU flexible para celular que absorbe golpes y protege de rayones. Se coloca y se quita fácil, y mantiene libres los botones, la cámara y el puerto de carga.'),
    ('VAR-047', 'Funda de TPU con anillo magnético MagSafe que protege el celular y permite usar cargadores, soportes y accesorios magnéticos sin quitarla. Pensada para iPhone 12 en adelante.'),
    ('VAR-048', 'Lápiz 3D que funde filamento plástico para dibujar figuras con volumen. Sirve para manualidades, maquetas y proyectos escolares, y para despertar la creatividad de chicos y grandes.'),
    ('VAR-049', 'Kit para grabar videos con el celular, con accesorios para mejorar el sonido, la luz y la estabilidad de la imagen. Pensado para crear contenido, hacer vivos y grabar clases o reseñas.'),
    ('VAR-050', 'Estabilizador de tensión TRV Powersafe que protege computadoras, televisores y otros equipos frente a subas y bajas de la red eléctrica. Suma varias tomas para conectar más de un equipo.'),
    ('VAR-051', 'Estabilizador de tensión TRV Micro Volt que protege computadoras, televisores, consolas y otros equipos frente a subas y bajas de la red eléctrica. Ayuda a cuidar la electrónica de casa o la oficina.'),
    ('VAR-052', 'Soporte Grip para auto que sujeta el celular con firmeza y lo mantiene a la vista. Cómodo para seguir el navegador y atender llamadas en manos libres durante el viaje.'),
    ('VAR-053', 'Soporte magnético Lambotech para auto que se fija con ventosa al parabrisas o al tablero. El celular se apoya y queda sujeto por imán, listo para seguir el navegador.'),
    ('VAR-054', 'Soporte Vent para auto que se engancha en la rejilla de ventilación. Mantiene el celular a la altura de la vista para seguir el navegador sin ocupar el parabrisas ni el tablero.'),
    ('VAR-055', 'Vidrio templado con sistema de colocación automática que alinea el protector sobre la pantalla sin burbujas ni corrimientos. Protege el celular de rayones y golpes.'),
    ('VAR-056', 'Vidrio templado para proteger la pantalla del celular de rayones, golpes y caídas. Se adhiere sobre el vidrio original y conserva la sensibilidad del táctil.'),
    ('VAR-057', 'Protector de vidrio para las cámaras traseras del iPhone. Cubre los lentes frente a rayones y golpes sin afectar las fotos, y se coloca en segundos.'),
    ('VAR-058', 'Soporte Karsen para mantener el celular firme y a la vista. Deja las manos libres para ver videos, seguir una receta, hacer videollamadas o usar el navegador.'),
    ('VAR-059', 'Soporte de pared con brazo móvil para televisores de 14 a 55 pulgadas. Permite orientar la pantalla hacia donde se mira, ideal para dormitorios, cocinas y oficinas.')
)
insert into private.storefront_curated_descriptions (sku, description, source_name)
select curated.sku, curated.description, product.source_name
from curated
join public.storefront_products as product on product.sku = curated.sku
on conflict (sku) do update set
  description = excluded.description,
  source_name = excluded.source_name,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Disparador: la sincronización ya no pisa las descripciones
-- ---------------------------------------------------------------------------

create or replace function private.storefront_apply_curated_description()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text;
begin
  -- Lo que se editó a mano en el Admin no se toca.
  if new.description_status = 'manually_reviewed' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.description is not distinct from old.description
     and new.short_description is not distinct from old.short_description
     and new.name is not distinct from old.name
     and new.source_name is not distinct from old.source_name
     and new.category_name is not distinct from old.category_name
     and new.description_status is not distinct from old.description_status then
    return new;
  end if;

  begin
    select curated.description
      into v_text
    from private.storefront_curated_descriptions as curated
    where curated.sku = new.sku
      and (curated.source_name is null or curated.source_name = new.source_name);

    if v_text is null then
      -- Sin texto propio: se usa el generador, pero con el nombre que se
      -- muestra en la tienda (el revisado), no con el nombre interno.
      v_text := private.storefront_generated_description(new.name, new.category_name);
    end if;

    if private.storefront_description_is_valid(v_text) then
      new.short_description := v_text;
      new.description := v_text;
      new.seo_description := v_text;
      new.description_status := 'generated';
      new.description_generated_at := coalesce(new.description_generated_at, now());
    end if;
  exception when others then
    -- Un texto nunca debe frenar una venta ni una sincronización.
    null;
  end;

  return new;
end;
$$;

revoke all on function private.storefront_apply_curated_description() from public, anon, authenticated;

drop trigger if exists storefront_products_curated_description on public.storefront_products;
create trigger storefront_products_curated_description
before insert or update on public.storefront_products
for each row execute function private.storefront_apply_curated_description();

-- ---------------------------------------------------------------------------
-- 4. Nombres que seguían en crudo (el enlace de cada producto no cambia)
-- ---------------------------------------------------------------------------

with reviewed(sku, name) as (
  values
    ('ADA-007', 'Adaptador USB-C a USB OTG'),
    ('AUR-022', 'Auricular Xienan Auralis'),
    ('AUR-023', 'Auricular Foxbox Run'),
    ('CAB-042', 'Cable USB-C a Lightning certificado para Apple'),
    ('CAB-043', 'Cable RCA a RCA'),
    ('CAB-044', 'Cable VGA'),
    ('CAB-045', 'Cable USB a Micro-USB Foxbox Round'),
    ('CAB-046', 'Cable USB-C a USB-C Spring'),
    ('CAB-047', 'Cable HDMI Maxxa de 3 m'),
    ('CAR-022', 'Fuente Hytoshy de 100 W (base)'),
    ('CAR-023', 'Cargador Foxbox Mega 3 de 45 W'),
    ('CAR-024', 'Cargador Foxbox Mega 3 de 20 W'),
    ('CAR-025', 'Cargador para auto Karsen Estruendo Micro-USB 3.1'),
    ('CAR-026', 'Cargador Xienan Auro USB y USB-C de 15 W'),
    ('ILU-007', 'Foco LED con parlante (LED Music Bulb)'),
    ('ILU-008', 'Lámpara capibara Mini Lamp'),
    ('ILU-009', 'Aro de luz blanco con trípode'),
    ('TEC-002', 'Micrófono corbatero inalámbrico K8'),
    ('TEL-002', 'Televisor Philips de 32"'),
    ('VAR-045', 'Consola portátil Sup Game Box 400 en 1'),
    ('VAR-046', 'Funda TPU para celular'),
    ('VAR-047', 'Funda TPU MagSafe para celular'),
    ('VAR-048', 'Lápiz 3D (3D Pen 2)'),
    ('VAR-049', 'Kit para grabar videos (Video Making Kit)'),
    ('VAR-050', 'Estabilizador de tensión TRV Powersafe'),
    ('VAR-051', 'Estabilizador de tensión TRV Micro Volt'),
    ('VAR-052', 'Soporte para auto Grip'),
    ('VAR-053', 'Soporte magnético para auto con ventosa Lambotech'),
    ('VAR-054', 'Soporte para auto Vent'),
    ('VAR-055', 'Vidrio templado de colocación automática (caja azul)'),
    ('VAR-056', 'Vidrio templado para celular'),
    ('VAR-057', 'Protector de cámaras para iPhone'),
    ('VAR-058', 'Soporte para celular Karsen'),
    ('VAR-059', 'Soporte móvil para TV de 14" a 55"')
)
update public.storefront_products as product
set name = reviewed.name,
    name_status = 'manually_reviewed',
    name_reviewed_at = now(),
    updated_at = now()
from reviewed
where product.sku = reviewed.sku
  and product.name_status = 'pending_review';

-- ---------------------------------------------------------------------------
-- 5. Familias mal ubicadas
-- ---------------------------------------------------------------------------

with moved(sku, family) as (
  values
    ('ADA-005', 'compu-y-gaming'),
    ('CAB-030', 'compu-y-gaming'),
    ('TEC-001', 'audio'),
    ('TEC-002', 'audio'),
    ('TEC-003', 'audio'),
    ('VAR-038', 'compu-y-gaming')
)
update public.storefront_products as product
set family_override = moved.family,
    updated_at = now()
from moved
where product.sku = moved.sku
  and product.family_override is distinct from moved.family;

-- ---------------------------------------------------------------------------
-- 6. Aplicar los textos a lo ya publicado
-- ---------------------------------------------------------------------------

update public.storefront_products as product
set short_description = curated.description,
    description = curated.description,
    seo_description = curated.description,
    description_status = 'generated',
    description_generated_at = now(),
    updated_at = now()
from private.storefront_curated_descriptions as curated
where curated.sku = product.sku
  and product.description_status <> 'manually_reviewed';

-- Productos sin texto propio: vuelven a la descripción que corresponde a su
-- nombre revisado (la sincronización la había reemplazado por la genérica).
update public.storefront_products as product
set short_description = generated.description,
    description = generated.description,
    seo_description = generated.description,
    description_status = 'generated',
    description_generated_at = now(),
    updated_at = now()
from (
  select candidate.id,
         private.storefront_generated_description(candidate.name, candidate.category_name) as description
  from public.storefront_products as candidate
  where candidate.description_status <> 'manually_reviewed'
    and not exists (
      select 1
      from private.storefront_curated_descriptions as curated
      where curated.sku = candidate.sku
    )
) as generated
where generated.id = product.id
  and private.storefront_description_is_valid(generated.description)
  and product.description is distinct from generated.description;

-- ---------------------------------------------------------------------------
-- 7. Comprobaciones: si algo no cierra, no se aplica nada
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing integer;
  v_sku text;
  v_expected text;
  v_actual text;
begin
  select count(*)
    into v_missing
  from private.storefront_curated_descriptions as curated
  join public.storefront_products as product on product.sku = curated.sku
  where product.description_status <> 'manually_reviewed'
    and product.description is distinct from curated.description;

  if v_missing <> 0 then
    raise exception 'Quedaron % productos sin su descripción propia', v_missing;
  end if;

  -- Simula lo que hace la sincronización: escribir el texto genérico del rubro.
  select curated.sku, curated.description
    into v_sku, v_expected
  from private.storefront_curated_descriptions as curated
  join public.storefront_products as product on product.sku = curated.sku
  where product.description_status <> 'manually_reviewed'
  order by curated.sku
  limit 1;

  if v_sku is not null then
    update public.storefront_products as product
    set short_description = private.storefront_generated_description(product.source_name, product.category_name),
        description = private.storefront_generated_description(product.source_name, product.category_name),
        description_status = 'generated',
        description_generated_at = now()
    where product.sku = v_sku;

    select product.description
      into v_actual
    from public.storefront_products as product
    where product.sku = v_sku;

    if v_actual is distinct from v_expected then
      raise exception 'La sincronización simulada pisó la descripción de %', v_sku;
    end if;
  end if;
end;
$$;

commit;
