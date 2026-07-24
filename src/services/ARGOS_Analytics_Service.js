import {
  calculateDaysDown,
  formatStatusDuration,
  isSameLocalCalendarDate,
} from "./ARGOS_Date_Time_Service";

import {
  FALLBACK_STATUS_CONFIGURATIONS,
  normalizeTechnicianDisplayName,
  normalizeTechnicianKey,
} from "./ARGOS_Asset_Normalization_Service";

export function buildTechnicianDailySummary({
  assets,
  statusHistoryEvents,
  completedRepairRecords,
  isAssignedToTechnician,
  technicianKey,
  includeOrganizationWork = false,
  now = new Date(),
}) {
  const isAssigned = includeOrganizationWork
    ? (asset) =>
        normalizeTechnicianKey(asset.technician) !== "unassigned"
    : isAssignedToTechnician;

  const matchesTechnicianScope = (record) =>
    includeOrganizationWork ||
    normalizeTechnicianKey(record.technician) === technicianKey;

  const assignedAssets = assets.filter(isAssigned);

  const activeAssignedAssets = assignedAssets.filter(
    (asset) => asset.status !== "Ready"
  );

  const todayStatusEvents = statusHistoryEvents.filter(
    (event) =>
      isSameLocalCalendarDate(
        event.recordedAt || event.statusEndedAt,
        now
      ) && matchesTechnicianScope(event)
  );

  const todayCompletedRepairs = completedRepairRecords.filter(
    (record) =>
      isSameLocalCalendarDate(
        record.completedDate ||
          record.completedDisplayDate ||
          record.statusEndedAt ||
          record.recordedAt,
        now
      ) && matchesTechnicianScope(record)
  );

  const updatedUnits = Array.from(
    new Set(
      todayStatusEvents
        .map((event) => event.unit)
        .filter(Boolean)
    )
  );

  return {
    assignedAssets,

    activeAssignedAssets,

    waitingPartsAssets: activeAssignedAssets.filter(
      (asset) => asset.status === "Waiting Parts"
    ),

    awaitingQcAssets: activeAssignedAssets.filter(
      (asset) => asset.status === "Awaiting QC"
    ),

    readyForPickupAssets: activeAssignedAssets.filter(
      (asset) => asset.status === "Ready for Pickup"
    ),

    criticalAssets: activeAssignedAssets.filter(
      (asset) => asset.priority === "Critical"
    ),

    todayStatusEvents: [...todayStatusEvents].sort(
      (firstEvent, secondEvent) =>
        String(
          secondEvent.recordedAt ||
            secondEvent.statusEndedAt ||
            ""
        ).localeCompare(
          String(
            firstEvent.recordedAt ||
              firstEvent.statusEndedAt ||
              ""
          )
        )
    ),

    todayCompletedRepairs,

    updatedUnits,
  };
}

export function buildDailySummary(
  assets,
  statusConfigurations = FALLBACK_STATUS_CONFIGURATIONS
) {
  const assetsWithDaysDown = assets.map((asset) => ({
    ...asset,
    daysDown: calculateDaysDown(
      asset.downSince,
      asset.status
    ),
  }));

  const availableStatusNames = new Set(
    statusConfigurations
      .filter(
        (status) =>
          status?.is_active !== false &&
          status?.counts_as_available === true
      )
      .map((status) => status.status_name)
      .filter(Boolean)
  );

  if (availableStatusNames.size === 0) {
    availableStatusNames.add("Ready");
  }

  const totalAssets = assetsWithDaysDown.length;

  const readyAssets = assetsWithDaysDown.filter((asset) =>
    availableStatusNames.has(asset.status)
  );

  const unavailableAssets = assetsWithDaysDown.filter(
    (asset) => !availableStatusNames.has(asset.status)
  );

  const waitingPartsAssets = assetsWithDaysDown.filter(
    (asset) => asset.status === "Waiting Parts"
  );

  const criticalUnavailableAssets =
    unavailableAssets.filter(
      (asset) => asset.priority === "Critical"
    );

  const tbdAssets = unavailableAssets.filter(
    (asset) => asset.rtsType === "TBD"
  );

  const noRtsAssets = unavailableAssets.filter(
    (asset) =>
      asset.rtsType === "No RTS Established"
  );

  const agingThreshold = 7;

  const agedAssets = unavailableAssets.filter(
    (asset) => asset.daysDown >= agingThreshold
  );

  const longestDownAsset = [
    ...unavailableAssets,
  ].sort(
    (firstAsset, secondAsset) =>
      secondAsset.daysDown - firstAsset.daysDown
  )[0];

  const departmentCounts = unavailableAssets.reduce(
    (counts, asset) => {
      counts[asset.department] =
        (counts[asset.department] || 0) + 1;

      return counts;
    },
    {}
  );

  return {
    totalAssets,

    readyAssets,

    unavailableAssets,

    waitingPartsAssets,

    criticalUnavailableAssets,

    tbdAssets,

    noRtsAssets,

    agedAssets,

    longestDownAsset,

    departmentWatch: Object.entries(
      departmentCounts
    )
      .map(
        ([department, count]) =>
          `${department}: ${count}`
      )
      .join(" | "),

    availability:
      totalAssets > 0
        ? (
            (readyAssets.length / totalAssets) *
            100
          ).toFixed(1)
        : "0.0",

    agingThreshold,
  };
}

