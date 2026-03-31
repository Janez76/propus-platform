import type { Customer } from "../api/customers";

export interface DuplicateMatch {
  customer: Customer;
  similarity: number;
  matchedFields: string[];
}

function normalizeString(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;
  const matrix: number[][] = Array(aLen + 1)
    .fill(null)
    .map(() => Array(bLen + 1).fill(0));

  for (let i = 0; i <= aLen; i++) matrix[i][0] = i;
  for (let j = 0; j <= bLen; j++) matrix[0][j] = j;

  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[aLen][bLen];
}

function calculateSimilarity(a: string, b: string): number {
  const normA = normalizeString(a);
  const normB = normalizeString(b);

  if (!normA || !normB) return 0;

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(normA, normB);
  return 1 - distance / maxLen;
}

export function findDuplicateCustomers(
  newCustomer: {
    name: string;
    email: string;
    phone?: string;
    company?: string;
  },
  existingCustomers: Customer[]
): DuplicateMatch[] {
  const NAME_THRESHOLD = 0.75;
  const EMAIL_THRESHOLD = 0.80;
  const PHONE_THRESHOLD = 0.85;
  const COMPANY_THRESHOLD = 0.85;
  const MIN_COMBINED_SCORE = 0.75;

  const matches: Map<number, DuplicateMatch> = new Map();

  for (const existing of existingCustomers) {
    const matchedFields: string[] = [];
    let combinedScore = 0;
    let fieldCount = 0;

    const nameSim = calculateSimilarity(newCustomer.name, existing.name);
    if (nameSim >= NAME_THRESHOLD) {
      matchedFields.push("name");
      combinedScore += nameSim;
      fieldCount++;
    }

    const emailSim = calculateSimilarity(newCustomer.email, existing.email);
    if (emailSim >= EMAIL_THRESHOLD) {
      matchedFields.push("email");
      combinedScore += emailSim;
      fieldCount++;
    }

    if (newCustomer.phone && existing.phone) {
      const phoneSim = calculateSimilarity(newCustomer.phone, existing.phone);
      if (phoneSim >= PHONE_THRESHOLD) {
        matchedFields.push("phone");
        combinedScore += phoneSim;
        fieldCount++;
      }
    }

    if (newCustomer.company && existing.company) {
      const companySim = calculateSimilarity(newCustomer.company, existing.company);
      if (companySim >= COMPANY_THRESHOLD) {
        matchedFields.push("company");
        combinedScore += companySim;
        fieldCount++;
      }
    }

    if (fieldCount > 0) {
      const avgScore = combinedScore / fieldCount;
      if (
        (matchedFields.includes("name") && matchedFields.includes("email")) ||
        matchedFields.includes("company") ||
        avgScore >= MIN_COMBINED_SCORE
      ) {
        matches.set(existing.id, {
          customer: existing,
          similarity: avgScore,
          matchedFields,
        });
      }
    }
  }

  return Array.from(matches.values()).sort(
    (a, b) => b.similarity - a.similarity
  );
}
