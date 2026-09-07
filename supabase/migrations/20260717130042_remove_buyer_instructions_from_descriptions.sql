-- Remove buyer-facing instructions from generated product descriptions.
-- Human-edited copy is protected: only the previous automatic batch is
-- selected when its three public copies still match the old generator exactly
-- and its generated/reviewed timestamps prove that it came from that batch.

create temporary table automatic_description_targets on commit drop as
select d.id
from public.storefront_products d
where d.description_status = 'manually_reviewed'
  and d.description_generated_at is not null
  and d.description_reviewed_at = d.description_generated_at
  and d.short_description = private.storefront_generated_description(d.name, d.category_name)
  and d.description = private.storefront_generated_description(d.name, d.category_name)
  and d.seo_description = private.storefront_generated_description(d.name, d.category_name);

create table if not exists private.storefront_description_backups (
  id bigint generated always as identity primary key,
  migration_key text not null,
  storefront_product_id uuid not null,
  sku text not null,
  old_short_description text not null,
  old_description text not null,
  old_seo_description text not null,
  old_description_status text not null,
  old_description_generated_at timestamptz,
  old_description_reviewed_at timestamptz,
  backed_up_at timestamptz not null default now(),
  unique (migration_key, storefront_product_id)
);

alter table private.storefront_description_backups enable row level security;
revoke all on table private.storefront_description_backups from public, anon, authenticated;
revoke all on sequence private.storefront_description_backups_id_seq from public, anon, authenticated;

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
  '20260717_remove_buyer_instructions_v1',
  d.id,
  d.sku,
  d.short_description,
  d.description,
  d.seo_description,
  d.description_status,
  d.description_generated_at,
  d.description_reviewed_at
from public.storefront_products d
join automatic_description_targets t on t.id = d.id
on conflict (migration_key, storefront_product_id) do nothing;

create or replace function private.storefront_description_has_buyer_instruction(sentence_text text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(sentence_text, '')) ~
    E'\\m(verific[aá]|revis[aá]|confirm[aá]|asegurate|consultanos|consult[aá]|comprob[aá]|compar[aá]|corrobor[aá]|cheque[aá]|control[aá]|le[eé]|envi[aá]|mandanos|record[aá])\\M|antes de (comprar|completar la compra)|compatibilidad sujeta a|es necesario verificar|ten[eé] en cuenta|whatsapp';
$$;

