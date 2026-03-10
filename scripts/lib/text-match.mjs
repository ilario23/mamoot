const TOKEN_RE = /[a-z0-9]+/g;

export const normalizeText = (value) =>
  value
    .toLowerCase()
    .replace(/[`*_>#~]/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value) => normalizeText(value).match(TOKEN_RE) ?? [];

const tokenOverlapScore = (targetTokens, candidateTokens) => {
  if (targetTokens.length === 0 || candidateTokens.length === 0) return 0;
  const targetSet = new Set(targetTokens);
  const candidateSet = new Set(candidateTokens);
  let common = 0;
  for (const token of targetSet) {
    if (candidateSet.has(token)) common += 1;
  }
  return common / targetSet.size;
};

const splitSourceSegments = (source) =>
  source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export const findBestSegmentMatch = (source, expectedPhrase) => {
  const expectedTokens = tokenize(expectedPhrase);
  const segments = splitSourceSegments(source);
  let best = {segment: '(no nearby text found)', score: 0};

  for (const segment of segments) {
    const score = tokenOverlapScore(expectedTokens, tokenize(segment));
    if (score > best.score) {
      best = {segment, score};
    }
  }

  return best;
};

const hasPhrase = (source, phrase) => {
  const normalizedSource = normalizeText(source);
  const normalizedPhrase = normalizeText(phrase);
  return normalizedPhrase.length > 0 && normalizedSource.includes(normalizedPhrase);
};

export const normalizeClause = (rawClause, fallbackId) => {
  if (typeof rawClause === 'string') {
    return {
      id: fallbackId,
      mode: 'allOf',
      terms: [rawClause],
    };
  }

  if (!rawClause || typeof rawClause !== 'object') {
    throw new Error(`Invalid clause definition for ${fallbackId}`);
  }

  const id = typeof rawClause.id === 'string' && rawClause.id.trim()
    ? rawClause.id
    : fallbackId;
  const hasAllOf = Array.isArray(rawClause.allOf);
  const hasAnyOf = Array.isArray(rawClause.anyOf);

  if (hasAllOf && hasAnyOf) {
    throw new Error(`Clause ${id} cannot define both allOf and anyOf`);
  }

  if (hasAllOf) {
    const terms = rawClause.allOf.filter((item) => typeof item === 'string');
    if (terms.length === 0) throw new Error(`Clause ${id} has empty allOf`);
    return {id, mode: 'allOf', terms};
  }

  if (hasAnyOf) {
    const terms = rawClause.anyOf.filter((item) => typeof item === 'string');
    if (terms.length === 0) throw new Error(`Clause ${id} has empty anyOf`);
    return {id, mode: 'anyOf', terms};
  }

  const basePhrase =
    typeof rawClause.phrase === 'string' ? rawClause.phrase : null;
  const alternatives = Array.isArray(rawClause.alternatives)
    ? rawClause.alternatives.filter((item) => typeof item === 'string')
    : [];

  if (!basePhrase && alternatives.length === 0) {
    throw new Error(`Clause ${id} must define phrase/alternatives or allOf/anyOf`);
  }

  return {
    id,
    mode: 'anyOf',
    terms: [basePhrase, ...alternatives].filter(Boolean),
  };
};

export const evaluateClause = (source, rawClause, fallbackId) => {
  const clause = normalizeClause(rawClause, fallbackId);
  const matched = clause.terms.filter((term) => hasPhrase(source, term));
  const ok = clause.mode === 'allOf'
    ? matched.length === clause.terms.length
    : matched.length > 0;
  const missing = clause.terms.filter((term) => !matched.includes(term));
  return {clause, ok, missing};
};
