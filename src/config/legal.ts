import { siteConfig } from "@/config/site";

export const legalConfig = {
  version: "1.2",
  // Al publicar: poner la fecha del día en que se activan los cobros online.
  lastUpdated: "20 de noviembre de 2026",
  professionalReviewPending: true,
  commercialName: siteConfig.name,
  legalHolder: siteConfig.legalName,
  taxId: siteConfig.taxId,
  commercialAddress: `${siteConfig.address}, ${siteConfig.location}, Argentina`,
  legalAddress: siteConfig.legalAddress,
  email: siteConfig.email,
  privacyEmail: siteConfig.email,
  whatsapp: siteConfig.phoneDisplay,
  fiscalCondition: siteConfig.fiscalCondition,
  invoiceType: siteConfig.invoiceType,
  currency: siteConfig.currency,
  privacyController: null,
  databaseRegistrationNumber: null,
  jurisdiction: null,
} as const;

export const legalLinks = [
  { href: "/terminos-y-condiciones", label: "Términos y condiciones" },
  { href: "/privacidad", label: "Privacidad" },
  { href: "/cookies", label: "Cookies" },
  { href: "/envios", label: "Envíos y entregas" },
  { href: "/cambios-y-devoluciones", label: "Cambios y devoluciones" },
  { href: "/garantias", label: "Garantías" },
  { href: "/arrepentimiento", label: "Botón de arrepentimiento" },
  { href: "/medios-de-pago", label: "Medios de pago" },
  { href: "/preguntas-frecuentes-legales", label: "Preguntas frecuentes" },
  { href: "/solicitudes-de-privacidad", label: "Solicitudes de privacidad" },
] as const;

export type LegalSection = { title: string; paragraphs?: string[]; items?: string[] };
export type LegalDocument = {
  slug: string;
  title: string;
  summary: string;
  sections: LegalSection[];
};

