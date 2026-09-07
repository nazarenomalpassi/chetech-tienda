"use client";

import Image from "next/image";
import { useState } from "react";

type ProductGalleryProps = {
  images: string[];
  name: string;
};

export function ProductGallery({ images, name }: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const selectedImage = images[selectedIndex];
  const markImageFailed = (image: string) => {
    setFailedImages((current) => {
      const next = new Set(current);
      next.add(image);
      return next;
    });
  };

  return (
    <div className="gallery">
      <div className="main-image">
        {selectedImage && !failedImages.has(selectedImage) ? (
          <Image
            key={selectedImage}
            src={selectedImage}
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
            alt={name}
            onError={() => markImageFailed(selectedImage)}
          />
        ) : (
          <div className="product-placeholder" aria-label="Producto Chetech sin fotografía">
            <span>CHETECH</span>
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="product-gallery-thumbnails" aria-label={`Imágenes de ${name}`}>
          {images.map((image, index) => (
            <button
              className={index === selectedIndex ? "active" : undefined}
              type="button"
              key={image}
              onClick={() => setSelectedIndex(index)}
              aria-label={`Ver imagen ${index + 1} de ${images.length}`}
              aria-pressed={index === selectedIndex}
            >
              {failedImages.has(image) ? (
                <span className="product-thumbnail-placeholder" aria-hidden="true">
                  CT
                </span>
              ) : (
                <Image
                  src={image}
                  fill
                  sizes="96px"
                  alt=""
                  onError={() => markImageFailed(image)}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
