export const siteConfig = {
  name: "Chetech",
  legalName: null,
  taxId: "20-42442917-2",
  fiscalCondition: "Monotributista",
  invoiceType: "Factura electrónica tipo C",
  currency: "Pesos argentinos (ARS)",
  description:
    "Tecnología, productos seleccionados y servicio técnico especializado en Río Tercero.",
  location: "Río Tercero, Córdoba",
  address: "Independencia 784",
  legalAddress: "Independencia 784, Río Tercero, Córdoba, Argentina",
  whatsapp: "5493571544683",
  phoneDisplay: "(3571) 544683",
  instagram: "https://instagram.com/chetechreparaciones",
  instagramHandle: "@chetechreparaciones",
  email: "chetech.reparaciones@gmail.com",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Independencia+784+Rio+Tercero+Córdoba",
  businessHours: [
    { label: "Lunes a viernes", value: "09:30 a 19:00" },
    { label: "Sábados", value: "10:00 a 12:30 y 16:00 a 20:00" },
    { label: "Domingos", value: "Cerrado" },
  ],
  openingHoursSpecification: [
    {
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:30",
      closes: "19:00",
    },
    { dayOfWeek: "Saturday", opens: "10:00", closes: "12:30" },
    { dayOfWeek: "Saturday", opens: "16:00", closes: "20:00" },
    { dayOfWeek: "Sunday", opens: "00:00", closes: "00:00" },
  ],
  shippingText: "Retiro gratis en Independencia 784.",
  warrantyText: "Garantía escrita en cada producto y en cada reparación.",
  warrantyDetail: "El plazo figura en la ficha de cada producto. Nunca es menor al que fija la Ley 24.240.",
  baseUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

export const navigation = [
  { href: "/productos", label: "Productos" },
  { href: "/productos?familia=para-tu-tele", label: "Para tu tele" },
  { href: "/servicio-tecnico", label: "Servicio técnico" },
  { href: "/cuenta/reparaciones", label: "Seguí tu reparación" },
  { href: "/contacto", label: "Contacto" },
];

export const tagline = "Arreglamos tu tele. Y tenemos todo para que la disfrutes.";
