export type ServiceCategorySlug =
  | "computadoras-notebooks"
  | "televisores"
  | "celulares-tablets"
  | "joysticks-consolas"
  | "mantenimiento"
  | "otros-equipos";

export type ServiceCategoryHref = `/servicio-tecnico/${ServiceCategorySlug}`;

export type ServiceIconKey = "monitor" | "tv" | "smartphone" | "gamepad" | "cpu" | "wrench";

export type ServiceGroup = {
  title: string;
  summary: string;
  items: readonly string[];
};

export type ServiceFaq = {
  question: string;
  answer: string;
};

export type ServiceProcessStep = {
  index: string;
  title: string;
  summary: string;
  details: readonly string[];
};

export type ServiceCategory = {
  slug: ServiceCategorySlug;
  href: ServiceCategoryHref;
  title: string;
  shortTitle: string;
  kicker: string;
  summary: string;
  description: string;
  cardDescription: string;
  image: `/brand/services/${ServiceCategorySlug}.webp`;
  imageAlt: string;
  iconKey: ServiceIconKey;
  contextualWhatsAppMessage: string;
  serviceGroups: readonly ServiceGroup[];
  commonProblems: readonly string[];
  benefits?: readonly string[];
  notices: readonly string[];
  faqs: readonly ServiceFaq[];
  relatedSlugs: readonly ServiceCategorySlug[];
};

export const serviceLandingHero = {
  image: "/brand/services/mantenimiento.webp",
  imageAlt:
    "Composición ilustrativa de un banco técnico con placa madre, herramientas y componentes de refrigeración",
  specialisms: ["Diagnóstico", "Hardware", "Software", "Electrónica"],
} as const;

