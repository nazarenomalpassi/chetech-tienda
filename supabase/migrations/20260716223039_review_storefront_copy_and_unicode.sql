-- Copy review for the 177 products present at the time of migration.
-- Public titles are intentionally independent from the administrative source
-- name so later price/stock syncs cannot undo reviewed spelling and casing.

alter table public.storefront_products
  add column if not exists source_name text not null default '',
  add column if not exists name_status text not null default 'pending_review',
  add column if not exists name_reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.storefront_products'::regclass
      and conname = 'storefront_products_name_status_check'
  ) then
    alter table public.storefront_products
      add constraint storefront_products_name_status_check
      check (name_status in ('pending_review','manually_reviewed'));
  end if;
end
$$;

create temporary table reviewed_storefront_titles (
  sku text primary key,
  reviewed_name text not null check (btrim(reviewed_name) <> '')
) on commit drop;

insert into reviewed_storefront_titles (sku, reviewed_name) values
  ('ADA-001', 'Adaptador universal viajero con USB y USB-C'),
  ('ADA-002', 'Receptor Bluetooth Jahro'),
  ('ADA-003', 'Adaptador Bluetooth Karsen Smart Car para auto'),
  ('ADA-004', 'Adaptador auxiliar a USB-C'),
  ('ADA-005', 'Adaptador de red Wi-Fi USB de 300 Mbps'),
  ('ADA-006', 'Receptor Bluetooth Jahro'),
  ('AUR-001', 'Auricular gamer Noga Hydra'),
  ('AUR-002', 'Auricular gamer Noga Stormer NG-8620'),
  ('AUR-003', 'Auricular Bluetooth Noga Aris NG-920BT'),
  ('AUR-004', 'Auricular Samsung AKG con caja'),
  ('AUR-005', 'Auricular Bluetooth InPods 12'),
  ('AUR-006', 'Auricular Bluetooth E9S Pro'),
  ('AUR-007', 'Auricular Samsung Dolby blanco'),
  ('AUR-008', 'Auricular Bluetooth infantil con funda'),
  ('AUR-009', 'Auricular Bluetooth transparente'),
  ('AUR-010', 'Auricular Bluetooth con vincha y diseño de personajes'),
  ('AUR-011', 'Auricular Bluetooth Noga Twins 50'),
  ('AUR-012', 'Auricular Samsung AKG USB-C'),
  ('AUR-013', 'Auricular Bluetooth Y08'),
  ('AUR-014', 'Auricular Karsen Mars USB-C'),
  ('AUR-015', 'Auricular Malibu M4'),
  ('AUR-016', 'Auricular Noga NG-1600'),
  ('AUR-017', 'Samsung Galaxy Buds2 Pro'),
  ('AUR-018', 'Apple AirPods Pro'),
  ('AUR-019', 'Auricular Foxbox Boost Pulse'),
  ('AUR-020', 'Auricular Foxbox Link 2 USB-C'),
  ('AUR-021', 'Auricular inalámbrico Foxbox Boost Force 2'),
  ('CAB-001', 'Conversor VGA a HDMI Jahro'),
  ('CAB-002', 'Adaptador HDMI hembra a HDMI hembra Dinax'),
  ('CAB-003', 'Adaptador Micro-USB a USB-C Karsen'),
  ('CAB-004', 'Adaptador universal viajero con USB y USB-C'),
  ('CAB-005', 'Luces de Navidad de alambre LED'),
  ('CAB-006', 'Cable auxiliar de 1,5 m'),
  ('CAB-007', 'Cable auxiliar a 2 AV Noga de 1,8 m'),
  ('CAB-008', 'Cable auxiliar a RCA Feimasi de 1,5 m'),
  ('CAB-009', 'Cable PS3 5'),
  ('CAB-010', 'Cable de red Noga de 2 m'),
  ('CAB-011', 'Cable extensor auxiliar Noga de 3 m'),
  ('CAB-012', 'Cable HDMI mallado de 1,5 m'),
  ('CAB-013', 'Cable HDMI mallado Vapex de 3 m'),
  ('CAB-014', 'Cable HDMI Seisa de 10 m'),
  ('CAB-015', 'Cable Micro-USB Otawa de 30 W'),
  ('CAB-016', 'Cable Mini HDMI a HDMI de 1,5 m'),
  ('CAB-017', 'Cable óptico de 3 m'),
  ('CAB-018', 'Cable de alimentación interlock de 1,8 m'),
  ('CAB-019', 'Cable de alimentación interlock de 1,5 m'),
  ('CAB-020', 'Cable USB-C a USB-C Hytoshy de 60 W'),
  ('CAB-021', 'Cable USB-C a USB-C para Apple'),
  ('CAB-022', 'Cable Micro-USB Samsung'),
  ('CAB-023', 'Cable para batería de auto'),
  ('CAB-024', 'Cable USB certificado para iPhone 5 de 1 m'),
  ('CAB-025', 'Cable de alimentación interlock trébol'),
  ('CAB-026', 'Conversor HDMI a VGA'),
  ('CAB-028', 'Cable USB-C a USB-C Karsen'),
  ('CAB-029', 'Cable Samsung USB a USB-C'),
  ('CAB-030', 'Adaptador Bluetooth 5.4 TP-Link'),
  ('CAB-031', 'Adaptador de iPhone a auxiliar Karsen'),
  ('CAB-032', 'Cable USB a USB-C Alo'),
  ('CAB-033', 'Conversor AV a HDMI Jahro'),
  ('CAB-034', 'Conversor HDMI a AV Jahro'),
  ('CAB-035', 'Cable USB-C Foxbox Prism de 1,5 m'),
  ('CAB-036', 'Cable LCD Display Foxbox Pixel USB-C de 100 W'),
  ('CAB-037', 'Cable magnético Foxbox Loop USB-C de 60 W'),
  ('CAB-038', 'Cable 4 en 1 USB, USB-C y iPhone'),
  ('CAB-039', 'Cable Ethernet Jahro de 15 m'),
  ('CAB-040', 'Cable USB a USB-C Spring'),
  ('CAR-001', 'Cargador universal para notebook Otawa – Karsen'),
  ('CAR-002', 'Fuente Jahro de 9 V y 1 A'),
  ('CAR-003', 'Cargador USB Noga NG-5900 para pilas'),
  ('CAR-004', 'Cargador Otawa con doble USB (base)'),
  ('CAR-005', 'Cargador USB certificado para Apple (base)'),
  ('CAR-006', 'Fuente Jahro de 5 V y 2 A'),
  ('CAR-007', 'Cargador USB-C Apple certificado de 20 W'),
  ('CAR-008', 'Cargador inalámbrico MagSafe'),
  ('CAR-009', 'Cargador Bulltec USB-C de carga rápida'),
  ('CAR-010', 'Cargador Samsung USB-C PD de 25 W'),
  ('CAR-011', 'Cargador Motorola de 68 W con cable USB-C'),
  ('CAR-012', 'Cargador para auto Karsen Atomic USB-C de 38 W'),
  ('CAR-014', 'Cargador Otawa USB-C de 30 W (base)'),
  ('CAR-015', 'Fuente Jahro de 12 V y 2 A'),
  ('CAR-016', 'Batería externa para iPhone'),
  ('CAR-017', 'Batería externa Xiaomi'),
  ('CAR-018', 'Power bank Lambotech de 10.000 mAh'),
  ('CAR-019', 'Fuente Alo Pocket de 15 W'),
  ('CAR-020', 'Fuente Xienam Auro de 15 W con USB y USB-C'),
  ('FRE-001', 'Freidora de aire Suono'),
  ('FRE-002', 'Freidora de aire Siam de 15 L'),
  ('ILU-001', 'Luz de emergencia Hytoshy de 30 LED'),
  ('ILU-003', 'Tira LED USB de 2 m'),
  ('ILU-004', 'Tira de neón blanca'),
  ('ILU-005', 'Tira de neón multicolor'),
  ('ILU-006', 'Linterna vincha'),
  ('PAR-001', 'Parlante Bluetooth Malibu MS-1954BT 6,5" x 2'),
  ('PAR-002', 'Parlante Bluetooth Malibu MS-2055BT 8" x 2'),
  ('PAR-003', 'Parlante Bluetooth Noga NG-BT620'),
  ('PAR-004', 'Parlante Bluetooth SH-309'),
  ('PAR-005', 'Parlante Noga para ducha'),
  ('PAR-006', 'Parlante para PC Genius SP-HF280'),
  ('PAR-007', 'Parlante mini para PC Noga NG-106'),
  ('PAR-009', 'Parlante portátil JD E300 Bluetooth de 30 W'),
  ('PAR-010', 'Parlante portátil LDNIO BTS12'),
  ('PEN-001', 'Pendrive Kingston de 64 GB'),
  ('PEN-002', 'Pendrive SanDisk de 128 GB USB 2.0'),
  ('PEN-003', 'Pendrive SanDisk de 32 GB'),
  ('PIL-001', 'Pilas recargables AA Noga x 2'),
  ('PIL-002', 'Pilas recargables AAA Noga x 2'),
  ('PIL-003', 'Pila Energizer CR2016 (precio por unidad)'),
  ('PIL-004', 'Pila Energizer CR2025 (precio por unidad)'),
  ('PIL-005', 'Pila Maxell CR2032 (precio por unidad)'),
  ('PIL-006', 'Batería Energizer 522 de 9 V'),
  ('PIL-007', 'Pila Energizer A23 (precio por unidad)'),
  ('PIL-008', 'Pila Energizer A27'),
  ('PIL-009', 'Pilas Energizer AA E91 x 2 (precio por unidad)'),
  ('PIL-010', 'Pilas Energizer AAA E92 x 2 (precio por unidad)'),
  ('PIL-011', 'Pila Energizer AZ13 (precio por unidad)'),
  ('PIL-012', 'Pila Energizer AZ312'),
  ('PIL-013', 'Pilas Energizer C E93 x 2 (precio por unidad)'),
  ('PIL-014', 'Pilas Energizer D E95 x 2 (precio por unidad)'),
  ('PIL-015', 'Pilas Eveready AA 1215 x 2 (precio por unidad)'),
  ('PIL-016', 'Pilas Eveready AAA 1212 x 2 (precio por unidad)'),
  ('PIL-017', 'Adhesivo Fastix transparente de 25 g'),
  ('PIL-018', 'Adhesivo La Gotita de 2 ml'),
  ('PIL-019', 'Adhesivo Poxirán de 23 ml'),
  ('PIL-020', 'Pila Vinnic LR44'),
  ('TEC-001', 'Micrófono dinámico Noga NG-MI98'),
  ('TEC-003', 'Micrófono Noga NG-MI120C'),
  ('TEC-004', 'Mouse Noga Stormer Wind de 3500 DPI'),
  ('TEC-005', 'Mouse óptico Genius DX-110'),
  ('TEC-006', 'Mouse óptico Noganet'),
  ('TEC-007', 'Teclado retroiluminado Noga NKB-560'),
  ('TEC-008', 'Teclado Genius KB-117'),
  ('TEC-010', 'Mouse inalámbrico Genius'),
  ('TEC-012', 'Mouse inalámbrico Genius NX-7009'),
  ('TEC-013', 'Teclado Genius KB-113'),
  ('TEC-014', 'Teclado Noga Stormer T100'),
  ('TEC-015', 'Teclado inalámbrico Bluetooth Noga Q10'),
  ('TEC-016', 'Joystick para PS3'),
  ('TEC-017', 'Mousepad Noga 23 x 20'),
  ('VAR-002', 'Hub USB 3.0 Noga'),
  ('VAR-004', 'Prolongador negro de 6 tomas con USB'),
  ('VAR-005', 'Prolongador múltiple TRV'),
  ('VAR-006', 'Radio retro Bluetooth Yuegan'),
  ('VAR-007', 'Soporte móvil para TV de 14" a 55"'),
  ('VAR-008', 'Soporte fijo para TV de 26" a 63"'),
  ('VAR-009', 'TV Stick'),
  ('VAR-010', 'Ventilador retráctil Hytoshy'),
  ('VAR-011', 'Zapatilla múltiple con luz'),
  ('VAR-012', 'Minisellador de bolsas'),
  ('VAR-013', 'Ventilador Hytoshy 3 en 1'),
  ('VAR-014', 'ONN Full HD'),
  ('VAR-015', 'Control remoto para TV'),
  ('VAR-017', 'Mouse Redragon King 1K'),
  ('VAR-018', 'Adaptador multipuerto'),
  ('VAR-019', 'Soporte móvil Hytoshy para TV'),
  ('VAR-021', 'Minipimer Naifeo de 300 W'),
  ('VAR-022', 'Set de 3 pinzas Julei'),
  ('VAR-023', 'Placa'),
  ('VAR-024', 'Pava eléctrica Tokyo / Oryx'),
  ('VAR-025', 'Joystick para PS4'),
  ('VAR-026', 'Caloventor Hytoshy de 2000 W'),
  ('VAR-027', 'Estufa infrarroja Hytoshy'),
  ('VAR-028', 'Soporte fijo para TV de 40" a 80"'),
  ('VAR-029', 'Funda para iPhone'),
  ('VAR-030', 'Camiseta de Argentina'),
  ('VAR-031', 'ONN 4K'),
  ('VAR-032', 'Soporte genérico Bracket Anchor para auto'),
  ('VAR-033', 'Soporte magnético MagSafe para auto'),
  ('VAR-034', 'Secador de pelo Bulltec Turbo Aero Lux'),
  ('VAR-035', 'Secador de pelo plegable Bulltec Tiny Air'),
  ('VAR-036', 'Linterna minera Headlamp de 5 lámparas'),
  ('VAR-037', 'Abridor de cerveza'),
  ('VAR-038', 'Grips para joystick PS4, PS5 y Xbox'),
  ('VAR-039', 'Soporte fijo para TV de 46" a 100"'),
  ('VAR-041', 'Reloj Foxbox Neutron 4.0'),
  ('VAR-042', 'Reloj Foxbox Neutron 3.0'),
  ('VAR-043', 'Reloj Foxbox Axia'),
  ('VAR-044', 'Reloj Foxbox Essence');

