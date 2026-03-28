function toNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function normalizeSubject(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^(re|aw|wg|fw|fwd)\s*:\s*/gi, '')
    .replace(/\s+/g, ' ');
}

function buildCaseKey(suggestion) {
  const details = suggestion.details_json || {};
  const candidate = details.candidate || details.candidateTour || {};
  const resolvedTourId = suggestion.tour_id || candidate.id || 'no-tour';
  if (suggestion.suggestion_type === 'invoice_match') {
    return [
      'invoice',
      resolvedTourId,
      suggestion.source_invoice_id || suggestion.invoice_number || suggestion.ref_vertrag || 'unknown',
      suggestion.suggested_action || 'invoice',
    ].join('::');
  }

  const email = details.email || {};
  const conversationId = firstNonEmpty(
    suggestion.conversation_id,
    email.conversation_id,
    email.conversationId
  );
  const normalizedSubject = normalizeSubject(suggestion.email_subject || suggestion.subject || email.subject);
  const sender = String(suggestion.from_email || email.from_email || email.fromEmail || '').trim().toLowerCase();
  const action = String(suggestion.suggested_action || '').trim().toLowerCase() || 'email';
  const intent = String(details.intent || '').trim().toLowerCase() || 'none';
  return [
    'email',
    resolvedTourId,
    sender || 'unknown-sender',
    action,
    intent,
    conversationId || normalizedSubject || 'no-thread',
  ].join('::');
}

function summarizeCase(caseItems = []) {
  const items = [...caseItems].sort(compareSuggestions);
  const latest = items[0] || null;
  const openItems = items.filter((item) => item.status === 'open');
  const latestOpen = openItems[0] || latest;
  const subjects = [...new Set(items.map((item) => String(item.email_subject || item.subject || '').trim()).filter(Boolean))];
  const senders = [...new Set(items.map((item) => String(item.from_email || '').trim().toLowerCase()).filter(Boolean))];
  const intents = [...new Set(items.map((item) => String(item.details_json?.intent || '').trim()).filter(Boolean))];
  const reasons = [...new Set(items.map((item) => String(item.reason || '').trim()).filter(Boolean))];
  const statuses = [...new Set(items.map((item) => String(item.status || '').trim()).filter(Boolean))];
  const latestAt = items.reduce((latestDate, item) => {
    const candidateDate = item.received_at || item.created_at || null;
    if (!candidateDate) return latestDate;
    if (!latestDate) return candidateDate;
    return new Date(candidateDate) > new Date(latestDate) ? candidateDate : latestDate;
  }, null);
  const firstAt = items.reduce((earliestDate, item) => {
    const candidateDate = item.received_at || item.created_at || null;
    if (!candidateDate) return earliestDate;
    if (!earliestDate) return candidateDate;
    return new Date(candidateDate) < new Date(earliestDate) ? candidateDate : earliestDate;
  }, null);
  const confidenceMax = items.reduce((maxValue, item) => Math.max(maxValue, toNumber(item.confidence, 0)), 0);

  return {
    key: buildCaseKey(latest || {}),
    items,
    latest,
    latestOpen,
    itemCount: items.length,
    openCount: openItems.length,
    latestAt,
    firstAt,
    subjects,
    senders,
    intents,
    reasons,
    statuses,
    confidenceMax,
  };
}

function compareSuggestions(left, right) {
  const leftTour = Number(left.tour_id || left.details_json?.candidate?.id || left.details_json?.candidateTour?.id || 0);
  const rightTour = Number(right.tour_id || right.details_json?.candidate?.id || right.details_json?.candidateTour?.id || 0);
  if (leftTour !== rightTour) return leftTour - rightTour;

  const leftStatus = String(left.status || '');
  const rightStatus = String(right.status || '');
  if (leftStatus !== rightStatus) return leftStatus.localeCompare(rightStatus);

  const leftDate = new Date(left.received_at || left.created_at || 0).getTime();
  const rightDate = new Date(right.received_at || right.created_at || 0).getTime();
  return rightDate - leftDate;
}

