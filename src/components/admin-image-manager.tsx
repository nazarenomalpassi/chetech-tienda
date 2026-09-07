"use client";

import { FormEvent, useState } from "react";
import { deleteProductImageAction } from "@/app/admin-actions";

type ProductImage = {
  id: string;
  public_url: string;
  alt_text: string;
  is_primary: boolean;
  sort_order: number;
};

export function AdminImageManager({
  productId,
  images,
}: {
  productId: string;
  images: ProductImage[];
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("productId", productId);
    data.set("isPrimary", data.get("isPrimary") === "on" ? "true" : "false");
    try {
      const response = await fetch("/api/admin/products/images", { method: "POST", body: data });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "No pudimos cargar la imagen.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No pudimos cargar la imagen.");
      setPending(false);
    }
  }
  return (
    <section className="admin-image-manager">
      <h2>Galería de imágenes</h2>
      <form onSubmit={upload}>
        <label>
          Archivo
          <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
        </label>
        <label>
          Texto alternativo
          <input name="alt" maxLength={200} required placeholder="Descripción breve de la imagen" />
        </label>
        <label className="check-row">
          <input type="checkbox" name="isPrimary" defaultChecked={!images.length} /> Imagen
          principal
        </label>
        {message && <p className="form-message error">{message}</p>}
        <button className="button secondary" disabled={pending}>
          {pending ? "Cargando…" : "Cargar imagen"}
        </button>
      </form>
      <div className="admin-image-list">
        {images.map((image) => (
          <article key={image.id}>
            <div
              className="admin-image-preview"
              role="img"
              aria-label={image.alt_text}
              style={{ backgroundImage: `url("${image.public_url.replace(/["\\\r\n]/g, "")}")` }}
            />
            <div>
              <strong>{image.is_primary ? "Principal" : `Orden ${image.sort_order + 1}`}</strong>
              <span>{image.alt_text}</span>
            </div>
            <form action={deleteProductImageAction}>
              <input type="hidden" name="id" value={image.id} />
              <input type="hidden" name="productId" value={productId} />
              <button className="text-button danger">Eliminar</button>
            </form>
          </article>
        ))}
        {!images.length && <p>Todavía no hay imágenes cargadas.</p>}
      </div>
    </section>
  );
}
