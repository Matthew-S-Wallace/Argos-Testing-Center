export function normalizeIdentityDisplay(value) {
  const cleanedValue = String(value || "")
    .trim()
    .replace(/\s+/g, " ");

  if (
    !cleanedValue ||
    cleanedValue === "—" ||
    cleanedValue === "‚Äî" ||
    cleanedValue.toLowerCase() === "unassigned"
  ) {
    return "Unassigned";
  }

  return cleanedValue;
}

export function normalizeIdentityKey(value) {
  return normalizeIdentityDisplay(value).toLowerCase();
}

function calculateLevenshteinDistance(firstValue, secondValue) {
  const first = normalizeIdentityKey(firstValue);
  const second = normalizeIdentityKey(secondValue);

  if (first === second) return 0;
  if (!first.length) return second.length;
  if (!second.length) return first.length;

  const previousRow = Array.from({ length: second.length + 1 }, (_, index) => index);

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    const currentRow = [firstIndex];

    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const substitutionCost =
        first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;

      currentRow[secondIndex] = Math.min(
        currentRow[secondIndex - 1] + 1,
        previousRow[secondIndex] + 1,
        previousRow[secondIndex - 1] + substitutionCost
      );
    }

    previousRow.splice(0, previousRow.length, ...currentRow);
  }

  return previousRow[second.length];
}

function calculateSimilarity(firstValue, secondValue) {
  const first = normalizeIdentityKey(firstValue);
  const second = normalizeIdentityKey(secondValue);
  const longestLength = Math.max(first.length, second.length);

  if (longestLength === 0) return 1;

  return 1 - calculateLevenshteinDistance(first, second) / longestLength;
}

export function resolveIdentity(enteredValue, knownValues = []) {
  const enteredDisplay = normalizeIdentityDisplay(enteredValue);
  const enteredKey = normalizeIdentityKey(enteredDisplay);

  if (enteredKey === "unassigned") {
    return {
      status: "exact",
      enteredValue: "Unassigned",
      match: "Unassigned",
    };
  }

  const uniqueKnownValues = Array.from(
    new Map(
      knownValues
        .map(normalizeIdentityDisplay)
        .filter((value) => normalizeIdentityKey(value) !== "unassigned")
        .map((value) => [normalizeIdentityKey(value), value])
    ).values()
  );

  const exactMatch = uniqueKnownValues.find(
    (knownValue) => normalizeIdentityKey(knownValue) === enteredKey
  );

  if (exactMatch) {
    return {
      status: "exact",
      enteredValue: enteredDisplay,
      match: exactMatch,
    };
  }

  const similarCandidates = uniqueKnownValues
    .map((knownValue) => ({
      value: knownValue,
      distance: calculateLevenshteinDistance(enteredDisplay, knownValue),
      similarity: calculateSimilarity(enteredDisplay, knownValue),
    }))
    .filter((candidate) => {
      const comparableLength = Math.max(
        normalizeIdentityKey(enteredDisplay).length,
        normalizeIdentityKey(candidate.value).length
      );

      return (
        comparableLength >= 4 &&
        candidate.distance <= 2 &&
        candidate.similarity >= 0.72
      );
    })
    .sort(
      (firstCandidate, secondCandidate) =>
        secondCandidate.similarity - firstCandidate.similarity ||
        firstCandidate.distance - secondCandidate.distance ||
        firstCandidate.value.localeCompare(secondCandidate.value)
    );

  if (similarCandidates.length > 0) {
    return {
      status: "similar",
      enteredValue: enteredDisplay,
      match: similarCandidates[0].value,
    };
  }

  return {
    status: "new",
    enteredValue: enteredDisplay,
    match: null,
  };
}
