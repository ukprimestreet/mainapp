/**
 * Compatibility surface for the dashboard design system.
 *
 * The system itself lives in `components/dash/`. The older names used across the panels are mapped onto it
 * here, so every screen picks up the same look without 22 files needing to be touched at once:
 *   Panel → Card, Stat → Metric, StatRow → MetricRow, DashTable → Table.
 *
 * New screens should import from "@/components/dash" directly.
 */
import type { ReactNode } from "react";
import { Card, Metric, MetricRow, Table } from "./dash/Ui";
import { PageHead } from "./dash/Shell";

export {
  AccountBlock, Activity, Card, Cell, Chip, Empty, Metric, MetricRow, Notice, Progress, Row, Table,
  area, btn, field, labelCls,
} from "./dash/Ui";
export { BarChart, Breakdown, Sparkline } from "./dash/Chart";
export { Icon, type IconName } from "./dash/Icon";
export { DashShell as DashLayout, PageHead, type NavGroup, type NavItem } from "./dash/Shell";

export const Panel = Card;
export const Stat = Metric;
export const StatRow = MetricRow;
export const DashTable = Table;

/**
 * The previous page wrapper. Kept so existing screens keep working; it now only lays out the heading, because
 * the navigation rail is supplied by each panel's layout.
 */
export function DashShell({
  title, subtitle, actions, children, footer,
}: { title: string; subtitle?: string; nav?: ReactNode; actions?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <PageHead title={title} subtitle={subtitle} actions={actions} />
      {children}
      {footer}
    </>
  );
}
