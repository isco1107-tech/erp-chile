export type AnalyticsModule = 'analytics' | 'science';

export interface DailyMetric {
  date: string;
  netSales: number;
  purchases: number;
  income: number;
  expense: number;
  documents: number;
}

export interface ScienceResult {
  status: 'ready' | 'insufficient';
  reason: string;
  method: string;
  sampleDays: number;
  trendPercent: number | null;
  forecast: Array<{ date: string; expected: number; lower: number; upper: number }>;
  anomalies: Array<{ date: string; actual: number; expected: number; direction: 'high' | 'low' }>;
  backtestMae: number | null;
}

export interface AnalyticsSnapshot {
  companyId: string;
  companyName: string;
  generatedAt: string;
  timezone: 'America/Santiago';
  days: number;
  sources: { sales: boolean; purchases: boolean; treasury: boolean; inventory: boolean };
  daily: DailyMetric[];
  totals: {
    netSales: number | null;
    previousNetSales: number | null;
    purchases: number | null;
    income: number | null;
    expense: number | null;
    documents: number | null;
    receivable: number | null;
    payable: number | null;
  };
  operations: Array<{ key: string; label: string; value: number; href: string }>;
  activity: Array<{ id: string; entity: string; action: string; at: string }>;
  science: ScienceResult | null;
}
