import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ARGOS_AUDIT_OUTCOMES,
  ARGOS_AUDIT_SEVERITIES,
  loadARGOSAuditEvents,
  loadARGOSAuditFilterOptions,
  loadARGOSAuditSummary,
  logARGOSAuditEvent,
} from "../services/ARGOS_Audit_Log_Service";

const DEFAULT_FILTERS = Object.freeze({
  search: "",
  category: "",
  action: "",
  outcome: "",
  severity: "",
  userId: "",
  entityType: "",
  startDate: "",
  endDate: "",
});

const DEFAULT_SUMMARY = Object.freeze({
  totalEvents: 0,
  todayEvents: 0,
  failedEvents: 0,
  criticalEvents: 0,
});

const DEFAULT_FILTER_OPTIONS = Object.freeze({
  categories: [],
  actions: [],
  outcomes: [],
  severities: [],
  users: [],
});

export default function useARGOSAuditLog({
  organizationId,
  enabled = true,
  pageSize = 50,
  initialFilters = {},
} = {}) {
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState(DEFAULT_SUMMARY);
  const [filterOptions, setFilterOptions] = useState(
    DEFAULT_FILTER_OPTIONS
  );

  const [filters, setFilters] = useState({
    ...DEFAULT_FILTERS,
    ...initialFilters,
  });

  const [page, setPage] = useState(1);
  const [totalEvents, setTotalEvents] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const canLoad = Boolean(enabled && organizationId);

  const loadEvents = useCallback(
    async ({ refresh = false } = {}) => {
      if (!canLoad) {
        setEvents([]);
        setTotalEvents(0);
        setTotalPages(1);
        setErrorMessage("");
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      try {
        const result = await loadARGOSAuditEvents({
          organizationId,
          ...filters,
          page,
          pageSize,
        });

        setEvents(result.events);
        setTotalEvents(result.totalEvents);
        setTotalPages(result.totalPages);

        if (page > result.totalPages) {
          setPage(result.totalPages);
        }
      } catch (error) {
        console.error("ARGOS audit event load failed:", error);
        setEvents([]);
        setTotalEvents(0);
        setTotalPages(1);
        setErrorMessage(
          error?.message ||
            "ARGOS could not load the organization audit log."
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      canLoad,
      filters,
      organizationId,
      page,
      pageSize,
    ]
  );

  const loadSummary = useCallback(async () => {
    if (!canLoad) {
      setSummary(DEFAULT_SUMMARY);
      return;
    }

    try {
      const result = await loadARGOSAuditSummary({
        organizationId,
      });

      setSummary(result);
    } catch (error) {
      console.error("ARGOS audit summary load failed:", error);
    }
  }, [canLoad, organizationId]);

  const loadFilterOptions = useCallback(async () => {
    if (!canLoad) {
      setFilterOptions(DEFAULT_FILTER_OPTIONS);
      return;
    }

    try {
      const result = await loadARGOSAuditFilterOptions({
        organizationId,
      });

      setFilterOptions(result);
    } catch (error) {
      console.error(
        "ARGOS audit filter-option load failed:",
        error
      );
    }
  }, [canLoad, organizationId]);

  const refresh = useCallback(async () => {
    await Promise.all([
      loadEvents({ refresh: true }),
      loadSummary(),
      loadFilterOptions(),
    ]);
  }, [loadEvents, loadFilterOptions, loadSummary]);

  const recordEvent = useCallback(
    async (event) => {
      const result = await logARGOSAuditEvent({
        ...event,
        organizationId:
          event?.organizationId || organizationId || null,
      });

      if (!result.error && canLoad) {
        await Promise.all([
          loadSummary(),
          loadFilterOptions(),
        ]);
      }

      return result;
    },
    [
      canLoad,
      loadFilterOptions,
      loadSummary,
      organizationId,
    ]
  );

  const setFilter = useCallback((filterName, value) => {
    if (!(filterName in DEFAULT_FILTERS)) {
      console.warn(
        `ARGOS ignored unsupported audit filter: ${filterName}`
      );
      return;
    }

    setFilters((currentFilters) => ({
      ...currentFilters,
      [filterName]: value,
    }));

    setPage(1);
  }, []);

  const replaceFilters = useCallback((nextFilters = {}) => {
    setFilters({
      ...DEFAULT_FILTERS,
      ...nextFilters,
    });

    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const nextPage = useCallback(() => {
    setPage((currentPage) =>
      Math.min(currentPage + 1, totalPages)
    );
  }, [totalPages]);

  const previousPage = useCallback(() => {
    setPage((currentPage) =>
      Math.max(currentPage - 1, 1)
    );
  }, []);

  const goToPage = useCallback(
    (nextPageNumber) => {
      const normalizedPage = Math.min(
        Math.max(1, Number(nextPageNumber) || 1),
        totalPages
      );

      setPage(normalizedPage);
    },
    [totalPages]
  );

  useEffect(() => {
    if (!canLoad) {
      setEvents([]);
      setSummary(DEFAULT_SUMMARY);
      setFilterOptions(DEFAULT_FILTER_OPTIONS);
      setTotalEvents(0);
      setTotalPages(1);
      setErrorMessage("");
      return;
    }

    loadEvents();
  }, [canLoad, loadEvents]);

  useEffect(() => {
    if (!canLoad) return;

    Promise.all([
      loadSummary(),
      loadFilterOptions(),
    ]);
  }, [
    canLoad,
    loadFilterOptions,
    loadSummary,
  ]);

  const hasActiveFilters = useMemo(
    () =>
      Object.values(filters).some(
        (value) => String(value || "").trim() !== ""
      ),
    [filters]
  );

  const pagination = useMemo(
    () => ({
      page,
      pageSize,
      totalEvents,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    }),
    [
      page,
      pageSize,
      totalEvents,
      totalPages,
    ]
  );

  return {
    events,
    summary,
    filterOptions,

    filters,
    hasActiveFilters,

    pagination,

    isLoading,
    isRefreshing,
    errorMessage,

    setFilter,
    replaceFilters,
    resetFilters,

    setPage: goToPage,
    nextPage,
    previousPage,

    loadEvents,
    refresh,
    recordEvent,

    outcomes: ARGOS_AUDIT_OUTCOMES,
    severities: ARGOS_AUDIT_SEVERITIES,
  };
}