import { createContext, useCallback, useContext, useRef, type ReactNode, type RefObject } from 'react';

export interface RegisteredWidget {
  id: string;
  title: string;
  ref: RefObject<HTMLElement | null>;
}

interface WidgetExportRegistry {
  register: (widget: RegisteredWidget) => void;
  unregister: (id: string) => void;
  /** Snapshot of currently-registered widgets, in registration order. */
  list: () => RegisteredWidget[];
}

const WidgetExportRegistryContext = createContext<WidgetExportRegistry | null>(null);

/**
 * Holds the set of exportable widgets currently mounted inside one tab, so a
 * single "export tab as PDF" button can rasterize all of them without each
 * widget needing to know about the others. Order is insertion order, which
 * matches DOM/visual order since widgets register on mount.
 */
export function WidgetExportRegistryProvider({ children }: { children: ReactNode }) {
  const widgetsRef = useRef<Map<string, RegisteredWidget>>(new Map());

  const register = useCallback((widget: RegisteredWidget) => {
    widgetsRef.current.set(widget.id, widget);
  }, []);

  const unregister = useCallback((id: string) => {
    widgetsRef.current.delete(id);
  }, []);

  const list = useCallback(() => [...widgetsRef.current.values()], []);

  return (
    <WidgetExportRegistryContext.Provider value={{ register, unregister, list }}>
      {children}
    </WidgetExportRegistryContext.Provider>
  );
}

/** Returns null outside a provider — widgets used standalone just skip registration. */
export function useWidgetExportRegistry(): WidgetExportRegistry | null {
  return useContext(WidgetExportRegistryContext);
}
