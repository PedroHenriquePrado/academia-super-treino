// Sugestões para revisão humana. Telefone compartilhado ou nome igual não provam identidade.
export function normalizedPhone(value) {
  return String(value || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
}

export function normalizedName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^a-z0-9 ]/g, ' ').trim().replace(/\s+/g, ' ');
}

export function duplicateReasons(a, b) {
  const phoneA = normalizedPhone(a.phone), phoneB = normalizedPhone(b.phone);
  const nameA = normalizedName(a.name), nameB = normalizedName(b.name);
  const reasons = [];
  if (phoneA.length >= 10 && phoneA === phoneB) reasons.push('Mesmo telefone');
  if (nameA.length >= 5 && nameA === nameB) reasons.push('Mesmo nome');
  return reasons;
}

export function duplicatePairs(students) {
  const byPhone = new Map(), byName = new Map(), pairs = new Map();
  for (const student of students) {
    for (const [map, key] of [[byPhone, normalizedPhone(student.phone)], [byName, normalizedName(student.name)]]) {
      if (key.length < (map === byPhone ? 10 : 5)) continue;
      for (const previous of map.get(key) || []) {
        const pair = [previous, student].sort((a, b) => Number(a.id) - Number(b.id));
        pairs.set(`${pair[0].id}:${pair[1].id}`, pair);
      }
      map.set(key, [...(map.get(key) || []), student]);
    }
  }
  return [...pairs.values()].map(([a, b]) => ({ a, b, reasons: duplicateReasons(a, b) }))
    .sort((x, y) => y.reasons.length - x.reasons.length || Number(x.a.id) - Number(y.a.id) || Number(x.b.id) - Number(y.b.id));
}

// O índice único (student_id, reference_month) não permite dois recibos do mesmo mês.
// Um pago prevalece sobre aberto/cancelado; dois pagos exigem decisão humana.
export function invoiceMovePlan(keptInvoices, removedInvoices) {
  const keptByMonth = new Map(keptInvoices.map(invoice => [invoice.reference_month, invoice]));
  const rank = { paid: 3, open: 2, cancelled: 1 };
  const move = [], replace = [], discard = [], conflicts = [];
  for (const invoice of removedInvoices) {
    const current = keptByMonth.get(invoice.reference_month);
    if (!current) { move.push(invoice); continue; }
    if (current.status === 'paid' && invoice.status === 'paid') {
      conflicts.push({ kept: current, removed: invoice });
    } else if ((rank[invoice.status] || 0) > (rank[current.status] || 0)) {
      replace.push(current); move.push(invoice);
    } else discard.push(invoice);
  }
  return { move, replace, discard, conflicts };
}
