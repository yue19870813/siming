import { useLayoutEffect, useRef, type ReactNode } from "react";
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus]");
    (
      first ??
      ref.current?.querySelector<HTMLElement>(
        "input, button, select, textarea",
      ) ??
      ref.current
    )?.focus();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <div className="editor-modal-backdrop">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="editor-modal"
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
          if (event.key === "Tab") {
            const controls = [
              ...(ref.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
              ) ?? []),
            ].filter((item) => !item.hidden);
            const first = controls[0];
            const last = controls.at(-1);
            if (!first) {
              event.preventDefault();
              return;
            }
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === ref.current)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
