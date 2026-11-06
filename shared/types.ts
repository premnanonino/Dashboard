export type PopStatus = 'Nominal' | 'Elevated' | 'Failover';
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type RecordType = 'CDR' | 'MDR' | 'SIP_EVENT' | 'BILLING_ALERT';
export type AlertSeverity = 'Nominal' | 'Warning' | 'Critical';

export interface TelnyxPopNode {
  id: string;
  code: string;
  city: string;
  region: string;
  coords3d: [number, number, number];
  activeChannels: number;
  maxChannels: number;
  rttMs: number;
  packetLossPct: number;
  status: PopStatus;
}

export interface AutoRechargeConfig {
  enabled: boolean;
  thresholdUsd: number;
  rechargeAmountUsd: number;
  paymentMethodBrand: string;
  paymentMethodLast4: string;
}

export interface BillingAccountOverview {
  accountId: string;
  organizationName: string;
  currency: 'USD';
  currentBalanceUsd: number;
  creditLimitUsd: number;
  availableCreditUsd: number;
  pendingUnbilledUsd: number;
  mtdSpendUsd: number;
  monthlyBudgetCapUsd: number;
  dailyBurnRateUsd: number;
  projectedMonthEndUsd: number;
  cycleStart: string;
  cycleEnd: string;
  daysRemaining: number;
  dataSourceMode: 'Live Telnyx v2 API' | 'Carrier Telemetry Engine';
  lastSyncedAt: string;
  autoRecharge: AutoRechargeConfig;
}

export interface BillingProductBreakdown {
  id: string;
  productName: string;
  skuCode: string;
  mtdCostUsd: number;
  prevPeriodCostUsd: number;
  deltaPct: number;
  volumeFormatted: string;
  unitRateFormatted: string;
  sharePct: number;
  colorHex: string;
}

export interface BillingGroupSummary {
  id: string;
  name: string;
  costCenter: string;
  assignedTrunks: number;
  assignedDids: number;
  monthlyCapUsd: number;
  mtdSpendUsd: number;
  status: AlertSeverity;
}

export interface InvoiceLineItem {
  description: string;
  quantity: string;
  unitPriceUsd: number;
  amountUsd: number;
}

export interface TelnyxInvoice {
  id: string;
  billingPeriod: string;
  issuedDate: string;
  dueDate: string;
  subtotalUsd: number;
  regulatoryFeesUsd: number;
  totalUsd: number;
  status: 'Paid' | 'Open' | 'Scheduled';
  lineItems: InvoiceLineItem[];
}

export interface HourlyBillingBucket {
  bucketIndex: number;
  hourLabel: string;
  voiceSpendUsd: number;
  messagingSpendUsd: number;
  sipTrunkSpendUsd: number;
  didProratedUsd: number;
  totalSpendUsd: number;
  callCount: number;
  messageCount: number;
}

export interface SipTrunkConnection {
  id: string;
  name: string;
  fqdn: string;
  authMode: 'FQDN + TLS' | 'IP ACL' | 'SIP Digest';
  primaryPop: string;
  secondaryPop: string;
  activeChannels: number;
  maxChannels: number;
  asrPct: number;
  acdSec: number;
  pddMs: number;
  mosScore: number;
  ratePerMinUsd: number;
  mtdSpendUsd: number;
  status: 'Nominal' | 'Warning' | 'Failover';
}

export interface DidPhoneNumber {
  e164: string;
  countryCode: string;
  rateCenter: string;
  connectionName: string;
  billingGroup: string;
  capabilities: string[];
  monthlyMrcUsd: number;
  mtdUsageUsd: number;
  status: 'Active' | 'Porting' | 'Suspended';
}

export interface DetailRecordEvent {
  id: string;
  timestamp: string;
  epochMs: number;
  type: RecordType;
  direction: 'Inbound' | 'Outbound' | 'System';
  fromNumber: string;
  toNumber: string;
  trunkName: string;
  popCode: string;
  durationOrUnits: string;
  rateUsd: number;
  chargeUsd: number;
  sipStatus: string;
  pddMs: number;
}

export interface BillingAlertRule {
  id: string;
  name: string;
  metricKey: string;
  thresholdFormatted: string;
  currentFormatted: string;
  triggered: boolean;
  severity: AlertSeverity;
}

export interface SystemArchitectureMetrics {
  rateLimiter: {
    algorithm: string;
    capacity: number;
    availableTokens: number;
    refillPerSec: number;
    totalAllowed: number;
    totalRejected: number;
  };
  circuitBreaker: {
    state: CircuitState;
    failureCount: number;
    failureThreshold: number;
    successCount: number;
    lastStateChangeAt: string;
    upstreamTarget: string;
  };
  lruCache: {
    capacity: number;
    size: number;
    hits: number;
    misses: number;
    evictions: number;
    hitRatePct: number;
  };
  consistentHash: {
    virtualNodesPerPop: number;
    totalRingNodes: number;
    activePops: number;
    partitionDistribution: Record<string, number>;
  };
  dsaEngines: {
    prefixTrie: {
      indexedNumbers: number;
      nodeCount: number;
      maxDepth: number;
      lastLookupTimeUs: number;
      lastQueryPrefix: string;
      lastMatchCount: number;
    };
    fenwickTree: {
      bucketCount: number;
      totalIndexedSpendUsd: number;
      lastRangeQueryTimeUs: number;
      lastQueryRange: [number, number];
    };
    minHeap: {
      heapSize: number;
      comparator: string;
      lastTopKTimeUs: number;
    };
    ringBuffer: {
      capacity: number;
      currentSize: number;
      totalWrites: number;
      overwriteCount: number;
    };
    slidingWindow: {
      windowSeconds: number;
      eventsInWindow: number;
      currentBurnPerMinUsd: number;
      anomalyDetected: boolean;
    };
  };
}

export interface DashboardSnapshot {
  account: BillingAccountOverview;
  products: BillingProductBreakdown[];
  billingGroups: BillingGroupSummary[];
  invoices: TelnyxInvoice[];
  hourlyBuckets: HourlyBillingBucket[];
  trunks: SipTrunkConnection[];
  pops: TelnyxPopNode[];
  alerts: BillingAlertRule[];
  recentEvents: DetailRecordEvent[];
  topCostlyTrunks: SipTrunkConnection[];
  systemMetrics: SystemArchitectureMetrics;
}
