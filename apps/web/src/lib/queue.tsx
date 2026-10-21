import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  QUEUE_STORAGE_KEY,
  appendUnique,
  moveQueueItem,
  prependUnique,
} from "./queueUtils";

export type QueueItem = {
  id: number;
  title: string;
  thumbnailFile?: string | null;
  durationSeconds?: number | null;
};

type QueueStore = {
  items: QueueItem[];
  add: (item: QueueItem) => void;
  addNext: (item: QueueItem) => void;
  remove: (id: number) => void;
  move: (id: number, direction: -1 | 1) => void;
  clear: () => void;
  takeNext: () => void;
};

const STORAGE_KEY = QUEUE_STORAGE_KEY;

function readQueue(): QueueItem[] {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is QueueItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as QueueItem).id === "number" &&
        typeof (item as QueueItem).title === "string",
    );
  } catch {
    return [];
  }
}

const QueueContext = createContext<QueueStore | null>(null);

export function QueueProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<QueueItem[]>(readQueue);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // A queue is optional; private browsing may disable session storage.
    }
  }, [items]);

  const add = useCallback((item: QueueItem) => {
    setItems((current) => appendUnique(current, item));
  }, []);

  const addNext = useCallback((item: QueueItem) => {
    setItems((current) => prependUnique(current, item));
  }, []);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const move = useCallback((id: number, direction: -1 | 1) => {
    setItems((current) => moveQueueItem(current, id, direction));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const takeNext = useCallback(() => {
    setItems((current) => current.slice(1));
  }, []);

  const store = useMemo(
    () => ({ items, add, addNext, remove, move, clear, takeNext }),
    [items, add, addNext, remove, move, clear, takeNext],
  );

  return (
    <QueueContext.Provider value={store}>{children}</QueueContext.Provider>
  );
}

export function useQueue(): QueueStore {
  const store = useContext(QueueContext);
  if (!store) throw new Error("useQueue must be used inside QueueProvider");
  return store;
}
