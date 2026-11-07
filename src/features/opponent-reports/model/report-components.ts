import type { OpponentReport, OpponentReportComponentId } from '@src/domain/opponent-report/types';

export const DEFAULT_COMPONENT_ORDER: readonly OpponentReportComponentId[] = ['keys', 'serveTargets', 'attackers', 'setter', 'serve', 'overview', 'reception', 'board', 'notes'];

export function reportComponentOrder(report: OpponentReport): OpponentReportComponentId[] {
  return [...new Set([...(report.componentOrder ?? []), ...DEFAULT_COMPONENT_ORDER])].filter(id => DEFAULT_COMPONENT_ORDER.includes(id));
}

export function moveReportComponent(report: OpponentReport, from: OpponentReportComponentId, to: OpponentReportComponentId): OpponentReport {
  const order = reportComponentOrder(report);
  const source = order.indexOf(from), target = order.indexOf(to);
  if (source < 0 || target < 0 || source === target) return report;
  order.splice(source, 1); order.splice(target, 0, from);
  return {...report, componentOrder: order};
}