export const legalDocuments: Record<string, LegalDocument> = {
  "terminos-y-condiciones": {
    slug: "terminos-y-condiciones",
    title: "Términos y condiciones",
    summary: "Información aplicable al uso del catálogo y a las compras hechas en la tienda.",
    sections: [
      {
        title: "Identificación y alcance",
        paragraphs: [
          `Este sitio es operado bajo el nombre comercial ${siteConfig.name}, CUIT ${siteConfig.taxId}, con domicilio en ${siteConfig.legalAddress}. Estos términos regulan el uso del catálogo público y las solicitudes iniciadas desde la web.`,
        ],
      },
      {
        title: "Cómo se forma la compra",
        paragraphs: [
          "Podés comprar sin crear una cuenta. Al confirmar el pedido elegís cómo recibirlo (retiro en Independencia 784, entrega en la zona o Correo Argentino) y cómo pagarlo (Mercado Pago, transferencia o pago al retirar), entre las opciones disponibles en ese momento. Antes de confirmar ves el total con el envío incluido.",
          "Mientras esperamos el pago reservamos el stock durante el plazo que se informa al confirmar el pedido. Si el pago no llega en ese plazo, la reserva se libera. El pedido queda confirmado cuando se acredita el pago o, en el pago al retirar, cuando lo retirás y pagás. Te avisamos por mail cada cambio de estado del pedido.",
          "Esta modalidad no limita los derechos que correspondan una vez perfeccionada la compra.",
        ],
      },
      {
        title: "Información previa",
        items: [
          "Nombre, condición, precio publicado y disponibilidad orientativa del producto.",
          "Cantidad, subtotal, costo de envío y total final antes de confirmar.",
          "Costo de envío calculado según la zona o el tamaño del paquete y mostrado antes de pagar; nunca se informa como gratuito si no lo es.",
          "Garantía, cambios, devoluciones y canales de contacto accesibles antes de enviar la solicitud.",
        ],
      },
      {
        title: "Productos y compatibilidad",
        paragraphs: [
          "Los productos pueden ser nuevos, usados o reacondicionados y deben identificarse como tales. En placas, repuestos y accesorios técnicamente compatibles, el cliente debe comparar el código original o consultar con una fotografía. La consulta de compatibilidad no constituye una exclusión automática de responsabilidad.",
        ],
      },
      {
        title: "Errores de publicación",
        paragraphs: [
          "Si se detecta un error manifiesto de precio, descripción o disponibilidad, se informará antes de confirmar la operación. Chetech no se reserva una facultad arbitraria de cancelación y analizará cada situación respetando los derechos del consumidor.",
        ],
      },
      {
        title: "Facturación y contacto",
        paragraphs: [
          `Las operaciones se documentan mediante ${siteConfig.invoiceType}. La moneda de referencia es ${siteConfig.currency}. Para consultas: ${siteConfig.email} o WhatsApp ${siteConfig.phoneDisplay}.`,
        ],
      },
      {
        title: "Derechos, propiedad intelectual y privacidad",
        paragraphs: [
          "El contenido y la marca del sitio no pueden utilizarse de forma engañosa o no autorizada. El tratamiento de datos se rige por la Política de privacidad. Ninguna disposición de estos términos busca excluir derechos obligatorios de consumidores o titulares de datos.",
        ],
      },
    ],
  },
  privacidad: {
    slug: "privacidad",
    title: "Política de privacidad",
    summary: "Cómo se utilizan y protegen los datos vinculados con consultas, compras y servicios.",
    sections: [
      {
        title: "Responsable y contacto",
        paragraphs: [
          `El sitio utiliza el nombre comercial ${siteConfig.name}, CUIT ${siteConfig.taxId}, con domicilio en ${siteConfig.legalAddress}. Las consultas sobre datos personales pueden enviarse a ${siteConfig.email}.`,
        ],
      },
      {
        title: "Datos tratados actualmente",
        items: [
          "Datos de cuenta: nombre, apellido, correo, estado de verificación, teléfono opcional, fechas de registro y último acceso.",
          "Direcciones que el cliente decida guardar para entregas. Se puede comprar con retiro sin guardar una dirección.",
          "Pedidos, productos, cantidades, precios históricos, modalidad, contacto y observaciones incluidos al finalizar el carrito.",
          "Datos del pago que informa Mercado Pago (estado, monto y número de operación). La tienda no recibe los datos de tu tarjeta.",
          "Contenido del carrito guardado localmente y, para cuentas autenticadas, sincronizado con la cuenta para conservarlo entre dispositivos.",
          "Aceptación de términos y privacidad, y consentimiento comercial opcional con sus fechas y versiones.",
          "Número de teléfono, perfil y contenido de la conversación cuando el usuario continúa por WhatsApp.",
          "Nombre opcional, correo o WhatsApp y lo que buscás cuando te anotás para que te avisemos si entra un producto, una tele o una placa.",
          "Datos técnicos que Railway (servidores y base de datos) o servicios de seguridad puedan procesar, como dirección IP, navegador, cookies estrictamente necesarias y registros técnicos.",
        ],
      },
      {
        title: "Finalidades",
        items: [
          "Crear y proteger la cuenta, verificar el correo y recuperar el acceso.",
          "Conservar preferencias útiles, direcciones y carritos asociados al usuario.",
          "Registrar solicitudes de compra, mostrar su historial y coordinar pagos, entregas, reparaciones y garantías.",
          "Enviar comunicaciones transaccionales relacionadas con seguridad o pedidos.",
          "Enviar novedades comerciales únicamente cuando exista consentimiento opcional vigente.",
          "Gestionar solicitudes de consumidores y de privacidad.",
          "Prevenir abuso, mantener la seguridad, auditar acciones administrativas y cumplir obligaciones comerciales, fiscales y legales aplicables.",
        ],
      },
      {
        title: "Proveedores y transferencias",
        paragraphs: [
          "La infraestructura utiliza Railway (servidores y base de datos). Los pagos online se procesan en Mercado Pago. Los mails de la cuenta, de los pedidos y de los avisos se envían mediante Resend, que recibe la dirección de correo y el contenido de cada mail. Las conversaciones se realizan mediante WhatsApp/Meta. Estos proveedores pueden procesar información fuera de Argentina. Sus condiciones, ubicaciones y garantías contractuales deben revisarse periódicamente; no se comparten datos con fines publicitarios propios mientras no se active una herramienta de analítica o marketing con consentimiento.",
        ],
      },
      {
        title: "Conservación y seguridad",
        paragraphs: [
          "Los datos se conservan solo durante el tiempo necesario para la finalidad informada y las obligaciones comerciales, fiscales, legales o de prevención de fraude. Desactivar o solicitar la eliminación de una cuenta no borra automáticamente pedidos que deban conservarse; cuando corresponda se limitará el acceso o se anonimizarán datos. Se utilizan Supabase Auth, controles por rol, RLS, cifrado en tránsito y registro de acciones administrativas.",
        ],
      },
      {
        title: "Derechos y cuenta",
        paragraphs: [
          `Podés actualizar datos y direcciones desde Mi cuenta, retirar el consentimiento comercial o solicitar acceso, rectificación, desactivación o supresión mediante ${siteConfig.email} o el formulario de solicitudes de privacidad. Antes de entregar o eliminar información se verificará razonablemente la identidad, sin pedir documentación innecesaria.`,
        ],
      },
      {
        title: "Analítica y marketing futuro",
        paragraphs: [
          "Actualmente no se cargan Meta Pixel, Google Analytics ni publicidad personalizada. Si se incorporan, esta política y el panel de consentimiento se actualizarán antes de activarlos. No se registrará una apertura de WhatsApp como compra confirmada ni se enviarán direcciones, notas, contraseñas o datos sensibles a herramientas publicitarias.",
        ],
      },
    ],
  },
  cookies: {
    slug: "cookies",
    title: "Política de cookies y almacenamiento local",
    summary: "Tecnologías utilizadas actualmente por la tienda.",
    sections: [
      {
        title: "Situación actual",
        paragraphs: [
          "La tienda pública no utiliza actualmente cookies de analítica, marketing ni publicidad. Tampoco carga Google Analytics, Meta Pixel o herramientas de grabación de sesiones.",
        ],
      },
      {
        title: "Carrito local",
        paragraphs: [
          "El carrito se guarda en localStorage con la clave chetech-storefront-cart-v3. localStorage no es una cookie: es almacenamiento dentro del navegador. Contiene productos y cantidades para mantener la selección entre visitas, pero no guarda automáticamente nombre, correo, teléfono ni el mensaje enviado a WhatsApp. También se guarda en el navegador de dónde llegaste a la tienda (por ejemplo, una historia de Instagram) durante 30 días, para saber qué publicaciones traen visitas. No incluye datos personales.",
        ],
      },
      {
        title: "Cookies de sesión necesarias",
        paragraphs: [
          "Las cuentas de clientes y el panel administrativo utilizan cookies de sesión de Supabase estrictamente necesarias para iniciar sesión, renovar el acceso y proteger rutas privadas. No se utilizan con fines publicitarios y cerrar sesión elimina la sesión del navegador.",
        ],
      },
      {
        title: "Cambios futuros",
        paragraphs: [
          "Si se incorporan tecnologías no esenciales, se actualizará esta política y se solicitará consentimiento previo con opciones equivalentes para aceptar, rechazar o configurar. Rechazar no impedirá navegar ni comprar.",
        ],
      },
    ],
  },
  envios: {
    slug: "envios",
    title: "Envíos y entregas",
    summary: "Retiro en el local, entrega en la zona y envíos a todo el país.",
    sections: [
      {
        title: "Modalidades",
        items: [
          "Retiro sin costo en Independencia 784, Río Tercero, en el horario del local.",
          "Entrega en Río Tercero y zonas cercanas, con el costo de cada zona.",
          "Envío a todo el país por Correo Argentino.",
          "Retiro o entrega de equipos de servicio técnico sujeto a coordinación y cobertura.",
        ],
      },
      {
        title: "Costo y plazo",
        paragraphs: [
          "El costo del envío se calcula según la zona o el tamaño del paquete y se muestra antes de pagar. Cuando despachamos, te mandamos el número de seguimiento por mail. No se mostrará envío gratuito salvo que exista una condición comercial real y confirmada.",
        ],
      },
      {
        title: "Recepción",
        paragraphs: [
          "Al recibir el paquete, recomendamos revisar el estado exterior y comunicar cuanto antes cualquier faltante, producto distinto o daño de transporte, conservando fotografías y embalaje cuando sea posible. Esto facilita la gestión y no elimina derechos legales.",
        ],
      },
    ],
  },
  "cambios-y-devoluciones": {
    slug: "cambios-y-devoluciones",
    title: "Cambios y devoluciones",
    summary: "Canales y criterios para iniciar una solicitud.",
    sections: [
      {
        title: "Cómo solicitarlo",
        paragraphs: [
          `Escribinos a ${siteConfig.email} o al WhatsApp ${siteConfig.phoneDisplay} con el nombre, referencia de compra, producto y una descripción breve del inconveniente. No envíes el producto sin coordinar previamente la recepción.`,
        ],
      },
      {
        title: "Información útil",
        items: [
          "Estado del producto, accesorios y embalaje disponibles.",
          "Fotografías cuando exista daño, defecto o diferencia con lo comprado.",
          "Indicación de si fue una compra remota, retiro local o envío.",
        ],
      },
      {
        title: "Evaluación",
        paragraphs: [
          "Se analizarán productos defectuosos, distintos a lo comprado, daños de transporte y otras solicitudes según las circunstancias y derechos aplicables. Los costos, forma de devolución y reintegro se informarán antes de avanzar. No se aplican rechazos automáticos ni cláusulas absolutas.",
        ],
      },
      {
        title: "Compras remotas",
        paragraphs: [
          "El derecho de arrepentimiento se gestiona desde su formulario específico. La falta de embalaje o la apertura necesaria para revisar el producto no se utilizarán automáticamente para negar derechos; el estado concreto será evaluado de buena fe.",
        ],
      },
    ],
  },
  garantias: {
    slug: "garantias",
    title: "Garantías",
    summary: siteConfig.warrantyText,
    sections: [
      {
        title: "Mensaje general",
        paragraphs: [siteConfig.warrantyText, siteConfig.warrantyDetail],
      },
      {
        title: "Alcance particular",
        paragraphs: [
          "Las condiciones específicas dependen del tipo de operación: producto nuevo, usado, reacondicionado, repuesto, placa de televisor o reparación. Cuando corresponda, se informarán por escrito en la publicación, presupuesto, orden o comprobante.",
        ],
      },
      {
        title: "Cómo iniciar una gestión",
        paragraphs: [
          `Contactanos por ${siteConfig.email} o WhatsApp ${siteConfig.phoneDisplay}, indicando el producto o reparación, fecha aproximada y descripción del problema. No se inventan plazos, coberturas de fabricante ni reposiciones automáticas.`,
        ],
      },
      {
        title: "Derechos legales",
        paragraphs: [
          "Las condiciones comerciales particulares no eliminan garantías legales obligatorias ni impiden analizar fallas, productos diferentes o reparaciones que no respondan a lo acordado.",
        ],
      },
    ],
  },
  "medios-de-pago": {
    slug: "medios-de-pago",
    title: "Medios de pago y facturación",
    summary: "Cómo se puede pagar y cómo se documenta la compra.",
    sections: [
      {
        title: "Confirmación",
        paragraphs: [
          "Podés pagar con Mercado Pago, con transferencia bancaria o, si retirás en el local, al retirar, entre las opciones disponibles al confirmar el pedido. Los pagos con Mercado Pago se procesan en su plataforma: la tienda no ve ni guarda los datos de tu tarjeta.",
        ],
      },
      {
        title: "Importes",
        paragraphs: [
          `Los precios se expresan en ${siteConfig.currency}. El total que ves al confirmar, con el envío incluido, es el que pagás. Si se aplica un cupón o un descuento por transferencia, se muestra separado antes de pagar.`,
        ],
      },
      {
        title: "Facturación",
        paragraphs: [
          `Chetech informa condición fiscal ${siteConfig.fiscalCondition} y emite ${siteConfig.invoiceType} para documentar sus operaciones. El comprobante se entrega o pone a disposición del cliente.`,
        ],
      },
    ],
  },
};