export function buildTechnicianAnalytics(
  assets,
  completedRepairRecords
) {
  const activeAssets = assets
    .filter((asset) => asset.status !== "Ready")
    .map((asset) => ({
      ...asset,

      daysDown: calculateDaysDown(
        asset.downSince,
        asset.status
      ),

      technician:
        normalizeTechnicianDisplayName(
          asset.technician
        ),

      technicianKey: normalizeTechnicianKey(
        asset.technician
      ),
    }));

  const completedRecords =
    completedRepairRecords.map((record) => ({
      ...record,

      technician:
        normalizeTechnicianDisplayName(
          record.technician
        ),

      technicianKey: normalizeTechnicianKey(
        record.technician
      ),

      repairDuration: Number(
        record.daysDownDisplay ??
          record.finalDaysDown ??
          0
      ),
    }));

  const displayNamesByKey = new Map();

  [...activeAssets, ...completedRecords].forEach(
    (record) => {
      if (
        !displayNamesByKey.has(
          record.technicianKey
        )
      ) {
        displayNamesByKey.set(
          record.technicianKey,
          record.technician
        );
      }
    }
  );

  const technicianKeys = Array.from(
    displayNamesByKey.keys()
  ).sort((firstKey, secondKey) =>
    displayNamesByKey
      .get(firstKey)
      .localeCompare(
        displayNamesByKey.get(secondKey)
      )
  );

  const rows = technicianKeys.map(
    (technicianKey) => {
      const technician =
        displayNamesByKey.get(technicianKey);

      const assignedAssets =
        activeAssets.filter(
          (asset) =>
            asset.technicianKey === technicianKey
        );

      const completedRepairs =
        completedRecords.filter(
          (record) =>
            record.technicianKey === technicianKey
        );

      const totalActiveDaysDown =
        assignedAssets.reduce(
          (sum, asset) =>
            sum + asset.daysDown,
          0
        );

      const totalCompletedDuration =
        completedRepairs.reduce(
          (sum, record) =>
            sum + record.repairDuration,
          0
        );

      const longestOpenAsset = [
        ...assignedAssets,
      ].sort(
        (firstAsset, secondAsset) =>
          secondAsset.daysDown -
          firstAsset.daysDown
      )[0];

      return {
        technician,

        technicianKey,

        activeUnits: assignedAssets.length,

        averageActiveDaysDown:
          assignedAssets.length > 0
            ? (
                totalActiveDaysDown /
                assignedAssets.length
              ).toFixed(1)
            : "0.0",

        longestOpenUnit: longestOpenAsset
          ? longestOpenAsset.unit
          : "—",

        longestOpenDays: longestOpenAsset
          ? longestOpenAsset.daysDown
          : 0,

        completedRepairs:
          completedRepairs.length,

        averageRepairDuration:
          completedRepairs.length > 0
            ? formatStatusDuration(
                totalCompletedDuration /
                  completedRepairs.length
              )
            : "0 minutes",
      };
    }
  );

  const activeTechnicians = rows.filter(
    (row) =>
      row.technicianKey !== "unassigned" &&
      row.activeUnits > 0
  ).length;

  const assignedActiveRepairs =
    activeAssets.filter(
      (asset) =>
        asset.technicianKey !== "unassigned"
    ).length;

  const unassignedRepairs =
    activeAssets.filter(
      (asset) =>
        asset.technicianKey === "unassigned"
    ).length;

  const totalActiveDaysDown =
    activeAssets.reduce(
      (sum, asset) => sum + asset.daysDown,
      0
    );

  return {
    rows,

    activeTechnicians,

    assignedActiveRepairs,

    unassignedRepairs,

    averageActiveDaysDown:
      activeAssets.length > 0
        ? (
            totalActiveDaysDown /
            activeAssets.length
          ).toFixed(1)
        : "0.0",
  };
}