create or replace function private.storefront_sanitize_generated_description(description_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  with sentence_parts as (
    select ordinality as sentence_order,
           btrim(part) as sentence
    from regexp_split_to_table(
      btrim(coalesce(description_text, '')),
      E'[.!?]+[[:space:]]+'
    ) with ordinality as split(part, ordinality)
  ), accepted_sentences as (
    select sentence_order,
           case
             when sentence ~ '[.!?]$' then sentence
             else sentence || '.'
           end as sentence
    from sentence_parts
    where sentence <> ''
      and not private.storefront_description_has_buyer_instruction(sentence)
  )
  select coalesce(string_agg(sentence, ' ' order by sentence_order), '')
  from accepted_sentences;
$$;

create or replace function private.storefront_generated_description_core(product_name text, category_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := lower(btrim(coalesce(product_name, '')));
  v_category text := lower(btrim(coalesce(category_name, '')));
begin
  -- Model-specific descriptions backed by official manufacturer information.
  if v_name = lower('Samsung Galaxy Buds2 Pro') then
    return 'Auriculares inalámbricos con Bluetooth 5.3, cancelación activa de ruido, sonido ambiente y audio de dos vías. Sus controles táctiles facilitan la reproducción de música y la gestión de llamadas.';
  elsif v_name = lower('Apple AirPods Pro') then
    return 'Auriculares inalámbricos Apple pensados para escuchar música y realizar llamadas dentro del ecosistema de la marca. Su formato compacto y sin cables resulta práctico para el uso cotidiano.';
  elsif v_name = lower('Auricular inalámbrico Foxbox Boost Force 2') then
    return 'Auriculares inalámbricos con Bluetooth 5.4, manos libres y entrada auxiliar de 3,5 mm. Ofrecen hasta 20 horas de reproducción y permiten alternar entre conexión inalámbrica y cableada.';
  elsif v_name = lower('Cargador Samsung USB-C PD de 25 W') then
    return 'Cargador de pared USB-C con Power Delivery 3.0 y PPS, capaz de entregar hasta 25 W. Brinda carga rápida a celulares Samsung y otros dispositivos que admiten esos protocolos.';
  elsif v_name = lower('Mouse óptico Genius DX-110') then
    return 'Mouse óptico cableado con conexión USB, resolución de 1200 DPI y tres botones con rueda de desplazamiento. Su diseño ambidiestro resulta cómodo para tareas cotidianas en Windows y macOS.';
  elsif v_name = lower('Mouse inalámbrico Genius NX-7009') then
    return 'Mouse inalámbrico de 2,4 GHz con receptor USB-A, sensor óptico de 1200 DPI y tres botones. Su diseño ambidiestro ofrece un manejo cómodo en Windows, macOS y Linux.';
  elsif v_name = lower('Teclado Genius KB-117') then
    return 'Teclado cableado de tamaño completo con conexión USB, teclas multimedia y diseño resistente a salpicaduras. Sus teclas de perfil bajo ofrecen una escritura cómoda para trabajo y estudio.';
  elsif v_name = lower('Teclado Genius KB-113') then
    return 'Teclado cableado de tamaño completo con tecla dedicada para acceder a Copilot en Windows 11. Una opción práctica para escritura, trabajo y navegación cotidiana.';
  elsif v_name = lower('Reloj Foxbox Neutron 4.0') then
    return 'Reloj inteligente con pantalla AMOLED de 1,96 pulgadas, llamadas por Bluetooth 5.3 y seguimiento de actividad. Incorpora batería de 300 mAh, carga inalámbrica y sincronización mediante aplicación móvil.';
  elsif v_name = lower('Reloj Foxbox Neutron 3.0') then
    return 'Reloj inteligente con pantalla AMOLED de 2,04 pulgadas, llamadas por Bluetooth y funciones de seguimiento de actividad. Incorpora batería de 250 mAh y carga inalámbrica para el uso cotidiano.';
  elsif v_name = lower('Reloj Foxbox Axia') then
    return 'Reloj inteligente con pantalla AMOLED de 1,78 pulgadas, llamadas por Bluetooth y seguimiento de actividad. Utiliza la aplicación FitCloudPro e incorpora batería de 230 mAh con carga inalámbrica.';
  elsif v_name = lower('Reloj Foxbox Essence') then
    return 'Reloj inteligente con pantalla AMOLED de 1,43 pulgadas, GPS integrado, llamadas Bluetooth y más de 100 modos deportivos. Incluye batería de 450 mAh y sincronización mediante Smart-Time Pro.';
  elsif v_name = lower('Adaptador Bluetooth 5.4 TP-Link') then
    return 'Adaptador USB que agrega conectividad Bluetooth 5.4 a una computadora. Permite vincular auriculares, parlantes, teclados, mouse y otros dispositivos inalámbricos de forma práctica.';

  -- Adapters and signal converters.
  elsif v_name like '%adaptador universal viajero%' then
    return 'Adaptador de viaje para utilizar cargadores con distintos formatos de enchufe. Sus puertos USB y USB-C permiten recargar varios dispositivos durante viajes y traslados.';
  elsif v_name like '%receptor bluetooth%' then
    return 'Receptor inalámbrico que agrega conectividad Bluetooth a equipos de audio. Permite reproducir música desde celulares, tablets o computadoras de forma práctica y sin cables.';
  elsif v_name like '%smart car%' then
    return 'Adaptador Bluetooth para reproducir música desde el celular en el sistema de audio del auto. Una solución sencilla para sumar conexión inalámbrica durante los viajes.';
  elsif v_name like '%adaptador auxiliar a usb-c%' then
    return 'Adaptador de audio que permite conectar auriculares o cables auxiliares de 3,5 mm a dispositivos con puerto USB-C. Su formato compacto facilita el uso cotidiano.';
  elsif v_name like '%adaptador de iphone a auxiliar%' then
    return 'Adaptador de audio para conectar auriculares o cables auxiliares de 3,5 mm a modelos de iPhone con el conector correspondiente. Una solución compacta para música y llamadas.';
  elsif v_name like '%wi-fi usb de 300 mbps%' then
    return 'Adaptador USB que permite agregar conexión Wi-Fi de hasta 300 Mbps a una computadora. Una solución práctica para conectarse a redes inalámbricas sin utilizar cable de red.';
  elsif v_name like '%vga a hdmi%' then
    return 'Conversor de señal que permite conectar una fuente VGA a una pantalla con entrada HDMI. Resulta útil para combinar computadoras y monitores de distintas generaciones.';
  elsif v_name like '%hdmi a vga%' then
    return 'Conversor de señal que permite conectar una fuente HDMI a una pantalla con entrada VGA. Resulta útil para combinar computadoras y monitores de distintas generaciones.';
  elsif v_name like '%hdmi hembra a hdmi hembra%' then
    return 'Adaptador hembra a hembra para unir dos cables HDMI y extender una conexión de imagen y sonido. Su formato compacto simplifica instalaciones en televisores, monitores y proyectores.';
  elsif v_name like '%micro-usb a usb-c%' then
    return 'Adaptador compacto que permite utilizar un cable Micro-USB con dispositivos que incorporan puerto USB-C. Una solución práctica para aprovechar cables y cargadores existentes.';
  elsif v_name like '%av a hdmi%' then
    return 'Conversor que transforma una señal analógica de audio y video AV en una salida HDMI. Permite conectar equipos tradicionales a televisores y monitores con entrada digital.';
  elsif v_name like '%hdmi a av%' then
    return 'Conversor que transforma una señal HDMI en audio y video analógico AV. Permite conectar dispositivos modernos a televisores y equipos que utilizan entradas RCA.';
  elsif v_name like '%adaptador multipuerto%' then
    return 'Adaptador diseñado para ampliar las conexiones de una computadora, tablet o celular mediante varios puertos. Facilita el uso simultáneo de periféricos, pantallas y unidades externas.';

  -- Cables.
  elsif v_name like '%cable auxiliar a 2 av%' or v_name like '%cable auxiliar a rca%' then
    return 'Cable de audio analógico para conectar una salida auxiliar de 3,5 mm con entradas RCA o AV. Resulta práctico para reproducir sonido en parlantes, equipos y televisores.';
  elsif v_name like '%cable extensor auxiliar%' then
    return 'Extensión de audio analógico que aumenta el alcance de un cable auxiliar de 3,5 mm. Ideal para utilizar auriculares, parlantes y equipos de sonido con mayor comodidad.';
  elsif v_name like '%cable auxiliar%' then
    return 'Cable de audio analógico para conectar celulares, computadoras, parlantes y sistemas de sonido mediante fichas auxiliares de 3,5 mm. Una solución sencilla para reproducir música.';
  elsif v_name like '%cable mini hdmi a hdmi%' then
    return 'Cable para conectar cámaras y otros dispositivos con salida Mini HDMI a pantallas, televisores o capturadoras con entrada HDMI. Transmite imagen y sonido en formato digital.';
  elsif v_name like '%cable hdmi%' then
    return 'Cable digital para transmitir imagen y sonido entre computadoras, consolas, televisores, monitores y proyectores con conexión HDMI. Ofrece una conexión práctica para entretenimiento y trabajo.';
  elsif v_name like '%cable ethernet%' or v_name like '%cable de red%' then
    return 'Cable de red para conectar computadoras, routers, consolas y televisores mediante puerto Ethernet. Brinda una conexión estable para navegación, streaming, juegos y transferencia de datos.';
  elsif v_name like '%cable óptico%' then
    return 'Cable óptico para transmitir audio digital entre televisores, barras de sonido, consolas y equipos de audio. Su señal por fibra evita interferencias eléctricas durante la reproducción.';
  elsif v_name like '%interlock%' then
    return 'Cable de alimentación para televisores, notebooks, monitores y otros equipos que utilizan ficha interlock. Funciona como repuesto práctico para suministrar energía desde un tomacorriente.';
  elsif v_name like '%cable para batería de auto%' then
    return 'Cable para realizar conexiones eléctricas con baterías de vehículos y equipos de energía. Su diseño permite transportar corriente entre terminales durante tareas de asistencia y mantenimiento.';
  elsif v_name like '%cable ps3%' then
    return 'Cable destinado a conectar o alimentar accesorios de PlayStation 3 según su tipo de terminal. Resulta útil como repuesto para el uso cotidiano de la consola.';
  elsif v_name like '%iphone%' and v_name like '%cable%' then
    return 'Cable para cargar y sincronizar modelos de iPhone con el conector indicado. Permite conectar el teléfono a cargadores, baterías externas y computadoras de forma sencilla.';
  elsif v_name like '%cable%' and (v_name like '%usb%' or v_name like '%micro-usb%') then
    return 'Cable para cargar dispositivos y transferir datos cuando el equipo admite esa función. Resulta práctico para celulares, tablets, notebooks y accesorios de uso cotidiano.';
  elsif v_name like '%cable%' then
    return 'Cable diseñado para conectar dispositivos mediante los terminales indicados en el nombre. Funciona como repuesto o extensión para resolver conexiones cotidianas de forma sencilla.';

  -- Chargers, power supplies and portable energy.
  elsif v_name like '%cargador universal para notebook%' then
    return 'Cargador universal para alimentar notebooks mediante distintas fichas de conexión. Su formato versátil permite utilizar una misma fuente con varios modelos que comparten sus requisitos eléctricos.';
  elsif v_name like '%fuente jahro de%' then
    return 'Fuente de alimentación para equipos que utilizan la tensión y corriente indicadas en el nombre. Convierte la energía del tomacorriente en una salida estable para dispositivos electrónicos.';
  elsif v_name like '%cargador%para pilas%' then
    return 'Cargador USB para recuperar la energía de pilas recargables. Permite reutilizarlas en controles, juguetes, cámaras y otros dispositivos, reduciendo el consumo de pilas descartables.';
  elsif v_name like '%cargador usb-c apple%20 w%' then
    return 'Cargador de pared USB-C de 20 W para dispositivos Apple que admiten esa potencia. Brinda una carga práctica y compacta para celulares, tablets y otros accesorios.';
  elsif v_name like '%magsafe%' and v_name like '%cargador%' then
    return 'Cargador inalámbrico magnético para iPhone y accesorios con tecnología MagSafe. Su alineación magnética mantiene el dispositivo en posición y facilita la carga cotidiana sin conectar el cable al teléfono.';
  elsif v_name like '%cargador motorola de 68 w%' then
    return 'Cargador de pared Motorola de hasta 68 W con cable USB-C. Ofrece carga rápida para teléfonos y dispositivos que admiten esa potencia y el protocolo correspondiente.';
  elsif v_name like '%cargador para auto%' then
    return 'Cargador para la toma de 12 V del vehículo con salida USB-C. Permite recuperar batería en celulares y otros dispositivos durante viajes, traslados y jornadas de trabajo.';
  elsif v_name like '%power bank%' and v_name like '%10.000 mah%' then
    return 'Batería externa de 10.000 mAh para recargar celulares y otros dispositivos lejos de un enchufe. Su formato portátil resulta útil para viajes, trabajo y uso diario.';
  elsif v_name like '%batería externa%' or v_name like '%power bank%' then
    return 'Batería externa portátil para recargar celulares y otros dispositivos cuando no hay un enchufe cerca. Resulta práctica para viajes, emergencias y jornadas prolongadas fuera de casa.';
  elsif v_name like '%fuente % de 15 w%' then
    return 'Fuente compacta de 15 W para recargar celulares, accesorios y otros dispositivos mediante los puertos indicados. Su tamaño facilita el uso diario y el traslado.';
  elsif v_name like '%cargador%' or v_category = 'cargadores' then
    return 'Cargador diseñado para suministrar energía y recuperar la batería de dispositivos electrónicos. Su formato compacto resulta práctico para el hogar, la oficina y los viajes.';

  -- Kitchen, home and lighting.
  elsif v_name like '%freidora de aire%15 l%' then
    return 'Freidora de aire de 15 litros para cocinar, dorar y recalentar alimentos mediante circulación de aire caliente. Su capacidad amplia resulta práctica para preparar varias porciones.';
  elsif v_name like '%freidora de aire%' then
    return 'Freidora de aire para cocinar, dorar y recalentar alimentos mediante circulación de aire caliente. Ofrece una forma práctica de preparar comidas cotidianas con poco aceite.';
  elsif v_name like '%luces de navidad%' then
    return 'Guirnalda de alambre con luces LED para decorar árboles, ventanas, muebles y distintos espacios interiores. Su formato flexible facilita crear diseños luminosos para celebraciones y ambientación.';
  elsif v_name like '%luz de emergencia%' then
    return 'Luz de emergencia con 30 LED para iluminar durante cortes eléctricos y situaciones imprevistas. Su formato portátil brinda una fuente de luz práctica para el hogar.';
  elsif v_name like '%tira led%' then
    return 'Tira LED alimentada por USB para agregar iluminación decorativa en escritorios, muebles, televisores y habitaciones. Su formato flexible permite ambientar distintos espacios de manera sencilla.';
  elsif v_name like '%tira de neón%' then
    return 'Tira de luz tipo neón para crear iluminación decorativa continua en habitaciones, muebles y exhibidores. Su formato flexible permite formar líneas y diseños luminosos.';
  elsif v_name like '%linterna vincha%' or v_name like '%linterna minera%' then
    return 'Linterna con sujeción para la cabeza que permite iluminar manteniendo las manos libres. Resulta práctica para reparaciones, actividades nocturnas, campamento y trabajos con poca luz.';

  -- Audio and storage.
  elsif v_name like '%parlante para pc%' or v_name like '%parlante mini para pc%' then
    return 'Parlante para reproducir música, videos y llamadas desde computadoras y notebooks. Su formato compacto resulta práctico para escritorios, espacios de estudio y trabajo cotidiano.';
  elsif v_name like '%parlante%ducha%' then
    return 'Parlante inalámbrico pensado para reproducir música en el baño y otros espacios húmedos. Su formato portátil permite disfrutar audio sin utilizar cables durante la rutina diaria.';
  elsif v_name like '%parlante%' or v_category = 'parlantes' then
    return 'Parlante para reproducir música y otros contenidos desde celulares, tablets y computadoras. Los modelos Bluetooth ofrecen conexión inalámbrica y un uso práctico en distintos espacios.';
  elsif v_name like '%pendrive%' or v_category = 'pendrives' then
    return 'Memoria USB portátil para guardar, transportar y compartir documentos, fotos, videos y otros archivos. Su tamaño compacto facilita llevar información entre computadoras y dispositivos.';

  -- Batteries.
  elsif v_name like '%pilas recargables%' then
    return 'Pilas recargables para alimentar controles, juguetes, cámaras y otros dispositivos del tamaño indicado. Pueden reutilizarse con un cargador adecuado y reducen el consumo de pilas descartables.';
  elsif v_name like '%az13%' or v_name like '%az312%' then
    return 'Pila para audífonos y otros dispositivos que utilizan el código indicado. Su formato compacto suministra energía estable para equipos de uso diario y tamaño reducido.';
  elsif v_name like '%cr2016%' or v_name like '%cr2025%' or v_name like '%cr2032%' or v_name like '%lr44%' then
    return 'Pila tipo botón para relojes, controles, calculadoras y pequeños dispositivos electrónicos que utilizan el código indicado. Su tamaño compacto permite alimentar equipos de bajo consumo.';
  elsif v_name like '%batería%9 v%' then
    return 'Batería de 9 V para detectores, instrumentos, juguetes y dispositivos que utilizan ese formato. Brinda una fuente de energía portátil para equipos de uso doméstico y profesional.';
  elsif v_name like '%pila%' or v_name like '%batería%' or v_category = 'pilas y baterías' then
    return 'Pila para alimentar controles, juguetes, relojes y otros dispositivos que utilizan el formato indicado. Brinda energía portátil para equipos de uso cotidiano en el hogar y el trabajo.';

  -- Computer peripherals and gaming.
  elsif v_name like '%micrófono dinámico%' then
    return 'Micrófono dinámico para captar voz en presentaciones, karaoke, ensayos y actividades de audio. Su diseño resulta práctico para uso recreativo, eventos y comunicación.';
  elsif v_name like '%micrófono%' then
    return 'Micrófono para captar voz en grabaciones, presentaciones, karaoke y actividades de comunicación. Resulta práctico para crear contenido, realizar reuniones y disfrutar momentos recreativos.';
  elsif v_name like '%mouse%noga stormer wind%3500 dpi%' then
    return 'Mouse para computadora con sensor de hasta 3500 DPI, pensado para movimientos precisos en tareas cotidianas y juegos. Su diseño facilita un control ágil del cursor.';
  elsif v_name like '%mouse óptico%' then
    return 'Mouse óptico para controlar el cursor con precisión en computadoras y notebooks. Su diseño sencillo resulta práctico para trabajo, estudio, navegación y tareas cotidianas.';
  elsif v_name like '%mouse inalámbrico%' then
    return 'Mouse inalámbrico cómodo y preciso para el uso diario en computadoras y notebooks. Su conexión sin cable brinda mayor libertad de movimiento en el escritorio.';
  elsif v_name like '%mousepad%' then
    return 'Superficie para mouse que favorece un desplazamiento uniforme y ayuda a proteger el escritorio. Su tamaño compacto resulta práctico para estudio, trabajo y juegos.';
  elsif v_name like '%teclado inalámbrico bluetooth%' then
    return 'Teclado inalámbrico para escribir y controlar computadoras, tablets y celulares mediante Bluetooth. Su conexión sin cables ayuda a mantener el espacio de trabajo ordenado.';
  elsif v_name like '%teclado retroiluminado%' then
    return 'Teclado con iluminación para facilitar la escritura y el juego en ambientes con poca luz. Su diseño combina funciones cotidianas con una estética moderna.';
  elsif v_name like '%teclado%' then
    return 'Teclado para escritura, estudio, trabajo y navegación en computadoras. Su distribución completa permite realizar tareas cotidianas con comodidad y mantener un flujo de uso sencillo.';
  elsif v_name like '%joystick para ps3%' then
    return 'Control para jugar y navegar por los menús de consolas PlayStation 3. Su diseño con botones y sticks permite manejar distintos tipos de juegos con comodidad.';
  elsif v_name like '%joystick para ps4%' then
    return 'Control para jugar y navegar por los menús de consolas PlayStation 4. Su diseño con botones y sticks permite manejar distintos tipos de juegos con comodidad.';

  -- Other identifiable products.
  elsif v_name like '%adhesivo%' then
    return 'Adhesivo para unir materiales y realizar pequeñas reparaciones domésticas según el tipo de producto. Su presentación compacta resulta práctica para tener a mano en el hogar o taller.';
  elsif v_name like '%hub usb 3.0%' then
    return 'Hub USB 3.0 para ampliar la cantidad de puertos de una computadora. Permite conectar varios periféricos, memorias y accesorios desde una sola entrada USB.';
  elsif v_name like '%prolongador%' or v_name like '%zapatilla múltiple%' then
    return 'Extensión eléctrica para conectar varios equipos desde una sola toma. Resulta práctica en hogares, oficinas y espacios de trabajo donde se necesitan más puntos de alimentación.';
  elsif v_name like '%radio retro bluetooth%' then
    return 'Radio de diseño retro con conexión Bluetooth para reproducir música desde celulares y otros dispositivos. Combina una estética clásica con funciones de audio para el uso cotidiano.';
  elsif v_name like '%soporte%móvil%tv%' then
    return 'Soporte móvil para instalar un televisor y ajustar su posición según el espacio. Permite orientar la pantalla y facilita organizar ambientes de entretenimiento o trabajo.';
  elsif v_name like '%soporte fijo%tv%' then
    return 'Soporte fijo para instalar un televisor cerca de la pared. Ayuda a aprovechar el espacio, ordenar el ambiente y mantener la pantalla en una posición estable.';
  elsif v_name like '%tv stick%' then
    return 'Dispositivo de streaming que transforma un televisor con entrada HDMI en un centro multimedia conectado. Permite reproducir películas, series, música y aplicaciones mediante internet.';
  elsif v_name like '%onn full hd%' then
    return 'Dispositivo de streaming ONN para reproducir películas, series, música y aplicaciones en resolución Full HD. Se conecta al televisor mediante HDMI y utiliza internet para acceder al contenido.';
  elsif v_name like '%onn 4k%' then
    return 'Dispositivo de streaming ONN para reproducir películas, series, música y aplicaciones en resolución hasta 4K. Se conecta al televisor mediante HDMI y utiliza internet para acceder al contenido.';
  elsif v_name like '%ventilador%' then
    return 'Ventilador diseñado para mover el aire y mejorar la sensación térmica en espacios de uso cotidiano. Su formato resulta práctico para el hogar, la oficina y los viajes.';
  elsif v_name like '%minisellador de bolsas%' then
    return 'Sellador compacto para cerrar bolsas plásticas y ayudar a conservar alimentos u objetos pequeños. Resulta práctico para organizar la cocina y reducir desperdicios.';
  elsif v_name like '%control remoto para tv%' then
    return 'Control remoto de reemplazo para manejar funciones de televisores. Permite cambiar canales, ajustar volumen y acceder a menús desde la comodidad del sillón.';
  elsif v_name like '%minipimer%' then
    return 'Batidora de mano de 300 W para mezclar, triturar y preparar salsas, sopas o licuados. Su formato permite trabajar directamente dentro de distintos recipientes.';
  elsif v_name like '%set de 3 pinzas%' then
    return 'Juego de tres pinzas para sujetar, manipular y retirar piezas pequeñas. Resulta práctico en tareas domésticas, manualidades, electrónica y trabajos que requieren precisión.';
  elsif v_name = 'placa' then
    return 'Placa electrónica utilizada como repuesto en tareas de reparación y mantenimiento. Permite reemplazar un componente dañado y recuperar el funcionamiento del equipo correspondiente.';
  elsif v_name like '%pava eléctrica%' then
    return 'Pava eléctrica para calentar agua de forma rápida y práctica. Resulta útil para preparar mate, té, café y otras bebidas calientes durante la rutina diaria.';
  elsif v_name like '%caloventor%' then
    return 'Caloventor de 2000 W para calefaccionar ambientes pequeños mediante circulación de aire caliente. Su formato portátil facilita trasladarlo entre distintos espacios del hogar.';
  elsif v_name like '%estufa infrarroja%' then
    return 'Estufa infrarroja para brindar calor directo en ambientes interiores. Su funcionamiento genera una sensación térmica rápida y resulta práctico como apoyo de calefacción.';
  elsif v_name like '%funda para iphone%' then
    return 'Funda para proteger un iPhone frente a roces, marcas y pequeños golpes del uso cotidiano. Su diseño ayuda a conservar el teléfono y personalizar su apariencia.';
  elsif v_name like '%camiseta de argentina%' then
    return 'Camiseta con diseño de Argentina para uso casual, eventos deportivos y regalos. Una prenda pensada para acompañar partidos y mostrar los colores de la selección.';
  elsif v_name like '%soporte%para auto%' then
    return 'Soporte para mantener el celular visible y sujeto dentro del auto. Facilita el uso de navegación y ayuda a organizar el dispositivo durante viajes y traslados.';
  elsif v_name like '%secador de pelo plegable%' then
    return 'Secador de pelo plegable para agilizar el secado y facilitar el traslado. Su formato compacto resulta práctico para viajes, guardado diario y espacios reducidos.';
  elsif v_name like '%secador de pelo%' then
    return 'Secador de pelo para lograr un secado rápido y uniforme durante la rutina diaria. Su formato manual permite dirigir el flujo de aire y facilita el peinado.';
  elsif v_name like '%abridor de cerveza%' then
    return 'Abridor manual para destapar botellas con tapa metálica de forma simple. Su tamaño compacto resulta práctico para la cocina, reuniones, salidas y regalos.';
  elsif v_name like '%grips para joystick%' then
    return 'Cubiertas para los sticks de controles PS4, PS5 y Xbox. Ayudan a mejorar el agarre, proteger la superficie y brindar mayor comodidad durante el juego.';
  elsif v_name like '%auricular bluetooth%' or v_name like '%auricular inalámbrico%' then
    return 'Auriculares inalámbricos para escuchar música y atender llamadas con comodidad. Su diseño sin cables ofrece libertad de movimiento y resulta práctico para el uso cotidiano.';
  elsif v_name like '%auricular gamer%' then
    return 'Auricular para disfrutar juegos, comunicación por voz y contenido multimedia. Su formato envolvente ayuda a concentrarse en el sonido durante partidas, videollamadas y entretenimiento.';
  elsif v_name like '%auricular%' or v_category = 'auriculares' then
    return 'Auricular para escuchar música, videos y llamadas con comodidad. Su formato resulta práctico para el uso cotidiano en celulares, computadoras, tablets y otros dispositivos.';
  elsif v_name like '%mouse%' then
    return 'Mouse para controlar el cursor en computadoras y notebooks. Su diseño resulta práctico para trabajo, estudio, navegación y juegos de uso cotidiano.';
  end if;

  if v_category = 'adaptadores' then
    return 'Adaptador diseñado para unir dispositivos con conexiones diferentes o ampliar una conexión existente. Su formato compacto permite resolver necesidades cotidianas de forma práctica.';
  elsif v_category = 'cables' then
    return 'Cable diseñado para conectar dispositivos mediante los terminales indicados en el nombre. Funciona como repuesto o extensión para resolver conexiones cotidianas de forma sencilla.';
  elsif v_category = 'iluminación' then
    return 'Accesorio de iluminación pensado para aportar luz funcional o decorativa. Su diseño permite ambientar espacios y resolver necesidades cotidianas dentro del hogar o trabajo.';
  elsif v_category = 'teclados y mouse' then
    return 'Periférico diseñado para acompañar el uso cotidiano de computadoras y otros dispositivos. Facilita tareas de trabajo, estudio, navegación y entretenimiento.';
  end if;

  return 'Artículo de uso cotidiano diseñado para brindar una solución práctica y sencilla. Su formato funcional facilita incorporarlo a tareas del hogar, trabajo o entretenimiento.';
end;
$$;

create or replace function private.storefront_generated_description(product_name text, category_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.storefront_sanitize_generated_description(
    private.storefront_generated_description_core(product_name, category_name)
  );
$$;

revoke all on function private.storefront_description_has_buyer_instruction(text) from public, anon, authenticated;
revoke all on function private.storefront_sanitize_generated_description(text) from public, anon, authenticated;
revoke all on function private.storefront_generated_description_core(text, text) from public, anon, authenticated;
revoke all on function private.storefront_generated_description(text, text) from public, anon, authenticated;

alter table public.storefront_products
  drop constraint if exists storefront_products_description_word_count_check,
  drop constraint if exists storefront_products_description_language_check;

update public.storefront_products d
set short_description = private.storefront_generated_description(d.name, d.category_name),
    description = private.storefront_generated_description(d.name, d.category_name),
    seo_description = private.storefront_generated_description(d.name, d.category_name),
    description_status = 'generated',
    description_generated_at = now(),
    description_reviewed_at = null,
    updated_at = now()
from automatic_description_targets t
where t.id = d.id;

alter table public.storefront_products
  add constraint storefront_products_description_word_count_check check (
    description_status <> 'generated'
    or (
      cardinality(regexp_split_to_array(btrim(short_description), E'\\s+')) between 15 and 45
      and cardinality(regexp_split_to_array(btrim(description), E'\\s+')) between 15 and 45
      and cardinality(regexp_split_to_array(btrim(seo_description), E'\\s+')) between 15 and 45
      and cardinality(regexp_split_to_array(btrim(short_description), E'[.!?]+[[:space:]]+')) between 1 and 2
      and cardinality(regexp_split_to_array(btrim(description), E'[.!?]+[[:space:]]+')) between 1 and 2
      and cardinality(regexp_split_to_array(btrim(seo_description), E'[.!?]+[[:space:]]+')) between 1 and 2
    )
  ),
  add constraint storefront_products_description_language_check check (
    description_status <> 'generated'
    or (
      lower(short_description) !~ E'base de datos|cat[aá]logo|categor[ií]a|chetech|producto agregado|incorporad[oa]|forma parte|pertenece a|\\m(verific[aá]|revis[aá]|confirm[aá]|asegurate|consultanos|consult[aá]|comprob[aá]|compar[aá]|corrobor[aá]|cheque[aá]|control[aá]|le[eé]|envi[aá]|mandanos|record[aá]|compatibilidad)\\M|antes de (comprar|completar la compra)|ten[eé] en cuenta|es necesario verificar|whatsapp'
      and lower(description) !~ E'base de datos|cat[aá]logo|categor[ií]a|chetech|producto agregado|incorporad[oa]|forma parte|pertenece a|\\m(verific[aá]|revis[aá]|confirm[aá]|asegurate|consultanos|consult[aá]|comprob[aá]|compar[aá]|corrobor[aá]|cheque[aá]|control[aá]|le[eé]|envi[aá]|mandanos|record[aá]|compatibilidad)\\M|antes de (comprar|completar la compra)|ten[eé] en cuenta|es necesario verificar|whatsapp'
      and lower(seo_description) !~ E'base de datos|cat[aá]logo|categor[ií]a|chetech|producto agregado|incorporad[oa]|forma parte|pertenece a|\\m(verific[aá]|revis[aá]|confirm[aá]|asegurate|consultanos|consult[aá]|comprob[aá]|compar[aá]|corrobor[aá]|cheque[aá]|control[aá]|le[eé]|envi[aá]|mandanos|record[aá]|compatibilidad)\\M|antes de (comprar|completar la compra)|ten[eé] en cuenta|es necesario verificar|whatsapp'
    )
  );

do $$
declare
  v_invalid_count integer;
begin
  select count(*)
    into v_invalid_count
  from public.storefront_products
  where description_status = 'generated'
    and (
      cardinality(regexp_split_to_array(btrim(short_description), E'\\s+')) not between 15 and 45
      or cardinality(regexp_split_to_array(btrim(short_description), E'[.!?]+[[:space:]]+')) not between 1 and 2
      or private.storefront_description_has_buyer_instruction(short_description)
      or lower(short_description) ~ 'base de datos|cat[aá]logo|categor[ií]a|chetech|producto agregado|incorporad[oa]|forma parte|pertenece a|whatsapp'
    );

  if v_invalid_count <> 0 then
    raise exception 'Generated description validation failed for % products', v_invalid_count;
  end if;
end;
$$;
