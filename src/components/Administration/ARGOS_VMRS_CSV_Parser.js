const SUPPORTED_DELIMITERS = [",", "\t", ";", "|"];

function stripBom(value) {
  return String(value || "").replace(/^\uFEFF/, "");
}

export function normalizeVMRSHeader(value) {
  return stripBom(value)
    .trim()
    .toLowerCase()
    .replace(/[\s\-\/]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function countDelimiterOutsideQuotes(line, delimiter) {
  let count = 0;
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && character === delimiter) {
      count += 1;
    }
  }

  return count;
}

export function detectVMRSDelimiter(text) {
  const sampleLines = stripBom(text)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .slice(0, 8);

  if (!sampleLines.length) return ",";

  const scored = SUPPORTED_DELIMITERS.map((delimiter) => {
    const counts = sampleLines.map((line) =>
      countDelimiterOutsideQuotes(line, delimiter),
    );

    const positiveCounts = counts.filter((count) => count > 0);

    const consistency = positiveCounts.length
      ? positiveCounts.filter((count) => count === positiveCounts[0]).length
      : 0;

    return {
      delimiter,
      score:
        positiveCounts.reduce((total, count) => total + count, 0) +
        consistency * 10,
    };
  });

  scored.sort((first, second) => second.score - first.score);

  return scored[0]?.score > 0 ? scored[0].delimiter : ",";
}

export function parseDelimitedText(
  text,
  delimiter = detectVMRSDelimiter(text),
) {
  const source = stripBom(text).replace(/\r\n?/g, "\n");
  const records = [];

  let record = [];
  let field = "";
  let inQuotes = false;
  let physicalLine = 1;
  let recordStartLine = 1;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;

        if (character === "\n") {
          physicalLine += 1;
        }
      }

      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === delimiter) {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field);

      records.push({
        values: record,
        sourceLine: recordStartLine,
      });

      record = [];
      field = "";
      physicalLine += 1;
      recordStartLine = physicalLine;
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error(
      `CSV parsing failed: an open quoted field begins near line ${recordStartLine}.`,
    );
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);

    records.push({
      values: record,
      sourceLine: recordStartLine,
    });
  }

  return records;
}

function makeUniqueHeaders(headers) {
  const counts = new Map();

  return headers.map((header, index) => {
    const normalized =
      normalizeVMRSHeader(header) || `column_${index + 1}`;

    const occurrence = (counts.get(normalized) || 0) + 1;

    counts.set(normalized, occurrence);

    return occurrence === 1
      ? normalized
      : `${normalized}_${occurrence}`;
  });
}

export async function parseVMRSCatalogFile(file) {
  if (!file || typeof file.text !== "function") {
    throw new Error("A readable CSV file is required.");
  }

  const text = await file.text();

  if (!text.trim()) {
    throw new Error("The selected CSV file is empty.");
  }

  const delimiter = detectVMRSDelimiter(text);

  const parsedRecords = parseDelimitedText(text, delimiter).filter(
    ({ values }) =>
      values.some((value) => String(value || "").trim()),
  );

  if (!parsedRecords.length) {
    throw new Error("The CSV file does not contain any records.");
  }

  if (parsedRecords.length === 1) {
    throw new Error("The CSV file contains headers but no data rows.");
  }

  const rawHeaders = parsedRecords[0].values.map((value) =>
    String(value || "").trim(),
  );

  const headers = makeUniqueHeaders(rawHeaders);

  const rows = parsedRecords
    .slice(1)
    .map(({ values, sourceLine }, rowIndex) => {
      const record = {};

      headers.forEach((header, columnIndex) => {
        record[header] = String(values[columnIndex] ?? "").trim();
      });

      return {
        rowNumber: rowIndex + 2,
        sourceLine,
        rawValues: values,
        rawRecord: record,
      };
    });

  return {
    delimiter,
    delimiterLabel: delimiter === "\t" ? "Tab" : delimiter,
    headers,
    rawHeaders,
    rows,
    totalRows: rows.length,
  };
}