export const serviceCategories = [
  {
    slug: "computadoras-notebooks",
    href: "/servicio-tecnico/computadoras-notebooks",
    title: "Computadoras y notebooks",
    shortTitle: "Computadoras",
    kicker: "Diagnóstico · rendimiento · reparación",
    summary:
      "Diagnosticamos, mantenemos y reparamos computadoras de escritorio y notebooks, con alternativas claras según el equipo y la falla.",
    description:
      "Revisamos hardware y software para encontrar el origen del problema. Podemos trabajar sobre rendimiento, temperatura, almacenamiento, memoria, sistema y componentes reemplazables cuando el modelo, el estado del equipo y la disponibilidad de repuestos lo permiten.",
    cardDescription:
      "Diagnóstico, optimización, mantenimiento, actualización y reparación de computadoras y notebooks.",
    image: "/brand/services/computadoras-notebooks.webp",
    imageAlt: "Interior de una computadora y notebook en un entorno de diagnóstico electrónico",
    iconKey: "monitor",
    contextualWhatsAppMessage:
      "Hola, Chetech. Quiero consultar por una computadora o notebook. Equipo y modelo: ____. La falla que presenta es: ____.",
    serviceGroups: [
      {
        title: "Diagnóstico y reparación",
        summary: "Buscamos la causa real de la falla antes de recomendar un trabajo o reemplazo.",
        items: [
          "Diagnóstico general de hardware y software",
          "Reparación de computadoras de escritorio y notebooks",
          "Problemas de encendido, arranque e inicio del sistema",
          "Revisión de sobrecalentamiento, ventilación y apagados inesperados",
          "Evaluación de conectores, puertos y componentes internos",
          "Reparación electrónica cuando resulta técnicamente viable",
        ],
      },
      {
        title: "Sistema y rendimiento",
        summary:
          "Ordenamos y configuramos el sistema para recuperar estabilidad y una experiencia de uso más fluida.",
        items: [
          "Optimización de rendimiento y eliminación de lentitud",
          "Instalación o reinstalación de Windows",
          "Configuración del sistema y controladores",
          "Resolución de errores de inicio y fallas de software",
          "Actualizaciones, revisión de seguridad y configuración inicial",
          "Eliminación de software no deseado y revisión de posibles amenazas",
        ],
      },
      {
        title: "Mantenimiento y temperatura",
        summary: "El mantenimiento ayuda a controlar temperatura, ruido y acumulación de polvo.",
        items: [
          "Limpieza interna y eliminación de polvo",
          "Cambio de pasta térmica cuando corresponde",
          "Revisión y limpieza de ventiladores",
          "Control de temperaturas y flujo de aire",
          "Limpieza de conectores y contactos accesibles",
          "Mantenimiento preventivo de PC y notebooks",
        ],
      },
      {
        title: "Actualizaciones y componentes",
        summary:
          "Evaluamos mejoras compatibles para extender la utilidad del equipo sin recomendar cambios innecesarios.",
        items: [
          "Cambio de discos HDD e instalación de SSD",
          "Instalación de unidades M.2 compatibles",
          "Ampliación o reemplazo de memoria RAM",
          "Cambio de teclado, pantalla o batería en notebooks",
          "Reemplazo de fichas de carga y componentes disponibles",
          "Armado y actualización de computadoras según necesidad",
        ],
      },
      {
        title: "Información y respaldo",
        summary:
          "Podemos evaluar copias y recuperación de información según el estado del almacenamiento.",
        items: [
          "Copias de seguridad antes de intervenciones acordadas",
          "Traspaso de archivos entre equipos o unidades",
          "Evaluación de recuperación de información",
          "Revisión básica del estado del almacenamiento",
        ],
      },
    ],
    commonProblems: [
      "El equipo no enciende o se apaga solo",
      "Windows no inicia o muestra errores",
      "La computadora funciona con lentitud",
      "Temperatura elevada o ventiladores ruidosos",
      "Pantalla sin imagen, dañada o con fallas",
      "Batería que dura poco o no carga",
      "Disco con errores o poco espacio disponible",
      "Puertos, teclado o periféricos que no responden",
    ],
    benefits: [
      "Mejor estabilidad",
      "Menor temperatura",
      "Rendimiento más fluido",
      "Actualizaciones compatibles",
      "Mayor vida útil del equipo",
    ],
    notices: [
      "La solución y el presupuesto se definen después del diagnóstico.",
      "Los cambios de piezas dependen de la compatibilidad del modelo y de la disponibilidad de repuestos.",
      "La recuperación de información se evalúa caso por caso y no puede garantizarse antes de revisar la unidad.",
    ],
    faqs: [
      {
        question: "¿Pueden mejorar una computadora lenta?",
        answer:
          "Sí, primero revisamos el sistema, las temperaturas, la memoria y el almacenamiento. Después te explicamos qué mantenimiento o actualización tendría sentido para ese equipo.",
      },
      {
        question: "¿Instalan SSD o amplían la memoria RAM?",
        answer:
          "Podemos hacerlo cuando el equipo admite la mejora. Antes confirmamos formato, capacidad compatible, estado general y disponibilidad del componente.",
      },
      {
        question: "¿Recuperan archivos de un disco dañado?",
        answer:
          "Evaluamos el estado del disco y las posibilidades reales. La recuperación depende del tipo de daño y no se promete un resultado hasta realizar el diagnóstico.",
      },
    ],
    relatedSlugs: ["mantenimiento", "otros-equipos"],
  },
  {
    slug: "televisores",
    href: "/servicio-tecnico/televisores",
    title: "Televisores",
    shortTitle: "Televisores",
    kicker: "Imagen · sonido · electrónica",
    summary:
      "Revisamos televisores con fallas de encendido, imagen, iluminación, sonido o funcionamiento, según marca, modelo y disponibilidad de repuestos.",
    description:
      "El diagnóstico permite diferenciar una falla de alimentación, retroiluminación, placa, software, conectividad o panel. Informamos la alternativa posible antes de avanzar y verificamos los códigos de las piezas cuando se requiere un reemplazo.",
    cardDescription:
      "Diagnóstico electrónico de televisores, placas, retroiluminación y fallas de imagen, sonido o encendido.",
    image: "/brand/services/televisores.webp",
    imageAlt: "Televisor abierto para diagnóstico de placas y componentes internos",
    iconKey: "tv",
    contextualWhatsAppMessage:
      "Hola, Chetech. Quiero consultar por la reparación de un televisor. Marca y modelo: ____. La falla que presenta es: ____.",
    serviceGroups: [
      {
        title: "Encendido y alimentación",
        summary:
          "Revisamos la etapa de alimentación y los componentes asociados cuando el televisor no responde o se reinicia.",
        items: [
          "Televisores que no encienden",
          "Equipos que quedan en espera o reinician",
          "Revisión de fuentes y alimentación",
          "Evaluación de placas de fuente y componentes electrónicos",
          "Problemas de encendido intermitente",
        ],
      },
      {
        title: "Imagen y retroiluminación",
        summary:
          "Diagnosticamos si la falta o alteración de imagen proviene de iluminación, placas, conexiones o panel.",
        items: [
          "Pantalla oscura con sonido",
          "Cambio de tiras LED compatibles",
          "Imagen tenue, parpadeos o sectores sin iluminación",
          "Líneas, colores alterados o imagen intermitente",
          "Revisión de T-Con, flex y conexiones internas",
          "Evaluación de fallas de panel",
        ],
      },
      {
        title: "Placas y control",
        summary: "Comprobamos código y compatibilidad antes de reemplazar una placa o módulo.",
        items: [
          "Diagnóstico de placa principal",
          "Diagnóstico de placa T-Con",
          "Diagnóstico y reemplazo de fuente cuando corresponde",
          "Reparación electrónica de placas técnicamente viables",
          "Problemas de puertos HDMI, USB y entradas",
          "Fallas de control, sensores y botoneras",
        ],
      },
      {
        title: "Sonido, software y conexión",
        summary: "Evaluamos problemas de audio, configuración, inicio y conectividad del equipo.",
        items: [
          "Televisor con imagen pero sin sonido",
          "Audio distorsionado o intermitente",
          "Equipo trabado en el logo o con reinicios",
          "Restablecimiento y configuración cuando resulta aplicable",
          "Problemas de conexión o funciones inteligentes",
        ],
      },
    ],
    commonProblems: [
      "No enciende o queda con la luz de espera",
      "Tiene sonido pero la pantalla se ve oscura",
      "La imagen parpadea o pierde iluminación",
      "Muestra líneas, manchas o colores alterados",
      "Se reinicia o queda detenido en el logo",
      "No reconoce entradas HDMI o USB",
      "Tiene imagen pero no reproduce sonido",
      "Enciende de forma intermitente",
    ],
    benefits: [
      "Diagnóstico por etapa",
      "Compatibilidad verificada",
      "Presupuesto informado",
      "Pruebas antes de la entrega",
    ],
    notices: [
      "Las fallas de panel requieren una evaluación específica y no siempre admiten una reparación conveniente.",
      "Las placas y tiras LED se confirman por modelo, código y disponibilidad.",
      "No todos los síntomas permiten identificar la pieza necesaria sin abrir y diagnosticar el televisor.",
    ],
    faqs: [
      {
        question: "¿Qué datos necesitan para revisar un televisor?",
        answer:
          "La marca, el modelo completo de la etiqueta y una descripción de la falla ayudan a orientar la consulta. La causa y el presupuesto se confirman después del diagnóstico.",
      },
      {
        question: "¿Cambian tiras LED?",
        answer:
          "Sí, cuando el diagnóstico confirma una falla de retroiluminación y existe un repuesto compatible con el modelo.",
      },
      {
        question: "¿Trabajan con todas las marcas?",
        answer:
          "Evaluamos equipos de distintas marcas. La posibilidad de reparación depende del modelo, la falla, el estado del panel y los repuestos disponibles.",
      },
    ],
    relatedSlugs: ["mantenimiento", "otros-equipos"],
  },
  {
    slug: "celulares-tablets",
    href: "/servicio-tecnico/celulares-tablets",
    title: "Celulares y tablets",
    shortTitle: "Celulares",
    kicker: "Pantalla · carga · funcionamiento",
    summary:
      "Evaluamos celulares y tablets con problemas de pantalla, batería, carga, audio, cámara, botones, encendido o software.",
    description:
      "Cada modelo utiliza piezas y procedimientos diferentes. Revisamos el equipo, confirmamos la falla y te informamos las alternativas disponibles antes de intervenirlo.",
    cardDescription:
      "Evaluación técnica de pantallas, baterías, carga, audio, cámaras, encendido y software según el modelo.",
    image: "/brand/services/celulares-tablets.webp",
    imageAlt: "Celular abierto sobre una mesa de reparación electrónica",
    iconKey: "smartphone",
    contextualWhatsAppMessage:
      "Hola, Chetech. Quiero consultar por un celular o tablet. Marca y modelo: ____. La falla que presenta es: ____.",
    serviceGroups: [
      {
        title: "Pantalla y estructura",
        summary:
          "Revisamos golpes, imagen, respuesta táctil y módulos compatibles con cada equipo.",
        items: [
          "Cambio de pantalla o módulo cuando corresponde",
          "Problemas de imagen o respuesta táctil",
          "Evaluación de daños por golpes",
          "Cambio de botones y piezas externas disponibles",
          "Colocación de protección de pantalla disponible para el modelo",
        ],
      },
      {
        title: "Batería y carga",
        summary:
          "Diagnosticamos consumo, autonomía, conectores y circuitos relacionados con la carga.",
        items: [
          "Cambio de batería compatible",
          "Cambio o reparación de pin de carga",
          "Problemas de carga lenta o intermitente",
          "Limpieza de conectores",
          "Equipos que no encienden o se apagan",
          "Revisión electrónica cuando resulta viable",
        ],
      },
      {
        title: "Audio, cámara y controles",
        summary:
          "Evaluamos los módulos y conexiones que intervienen en llamadas, sonido, imagen y controles físicos.",
        items: [
          "Problemas de parlante, micrófono o auricular",
          "Audio bajo, distorsionado o intermitente",
          "Problemas de cámara",
          "Botones que no responden",
          "Problemas de vibración o sensores, según el equipo",
        ],
      },
      {
        title: "Sistema e información",
        summary:
          "Trabajamos sobre configuración y software cuando la falla no requiere una reparación física.",
        items: [
          "Equipos trabados en el logo o con reinicios",
          "Restauración y actualización del sistema",
          "Configuración inicial y de aplicaciones",
          "Traspaso de información y copias cuando el equipo lo permite",
          "Problemas de conexión y configuración",
        ],
      },
    ],
    commonProblems: [
      "Pantalla rota, sin imagen o sin respuesta táctil",
      "Batería con poca autonomía",
      "No carga o el conector funciona de forma intermitente",
      "No enciende o se reinicia",
      "Queda detenido en el logo",
      "No se escucha o no capta la voz",
      "Cámara o botones que no responden",
      "Problemas de configuración o conexión",
    ],
    benefits: [
      "Diagnóstico por modelo",
      "Alternativas explicadas",
      "Repuestos compatibles cuando están disponibles",
      "Pruebas de funcionamiento",
    ],
    notices: [
      "La disponibilidad y calidad de las piezas dependen del modelo y se informan antes de avanzar.",
      "Los equipos con daño por líquido o fallas electrónicas requieren evaluación y pueden presentar daños no visibles.",
      "Las copias, el traspaso y la recuperación de información dependen de que el equipo y el almacenamiento sean accesibles; no se garantiza un resultado previo.",
    ],
    faqs: [
      {
        question: "¿Pueden decirme el precio solo con el modelo?",
        answer:
          "El modelo permite consultar repuestos, pero el presupuesto final depende de la falla y del estado del equipo. Primero confirmamos qué componente necesita realmente.",
      },
      {
        question: "¿Tengo que llevar el cargador?",
        answer:
          "Si la falla está relacionada con carga, batería o encendido, traer el cargador habitual puede ayudar a realizar pruebas comparativas.",
      },
      {
        question: "¿Se conservan mis datos?",
        answer:
          "Evitamos modificar información cuando no es necesario, pero algunas tareas de software pueden requerir restauración. Te informamos antes y recomendamos contar con una copia de seguridad.",
      },
    ],
    relatedSlugs: ["mantenimiento", "otros-equipos"],
  },
  {
    slug: "joysticks-consolas",
    href: "/servicio-tecnico/joysticks-consolas",
    title: "Joysticks y consolas",
    shortTitle: "Gaming",
    kicker: "Controles · conexión · temperatura",
    summary:
      "Diagnosticamos controles y consolas con problemas de precisión, botones, carga, conexión, encendido, lectura o temperatura.",
    description:
      "Revisamos joysticks y consolas de distintas plataformas según el modelo y la falla. Confirmamos la compatibilidad de sticks, baterías, conectores y otros repuestos antes de realizar un cambio.",
    cardDescription:
      "Diagnóstico y mantenimiento de controles y consolas con drift, fallas de botones, conexión, carga o temperatura.",
    image: "/brand/services/joysticks-consolas.webp",
    imageAlt: "Joystick desarmado con sus componentes internos visibles",
    iconKey: "gamepad",
    contextualWhatsAppMessage:
      "Hola, Chetech. Quiero consultar por un joystick o consola. Marca y modelo: ____. La falla que presenta es: ____.",
    serviceGroups: [
      {
        title: "Sticks y precisión",
        summary:
          "Evaluamos movimientos involuntarios, zonas sin respuesta y desgaste de los mecanismos analógicos.",
        items: [
          "Diagnóstico y reparación de drift",
          "Cambio de sticks analógicos compatibles",
          "Instalación de sticks magnéticos compatibles cuando resulta aplicable",
          "Calibración y pruebas de precisión",
          "Revisión de conexiones y componentes asociados",
        ],
      },
      {
        title: "Botones y controles",
        summary:
          "Revisamos las piezas mecánicas y eléctricas responsables de la respuesta del control.",
        items: [
          "Cambio o reparación de botones",
          "Reparación de gatillos",
          "Cambio de membranas",
          "Revisión de vibración",
          "Reparación de cables y conexiones internas",
        ],
      },
      {
        title: "Carga y conexión",
        summary:
          "Diagnosticamos problemas de alimentación, batería, conexión inalámbrica y fichas.",
        items: [
          "Cambio de batería compatible",
          "Problemas de carga",
          "Cambio o reparación de ficha USB",
          "Problemas de conexión o sincronización",
          "Revisión de placas y conectores cuando resulta viable",
        ],
      },
      {
        title: "Consolas",
        summary:
          "Realizamos diagnóstico y mantenimiento de consolas según el equipo y la disponibilidad técnica.",
        items: [
          "Diagnóstico general de consolas",
          "Limpieza interna y mantenimiento",
          "Cambio de pasta térmica cuando corresponde",
          "Problemas de temperatura, ruido o apagado",
          "Fallas de encendido o lectura",
          "Evaluación de puertos y conectores",
          "Pruebas y optimización del funcionamiento",
        ],
      },
    ],
    commonProblems: [
      "El personaje o cursor se mueve solo",
      "Sticks con zonas sin respuesta",
      "Botones o gatillos que no responden",
      "El joystick no carga o dura poco",
      "Problemas de conexión o sincronización",
      "Consola con temperatura elevada o ruido",
      "Equipo que no enciende o se apaga",
      "Puertos o lectura con funcionamiento irregular",
    ],
    benefits: [
      "Respuesta más precisa",
      "Controles probados",
      "Temperatura controlada",
      "Mantenimiento preventivo",
    ],
    notices: [
      "La reparación y calibración dependen del modelo, del desgaste y del tipo de stick instalado.",
      "Los repuestos se confirman por compatibilidad y disponibilidad antes de avanzar.",
      "Las fallas de placa, almacenamiento o lectura de una consola requieren diagnóstico y pueden no resultar técnicamente viables.",
    ],
    faqs: [
      {
        question: "¿Reparan controles con drift?",
        answer:
          "Sí, diagnosticamos el origen del movimiento involuntario y evaluamos limpieza, ajuste o reemplazo del stick según su estado y compatibilidad.",
      },
      {
        question: "¿Instalan sticks magnéticos?",
        answer:
          "Podemos evaluar esa alternativa cuando existe una versión compatible con el control y el procedimiento resulta adecuado para el modelo.",
      },
      {
        question: "¿Hacen mantenimiento de consolas?",
        answer:
          "Realizamos limpieza, revisión térmica y otras tareas preventivas según el equipo. Antes de intervenir te explicamos el alcance recomendado.",
      },
    ],
    relatedSlugs: ["mantenimiento", "otros-equipos"],
  },
  {
    slug: "mantenimiento",
    href: "/servicio-tecnico/mantenimiento",
    title: "Mantenimiento preventivo",
    shortTitle: "Mantenimiento",
    kicker: "Temperatura · limpieza · prevención",
    summary:
      "El mantenimiento periódico ayuda a controlar polvo, temperatura, ruido y desgaste antes de que aparezcan fallas mayores.",
    description:
      "Revisamos el estado general del equipo y realizamos tareas preventivas adecuadas para computadoras, notebooks, consolas y otros dispositivos que admiten mantenimiento. El alcance se define según el diseño y las necesidades reales de cada caso.",
    cardDescription:
      "Limpieza, revisión térmica, optimización y control preventivo para cuidar el funcionamiento del equipo.",
    image: "/brand/services/mantenimiento.webp",
    imageAlt: "Herramientas y componentes preparados para mantenimiento electrónico preventivo",
    iconKey: "cpu",
    contextualWhatsAppMessage:
      "Hola, Chetech. Quiero consultar por mantenimiento preventivo. Tipo de equipo y modelo: ____. Quisiera revisar: ____.",
    serviceGroups: [
      {
        title: "Limpieza interna",
        summary:
          "Retiramos acumulaciones que pueden obstruir la ventilación o afectar conectores y mecanismos.",
        items: [
          "Eliminación de polvo",
          "Limpieza interna de PC y notebooks",
          "Limpieza interna de consolas",
          "Limpieza de ventiladores y rejillas",
          "Limpieza de conectores accesibles",
          "Mantenimiento de televisores cuando resulta aplicable",
        ],
      },
      {
        title: "Control térmico",
        summary: "Evaluamos el sistema de refrigeración y sus condiciones de trabajo.",
        items: [
          "Cambio de pasta térmica cuando corresponde",
          "Revisión de ventiladores",
          "Control de temperaturas",
          "Revisión de flujo de aire",
          "Detección de ruido o vibraciones anormales",
        ],
      },
      {
        title: "Sistema y almacenamiento",
        summary:
          "En equipos informáticos revisamos aspectos que influyen en estabilidad y rendimiento.",
        items: [
          "Optimización del sistema",
          "Revisión de almacenamiento disponible",
          "Control básico de salud del disco",
          "Actualización del sistema y controladores",
          "Revisión de seguridad y software no deseado",
          "Prevención de fallas de funcionamiento",
        ],
      },
      {
        title: "Control general",
        summary: "Comprobamos el funcionamiento antes y después del mantenimiento acordado.",
        items: [
          "Inspección visual de componentes",
          "Revisión de conexiones y fijaciones",
          "Pruebas de encendido y estabilidad",
          "Informe de observaciones relevantes",
          "Recomendaciones ajustadas al uso del equipo",
        ],
      },
    ],
    commonProblems: [
      "Temperatura elevada",
      "Ventiladores ruidosos",
      "Acumulación visible de polvo",
      "Apagados o pérdida de rendimiento bajo carga",
      "Rejillas o ventilación obstruidas",
      "Equipo que no recibe mantenimiento hace tiempo",
      "Sistema lento o almacenamiento saturado",
      "Conectores con suciedad o funcionamiento irregular",
    ],
    benefits: [
      "Menor temperatura",
      "Mejor rendimiento",
      "Menor ruido",
      "Mayor vida útil",
      "Prevención de fallas",
      "Mejor estabilidad",
    ],
    notices: [
      "El mantenimiento reduce riesgos, pero no garantiza que un componente desgastado no pueda fallar.",
      "La frecuencia y las tareas necesarias dependen del equipo, el ambiente y el tipo de uso.",
      "Si durante la revisión aparece una falla adicional, se informa antes de realizar un trabajo no acordado.",
    ],
    faqs: [
      {
        question: "¿Cada cuánto conviene hacer mantenimiento?",
        answer:
          "Depende del equipo, el uso, la ventilación y la cantidad de polvo del ambiente. Podemos revisar el estado y recomendar una frecuencia razonable sin imponer tareas innecesarias.",
      },
      {
        question: "¿El mantenimiento soluciona el sobrecalentamiento?",
        answer:
          "Puede ayudar cuando la causa es polvo, pasta térmica o ventilación deficiente. Si existe una falla de hardware, el diagnóstico puede indicar otra reparación.",
      },
      {
        question: "¿También revisan el sistema?",
        answer:
          "En computadoras y notebooks podemos complementar la limpieza con controles de almacenamiento, actualizaciones, seguridad y rendimiento.",
      },
    ],
    relatedSlugs: ["computadoras-notebooks", "joysticks-consolas", "televisores"],
  },
  {
    slug: "otros-equipos",
    href: "/servicio-tecnico/otros-equipos",
    title: "Otros equipos electrónicos",
    shortTitle: "Otros equipos",
    kicker: "Evaluación · electrónica · soluciones",
    summary:
      "Si tu equipo no aparece en las categorías principales, consultanos. Evaluamos cada caso según la falla, el modelo y la disponibilidad de repuestos.",
    description:
      "Trabajamos sobre distintos dispositivos y pequeños equipos electrónicos cuando su construcción, estado y repuestos permiten una intervención responsable. Una consulta inicial sirve para orientarte, pero la viabilidad se confirma después de revisar el equipo.",
    cardDescription:
      "Evaluación de parlantes, audio, pequeños electrodomésticos, fuentes, placas y otros dispositivos electrónicos.",
    image: "/brand/services/otros-equipos.webp",
    imageAlt: "Placa electrónica y herramientas de diagnóstico sobre un banco de trabajo",
    iconKey: "wrench",
    contextualWhatsAppMessage:
      "Hola, Chetech. Quiero consultar por otro equipo electrónico. Tipo, marca y modelo: ____. La falla que presenta es: ____.",
    serviceGroups: [
      {
        title: "Audio y accesorios",
        summary:
          "Evaluamos equipos de sonido y accesorios electrónicos según su construcción y repuestos.",
        items: [
          "Parlantes y equipos de audio",
          "Problemas de alimentación, carga o conexión",
          "Conectores, cables y controles",
          "Accesorios y dispositivos electrónicos",
          "Revisión de placas cuando resulta viable",
        ],
      },
      {
        title: "Pequeños electrodomésticos",
        summary:
          "Revisamos equipos compactos siempre que sea posible trabajar con seguridad y conseguir las piezas necesarias.",
        items: [
          "Microondas sujetos a evaluación técnica",
          "Pequeños electrodomésticos",
          "Cargadores y fuentes",
          "Problemas de encendido y alimentación",
          "Controles, conexiones y componentes reemplazables",
        ],
      },
      {
        title: "Electrónica general",
        summary:
          "Analizamos dispositivos no contemplados en las demás categorías sin prometer una reparación antes del diagnóstico.",
        items: [
          "Placas electrónicas",
          "Fuentes de alimentación",
          "Dispositivos con fallas de conectores",
          "Drones y equipos especiales sujetos a evaluación",
          "Otros equipos electrónicos consultados por el cliente",
        ],
      },
      {
        title: "Diagnóstico responsable",
        summary:
          "La reparación se recomienda solo cuando existe una alternativa técnicamente razonable.",
        items: [
          "Identificación inicial de la falla",
          "Evaluación de seguridad y estado general",
          "Consulta de repuestos disponibles",
          "Presupuesto antes de avanzar",
          "Pruebas de funcionamiento cuando la reparación es viable",
        ],
      },
    ],
    commonProblems: [
      "El equipo no enciende",
      "Funciona de manera intermitente",
      "No carga o no recibe alimentación",
      "Conectores flojos o dañados",
      "Audio ausente o distorsionado",
      "Botones o controles que no responden",
      "Olor, ruido o temperatura fuera de lo habitual",
      "Daños visibles en placas o componentes",
    ],
    benefits: [
      "Evaluación caso por caso",
      "Alternativas claras",
      "Trabajo sujeto a viabilidad",
      "Presupuesto informado",
    ],
    notices: [
      "No se reparan automáticamente todos los equipos o modelos; cada caso requiere evaluación.",
      "La viabilidad depende de la falla, la seguridad del equipo y la disponibilidad de componentes.",
      "No conectes ni sigas usando un equipo que presenta olor, humo, chispas o calentamiento anormal.",
    ],
    faqs: [
      {
        question: "Mi equipo no aparece en la lista, ¿puedo consultar?",
        answer:
          "Sí. Envianos el tipo de equipo, la marca, el modelo y una descripción de la falla. Con esa información podemos orientarte y confirmar si corresponde acercarlo.",
      },
      {
        question: "¿Reparan cualquier placa electrónica?",
        answer:
          "No todas las placas admiten una reparación segura o conveniente. Evaluamos el daño, el circuito y los componentes disponibles antes de informar una alternativa.",
      },
      {
        question: "¿El presupuesto se confirma por WhatsApp?",
        answer:
          "WhatsApp sirve para la consulta inicial y la coordinación. El presupuesto definitivo se informa después de diagnosticar el equipo.",
      },
    ],
    relatedSlugs: ["computadoras-notebooks", "televisores", "mantenimiento"],
  },
] as const satisfies readonly ServiceCategory[];

