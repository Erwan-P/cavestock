"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";

export function WineContextMenu({ x, y, onEdit, onClose, onRestoreFocus }: {
  x: number; y: number; onEdit: () => void; onClose: () => void; onRestoreFocus: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const close = () => closeRef.current();
    function outside(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [x, y]);

  return createPortal(<div ref={menuRef} className="wine-context-menu" role="menu" aria-label="Actions sur ce vin"
    style={{ left: Math.max(8, Math.min(x, window.innerWidth - 188)), top: Math.max(8, Math.min(y, window.innerHeight - 60)) }}
    onContextMenu={(event) => event.preventDefault()}
    onKeyDown={(event) => {
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault(); event.stopPropagation(); onClose(); onRestoreFocus();
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault(); menuRef.current?.querySelector("button")?.focus();
      }
    }}>
    <button type="button" role="menuitem" onClick={onEdit}><Pencil size={15} aria-hidden="true" />Modifier</button>
  </div>, document.body);
}
