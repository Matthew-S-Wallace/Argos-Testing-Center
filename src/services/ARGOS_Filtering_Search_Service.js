/**
 * ARGOS™ Filtering & Search Service
 *
 * Centralizes pure filtering and sorting operations used by My Fleet
 * and report tables. React state management remains inside App.jsx.
 */

const REPORT_NUMERIC_SORT_KEYS = {
  currentUnits: "currentUnits",
  completedStatusEvents: "completedStatusEvents",
  averageDuration: "averageDurationDays",
  longestDuration: "longestDurationDays",
  percentageOfRecordedDowntime: "percentageOfRecordedDowntime",
};

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

export function hasActiveFleetColumnFilters(fleetColumnFilters = {}) {
  return Object.values(fleetColumnFilters).some((value) =>
    String(value || "").trim()
  );
}

export function filterAndSortFleetAssets({
  assets = [],
  fleetSearch = "",
  fleetStatusFilter = "All Statuses",
  fieldQueueMode = "all",
  fleetColumnFilters = {},
  fleetSort = { key: "unit", direction: "asc" },
  isAssignedToTechnician = () => false,
}) {
  const normalizedFleetSearch = normalizeSearchValue(fleetSearch);

  return [...assets]
    .filter((asset) => {
      const matchesUnitSearch =
        !normalizedFleetSearch ||
        String(asset.unit || "")
          .toLowerCase()
          .includes(normalizedFleetSearch);

      const matchesStatusFilter =
        fleetStatusFilter === "All Statuses" ||
        asset.status === fleetStatusFilter;

      const isAssigned = isAssignedToTechnician(asset);

      const matchesFieldQueue =
        fieldQueueMode === "all" ||
        (fieldQueueMode === "assigned" && isAssigned) ||
        (
          fieldQueueMode === "awaiting" &&
          isAssigned &&
          asset.status !== "Ready"
        );

      const matchesColumnFilters = Object.entries(
        fleetColumnFilters
      ).every(([key, value]) => {
        const normalizedFilter = normalizeSearchValue(value);

        if (!normalizedFilter) {
          return true;
        }

        return String(asset[key] || "")
          .toLowerCase()
          .includes(normalizedFilter);
      });

      return (
        matchesUnitSearch &&
        matchesStatusFilter &&
        matchesFieldQueue &&
        matchesColumnFilters
      );
    })
    .sort((firstAsset, secondAsset) => {
      const firstValue = String(firstAsset[fleetSort.key] || "");
      const secondValue = String(secondAsset[fleetSort.key] || "");

      const comparison = firstValue.localeCompare(
        secondValue,
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        }
      );

      return fleetSort.direction === "asc"
        ? comparison
        : -comparison;
    });
}

export function sortReportRows(
  reportRows = [],
  reportSort = { key: "currentUnits", direction: "desc" }
) {
  return [...reportRows].sort((firstRow, secondRow) => {
    const sortKey =
      REPORT_NUMERIC_SORT_KEYS[reportSort.key] ||
      reportSort.key;

    const firstValue = firstRow[sortKey];
    const secondValue = secondRow[sortKey];

    const comparison =
      typeof firstValue === "number" ||
      !Number.isNaN(Number(firstValue))
        ? Number(firstValue) - Number(secondValue)
        : String(firstValue || "").localeCompare(
            String(secondValue || "")
          );

    return reportSort.direction === "asc"
      ? comparison
      : -comparison;
  });
}
