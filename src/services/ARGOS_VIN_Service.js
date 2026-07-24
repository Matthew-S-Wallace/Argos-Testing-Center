export function normalizeScannedVIN(value) {
  const cleanedValue = String(value || "")
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, "");

  if (cleanedValue.length <= 17) return cleanedValue;

  const possibleVinMatches = [];

  for (
    let index = 0;
    index <= cleanedValue.length - 17;
    index += 1
  ) {
    const candidate = cleanedValue.slice(index, index + 17);

    if (/^[A-HJ-NPR-Z0-9]{17}$/.test(candidate)) {
      possibleVinMatches.push(candidate);
    }
  }

  return (
    possibleVinMatches[possibleVinMatches.length - 1] ||
    cleanedValue.slice(-17)
  );
}

export function isLikelyVIN(value) {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(
    normalizeScannedVIN(value)
  );
}

export function cleanDecodedVehicleValue(value) {
  const cleanedValue = String(value || "").trim();

  if (
    !cleanedValue ||
    cleanedValue.toLowerCase() === "not applicable" ||
    cleanedValue.toLowerCase() === "unknown"
  ) {
    return "";
  }

  return cleanedValue;
}

export function buildDecodedAssetDescription(decodedVehicle) {
  return [
    decodedVehicle.year,
    decodedVehicle.make,
    decodedVehicle.model,
  ]
    .map(cleanDecodedVehicleValue)
    .filter(Boolean)
    .join(" ");
}

export async function decodeVinVehicleInformation(vin) {
  const normalizedVin = normalizeScannedVIN(vin);

  if (!isLikelyVIN(normalizedVin)) {
    return {
      year: "",
      make: "",
      model: "",
      assetDescription: "",
    };
  }

  try {
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(
        normalizedVin
      )}?format=json`
    );

    if (!response.ok) {
      throw new Error("VIN decoder request failed.");
    }

    const data = await response.json();
    const result = data?.Results?.[0] || {};

    const decodedVehicle = {
      year: cleanDecodedVehicleValue(result.ModelYear),
      make: cleanDecodedVehicleValue(result.Make),
      model: cleanDecodedVehicleValue(result.Model),
    };

    return {
      ...decodedVehicle,
      assetDescription:
        buildDecodedAssetDescription(decodedVehicle),
    };
  } catch {
    return {
      year: "",
      make: "",
      model: "",
      assetDescription: "",
    };
  }
}