import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "./icons";

export type MenuItem = { value: string; label: string; detail?: string };

type Props = {
  label: ReactNode;
  icon?: ReactNode;
  items: MenuItem[];
  selected: string;
  onSelect: (value: string) => void;
  pill?: boolean;
  title?: string;
};

/** A button in the composer that opens a list above it. Closes on Escape or a click outside. */
export default function Menu({ label, icon, items, selected, onSelect, pill, title }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className={pill ? "control pill" : "control"}
        title={title}
        onClick={() => setOpen(!open)}
      >
        {icon}
        <span className="control-label">{label}</span>
        <ChevronDown />
      </button>
      {open && (
        <div className="menu-list" role="listbox">
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={item.value === selected}
              className={item.value === selected ? "menu-item selected" : "menu-item"}
              onClick={() => {
                onSelect(item.value);
                setOpen(false);
              }}
            >
              <span>{item.label}</span>
              {item.detail && <span className="menu-detail">{item.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
