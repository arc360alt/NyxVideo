import type { ReactNode } from 'react';
import { FiX } from 'react-icons/fi';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export function Modal({ title, onClose, children, width = 420 }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] flex-col rounded-lg border border-border bg-surface-0 shadow-2xl"
        style={{ width }}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <button onClick={onClose} className="text-fg-faint hover:text-fg">
            <FiX size={16} />
          </button>
        </div>
        <div className="nyx-scroll overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
