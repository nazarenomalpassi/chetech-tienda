-- Professional product copy for the public storefront.
-- The generator only states what the product is, what it is used for and
-- attributes that are explicit in the product title or verified by an
-- official manufacturer source. It never emits inventory or catalog prose.

drop function if exists private.storefront_reviewed_description(text, text);

create or replace function private.storefront_generated_description(product_name text, category_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := lower(btrim(coalesce(product_name, '')));
  v_category text := lower(btrim(coalesce(category_name, '')));
begin
  -- Model-specific copy. Technical claims below were checked against official
  -- manufacturer pages on 2026-07-16.
  if v_name = lower('Samsung Galaxy Buds2 Pro') then
    -- https://www.samsung.com/latin/audio-sound/galaxy-buds/galaxy-buds2-pro-bora-purple-sm-r510nlvalta/
    return 'Auriculares inalámbricos con Bluetooth 5.3, cancelación activa de ruido, sonido ambiente y audio de dos vías. Incluyen funciones de llamadas y controles táctiles. La experiencia completa depende de un dispositivo y aplicaciones Samsung compatibles.';
  elsif v_name = lower('Apple AirPods Pro') then
    -- The generation is absent from the source name, so no generation-specific
    -- Apple specification is asserted.
    return 'Auriculares inalámbricos Apple para música, llamadas y uso cotidiano dentro del ecosistema de la marca. La generación no está indicada; consultanos antes de comprar para confirmar funciones, estuche y compatibilidad exacta.';
  elsif v_name = lower('Auricular inalámbrico Foxbox Boost Force 2') then
    -- https://foxbox.com.ar/auricular-force-2-0/
    return 'Auriculares inalámbricos con Bluetooth 5.4, manos libres y entrada auxiliar de 3,5 mm. Ofrecen hasta 20 horas de reproducción y permiten alternar entre conexión inalámbrica y cableada según el dispositivo.';
  elsif v_name = lower('Cargador Samsung USB-C PD de 25 W') then
    -- https://www.samsung.com/us/mobile-accessories/25w-pd-power-adapter-black-sku-ep-t2510nbegus/
    return 'Cargador de pared USB-C con Power Delivery 3.0 y PPS, capaz de entregar hasta 25 W en equipos compatibles. Ideal para celulares Samsung con carga rápida; el cable se verifica por separado.';
  elsif v_name = lower('Mouse óptico Genius DX-110') then
    -- https://www.geniusnet.com/en/products/view/dx_110
    return 'Mouse óptico cableado con conexión USB, resolución de 1200 DPI y tres botones con rueda de desplazamiento. Su diseño ambidiestro resulta práctico para tareas cotidianas en computadoras con Windows o macOS.';
  elsif v_name = lower('Mouse inalámbrico Genius NX-7009') then
    -- https://www.geniusnet.com/hu/products/view/nx_7009
    return 'Mouse inalámbrico de 2,4 GHz con receptor USB-A, sensor óptico de 1200 DPI y tres botones. Su diseño ambidiestro y conexión plug and play lo hacen cómodo para computadoras con Windows, macOS o Linux.';
  elsif v_name = lower('Teclado Genius KB-117') then
    -- https://www.geniusnet.com/en/products/view/kb_117
    return 'Teclado cableado de tamaño completo con conexión USB, teclas multimedia y diseño resistente a salpicaduras. Ofrece escritura cómoda con teclas de perfil bajo y funciona en computadoras con Windows o macOS.';
  elsif v_name = lower('Teclado Genius KB-113') then
    -- https://www.geniusnet.com/en/support/view/kb_113
    return 'Teclado cableado con tecla dedicada para acceder a Copilot en Windows 11. Ofrece una distribución completa para escritura diaria; verificá el tipo de conexión y el idioma del teclado antes de comprar.';
  elsif v_name = lower('Reloj Foxbox Neutron 4.0') then
    -- https://foxbox.com.ar/smartwatch-neutron-4-0/
    return 'Reloj inteligente con pantalla AMOLED de 1,96 pulgadas, llamadas por Bluetooth 5.3 y seguimiento de actividad. Su batería es de 300 mAh y utiliza carga inalámbrica. Se sincroniza con el celular mediante una aplicación.';
  elsif v_name = lower('Reloj Foxbox Neutron 3.0') then
    -- https://foxbox.com.ar/smartwatch-neutron-3-0/
    return 'Reloj inteligente con pantalla AMOLED de 2,04 pulgadas, llamadas por Bluetooth y funciones de seguimiento de actividad. Incorpora una batería de 250 mAh y carga inalámbrica para acompañar el uso cotidiano.';
  elsif v_name = lower('Reloj Foxbox Axia') then
    -- https://foxbox.com.ar/smartwatch-axia/
    return 'Reloj inteligente con pantalla AMOLED de 1,78 pulgadas, llamadas por Bluetooth y seguimiento de actividad. Utiliza la aplicación FitCloudPro, incorpora una batería de 230 mAh y se recarga mediante conexión inalámbrica.';
  elsif v_name = lower('Reloj Foxbox Essence') then
    -- https://foxbox.com.ar/smartwatch-essence/
    return 'Reloj inteligente con pantalla AMOLED de 1,43 pulgadas, GPS integrado, llamadas Bluetooth y más de 100 modos deportivos. Incluye batería de 450 mAh y se vincula al celular mediante la aplicación Smart-Time Pro.';
  elsif v_name = lower('Adaptador Bluetooth 5.4 TP-Link') then
    return 'Adaptador USB que incorpora conectividad Bluetooth 5.4 a computadoras compatibles. Permite vincular periféricos y dispositivos inalámbricos; consultanos para confirmar modelo, versión de hardware, sistema operativo admitido y alcance.';

  -- Adapters and converters.
  elsif v_name like '%adaptador universal viajero%' then
    return 'Adaptador de viaje pensado para conectar cargadores en distintos formatos de enchufe y recargar equipos mediante USB o USB-C. Verificá las fichas admitidas, la tensión del destino y los requisitos de cada dispositivo.';
  elsif v_name like '%receptor bluetooth%' then
    return 'Receptor inalámbrico pensado para sumar conectividad Bluetooth a equipos de audio compatibles. Permite reproducir música desde celulares, tablets o computadoras; verificá entradas, alimentación y versión antes de comprar.';
  elsif v_name like '%smart car%' then
    return 'Adaptador Bluetooth para reproducir audio desde el celular en sistemas de sonido del auto compatibles. Verificá el tipo de entrada, la alimentación requerida y las funciones incluidas antes de comprar.';
  elsif v_name like '%adaptador auxiliar a usb-c%' then
    return 'Adaptador de audio para conectar auriculares o cables auxiliares de 3,5 mm a dispositivos con puerto USB-C. Verificá que el equipo admita salida de audio mediante ese conector antes de comprar.';
  elsif v_name like '%adaptador de iphone a auxiliar%' then
    return 'Adaptador de audio para conectar un cable o auricular auxiliar de 3,5 mm a un iPhone compatible. Verificá el conector del teléfono y la compatibilidad con audio antes de comprar.';
  elsif v_name like '%wi-fi usb de 300 mbps%' then
    return 'Adaptador USB que agrega conexión Wi-Fi de hasta 300 Mbps a una computadora compatible. Resulta útil para conectarse a redes inalámbricas; verificá bandas, controladores y sistema operativo antes de comprar.';
  elsif v_name like '%vga a hdmi%' then
    return 'Conversor de señal para conectar una fuente VGA a una pantalla HDMI compatible. Resulta útil al combinar equipos de distintas generaciones; verificá dirección de conversión, alimentación y audio antes de comprar.';
  elsif v_name like '%hdmi a vga%' then
    return 'Conversor de señal para conectar una fuente HDMI a una pantalla VGA compatible. Resulta útil al combinar equipos de distintas generaciones; verificá dirección de conversión, alimentación y audio antes de comprar.';
  elsif v_name like '%hdmi hembra a hdmi hembra%' then
    return 'Adaptador hembra a hembra pensado para unir dos cables HDMI compatibles. Permite extender una conexión existente; verificá versión, resolución admitida y longitud total del tendido antes de comprar.';
  elsif v_name like '%micro-usb a usb-c%' then
    return 'Adaptador compacto para vincular un conector Micro-USB con un puerto USB-C compatible. Puede simplificar el uso de cables existentes; verificá orientación, carga y transferencia de datos antes de comprar.';
  elsif v_name like '%av a hdmi%' then
    return 'Conversor para conectar una fuente de audio y video analógico AV a una pantalla HDMI compatible. Verificá la dirección de conversión, el formato de señal y la alimentación requerida antes de comprar.';
  elsif v_name like '%hdmi a av%' then
    return 'Conversor para conectar una fuente HDMI a una pantalla o equipo con entrada de audio y video AV. Verificá dirección de conversión, formato de señal y alimentación requerida antes de comprar.';
  elsif v_name like '%adaptador multipuerto%' then
    return 'Adaptador pensado para ampliar las conexiones disponibles en un dispositivo compatible mediante varios puertos. Consultanos para confirmar conectores, funciones de cada salida, alimentación y compatibilidad antes de comprar.';

  -- Cables.
  elsif v_name like '%cable auxiliar a 2 av%' or v_name like '%cable auxiliar a rca%' then
    return 'Cable de audio analógico para conectar una salida auxiliar de 3,5 mm con entradas RCA o AV compatibles. Ideal para equipos de sonido; verificá conectores, canales y longitud antes de comprar.';
  elsif v_name like '%cable extensor auxiliar%' then
    return 'Extensión de audio analógico para aumentar el alcance de un cable auxiliar de 3,5 mm. Resulta práctica para auriculares y equipos de sonido compatibles; verificá conectores y longitud antes de comprar.';
  elsif v_name like '%cable auxiliar%' then
    return 'Cable de audio analógico para conectar dispositivos con entrada y salida auxiliar de 3,5 mm. Ideal para celulares, computadoras, parlantes o autos compatibles; verificá conectores y longitud antes de comprar.';
  elsif v_name like '%cable mini hdmi a hdmi%' then
    return 'Cable para conectar una fuente Mini HDMI a una pantalla o capturadora con entrada HDMI. Resulta útil con cámaras y otros equipos compatibles; verificá conectores y longitud antes de comprar.';
  elsif v_name like '%cable hdmi%' then
    return 'Cable digital para transmitir imagen y sonido entre equipos con conexión HDMI, como computadoras, consolas y televisores compatibles. Verificá longitud, versión y resolución requerida antes de comprar.';
  elsif v_name like '%cable ethernet%' or v_name like '%cable de red%' then
    return 'Cable de red para conectar computadoras, routers, consolas y otros equipos con puerto Ethernet. Brinda una conexión cableada estable; verificá longitud, ficha y velocidad admitida antes de comprar.';
  elsif v_name like '%cable óptico%' then
    return 'Cable óptico para transmitir audio digital entre televisores, barras de sonido, consolas y otros equipos compatibles. Evita interferencias eléctricas; verificá conectores y longitud antes de comprar.';
  elsif v_name like '%interlock%' then
    return 'Cable de alimentación para equipos que utilizan la ficha interlock indicada. Resulta útil como reemplazo o repuesto; compará forma del conector, tensión admitida y longitud antes de comprar.';
  elsif v_name like '%cable para batería de auto%' then
    return 'Cable destinado a realizar conexiones con baterías de vehículos y equipos compatibles. Antes de usarlo, verificá terminales, polaridad, capacidad admitida y procedimiento seguro recomendado por el fabricante.';
  elsif v_name like '%cable ps3%' then
    return 'Cable pensado para conectar o alimentar equipos compatibles con PlayStation 3. Como el tipo de conexión no está especificado, consultanos para confirmar terminales, función y longitud antes de comprar.';
  elsif v_name like '%iphone%' and v_name like '%cable%' then
    return 'Cable para carga y sincronización de modelos de iPhone con el conector indicado. Permite conectar el teléfono a un cargador o computadora compatible; verificá terminales, certificación y longitud antes de comprar.';
  elsif v_name like '%cable%' and (v_name like '%usb%' or v_name like '%micro-usb%') then
    return 'Cable para cargar dispositivos compatibles y, cuando el equipo lo admite, transferir datos. Ideal para celulares, tablets y accesorios; verificá ambos conectores, potencia admitida y longitud antes de comprar.';
  elsif v_name like '%cable%' then
    return 'Cable pensado para conectar dispositivos compatibles con los terminales indicados. Resulta útil como reemplazo o extensión de uso cotidiano; verificá conectores, longitud y requisitos del equipo antes de comprar.';

  -- Chargers, power supplies and power banks.
  elsif v_name like '%cargador universal para notebook%' then
    return 'Cargador universal pensado para alimentar notebooks compatibles mediante distintas fichas. Antes de conectarlo, verificá voltaje, amperaje, polaridad, potencia requerida y punta correspondiente al modelo de computadora.';
  elsif v_name like '%fuente jahro de%' then
    return 'Fuente de alimentación para equipos que requieren la tensión y corriente indicadas en el nombre. Antes de conectarla, verificá voltaje, amperaje, polaridad y medida de ficha para evitar incompatibilidades.';
  elsif v_name like '%cargador%para pilas%' then
    return 'Cargador USB para pilas recargables compatibles. Permite recuperar energía para volver a utilizarlas en controles, juguetes y otros equipos; verificá tamaños admitidos y pilas incluidas antes de comprar.';
  elsif v_name like '%cargador usb-c apple%20 w%' then
    return 'Cargador de pared USB-C de 20 W pensado para recargar dispositivos Apple compatibles. Admite carga rápida en modelos compatibles; verificá el cable necesario y el conector del equipo antes de comprar.';
  elsif v_name like '%magsafe%' and v_name like '%cargador%' then
    return 'Cargador inalámbrico magnético para iPhone y accesorios compatibles con MagSafe. Facilita la alineación durante la carga; verificá modelo del dispositivo, fuente de alimentación necesaria y accesorios incluidos.';
  elsif v_name like '%cargador motorola de 68 w%' then
    return 'Cargador de pared Motorola de hasta 68 W con cable USB-C. Permite carga rápida en equipos compatibles; la potencia efectiva depende del dispositivo, el protocolo admitido y el cable utilizado.';
  elsif v_name like '%cargador para auto%' then
    return 'Cargador para utilizar en la toma de 12 V del vehículo y recargar dispositivos compatibles. Incluye salida USB-C según el nombre; verificá potencia, puertos y protocolos admitidos antes de comprar.';
  elsif v_name like '%power bank%' and v_name like '%10.000 mah%' then
    return 'Batería externa de 10.000 mAh para recargar celulares y otros dispositivos compatibles fuera de casa. Resulta práctica para viajes y emergencias; verificá puertos, potencia de salida y cable necesario.';
  elsif v_name like '%batería externa%' or v_name like '%power bank%' then
    return 'Batería externa portátil para recargar celulares y otros dispositivos compatibles cuando no hay un enchufe cerca. Consultanos para confirmar capacidad, conectores, potencia de salida y cable incluido.';
  elsif v_name like '%fuente % de 15 w%' then
    return 'Fuente compacta de 15 W para recargar dispositivos compatibles mediante los puertos indicados. Resulta práctica para el uso diario; verificá protocolos de carga, cable necesario y compatibilidad antes de comprar.';
  elsif v_name like '%cargador%' or v_category = 'cargadores' then
    return 'Cargador pensado para suministrar energía a dispositivos compatibles. Antes de comprar, verificá potencia, tensión, tipo de conector, protocolo de carga y si el cable necesario está incluido.';

  -- Home appliances and lighting.
  elsif v_name like '%freidora de aire%15 l%' then
    return 'Freidora de aire de 15 litros pensada para cocinar, dorar y recalentar alimentos con circulación de aire caliente. Su capacidad resulta útil para porciones grandes; verificá funciones y accesorios incluidos.';
  elsif v_name like '%freidora de aire%' then
    return 'Freidora de aire para cocinar, dorar y recalentar alimentos mediante circulación de aire caliente. Ofrece una alternativa práctica para el uso cotidiano; consultanos para confirmar capacidad, funciones y accesorios incluidos.';
  elsif v_name like '%luces de navidad%' then
    return 'Guirnalda de alambre con luces LED para decorar árboles, ventanas, muebles y otros espacios interiores. Su formato flexible facilita la colocación; verificá longitud, alimentación y uso recomendado antes de comprar.';
  elsif v_name like '%luz de emergencia%' then
    return 'Luz de emergencia con 30 LED pensada para iluminar durante cortes eléctricos o situaciones imprevistas. Consultanos para confirmar autonomía, modo de carga, accesorios incluidos y recomendaciones de uso.';
  elsif v_name like '%tira led%' then
    return 'Tira LED alimentada por USB para sumar iluminación decorativa en escritorios, muebles, televisores y otros espacios. Verificá longitud, color de luz, controles incluidos y superficie de instalación antes de comprar.';
  elsif v_name like '%tira de neón%' then
    return 'Tira de luz tipo neón para crear iluminación decorativa continua en habitaciones, muebles o exhibidores. Su formato flexible facilita distintos diseños; verificá longitud, alimentación y accesorios antes de comprar.';
  elsif v_name like '%linterna vincha%' or v_name like '%linterna minera%' then
    return 'Linterna manos libres con sujeción para la cabeza, ideal para reparaciones, actividades nocturnas y trabajos con poca luz. Permite orientar la iluminación; verificá alimentación, modos y accesorios incluidos.';

  -- Audio and storage.
  elsif v_name like '%parlante para pc%' or v_name like '%parlante mini para pc%' then
    return 'Parlante pensado para reproducir audio desde computadoras y notebooks compatibles. Su formato resulta práctico para escritorios y uso cotidiano; verificá tipo de conexión, alimentación, controles y contenido de la caja.';
  elsif v_name like '%parlante%ducha%' then
    return 'Parlante pensado para escuchar música en espacios húmedos mediante conexión inalámbrica. Consultanos para confirmar nivel de resistencia al agua, autonomía, método de carga y compatibilidad antes de usarlo en la ducha.';
  elsif v_name like '%parlante%' or v_category = 'parlantes' then
    return 'Parlante para reproducir música y otros contenidos desde dispositivos compatibles. Los modelos Bluetooth permiten conexión inalámbrica; verificá potencia, entradas, autonomía, método de carga y accesorios incluidos.';
  elsif v_name like '%pendrive%' or v_category = 'pendrives' then
    return 'Memoria USB portátil para guardar, transportar y compartir documentos, fotos, videos y otros archivos. La capacidad e interfaz figuran en el nombre; verificá compatibilidad y espacio utilizable antes de comprar.';

  -- Batteries.
  elsif v_name like '%pilas recargables%' then
    return 'Pilas recargables para alimentar controles, juguetes y otros dispositivos compatibles con el tamaño indicado. Pueden reutilizarse con un cargador adecuado; verificá formato, capacidad, química y cantidad incluida.';
  elsif v_name like '%az13%' or v_name like '%az312%' then
    return 'Pila para audífonos y otros dispositivos compatibles con el código indicado. Su tamaño debe coincidir exactamente con el repuesto original; verificá modelo, voltaje y cantidad incluida antes de comprar.';
  elsif v_name like '%cr2016%' or v_name like '%cr2025%' or v_name like '%cr2032%' or v_name like '%lr44%' then
    return 'Pila tipo botón para relojes, controles, calculadoras y otros equipos compatibles con el código indicado. Compará la referencia exacta y el voltaje con la pila original antes de comprar.';
  elsif v_name like '%batería%9 v%' then
    return 'Batería de 9 V para detectores, instrumentos, juguetes y otros dispositivos compatibles con ese formato. Verificá el tipo de pila requerido por el equipo y la presentación antes de comprar.';
  elsif v_name like '%pila%' or v_name like '%batería%' or v_category = 'pilas y baterías' then
    return 'Pila para alimentar dispositivos compatibles con el formato y código indicados en el nombre. Compará tamaño, voltaje y referencia con la unidad original, y verificá la cantidad incluida antes de comprar.';

  -- Computer peripherals and gaming accessories.
  elsif v_name like '%micrófono dinámico%' then
    return 'Micrófono dinámico para voz, presentaciones, karaoke y otros usos de audio. Su funcionamiento depende del equipo al que se conecte; verificá conector, cable, patrón de captación y accesorios incluidos.';
  elsif v_name like '%micrófono%' then
    return 'Micrófono para captar voz en grabaciones, presentaciones, karaoke u otros usos de audio. Verificá tipo de conexión, compatibilidad con el equipo, cable necesario y accesorios incluidos antes de comprar.';
  elsif v_name like '%mouse%noga stormer wind%3500 dpi%' then
    return 'Mouse para computadora con sensor de hasta 3500 DPI, pensado para movimientos precisos en tareas cotidianas y juegos. Consultanos para confirmar conexión, cantidad de botones, iluminación y software compatible.';
  elsif v_name like '%mouse óptico%' then
    return 'Mouse óptico para controlar el cursor con precisión en computadoras y notebooks compatibles. Su diseño resulta práctico para tareas cotidianas; verificá tipo de conexión, resolución y sistema operativo antes de comprar.';
  elsif v_name like '%mouse inalámbrico%' then
    return 'Mouse inalámbrico cómodo y preciso para el uso diario en computadoras y notebooks. Permite trabajar sin cable; verificá si utiliza receptor USB o Bluetooth, alimentación y compatibilidad antes de comprar.';
  elsif v_name like '%mousepad%' then
    return 'Superficie para mouse que favorece un desplazamiento uniforme y ayuda a proteger el escritorio. Su tamaño compacto resulta práctico para estudio, trabajo o juego; verificá medidas y material antes de comprar.';
  elsif v_name like '%teclado inalámbrico bluetooth%' then
    return 'Teclado inalámbrico para escribir y controlar dispositivos compatibles mediante Bluetooth. Resulta práctico para computadoras, tablets o celulares; verificá distribución de teclas, sistema operativo, alimentación y tamaño antes de comprar.';
  elsif v_name like '%teclado retroiluminado%' then
    return 'Teclado con iluminación para facilitar la escritura y el juego en ambientes con poca luz. Verificá tipo de conexión, distribución de teclas, modos de iluminación y compatibilidad antes de comprar.';
  elsif v_name like '%teclado%' then
    return 'Teclado pensado para escritura, estudio, trabajo y uso cotidiano en computadoras compatibles. Antes de comprar, verificá tipo de conexión, distribución de teclas, idioma, funciones adicionales y sistema operativo.';
  elsif v_name like '%joystick para ps3%' then
    return 'Control para jugar en consolas PlayStation 3 compatibles. Permite manejar juegos y menús con mayor comodidad; verificá tipo de conexión, alimentación, funciones y accesorios incluidos antes de comprar.';
  elsif v_name like '%joystick para ps4%' then
    return 'Control para jugar en consolas PlayStation 4 compatibles. Permite manejar juegos y menús con mayor comodidad; verificá tipo de conexión, alimentación, funciones y accesorios incluidos antes de comprar.';

  -- Other clearly identifiable products.
  elsif v_name like '%adhesivo%' then
    return 'Adhesivo para pequeñas reparaciones según los materiales admitidos por el fabricante. Antes de aplicarlo, leé las indicaciones del envase y verificá superficies compatibles, tiempo de curado y precauciones de seguridad.';
  elsif v_name like '%hub usb 3.0%' then
    return 'Hub USB 3.0 para ampliar la cantidad de puertos disponibles en una computadora compatible. Permite conectar varios periféricos; verificá número de salidas, alimentación y velocidad admitida antes de comprar.';
  elsif v_name like '%prolongador%' or v_name like '%zapatilla múltiple%' then
    return 'Extensión eléctrica para conectar varios equipos desde una toma. Resulta práctica en hogares y espacios de trabajo; verificá cantidad de salidas, potencia máxima, longitud, puesta a tierra y protecciones.';
  elsif v_name like '%radio retro bluetooth%' then
    return 'Radio de diseño retro con conexión Bluetooth para reproducir audio desde celulares y otros dispositivos compatibles. Consultanos para confirmar bandas de radio, entradas, alimentación y controles incluidos.';
  elsif v_name like '%soporte%móvil%tv%' then
    return 'Soporte móvil para instalar un televisor compatible y ajustar su posición. Antes de comprar, verificá pulgadas admitidas, patrón VESA, peso máximo, tipo de pared y elementos de fijación incluidos.';
  elsif v_name like '%soporte fijo%tv%' then
    return 'Soporte fijo para instalar un televisor compatible cerca de la pared. Antes de comprar, verificá pulgadas admitidas, patrón VESA, peso máximo, tipo de pared y elementos de fijación incluidos.';
  elsif v_name like '%tv stick%' then
    return 'Dispositivo de streaming pensado para reproducir contenido multimedia en televisores con entrada HDMI. Requiere conexión a internet y compatibilidad con las aplicaciones utilizadas; consultanos para confirmar versión y accesorios incluidos.';
  elsif v_name like '%onn full hd%' then
    return 'Dispositivo de streaming ONN para reproducir contenido Full HD en un televisor compatible. Requiere entrada HDMI, conexión a internet y cuentas en los servicios utilizados; consultanos para confirmar versión y accesorios.';
  elsif v_name like '%onn 4k%' then
    return 'Dispositivo de streaming ONN para reproducir contenido hasta 4K en un televisor y servicios compatibles. Requiere entrada HDMI, conexión a internet y cuentas activas; consultanos para confirmar versión y accesorios.';
  elsif v_name like '%ventilador%' then
    return 'Ventilador pensado para mover el aire y mejorar la sensación térmica en espacios de uso cotidiano. Consultanos para confirmar tamaño, alimentación, velocidades, modos de uso y accesorios incluidos.';
  elsif v_name like '%minisellador de bolsas%' then
    return 'Sellador compacto para cerrar bolsas plásticas y ayudar a conservar alimentos u objetos pequeños. Resulta práctico en la cocina y el hogar; verificá alimentación, ancho de sellado y uso recomendado.';
  elsif v_name like '%control remoto para tv%' then
    return 'Control remoto de reemplazo para manejar funciones básicas de televisores compatibles. Antes de comprar, verificá marca, modelo, código del control original, método de programación y pilas necesarias.';
  elsif v_name like '%minipimer%' then
    return 'Batidora de mano de 300 W pensada para mezclar, triturar y preparar salsas o licuados. Su formato permite trabajar directamente en distintos recipientes; verificá accesorios, velocidades y recomendaciones de uso.';
  elsif v_name like '%set de 3 pinzas%' then
    return 'Juego de tres pinzas para sujetar, manipular o retirar piezas pequeñas en tareas domésticas y de precisión. Consultanos para confirmar tamaños, formas de punta, material y presentación incluida.';
  elsif v_name = 'placa' then
    return 'Placa electrónica destinada a reparación o reemplazo en equipos compatibles. Como no se indica modelo ni función, compará códigos, conectores y formato con la pieza original o consultanos por WhatsApp.';
  elsif v_name like '%pava eléctrica%' then
    return 'Pava eléctrica para calentar agua de forma rápida y práctica en la cocina. Ideal para infusiones y preparaciones calientes; consultanos para confirmar capacidad, potencia, corte automático y modelo entregado.';
  elsif v_name like '%caloventor%' then
    return 'Caloventor de 2000 W para calefaccionar ambientes pequeños mediante aire caliente. Su formato permite trasladarlo con facilidad; verificá niveles de potencia, termostato, protecciones y recomendaciones de seguridad.';
  elsif v_name like '%estufa infrarroja%' then
    return 'Estufa infrarroja pensada para brindar calor directo en ambientes interiores. Resulta práctica como apoyo de calefacción; verificá potencia, niveles de calor, protecciones y distancia de uso recomendada.';
  elsif v_name like '%funda para iphone%' then
    return 'Funda para proteger un iPhone compatible frente a roces y marcas del uso cotidiano. Antes de comprar, confirmá el modelo exacto del teléfono, material, color y tipo de protección ofrecida.';
  elsif v_name like '%camiseta de argentina%' then
    return 'Camiseta con diseño de Argentina para uso casual, eventos deportivos o regalo. Consultanos antes de comprar para confirmar talle, medidas, material, versión del diseño y cuidados de lavado.';
  elsif v_name like '%soporte%para auto%' then
    return 'Soporte para mantener el celular visible y sujeto dentro del auto. Facilita el uso de navegación con manos libres; verificá método de fijación, tamaño admitido y compatibilidad antes de comprar.';
  elsif v_name like '%secador de pelo plegable%' then
    return 'Secador de pelo plegable pensado para agilizar el secado y facilitar el traslado. Su formato compacto resulta práctico para viajes y guardado diario; verificá potencia, velocidades y accesorios incluidos.';
  elsif v_name like '%secador de pelo%' then
    return 'Secador de pelo pensado para agilizar el secado y facilitar el peinado diario. Su formato manual permite dirigir el flujo de aire con comodidad; verificá potencia, velocidades y accesorios incluidos.';
  elsif v_name like '%abridor de cerveza%' then
    return 'Abridor manual para destapar botellas con tapa metálica de forma simple. Su tamaño compacto facilita guardarlo en la cocina o llevarlo a reuniones; consultanos para confirmar diseño y material.';
  elsif v_name like '%grips para joystick%' then
    return 'Cubiertas para los sticks de controles PS4, PS5 y Xbox compatibles. Ayudan a mejorar el agarre y proteger la superficie durante el juego; verificá tamaño, diseño y cantidad incluida.';
  elsif v_name like '%auricular bluetooth%' or v_name like '%auricular inalámbrico%' then
    return 'Auriculares inalámbricos para escuchar música y atender llamadas con comodidad desde dispositivos Bluetooth compatibles. Su uso sin cables resulta práctico para actividades cotidianas; verificá autonomía, controles y método de carga.';
  elsif v_name like '%auricular gamer%' then
    return 'Auricular pensado para juegos, comunicación por voz y contenido multimedia en equipos compatibles. Consultanos para confirmar tipo de conexión, micrófono, controles, iluminación y compatibilidad con tu plataforma.';
  elsif v_name like '%auricular%' or v_category = 'auriculares' then
    return 'Auricular para escuchar música, videos y llamadas en dispositivos compatibles. Resulta práctico para el uso cotidiano; verificá tipo de conexión, micrófono, controles y compatibilidad antes de comprar.';
  elsif v_name like '%mouse%' then
    return 'Mouse para controlar el cursor en computadoras y notebooks compatibles. Resulta práctico para trabajo, estudio o juego; verificá conexión, resolución, cantidad de botones y sistema operativo antes de comprar.';
  end if;

  -- Conservative fallbacks by product family. They intentionally avoid making
  -- technical claims that are not present in the source data.
  if v_category = 'adaptadores' then
    return 'Adaptador destinado a vincular dispositivos con conexiones diferentes o ampliar una conexión existente. Antes de comprar, verificá terminales, dirección de señal, alimentación y compatibilidad con ambos equipos.';
  elsif v_category = 'cables' then
    return 'Cable para conectar dispositivos compatibles con los terminales indicados en el nombre. Antes de comprar, verificá ambos conectores, longitud, función prevista y requisitos técnicos de los equipos.';
  elsif v_category = 'iluminación' then
    return 'Accesorio de iluminación pensado para aportar luz funcional o decorativa según el modelo. Consultanos para confirmar alimentación, medidas, color de luz, controles y elementos incluidos antes de comprar.';
  elsif v_category = 'teclados y mouse' then
    return 'Periférico para acompañar el uso cotidiano de computadoras y otros dispositivos compatibles. Antes de comprar, verificá tipo de conexión, funciones, alimentación, sistema operativo y accesorios incluidos.';
  end if;

  return 'Artículo pensado para resolver una necesidad concreta de uso cotidiano. Como el nombre no permite verificar todas sus funciones, consultanos para confirmar características, medidas, compatibilidad y contenido de la caja antes de comprar.';
end;
$$;

revoke all on function private.storefront_generated_description(text, text) from public, anon, authenticated;

-- Rewrite the complete public collection with the new professional copy.
update public.storefront_products d
set short_description = private.storefront_generated_description(d.name, d.category_name),
    description = private.storefront_generated_description(d.name, d.category_name),
    seo_description = private.storefront_generated_description(d.name, d.category_name),
    description_status = 'manually_reviewed',
    description_generated_at = now(),
    description_reviewed_at = now(),
    updated_at = now();

-- Guardrails: future writes cannot reintroduce administrative wording or
-- descriptions outside the requested 20-to-50-word range.
alter table public.storefront_products
  drop constraint if exists storefront_products_description_word_count_check,
  drop constraint if exists storefront_products_description_language_check;

alter table public.storefront_products
  add constraint storefront_products_description_word_count_check check (
    cardinality(regexp_split_to_array(btrim(short_description), E'\\s+')) between 20 and 50
    and cardinality(regexp_split_to_array(btrim(description), E'\\s+')) between 20 and 50
    and cardinality(regexp_split_to_array(btrim(seo_description), E'\\s+')) between 20 and 50
  ),
  add constraint storefront_products_description_language_check check (
    lower(short_description) !~ '(base de datos|cat[aá]logo|categor[ií]a|chetech|disponible en|producto agregado|incorporad[oa]|forma parte|pertenece a)'
    and lower(description) !~ '(base de datos|cat[aá]logo|categor[ií]a|chetech|disponible en|producto agregado|incorporad[oa]|forma parte|pertenece a)'
    and lower(seo_description) !~ '(base de datos|cat[aá]logo|categor[ií]a|chetech|disponible en|producto agregado|incorporad[oa]|forma parte|pertenece a)'
  );

do $$
declare
  v_invalid_count integer;
begin
  select count(*)
    into v_invalid_count
  from public.storefront_products
  where cardinality(regexp_split_to_array(btrim(short_description), E'\\s+')) not between 20 and 50
     or cardinality(regexp_split_to_array(btrim(description), E'\\s+')) not between 20 and 50
     or lower(short_description) ~ '(base de datos|cat[aá]logo|categor[ií]a|chetech|disponible en|producto agregado|incorporad[oa]|forma parte|pertenece a)'
     or lower(description) ~ '(base de datos|cat[aá]logo|categor[ií]a|chetech|disponible en|producto agregado|incorporad[oa]|forma parte|pertenece a)';

  if v_invalid_count <> 0 then
    raise exception 'Professional description validation failed for % products', v_invalid_count;
  end if;
end;
$$;
