"use client";

import { cloneElement, isValidElement, useState, type ReactElement } from "react";

export default function Modal({
  triggerLabel,
  title,
  maxWidth = "max-w-3xl",
  children,
}: {
  triggerLabel: string;
  title: string;
  maxWidth?: string;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
      >
        {triggerLabel}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            className={`max-h-[90vh] w-full ${maxWidth} overflow-y-auto rounded-lg bg-white p-6 shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              <button type="button" onClick={close} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                ✕
              </button>
            </div>
            {isValidElement(children) ? cloneElement(children, { onSuccess: close } as object) : children}
          </div>
        </div>
      )}
    </>
  );
}
