import type { OpponentReport, OpponentReportComponentId } from '@src/domain/opponent-report/types';

export const DEFAULT_COMPONENT_ORDER: readonly OpponentReportComponentId[] = ['team', 'keys', 'serveTargets', 'attackers', 'setter', 'zones', 'serve', 'overview', 'reception', 'board', 'notes'];

/** The saved order; a component newer than the saved order goes where it sits by default, not last. */
export function reportComponentOrder(report: OpponentReport): OpponentReportComponentId[] {
  const order = [...new Set(report.componentOrder ?? [])].filter(id => DEFAULT_COMPONENT_ORDER.includes(id));
  DEFAULT_COMPONENT_ORDER.forEach((id, index) => {
    if (order.includes(id)) return;
    const previous = DEFAULT_COMPONENT_ORDER.slice(0, index).reverse().find(entry => order.includes(entry));
    order.splice(previous ? order.indexOf(previous) + 1 : 0, 0, id);
  });
  return order;
}

export function moveReportComponent(report: OpponentReport, from: OpponentReportComponentId, to: OpponentReportComponentId): OpponentReport {
  const order = reportComponentOrder(report);
  const source = order.indexOf(from), target = order.indexOf(to);
  if (source < 0 || target < 0 || source === target) return report;
  order.splice(source, 1); order.splice(target, 0, from);
  return {...report, componentOrder: order};
}