do $$
begin
  if exists (
    select 1
    from public.storefront_products p
    left join reviewed_storefront_titles r on r.sku = p.sku
    where r.sku is null
  ) then
    raise exception 'La revisión de títulos no cubre todos los productos públicos.';
  end if;

  if exists (
    select 1
    from reviewed_storefront_titles r
    left join public.storefront_products p on p.sku = r.sku
    where p.sku is null
  ) then
    raise exception 'La revisión contiene un SKU que no existe en el catálogo público.';
  end if;
end
$$;

alter table public.storefront_products
  drop constraint if exists storefront_products_availability_label_check;

update public.storefront_products d
set availability_label = case
      when not p.is_active or p.stock <= 0 then 'Sin stock'
      when p.stock <= greatest(p.min_stock, 1) then 'Últimas unidades'
      else 'Disponible'
    end,
    source_name = p.name,
    updated_at = now()
from public.products p
where p.id = d.product_id;

alter table public.storefront_products
  add constraint storefront_products_availability_label_check
  check (availability_label in ('Disponible','Últimas unidades','Sin stock','Consultar disponibilidad'));

create or replace function private.storefront_reviewed_description(product_title text, category_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case category_title
    when 'Adaptadores' then format('%s es una solución práctica para ampliar o convertir conexiones entre dispositivos. Consultanos antes de comprar para confirmar conectores, compatibilidad, presentación y disponibilidad actual.', product_title)
    when 'Auriculares' then format('%s es una alternativa de audio para el uso cotidiano. Consultanos antes de comprar para confirmar conexión, compatibilidad, presentación, contenido de la caja y disponibilidad actual.', product_title)
    when 'Cables' then format('%s está pensado para resolver conexiones de uso cotidiano. Consultanos antes de comprar para confirmar terminales, longitud, compatibilidad, presentación y disponibilidad actual del producto.', product_title)
    when 'Cargadores' then format('%s es una opción para alimentar o recargar equipos compatibles. Consultanos antes de comprar para confirmar potencia, conectores, compatibilidad, contenido de la caja y disponibilidad actual.', product_title)
    when 'Freidoras' then format('%s es un electrodoméstico pensado para sumar practicidad a la cocina. Consultanos antes de comprar para confirmar capacidad, funciones, medidas, contenido de la caja y disponibilidad actual.', product_title)
    when 'Iluminación' then format('%s es una opción de iluminación para distintos espacios y usos. Consultanos antes de comprar para confirmar alimentación, medidas, presentación, accesorios incluidos y disponibilidad actual.', product_title)
    when 'Parlantes' then format('%s es una alternativa de audio para el uso cotidiano. Consultanos antes de comprar para confirmar conexión, potencia, medidas, contenido de la caja y disponibilidad actual.', product_title)
    when 'Pendrives' then format('%s es una opción práctica para guardar y trasladar archivos. Consultanos antes de comprar para confirmar capacidad, interfaz, compatibilidad, presentación y disponibilidad actual.', product_title)
    when 'Pilas y Baterías' then format('%s es una opción para equipos que utilizan ese formato de alimentación. Consultanos antes de comprar para confirmar medida, presentación, cantidad incluida, compatibilidad y disponibilidad actual.', product_title)
    when 'Teclados y Mouse' then format('%s es un accesorio pensado para acompañar el uso diario de computadoras y otros equipos compatibles. Consultanos antes de comprar para confirmar conexión, compatibilidad, presentación y disponibilidad actual.', product_title)
    else format('%s es un producto disponible en el catálogo de Chetech. Consultanos antes de comprar para confirmar características, presentación, contenido de la caja, compatibilidad cuando corresponda y disponibilidad actual.', product_title)
  end;
$$;

revoke all on function private.storefront_reviewed_description(text, text) from public, anon, authenticated;

update public.storefront_products d
set name = r.reviewed_name,
    name_status = 'manually_reviewed',
    name_reviewed_at = now(),
    short_description = private.storefront_reviewed_description(r.reviewed_name, d.category_name),
    description = private.storefront_reviewed_description(r.reviewed_name, d.category_name),
    description_status = 'manually_reviewed',
    description_reviewed_at = now(),
    seo_title = r.reviewed_name,
    seo_description = private.storefront_reviewed_description(r.reviewed_name, d.category_name),
    updated_at = now()
from reviewed_storefront_titles r
where r.sku = d.sku;

-- Correct UTF-8 generator for products created after this reviewed batch.
create or replace function private.storefront_generated_description(product_name text, category_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select format(
    'Encontrá %s en Chetech. Consultanos para confirmar sus características, presentación y compatibilidad antes de comprar. La disponibilidad y el precio se verifican al momento de preparar el pedido.',
    btrim(coalesce(product_name, 'este producto'))
  );
$$;

create or replace function private.sync_storefront_product_from_source()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category_name text;
  v_category_slug text;
  v_description text;
begin
  select coalesce(nullif(btrim(c.name), ''), 'Otros'),
         coalesce(nullif(btrim(c.slug), ''), 'otros')
    into v_category_name, v_category_slug
  from public.categories c
  where c.id = new.category_id;

  v_category_name := coalesce(v_category_name, 'Otros');
  v_category_slug := coalesce(v_category_slug, 'otros');

  if nullif(btrim(new.name), '') is not null
     and nullif(btrim(new.sku), '') is not null
     and new.sale_price > 0
     and new.stock > 0
     and new.is_active then
    v_description := private.storefront_generated_description(new.name, v_category_name);

    insert into public.storefront_products (
      product_id, slug, sku, source_name, name, name_status,
      short_description, description, description_status, description_generated_at,
      category_name, category_slug, public_price,
      availability_label, is_published, published_at
    ) values (
      new.id,
      private.storefront_slugify(new.name) || '-' || private.storefront_slugify(new.sku),
      new.sku,
      new.name,
      new.name,
      'pending_review',
      v_description,
      v_description,
      'generated',
      now(),
      v_category_name,
      v_category_slug,
      new.sale_price,
      case when new.stock <= greatest(new.min_stock, 1) then 'Últimas unidades' else 'Disponible' end,
      true,
      now()
    )
    on conflict (sku) do update set
      product_id = excluded.product_id,
      source_name = excluded.source_name,
      name = case
        when public.storefront_products.name_status = 'manually_reviewed'
          then public.storefront_products.name
        else excluded.name
      end,
      name_status = case
        when public.storefront_products.name_status = 'manually_reviewed'
          then public.storefront_products.name_status
        else 'pending_review'
      end,
      name_reviewed_at = case
        when public.storefront_products.name_status = 'manually_reviewed'
          then public.storefront_products.name_reviewed_at
        else null
      end,
      category_name = excluded.category_name,
      category_slug = excluded.category_slug,
      public_price = excluded.public_price,
      availability_label = excluded.availability_label,
      is_published = true,
      published_at = coalesce(public.storefront_products.published_at, excluded.published_at),
      short_description = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.short_description
        else excluded.short_description
      end,
      description = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.description
        else excluded.description
      end,
      description_status = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.description_status
        else 'generated'
      end,
      description_generated_at = case
        when public.storefront_products.description_status = 'manually_reviewed'
          then public.storefront_products.description_generated_at
        else now()
      end,
      updated_at = now();
  else
    update public.storefront_products
    set source_name = new.name,
        availability_label = 'Sin stock',
        is_published = false,
        updated_at = now()
    where product_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.storefront_generated_description(text, text) from public, anon, authenticated;
revoke all on function private.sync_storefront_product_from_source() from public, anon, authenticated;