export const serviceProcess: readonly ServiceProcessStep[] = [
  {
    index: "01",
    title: "Nos contactás",
    summary: "Nos contás qué equipo tenés y qué falla presenta.",
    details: [
      "Podés escribirnos por WhatsApp con el tipo de equipo, marca y modelo.",
      "Una foto o video puede ayudar a orientar la recepción.",
      "La información inicial no reemplaza el diagnóstico técnico.",
    ],
  },
  {
    index: "02",
    title: "Recibimos el equipo",
    summary: "Coordinamos el ingreso y registramos la información necesaria.",
    details: [
      "Registramos los datos del cliente, el equipo y la falla informada.",
      "Dejamos constancia de los accesorios entregados cuando corresponde.",
      "Podés acercarlo al local o consultar la modalidad de retiro disponible.",
    ],
  },
  {
    index: "03",
    title: "Diagnosticamos",
    summary: "Revisamos el equipo para identificar la causa real del problema.",
    details: [
      "Evaluamos el estado general y las pruebas adecuadas para el equipo.",
      "Comprobamos si la reparación es técnicamente viable.",
      "La disponibilidad de repuestos se analiza una vez identificada la falla.",
    ],
  },
  {
    index: "04",
    title: "Te informamos el presupuesto",
    summary: "Explicamos el trabajo recomendado y su importe antes de avanzar.",
    details: [
      "Informamos la tarea necesaria y el presupuesto correspondiente.",
      "Cuando aplica, aclaramos la disponibilidad estimada de repuestos.",
      "Los tiempos dependen del equipo, la falla y los componentes necesarios.",
    ],
  },
  {
    index: "05",
    title: "Autorizás la reparación",
    summary: "Vos decidís si querés continuar con la alternativa informada.",
    details: [
      "No iniciamos un trabajo adicional sin comunicarlo previamente.",
      "Podés consultar cualquier punto del presupuesto antes de responder.",
      "La autorización queda asociada a la orden de reparación.",
    ],
  },
  {
    index: "06",
    title: "Reparamos y probamos",
    summary: "Realizamos el trabajo autorizado y comprobamos el funcionamiento.",
    details: [
      "Intervenimos únicamente sobre el alcance acordado.",
      "Hacemos las pruebas que corresponden al tipo de reparación.",
      "Registramos avances públicos cuando la orden está vinculada a tu cuenta.",
    ],
  },
  {
    index: "07",
    title: "Coordinamos la entrega",
    summary: "Te avisamos cuando el equipo está listo y acordamos la devolución.",
    details: [
      "Podés retirar el equipo en el local o consultar la modalidad coordinada.",
      "Informamos el trabajo realizado y las observaciones relevantes.",
      "La fecha de entrega queda registrada en la orden cuando corresponde.",
    ],
  },
  {
    index: "08",
    title: "Accedés a la garantía",
    summary: "La reparación cuenta con las condiciones aplicables al trabajo realizado.",
    details: [
      "Las condiciones concretas dependen de la reparación y se informan por escrito.",
      "No se aplica un plazo único a trabajos o componentes diferentes.",
      "Ante un inconveniente, contactanos con el número de orden para revisar el caso.",
    ],
  },
];

