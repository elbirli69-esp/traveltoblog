"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { peekPendingShareId } from "@/lib/share-client";

export default function PendingShareBanner() {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(Boolean(peekPendingShareId()));
  }, []);

  if (!pending) return null;

  return (
    <div className="callout callout-success mb-6 text-sm">
      <p className="font-medium">Tienes fotos compartidas pendientes.</p>
      <p className="mt-1 text-fg-secondary">
        Ábrelo o actívalo y se añadirán a ese viaje. También puedes{" "}
        <Link href="/share/receive" className="link-accent">
          elegir el viaje
        </Link>
        .
      </p>
    </div>
  );
}
