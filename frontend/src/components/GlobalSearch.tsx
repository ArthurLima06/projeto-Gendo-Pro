import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  search,
  type GlobalSearchItem,
  type GlobalSearchResponse,
} from "@/services/searchService";

type SearchGroupKey = keyof GlobalSearchResponse;

const SEARCH_GROUPS: Array<{ key: SearchGroupKey; label: string }> = [
  { key: "patients", label: "Pacientes" },
  { key: "appointments", label: "Agendamentos" },
  { key: "records", label: "Prontuarios" },
  { key: "payments", label: "Financeiro" },
  { key: "reports", label: "Relatorios" },
  { key: "pages", label: "Paginas" },
];

const EMPTY_RESULTS: GlobalSearchResponse = {
  patients: [],
  appointments: [],
  records: [],
  payments: [],
  reports: [],
  pages: [],
};

export default function GlobalSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [results, setResults] = useState<GlobalSearchResponse>(EMPTY_RESULTS);

  useEffect(() => {
    setDebouncedQuery(query.trim());
  }, [query]);

  useEffect(() => {
    console.log("QUERY STATE UPDATED:", query);
  }, [query]);

  useEffect(() => {
    if (!query) return;

    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        console.log("SEARCH RESPONSE:", data);
      })
      .catch((error) => {
        console.error("SEARCH ERROR:", error);
      });
  }, [query]);

  useEffect(() => {
    console.log("DebouncedQuery:", debouncedQuery);

    if (!debouncedQuery) {
      console.log("No query, skipping search");
      setResults(EMPTY_RESULTS);
      setErrorMessage("");
      setIsLoading(false);
      setActiveIndex(-1);
      return;
    }

    console.log("Calling search API");

    setIsLoading(true);
    setErrorMessage("");
    setResults(EMPTY_RESULTS);

    search(debouncedQuery)
      .then((response) => {
        console.log("Search response received:", response);
        setResults(response);
        setIsOpen(true);
      })
      .catch((error) => {
        console.error("Search error:", error);
        setResults(EMPTY_RESULTS);
        setErrorMessage(
          error instanceof Error ? error.message : "Erro ao buscar resultados."
        );
        setIsOpen(true);
      })
      .finally(() => {
        console.log("Search finished");
        setIsLoading(false);
      });
  }, [debouncedQuery]);

  const groupedResults = useMemo(() => {
    let runningIndex = 0;
    return SEARCH_GROUPS.map((group) => ({
      ...group,
      items: results[group.key].map((item) => ({
        item,
        index: runningIndex++,
      })),
    })).filter((group) => group.items.length > 0);
  }, [results]);

  const flatResults = useMemo(
    () => groupedResults.flatMap((group) => group.items.map((entry) => entry.item)),
    [groupedResults]
  );

  useEffect(() => {
    if (!debouncedQuery) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex(flatResults.length > 0 ? 0 : -1);
  }, [debouncedQuery, flatResults.length]);

  const hasResults = flatResults.length > 0;
  const shouldShowDropdown = isOpen && query.trim().length > 0;

  const closeDropdown = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleSelect = (item: GlobalSearchItem) => {
    navigate(item.path);
    setQuery("");
    closeDropdown();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown();
      return;
    }

    if (!shouldShowDropdown && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setIsOpen(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!flatResults.length) return;
      setActiveIndex((prev) => {
        if (prev < 0) return 0;
        return Math.min(prev + 1, flatResults.length - 1);
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!flatResults.length) return;
      setActiveIndex((prev) => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
      return;
    }

    if (event.key === "Enter" && shouldShowDropdown && activeIndex >= 0) {
      event.preventDefault();
      const selected = flatResults[activeIndex];
      if (selected) {
        handleSelect(selected);
      }
    }
  };

  const handleBlurCapture = (event: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && containerRef.current?.contains(nextTarget)) {
      return;
    }
    closeDropdown();
  };

  return (
    <div
      ref={containerRef}
      className="relative w-64"
      onBlurCapture={handleBlurCapture}
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        placeholder="Buscar..."
        value={query}
        onChange={(event) => {
          const value = event.target.value;

          setQuery(value);
        }}
        className="
          w-full
          h-9
          pl-9
          pr-9
          rounded-md
          border
          border-input
          bg-background
          text-sm
          text-foreground
          placeholder:text-muted-foreground
          focus:outline-none
          focus:ring-2
          focus:ring-ring
          focus:border-ring
        "
      />
      {isLoading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}

      {shouldShowDropdown && (
        <div className="absolute top-full mt-2 w-full rounded-md border border-border bg-card shadow-lg z-50 overflow-hidden">
          <div className="max-h-96 overflow-y-auto">
            {errorMessage && (
              <p className="px-3 py-3 text-sm text-destructive">{errorMessage}</p>
            )}

            {!errorMessage && !isLoading && !hasResults && (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                Nenhum resultado encontrado
              </p>
            )}

            {!errorMessage && groupedResults.map((group) => (
              <div key={group.key} className="border-b border-border last:border-b-0">
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                <div className="pb-2">
                  {group.items.map(({ item, index }) => {
                    const isActive = index === activeIndex;

                    return (
                      <button
                        key={`${item.type}-${item.id}`}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={`w-full text-left px-3 py-2 transition-colors focus:outline-none focus:bg-muted/70 ${
                          isActive ? "bg-muted/70" : "hover:bg-muted/50"
                        }`}
                      >
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.name}
                        </p>
                        {item.extraInfo && (
                          <p className="text-xs text-muted-foreground truncate">
                            {item.extraInfo}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