export const generalServiceFaqs: readonly ServiceFaq[] = [
  {
    question: "¿El diagnóstico tiene costo?",
    answer:
      "Actualmente Chetech ofrece diagnóstico de reparaciones sin costo. La revisión permite identificar la falla y no implica una promesa de reparación antes de evaluar el equipo.",
  },
  {
    question: "¿Cuánto demora una reparación?",
    answer:
      "El tiempo depende del equipo, la falla, las pruebas necesarias y la disponibilidad de repuestos. Después del diagnóstico te informamos el estado y los próximos pasos.",
  },
  {
    question: "¿Trabajan con todas las marcas?",
    answer:
      "Evaluamos equipos de distintas marcas. La posibilidad de reparación depende del modelo, el tipo de falla y los componentes disponibles.",
  },
  {
    question: "¿Tengo que llevar el cargador o los accesorios?",
    answer:
      "Traelos cuando estén relacionados con la falla o sean necesarios para probar el equipo. Si no estás seguro, consultanos antes de acercarte.",
  },
  {
    question: "¿Realizan respaldo o recuperación de información?",
    answer:
      "Podemos evaluar copias, traspasos o recuperación según el estado del equipo y del almacenamiento. No es posible garantizar un resultado antes del diagnóstico.",
  },
  {
    question: "¿La reparación tiene garantía?",
    answer:
      "Los productos y reparaciones cuentan con garantía. Las condiciones concretas dependen del trabajo realizado y se informan en la orden, el presupuesto o el comprobante correspondiente.",
  },
  {
    question: "¿Me avisan antes de realizar el trabajo?",
    answer:
      "Sí. Después del diagnóstico te informamos la alternativa y el presupuesto para que puedas decidir antes de avanzar.",
  },
  {
    question: "¿Qué pasa si el equipo no tiene solución?",
    answer:
      "Te informamos el resultado del diagnóstico y coordinamos la devolución. No prometemos una reparación cuando no es técnicamente viable.",
  },
  {
    question: "¿Puedo consultar por WhatsApp?",
    answer:
      "Sí. Enviá el tipo de equipo, la marca, el modelo y una descripción breve de la falla para orientar la consulta inicial.",
  },
  {
    question: "¿Cómo sé cuándo está listo?",
    answer:
      "Te avisamos por el canal coordinado. Si tu reparación está vinculada a una cuenta activa, también podés consultar su estado y las novedades desde “Mis reparaciones”.",
  },
];

export function getServiceCategory(slug: string): ServiceCategory | undefined {
  return serviceCategories.find((category) => category.slug === slug);
}