export function buildStatusDurationAnalytics(
  assets,
  statusHistoryEvents,
  statusOptions
) {
  const statusDurationOptions =
    statusOptions.filter(
      (status) => status !== "Ready"
    );

  const activeAssets = assets.filter(
    (asset) => asset.status !== "Ready"
  );

  const normalizedHistoryEvents =
    statusHistoryEvents
      .filter((event) =>
        statusDurationOptions.includes(
          event.previousStatus
        )
      )
      .map((event) => ({
        ...event,

        durationDays: Number(
          event.durationDays ?? 0
        ),
      }));

  const totalRecordedDuration =
    normalizedHistoryEvents.reduce(
      (sum, event) =>
        sum + event.durationDays,
      0
    );

  const rows = statusDurationOptions.map(
    (status) => {
      const currentUnits =
        activeAssets.filter(
          (asset) => asset.status === status
        ).length;

      const completedEvents =
        normalizedHistoryEvents.filter(
          (event) =>
            event.previousStatus === status
        );

      const completedStatusEvents =
        completedEvents.length;

      const totalDuration =
        completedEvents.reduce(
          (sum, event) =>
            sum + event.durationDays,
          0
        );

      const longestDuration =
        completedEvents.length > 0
          ? Math.max(
              ...completedEvents.map(
                (event) =>
                  event.durationDays
              )
            )
          : 0;

      return {
        status,

        currentUnits,

        completedStatusEvents,

        averageDurationDays:
          completedStatusEvents > 0
            ? totalDuration /
              completedStatusEvents
            : 0,

        averageDuration:
          completedStatusEvents > 0
            ? formatStatusDuration(
                totalDuration /
                  completedStatusEvents
              )
            : "0 minutes",

        longestDurationDays:
          longestDuration,

        longestDuration:
          formatStatusDuration(
            longestDuration
          ),

        totalDuration,

        percentageOfRecordedDowntime:
          totalRecordedDuration > 0
            ? (
                (totalDuration /
                  totalRecordedDuration) *
                100
              ).toFixed(1)
            : "0.0",
      };
    }
  );

  const trackedStatusTransitions =
    normalizedHistoryEvents.length;

  const averageRecordedDurationDays =
    trackedStatusTransitions > 0
      ? totalRecordedDuration /
        trackedStatusTransitions
      : 0;

  const averageRecordedStatusDuration =
    formatStatusDuration(
      averageRecordedDurationDays
    );

  const averageRecordedStatusEvent =
    normalizedHistoryEvents.length > 0
      ? [...normalizedHistoryEvents].sort(
          (firstEvent, secondEvent) =>
            Math.abs(
              firstEvent.durationDays -
                averageRecordedDurationDays
            ) -
            Math.abs(
              secondEvent.durationDays -
                averageRecordedDurationDays
            )
        )[0]
      : null;

  const longestRecordedStatusEvent =
    normalizedHistoryEvents.length > 0
      ? [...normalizedHistoryEvents].sort(
          (firstEvent, secondEvent) =>
            secondEvent.durationDays -
            firstEvent.durationDays
        )[0]
      : null;

  const longestRecordedStatusDuration =
    longestRecordedStatusEvent
      ? formatStatusDuration(
          longestRecordedStatusEvent.durationDays
        )
      : "0 minutes";

  const currentLargestBottleneck = [
    ...rows,
  ].sort(
    (firstRow, secondRow) =>
      secondRow.currentUnits -
      firstRow.currentUnits
  )[0];

  return {
    rows,

    trackedStatusTransitions,

    averageRecordedStatusDuration,

    averageRecordedStatusEvent,

    longestRecordedStatusDuration,

    longestRecordedStatusEvent,

    currentLargestBottleneck:
      currentLargestBottleneck &&
      currentLargestBottleneck.currentUnits > 0
        ? currentLargestBottleneck
        : null,
  };
}