function buildSuggestionGroups(suggestions = []) {
  const groupMap = new Map();
  const noTourItems = [];
  const ambiguousItems = [];
  const billingItems = [];
  const missingContentItems = [];
  const conflictItems = [];
  const manualReviewItems = [];

  for (const suggestion of suggestions) {
    const details = suggestion.details_json || {};
    const candidate = details.candidate || details.candidateTour || {};
    const assignment = details.assignment_diagnostics || {};
    const resolvedTourId = suggestion.tour_id || candidate.id || null;
    const resolvedTourName = suggestion.object_label
      || suggestion.bezeichnung
      || candidate.object_label
      || candidate.customer_name
      || (resolvedTourId ? `Tour ${resolvedTourId}` : '');
    const resolvedCustomer = suggestion.customer_name || suggestion.kunde_ref || candidate.customer_name || '';
    const resolvedStatus = suggestion.tour_status || candidate.status || '';
    const candidateId = candidate.id || null;
    const matchPriorityRank = Number(candidate?.match_priority?.rank || 0);
    const matchPriorityLabel = String(candidate?.match_priority?.label || '').toLowerCase();
    const suggestionConfidence = toNumber(suggestion.confidence, 0);
    const hasConflict = !!(suggestion.tour_id && candidateId && String(suggestion.tour_id) !== String(candidateId));
    const isManualReview = String(suggestion.suggested_action || '') === 'review_manual';
    const isReviewAction = String(suggestion.suggested_action || '').startsWith('review_');
    const isUnclear = String(details.intent || '') === 'unclear';
    const isBilling = String(suggestion.suggested_action || '') === 'review_billing' || String(details.intent || '') === 'billing_question';
    const isExplicitlyAmbiguous = assignment.ambiguous === true || assignment.ambiguous === 'true';
    const hasMissingMailBody = suggestion.suggestion_type === 'email_intent' && !firstNonEmpty(
      suggestion.body_text,
      suggestion.body_preview,
      details.email?.body_text,
      details.email?.body_preview,
      details.email?.bodyText,
      details.email?.bodyPreview
    );
    const isWeakHeuristicOnly = matchPriorityRank < 400 || /rechnungsadresse|kontakt|kundenname/.test(matchPriorityLabel);
    const isStrongMatch = (
      (!!suggestion.tour_id && (!candidateId || String(suggestion.tour_id) === String(candidateId)))
      || (!!candidateId && suggestionConfidence >= 0.9)
      || (!!candidateId && matchPriorityRank >= 500)
    );

    if (hasConflict) {
      conflictItems.push(suggestion);
      continue;
    }

    if (isBilling) {
      billingItems.push(suggestion);
      continue;
    }

    if (hasMissingMailBody) {
      missingContentItems.push(suggestion);
      continue;
    }

    if (isExplicitlyAmbiguous || isManualReview || isUnclear) {
      ambiguousItems.push(suggestion);
      continue;
    }

    if (isReviewAction || !isStrongMatch || isWeakHeuristicOnly) {
      manualReviewItems.push(suggestion);
      continue;
    }

    if (!resolvedTourId) {
      noTourItems.push(suggestion);
      continue;
    }

    const key = `${resolvedTourId}::${String(resolvedTourName || '').trim().toLowerCase()}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        tourId: resolvedTourId,
        tourName: resolvedTourName || `Tour ${resolvedTourId}`,
        customerName: resolvedCustomer,
        tourStatus: resolvedStatus,
        items: [],
      });
    }
    groupMap.get(key).items.push(suggestion);
  }

  const groups = [...groupMap.values()]
    .map((group) => {
      const caseMap = new Map();
      for (const item of group.items) {
        const caseKey = buildCaseKey(item);
        if (!caseMap.has(caseKey)) caseMap.set(caseKey, []);
        caseMap.get(caseKey).push(item);
      }
      const cases = [...caseMap.values()]
        .map((items) => summarizeCase(items))
        .sort((left, right) => {
          const leftOpen = left.openCount > 0 ? 0 : 1;
          const rightOpen = right.openCount > 0 ? 0 : 1;
          const leftDate = new Date(left.latestAt || 0).getTime();
          const rightDate = new Date(right.latestAt || 0).getTime();
          return leftOpen - rightOpen || rightDate - leftDate;
        });
      const openCount = group.items.filter((item) => item.status === 'open').length;
      const latestSuggestionAt = group.items.reduce((latest, item) => {
        const candidateDate = item.received_at || item.created_at || null;
        if (!candidateDate) return latest;
        if (!latest) return candidateDate;
        return new Date(candidateDate) > new Date(latest) ? candidateDate : latest;
      }, null);
      return {
        ...group,
        cases,
        caseCount: cases.length,
        openCount,
        autoOpen: openCount > 0,
        latestSuggestionAt,
      };
    })
    .sort((left, right) => {
      const leftOpen = left.openCount > 0 ? 0 : 1;
      const rightOpen = right.openCount > 0 ? 0 : 1;
      return leftOpen - rightOpen || String(left.tourName || '').localeCompare(String(right.tourName || ''));
    });

  noTourItems.sort(compareSuggestions);
  manualReviewItems.sort(compareSuggestions);
  missingContentItems.sort(compareSuggestions);
  conflictItems.sort(compareSuggestions);
  billingItems.sort(compareSuggestions);
  ambiguousItems.sort(compareSuggestions);

  return {
    groups,
    noTourItems,
    manualReviewItems,
    missingContentItems,
    conflictItems,
    billingItems,
    ambiguousItems,
  };
}

module.exports = {
  buildSuggestionGroups,
};
