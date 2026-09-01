"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type WorkspaceSection = "workspace" | "journal" | "export";

interface TravelWorkspaceNavProps {
  travelId: string;
}

function sectionFromPath(pathname: string, travelId: string): WorkspaceSection {
  if (pathname.startsWith(`/travel/${travelId}/journal`)) return "journal";
  if (pathname.startsWith(`/travel/${travelId}/export`)) return "export";
  return "workspace";
}

const LINKS: { id: WorkspaceSection; href: (id: string) => string; label: string }[] = [
  { id: "workspace", href: (id) => `/travel/${id}`, label: "Recuerdos" },
  { id: "journal", href: (id) => `/travel/${id}/journal`, label: "Crónica" },
  { id: "export", href: (id) => `/travel/${id}/export`, label: "Exportar" },
];

export default function TravelWorkspaceNav({ travelId }: TravelWorkspaceNavProps) {
  const pathname = usePathname();
  const active = sectionFromPath(pathname, travelId);

  return (
    <nav aria-label="Secciones del viaje" className="nav-track">
      {LINKS.map((link) => {
        const isActive = active === link.id;
        return (
          <Link
            key={link.id}
            href={link.href(travelId)}
            className={`nav-pill ${isActive ? "nav-pill-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
