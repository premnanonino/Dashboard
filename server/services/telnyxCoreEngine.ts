import type {
  AutoRechargeConfig,
  BillingAccountOverview,
  BillingAlertRule,
  BillingGroupSummary,
  BillingProductBreakdown,
  DashboardSnapshot,
  DetailRecordEvent,
  DidPhoneNumber,
  HourlyBillingBucket,
  SipTrunkConnection,
  SystemArchitectureMetrics,
  TelnyxInvoice,
  TelnyxPopNode,
} from '../../shared/types.ts';
import { FenwickTree } from '../dsa/fenwickTree.ts';
import { MinHeap } from '../dsa/minHeap.ts';
import { PrefixTrie } from '../dsa/prefixTrie.ts';
import { RingBuffer } from '../dsa/ringBuffer.ts';
import { SlidingWindowSpendTracker } from '../dsa/slidingWindow.ts';
import { CircuitBreaker } from '../system/circuitBreaker.ts';
import { ConsistentHashRing } from '../system/consistentHash.ts';
import { EventBus } from '../system/eventBus.ts';
import { LruCache } from '../system/lruCache.ts';
import { TokenBucketRateLimiter } from '../system/rateLimiter.ts';

interface StreamEvents extends Record<string, unknown> {
  telemetry_tick: {
    event: DetailRecordEvent;
    currentBalanceUsd: number;
    mtdSpendUsd: number;
    pendingUnbilledUsd: number;
    burnPerMinUsd: number;
    anomalyDetected: boolean;
  };
  billing_updated: BillingAccountOverview;
}

export class TelnyxCoreEngine {
  public readonly rateLimiter: TokenBucketRateLimiter;
  public readonly circuitBreaker: CircuitBreaker;
  public readonly lruCache: LruCache<DashboardSnapshot>;
  public readonly consistentHash: ConsistentHashRing;
  public readonly eventBus: EventBus<StreamEvents>;

  private readonly didTrie: PrefixTrie<DidPhoneNumber>;
  private readonly ratePrefixTrie: PrefixTrie<{ carrierRoute: string; ratePerMinUsd: number; popCode: string }>;
  private readonly billingFenwick: FenwickTree;
  private readonly trunkHeapTracker: MinHeap<SipTrunkConnection>;
  private readonly cdrRingBuffer: RingBuffer<DetailRecordEvent>;
  private readonly spendWindow: SlidingWindowSpendTracker;

  private account: BillingAccountOverview;
  private products: BillingProductBreakdown[];
  private billingGroups: BillingGroupSummary[];
  private invoices: TelnyxInvoice[];
  private hourlyBuckets: HourlyBillingBucket[];
  private trunks: SipTrunkConnection[];
  private pops: TelnyxPopNode[];
  private allDids: DidPhoneNumber[];
  private eventSeq: number;
  private tickTimer: ReturnType<typeof setInterval> | null;

  constructor() {
    this.rateLimiter = new TokenBucketRateLimiter(180, 40);
    this.circuitBreaker = new CircuitBreaker('https://api.telnyx.com/v2', 3, 15000, 2);
    this.lruCache = new LruCache<DashboardSnapshot>(32, 4000);
    this.consistentHash = new ConsistentHashRing(120);
    this.eventBus = new EventBus<StreamEvents>();

    this.didTrie = new PrefixTrie<DidPhoneNumber>();
    this.ratePrefixTrie = new PrefixTrie<{ carrierRoute: string; ratePerMinUsd: number; popCode: string }>();
    this.billingFenwick = new FenwickTree(24);
    this.trunkHeapTracker = new MinHeap<SipTrunkConnection>((a, b) => a.mtdSpendUsd - b.mtdSpendUsd);
    this.cdrRingBuffer = new RingBuffer<DetailRecordEvent>(256);
    this.spendWindow = new SlidingWindowSpendTracker(300, 14.0);
    this.eventSeq = 1000;
    this.tickTimer = null;

    const hasLiveKey = Boolean(process.env.TELNYX_API_KEY && process.env.TELNYX_API_KEY.trim().length > 8);

    this.account = {
      accountId: 'acct_telnyx_948102',
      organizationName: 'Northstar Carrier Operations',
      currency: 'USD',
      currentBalanceUsd: 4812.40,
      creditLimitUsd: 2500.00,
      availableCreditUsd: 7312.40,
      pendingUnbilledUsd: 342.18,
      mtdSpendUsd: 4647.60,
      monthlyBudgetCapUsd: 7500.00,
      dailyBurnRateUsd: 221.31,
      projectedMonthEndUsd: 6639.42,
      cycleStart: '2026-11-01',
      cycleEnd: '2026-11-30',
      daysRemaining: 24,
      dataSourceMode: hasLiveKey ? 'Live Telnyx v2 API' : 'Carrier Telemetry Engine',
      lastSyncedAt: new Date().toISOString(),
      autoRecharge: {
        enabled: true,
        thresholdUsd: 500.00,
        rechargeAmountUsd: 2000.00,
        paymentMethodBrand: 'Visa Corporate',
        paymentMethodLast4: '4821',
      },
    };

    this.pops = [
      {
        id: 'pop-iad',
        code: 'IAD1',
        city: 'Ashburn, VA',
        region: 'US-East',
        coords3d: [-1.75, 0.35, 1.05],
        activeChannels: 1420,
        maxChannels: 2500,
        rttMs: 11.4,
        packetLossPct: 0.01,
        status: 'Nominal',
      },
      {
        id: 'pop-ord',
        code: 'ORD1',
        city: 'Chicago, IL',
        region: 'US-Central',
        coords3d: [-2.25, 0.55, -0.35],
        activeChannels: 980,
        maxChannels: 2000,
        rttMs: 16.8,
        packetLossPct: 0.02,
        status: 'Nominal',
      },
      {
        id: 'pop-sjc',
        code: 'SJC1',
        city: 'San Jose, CA',
        region: 'US-West',
        coords3d: [-2.75, 0.15, -1.45],
        activeChannels: 760,
        maxChannels: 1800,
        rttMs: 22.1,
        packetLossPct: 0.01,
        status: 'Nominal',
      },
      {
        id: 'pop-fra',
        code: 'FRA1',
        city: 'Frankfurt, DE',
        region: 'EU-Central',
        coords3d: [1.55, 0.52, 0.72],
        activeChannels: 1140,
        maxChannels: 2200,
        rttMs: 14.2,
        packetLossPct: 0.01,
        status: 'Nominal',
      },
      {
        id: 'pop-lhr',
        code: 'LHR1',
        city: 'London, UK',
        region: 'EU-West',
        coords3d: [0.85, 0.68, -0.58],
        activeChannels: 640,
        maxChannels: 1500,
        rttMs: 18.6,
        packetLossPct: 0.03,
        status: 'Nominal',
      },
      {
        id: 'pop-nrt',
        code: 'NRT1',
        city: 'Tokyo, JP',
        region: 'APAC-East',
        coords3d: [2.68, 0.22, -1.18],
        activeChannels: 510,
        maxChannels: 1400,
        rttMs: 28.4,
        packetLossPct: 0.02,
        status: 'Nominal',
      },
    ];

    this.products = [
      {
        id: 'prod-sip',
        productName: 'Elastic SIP Trunking',
        skuCode: 'SIP-TRUNK-OUT/IN',
        mtdCostUsd: 2184.50,
        prevPeriodCostUsd: 2053.10,
        deltaPct: 6.4,
        volumeFormatted: '546,125 min',
        unitRateFormatted: '$0.0040 / min',
        sharePct: 47.0,
        colorHex: '#00875A',
      },
      {
        id: 'prod-voice',
        productName: 'Programmable Voice API',
        skuCode: 'VOICE-CALL-CTRL',
        mtdCostUsd: 1142.80,
        prevPeriodCostUsd: 1027.70,
        deltaPct: 11.2,
        volumeFormatted: '163,257 min',
        unitRateFormatted: '$0.0070 / min',
        sharePct: 24.6,
        colorHex: '#1D4ED8',
      },
      {
        id: 'prod-msg',
        productName: 'Messaging API (10DLC & Toll-Free)',
        skuCode: 'MSG-SMS-MMS-V2',
        mtdCostUsd: 784.20,
        prevPeriodCostUsd: 809.28,
        deltaPct: -3.1,
        volumeFormatted: '196,050 seg',
        unitRateFormatted: '$0.0040 / seg',
        sharePct: 16.9,
        colorHex: '#0F766E',
      },
      {
        id: 'prod-did',
        productName: 'Phone Numbers & DIDs (MRC)',
        skuCode: 'NUM-DID-MRC',
        mtdCostUsd: 312.00,
        prevPeriodCostUsd: 305.88,
        deltaPct: 2.0,
        volumeFormatted: '312 active DIDs',
        unitRateFormatted: '$1.00 / mo',
        sharePct: 6.7,
        colorHex: '#334155',
      },
      {
        id: 'prod-verify',
        productName: 'Verify API & Number Lookup',
        skuCode: 'VERIFY-LRN-HLR',
        mtdCostUsd: 148.60,
        prevPeriodCostUsd: 141.79,
        deltaPct: 4.8,
        volumeFormatted: '29,720 req',
        unitRateFormatted: '$0.0050 / req',
        sharePct: 3.2,
        colorHex: '#B45309',
      },
      {
        id: 'prod-e911',
        productName: 'Emergency E911 & Regulatory Fees',
        skuCode: 'E911-USF-REG',
        mtdCostUsd: 75.50,
        prevPeriodCostUsd: 75.50,
        deltaPct: 0.0,
        volumeFormatted: '151 endpoints',
        unitRateFormatted: '$0.50 / mo',
        sharePct: 1.6,
        colorHex: '#64748B',
      },
    ];

    this.billingGroups = [
      {
        id: 'bg-us-voice',
        name: 'US-East Production Voice',
        costCenter: 'CC-401-VOICE',
        assignedTrunks: 3,
        assignedDids: 148,
        monthlyCapUsd: 3500.00,
        mtdSpendUsd: 2290.40,
        status: 'Nominal',
      },
      {
        id: 'bg-eu-sip',
        name: 'EU-Central Carrier Trunks',
        costCenter: 'CC-402-EMEA',
        assignedTrunks: 2,
        assignedDids: 84,
        monthlyCapUsd: 2000.00,
        mtdSpendUsd: 1218.20,
        status: 'Nominal',
      },
      {
        id: 'bg-sms-10dlc',
        name: 'Transactional 10DLC & Verify',
        costCenter: 'CC-409-MSG',
        assignedTrunks: 1,
        assignedDids: 52,
        monthlyCapUsd: 1200.00,
        mtdSpendUsd: 892.80,
        status: 'Warning',
      },
      {
        id: 'bg-apac-edge',
        name: 'APAC & Global Failover Pool',
        costCenter: 'CC-415-APAC',
        assignedTrunks: 2,
        assignedDids: 28,
        monthlyCapUsd: 800.00,
        mtdSpendUsd: 246.20,
        status: 'Nominal',
      },
    ];

    this.invoices = [
      {
        id: 'INV-2026-1101',
        billingPeriod: 'Nov 01 – Nov 30, 2026 (Current)',
        issuedDate: '2026-11-01',
        dueDate: '2026-12-01',
        subtotalUsd: 4572.10,
        regulatoryFeesUsd: 75.50,
        totalUsd: 4647.60,
        status: 'Open',
        lineItems: [
          { description: 'Elastic SIP Trunking Outbound/Inbound Termination', quantity: '546,125 min', unitPriceUsd: 0.004, amountUsd: 2184.50 },
          { description: 'Programmable Voice Call Control & Media Forking', quantity: '163,257 min', unitPriceUsd: 0.007, amountUsd: 1142.80 },
          { description: '10DLC & Toll-Free SMS/MMS Messaging Segments', quantity: '196,050 seg', unitPriceUsd: 0.004, amountUsd: 784.20 },
          { description: 'Local & Toll-Free DID Monthly Recurring Charges', quantity: '312 numbers', unitPriceUsd: 1.0, amountUsd: 312.00 },
          { description: 'Verify 2FA & LRN Dip Queries', quantity: '29,720 queries', unitPriceUsd: 0.005, amountUsd: 148.60 },
          { description: 'E911 Provisioning, USF & Carrier Cost Recovery', quantity: '151 endpoints', unitPriceUsd: 0.5, amountUsd: 75.50 },
        ],
      },
      {
        id: 'INV-2026-1001',
        billingPeriod: 'Oct 01 – Oct 31, 2026',
        issuedDate: '2026-10-01',
        dueDate: '2026-11-01',
        subtotalUsd: 6412.80,
        regulatoryFeesUsd: 108.40,
        totalUsd: 6521.20,
        status: 'Paid',
        lineItems: [
          { description: 'Elastic SIP Trunking Outbound/Inbound Termination', quantity: '782,400 min', unitPriceUsd: 0.004, amountUsd: 3129.60 },
          { description: 'Programmable Voice Call Control', quantity: '224,100 min', unitPriceUsd: 0.007, amountUsd: 1568.70 },
          { description: '10DLC & Toll-Free SMS Messaging', quantity: '312,000 seg', unitPriceUsd: 0.004, amountUsd: 1248.00 },
          { description: 'Local & Toll-Free DID MRC', quantity: '306 numbers', unitPriceUsd: 1.0, amountUsd: 306.00 },
          { description: 'Verify 2FA & LRN Queries', quantity: '32,100 queries', unitPriceUsd: 0.005, amountUsd: 160.50 },
          { description: 'E911 & Regulatory Surcharges', quantity: '151 endpoints', unitPriceUsd: 0.718, amountUsd: 108.40 },
        ],
      },
      {
        id: 'INV-2026-0901',
        billingPeriod: 'Sep 01 – Sep 30, 2026',
        issuedDate: '2026-09-01',
        dueDate: '2026-10-01',
        subtotalUsd: 5980.40,
        regulatoryFeesUsd: 102.10,
        totalUsd: 6082.50,
        status: 'Paid',
        lineItems: [
          { description: 'Elastic SIP Trunking Outbound/Inbound Termination', quantity: '731,000 min', unitPriceUsd: 0.004, amountUsd: 2924.00 },
          { description: 'Programmable Voice Call Control', quantity: '208,200 min', unitPriceUsd: 0.007, amountUsd: 1457.40 },
          { description: '10DLC & Toll-Free SMS Messaging', quantity: '289,000 seg', unitPriceUsd: 0.004, amountUsd: 1156.00 },
          { description: 'Local & Toll-Free DID MRC', quantity: '298 numbers', unitPriceUsd: 1.0, amountUsd: 298.00 },
          { description: 'Verify 2FA & LRN Queries', quantity: '29,000 queries', unitPriceUsd: 0.005, amountUsd: 145.00 },
          { description: 'E911 & Regulatory Surcharges', quantity: '148 endpoints', unitPriceUsd: 0.69, amountUsd: 102.10 },
        ],
      },
      {
        id: 'INV-2026-0801',
        billingPeriod: 'Aug 01 – Aug 31, 2026',
        issuedDate: '2026-08-01',
        dueDate: '2026-09-01',
        subtotalUsd: 5640.00,
        regulatoryFeesUsd: 96.80,
        totalUsd: 5736.80,
        status: 'Paid',
        lineItems: [
          { description: 'Elastic SIP Trunking & Voice Services', quantity: '890,000 min', unitPriceUsd: 0.0048, amountUsd: 4272.00 },
          { description: 'Messaging & Verify API Bundle', quantity: '270,000 units', unitPriceUsd: 0.004, amountUsd: 1080.00 },
          { description: 'DID MRC & Regulatory Fees', quantity: '288 numbers', unitPriceUsd: 1.336, amountUsd: 384.80 },
        ],
      },
    ];

    this.trunks = [
      {
        id: 'conn_sip_us_east',
        name: 'prod-us-east-tls',
        fqdn: 'prod-us-east.sip.telnyx.com',
        authMode: 'FQDN + TLS',
        primaryPop: 'IAD1',
        secondaryPop: 'ORD1',
        activeChannels: 842,
        maxChannels: 1500,
        asrPct: 98.4,
        acdSec: 184,
        pddMs: 142,
        mosScore: 4.44,
        ratePerMinUsd: 0.004,
        mtdSpendUsd: 1124.80,
        status: 'Nominal',
      },
      {
        id: 'conn_sip_eu_fra',
        name: 'eu-central-core',
        fqdn: 'eu-fra-core.sip.telnyx.com',
        authMode: 'FQDN + TLS',
        primaryPop: 'FRA1',
        secondaryPop: 'LHR1',
        activeChannels: 690,
        maxChannels: 1200,
        asrPct: 97.9,
        acdSec: 212,
        pddMs: 168,
        mosScore: 4.41,
        ratePerMinUsd: 0.0045,
        mtdSpendUsd: 894.30,
        status: 'Nominal',
      },
      {
        id: 'conn_voice_cc_chi',
        name: 'us-chi-contact-center',
        fqdn: 'chi-cc-voice.sip.telnyx.com',
        authMode: 'IP ACL',
        primaryPop: 'ORD1',
        secondaryPop: 'IAD1',
        activeChannels: 615,
        maxChannels: 1000,
        asrPct: 96.8,
        acdSec: 265,
        pddMs: 195,
        mosScore: 4.38,
        ratePerMinUsd: 0.007,
        mtdSpendUsd: 782.40,
        status: 'Nominal',
      },
      {
        id: 'conn_sip_us_west',
        name: 'us-west-webrtc-gw',
        fqdn: 'sjc-webrtc.sip.telnyx.com',
        authMode: 'FQDN + TLS',
        primaryPop: 'SJC1',
        secondaryPop: 'ORD1',
        activeChannels: 488,
        maxChannels: 900,
        asrPct: 97.2,
        acdSec: 156,
        pddMs: 174,
        mosScore: 4.42,
        ratePerMinUsd: 0.004,
        mtdSpendUsd: 618.90,
        status: 'Nominal',
      },
      {
        id: 'conn_tollfree_us',
        name: 'tollfree-inbound-us',
        fqdn: 'tf-inbound.sip.telnyx.com',
        authMode: 'IP ACL',
        primaryPop: 'IAD1',
        secondaryPop: 'SJC1',
        activeChannels: 412,
        maxChannels: 800,
        asrPct: 99.1,
        acdSec: 298,
        pddMs: 128,
        mosScore: 4.46,
        ratePerMinUsd: 0.006,
        mtdSpendUsd: 542.60,
        status: 'Nominal',
      },
      {
        id: 'conn_eu_uk_gw',
        name: 'uk-lon-enterprise',
        fqdn: 'lon-ent.sip.telnyx.com',
        authMode: 'FQDN + TLS',
        primaryPop: 'LHR1',
        secondaryPop: 'FRA1',
        activeChannels: 318,
        maxChannels: 600,
        asrPct: 95.4,
        acdSec: 174,
        pddMs: 248,
        mosScore: 4.29,
        ratePerMinUsd: 0.0052,
        mtdSpendUsd: 368.40,
        status: 'Warning',
      },
      {
        id: 'conn_apac_tyo',
        name: 'apac-tyo-carrier',
        fqdn: 'tyo-carrier.sip.telnyx.com',
        authMode: 'SIP Digest',
        primaryPop: 'NRT1',
        secondaryPop: 'SJC1',
        activeChannels: 264,
        maxChannels: 600,
        asrPct: 96.5,
        acdSec: 192,
        pddMs: 215,
        mosScore: 4.35,
        ratePerMinUsd: 0.0085,
        mtdSpendUsd: 214.20,
        status: 'Nominal',
      },
      {
        id: 'conn_verify_otp',
        name: 'verify-voice-fallback',
        fqdn: 'verify-otp.sip.telnyx.com',
        authMode: 'FQDN + TLS',
        primaryPop: 'IAD1',
        secondaryPop: 'FRA1',
        activeChannels: 124,
        maxChannels: 400,
        asrPct: 94.2,
        acdSec: 24,
        pddMs: 162,
        mosScore: 4.40,
        ratePerMinUsd: 0.005,
        mtdSpendUsd: 102.00,
        status: 'Nominal',
      },
    ];

    this.hourlyBuckets = [];
    this.allDids = [];

    this.initializeHourlyFenwickBuckets();
    this.initializeDidTrieAndRateDeck();
    this.rebuildConsistentHashRing();
    this.seedInitialCdrRingBuffer();

    // Prime Top-K heap timing
    MinHeap.extractTopK(this.trunks, 4, (a, b) => a.mtdSpendUsd - b.mtdSpendUsd);
    // Prime Trie timing
    this.didTrie.searchByPrefix('+1415', 25);
    // Prime Fenwick timing
    this.billingFenwick.rangeSum(0, 23);
  }

  private initializeHourlyFenwickBuckets(): void {
    const hourlyCurve = [
      4.2, 3.8, 3.1, 2.9, 3.4, 4.9,
      7.6, 11.4, 15.8, 18.2, 19.6, 18.9,
      17.4, 19.1, 20.4, 18.7, 16.5, 13.8,
      10.9, 8.7, 7.2, 6.1, 5.4, 4.7,
    ];

    this.hourlyBuckets = hourlyCurve.map((baseSpend, hour) => {
      const voice = Number((baseSpend * 0.28).toFixed(2));
      const sip = Number((baseSpend * 0.48).toFixed(2));
      const msg = Number((baseSpend * 0.19).toFixed(2));
      const did = Number((baseSpend * 0.05).toFixed(2));
      const total = Number((voice + sip + msg + did).toFixed(2));

      this.billingFenwick.update(hour, total);

      return {
        bucketIndex: hour,
        hourLabel: `${String(hour).padStart(2, '0')}:00`,
        voiceSpendUsd: voice,
        messagingSpendUsd: msg,
        sipTrunkSpendUsd: sip,
        didProratedUsd: did,
        totalSpendUsd: total,
        callCount: Math.round(baseSpend * 185),
        messageCount: Math.round(baseSpend * 240),
      };
    });
  }

  private initializeDidTrieAndRateDeck(): void {
    // Rate-deck prefixes for Longest Prefix Match (LPM)
    const ratePrefixes: Array<{ prefix: string; carrierRoute: string; ratePerMinUsd: number; popCode: string }> = [
      { prefix: '+1', carrierRoute: 'NANP Domestic Tier-1', ratePerMinUsd: 0.004, popCode: 'IAD1' },
      { prefix: '+1415', carrierRoute: 'US-CA San Francisco Metro LRN', ratePerMinUsd: 0.0036, popCode: 'SJC1' },
      { prefix: '+1212', carrierRoute: 'US-NY Manhattan Metro LRN', ratePerMinUsd: 0.0035, popCode: 'IAD1' },
      { prefix: '+1312', carrierRoute: 'US-IL Chicago Metro LRN', ratePerMinUsd: 0.0037, popCode: 'ORD1' },
      { prefix: '+1800', carrierRoute: 'US Toll-Free Origination', ratePerMinUsd: 0.006, popCode: 'IAD1' },
      { prefix: '+1888', carrierRoute: 'US Toll-Free Origination', ratePerMinUsd: 0.006, popCode: 'ORD1' },
      { prefix: '+44', carrierRoute: 'UK National Fixed/Mobile', ratePerMinUsd: 0.0058, popCode: 'LHR1' },
      { prefix: '+4420', carrierRoute: 'UK London Geographic Tier-1', ratePerMinUsd: 0.0048, popCode: 'LHR1' },
      { prefix: '+49', carrierRoute: 'Germany National Carrier', ratePerMinUsd: 0.0052, popCode: 'FRA1' },
      { prefix: '+4969', carrierRoute: 'Germany Frankfurt Direct Peering', ratePerMinUsd: 0.0042, popCode: 'FRA1' },
      { prefix: '+4930', carrierRoute: 'Germany Berlin Metro Peering', ratePerMinUsd: 0.0044, popCode: 'FRA1' },
      { prefix: '+81', carrierRoute: 'Japan National Carrier', ratePerMinUsd: 0.0092, popCode: 'NRT1' },
      { prefix: '+813', carrierRoute: 'Japan Tokyo 03 Direct Trunk', ratePerMinUsd: 0.0082, popCode: 'NRT1' },
    ];

    for (const r of ratePrefixes) {
      this.ratePrefixTrie.insert(r.prefix, {
        carrierRoute: r.carrierRoute,
        ratePerMinUsd: r.ratePerMinUsd,
        popCode: r.popCode,
      });
    }

    const seedSpecs: Array<{
      prefix: string;
      countryCode: string;
      rateCenter: string;
      connectionName: string;
      billingGroup: string;
      capabilities: string[];
      mrc: number;
      count: number;
    }> = [
      {
        prefix: '+1415890',
        countryCode: 'US',
        rateCenter: 'San Francisco, CA',
        connectionName: 'us-west-webrtc-gw',
        billingGroup: 'US-East Production Voice',
        capabilities: ['Voice', 'SMS', 'MMS', 'E911'],
        mrc: 1.0,
        count: 7,
      },
      {
        prefix: '+1212650',
        countryCode: 'US',
        rateCenter: 'New York, NY',
        connectionName: 'prod-us-east-tls',
        billingGroup: 'US-East Production Voice',
        capabilities: ['Voice', 'SMS', 'E911'],
        mrc: 1.0,
        count: 7,
      },
      {
        prefix: '+1312740',
        countryCode: 'US',
        rateCenter: 'Chicago, IL',
        connectionName: 'us-chi-contact-center',
        billingGroup: 'Transactional 10DLC & Verify',
        capabilities: ['Voice', 'SMS', 'MMS'],
        mrc: 1.0,
        count: 6,
      },
      {
        prefix: '+1800555',
        countryCode: 'US-TF',
        rateCenter: 'US Toll-Free 800',
        connectionName: 'tollfree-inbound-us',
        billingGroup: 'US-East Production Voice',
        capabilities: ['Voice', 'SMS'],
        mrc: 2.0,
        count: 4,
      },
      {
        prefix: '+44207946',
        countryCode: 'GB',
        rateCenter: 'London, UK',
        connectionName: 'uk-lon-enterprise',
        billingGroup: 'EU-Central Carrier Trunks',
        capabilities: ['Voice', 'SMS'],
        mrc: 1.25,
        count: 5,
      },
      {
        prefix: '+49691200',
        countryCode: 'DE',
        rateCenter: 'Frankfurt, DE',
        connectionName: 'eu-central-core',
        billingGroup: 'EU-Central Carrier Trunks',
        capabilities: ['Voice', 'E911'],
        mrc: 1.15,
        count: 5,
      },
      {
        prefix: '+8135550',
        countryCode: 'JP',
        rateCenter: 'Tokyo, JP',
        connectionName: 'apac-tyo-carrier',
        billingGroup: 'APAC & Global Failover Pool',
        capabilities: ['Voice'],
        mrc: 2.5,
        count: 4,
      },
    ];

    let idx = 100;
    for (const spec of seedSpecs) {
      for (let i = 0; i < spec.count; i += 1) {
        idx += 1;
        const suffix = String(idx * 17 + i * 31).slice(-4).padStart(4, '0');
        const e164 = `${spec.prefix}${suffix}`;
        const did: DidPhoneNumber = {
          e164,
          countryCode: spec.countryCode,
          rateCenter: spec.rateCenter,
          connectionName: spec.connectionName,
          billingGroup: spec.billingGroup,
          capabilities: spec.capabilities,
          monthlyMrcUsd: spec.mrc,
          mtdUsageUsd: Number((4.2 + ((idx * 13) % 29) * 0.65).toFixed(2)),
          status: idx % 19 === 0 ? 'Porting' : 'Active',
        };
        this.allDids.push(did);
        this.didTrie.insert(e164, did);
      }
    }
  }

  public rebuildConsistentHashRing(): void {
    const activePopCodes = this.pops
      .filter((p) => p.status !== 'Failover')
      .map((p) => p.code);
    const keys = this.trunks.map((t) => t.fqdn).concat(this.allDids.map((d) => d.e164));
    this.consistentHash.rebuild(activePopCodes, keys);
  }

  private seedInitialCdrRingBuffer(): void {
    const now = Date.now();
    for (let i = 36; i >= 1; i -= 1) {
      const event = this.generateSyntheticEvent(now - i * 14000);
      this.cdrRingBuffer.push(event);
      if (i <= 12) {
        this.spendWindow.record(event.epochMs, event.chargeUsd);
      }
    }
  }

  private generateSyntheticEvent(epochMs = Date.now()): DetailRecordEvent {
    this.eventSeq += 1;
    const trunk = this.trunks[this.eventSeq % this.trunks.length];
    const did = this.allDids[this.eventSeq % this.allDids.length];
    const isMessaging = this.eventSeq % 3 === 0;
    const isSipWarning = this.eventSeq % 17 === 0;

    if (isMessaging) {
      const segments = 1 + (this.eventSeq % 3);
      const rate = 0.004;
      const charge = Number((segments * rate).toFixed(4));
      return {
        id: `mdr_${this.eventSeq}`,
        timestamp: new Date(epochMs).toISOString(),
        epochMs,
        type: 'MDR',
        direction: this.eventSeq % 2 === 0 ? 'Outbound' : 'Inbound',
        fromNumber: did.e164,
        toNumber: `+1415555${String(1000 + (this.eventSeq % 8999))}`,
        trunkName: trunk.name,
        popCode: trunk.primaryPop,
        durationOrUnits: `${segments} seg`,
        rateUsd: rate,
        chargeUsd: charge,
        sipStatus: 'Delivered',
        pddMs: 64 + (this.eventSeq % 35),
      };
    }

    const durationSec = isSipWarning ? 0 : 28 + ((this.eventSeq * 19) % 240);
    const minutes = durationSec / 60;
    const charge = Number((minutes * trunk.ratePerMinUsd).toFixed(4));

    return {
      id: `cdr_${this.eventSeq}`,
      timestamp: new Date(epochMs).toISOString(),
      epochMs,
      type: isSipWarning ? 'SIP_EVENT' : 'CDR',
      direction: this.eventSeq % 2 === 0 ? 'Outbound' : 'Inbound',
      fromNumber: did.e164,
      toNumber: `+1212880${String(1000 + (this.eventSeq % 8999))}`,
      trunkName: trunk.name,
      popCode: trunk.primaryPop,
      durationOrUnits: `${durationSec}s`,
      rateUsd: trunk.ratePerMinUsd,
      chargeUsd: charge,
      sipStatus: isSipWarning ? '503 Service Unavailable' : '200 OK',
      pddMs: isSipWarning ? 412 : trunk.pddMs + ((this.eventSeq % 24) - 12),
    };
  }

  public startLiveTelemetryLoop(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => {
      this.processTelemetryTick();
    }, 3500);
  }

  public stopLiveTelemetryLoop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private processTelemetryTick(): void {
    const now = Date.now();
    const event = this.generateSyntheticEvent(now);
    this.cdrRingBuffer.push(event);
    this.spendWindow.record(now, event.chargeUsd);

    // Update current hour bucket in Fenwick Tree
    const currentHour = new Date(now).getHours();
    this.billingFenwick.update(currentHour, event.chargeUsd);
    const bucket = this.hourlyBuckets[currentHour];
    if (bucket) {
      bucket.totalSpendUsd = Number((bucket.totalSpendUsd + event.chargeUsd).toFixed(4));
      if (event.type === 'MDR') {
        bucket.messagingSpendUsd = Number((bucket.messagingSpendUsd + event.chargeUsd).toFixed(4));
        bucket.messageCount += 1;
      } else {
        bucket.sipTrunkSpendUsd = Number((bucket.sipTrunkSpendUsd + event.chargeUsd).toFixed(4));
        bucket.callCount += 1;
      }
    }

    // Update financial counters
    this.account.pendingUnbilledUsd = Number((this.account.pendingUnbilledUsd + event.chargeUsd).toFixed(2));
    this.account.mtdSpendUsd = Number((this.account.mtdSpendUsd + event.chargeUsd).toFixed(2));
    this.account.currentBalanceUsd = Math.max(0, Number((this.account.currentBalanceUsd - event.chargeUsd).toFixed(2)));
    this.account.availableCreditUsd = Number((this.account.currentBalanceUsd + this.account.creditLimitUsd).toFixed(2));
    this.account.lastSyncedAt = new Date(now).toISOString();

    this.checkAutoRecharge();
    this.lruCache.invalidateAll();

    const windowStats = this.spendWindow.getStats(now);
    this.eventBus.publish('telemetry_tick', {
      event,
      currentBalanceUsd: this.account.currentBalanceUsd,
      mtdSpendUsd: this.account.mtdSpendUsd,
      pendingUnbilledUsd: this.account.pendingUnbilledUsd,
      burnPerMinUsd: windowStats.currentBurnPerMinUsd,
      anomalyDetected: windowStats.anomalyDetected,
    });
  }

  private checkAutoRecharge(): void {
    if (
      this.account.autoRecharge.enabled &&
      this.account.currentBalanceUsd < this.account.autoRecharge.thresholdUsd
    ) {
      const recharge = this.account.autoRecharge.rechargeAmountUsd;
      this.account.currentBalanceUsd = Number((this.account.currentBalanceUsd + recharge).toFixed(2));
      this.account.availableCreditUsd = Number((this.account.currentBalanceUsd + this.account.creditLimitUsd).toFixed(2));
      this.eventSeq += 1;
      this.cdrRingBuffer.push({
        id: `bil_${this.eventSeq}`,
        timestamp: new Date().toISOString(),
        epochMs: Date.now(),
        type: 'BILLING_ALERT',
        direction: 'System',
        fromNumber: 'AUTO-RECHARGE',
        toNumber: this.account.accountId,
        trunkName: `${this.account.autoRecharge.paymentMethodBrand} •••• ${this.account.autoRecharge.paymentMethodLast4}`,
        popCode: 'BILLING',
        durationOrUnits: `+$${recharge.toFixed(2)}`,
        rateUsd: 1,
        chargeUsd: 0,
        sipStatus: 'Auto-Recharge Settled',
        pddMs: 18,
      });
    }
  }

  public async trySyncTelnyxLiveApi(): Promise<{ synced: boolean; source: string }> {
    const apiKey = process.env.TELNYX_API_KEY?.trim();
    if (!apiKey) {
      this.account.lastSyncedAt = new Date().toISOString();
      this.lruCache.invalidateAll();
      return { synced: true, source: 'Carrier Telemetry Engine' };
    }

    const result = await this.circuitBreaker.execute(
      async () => {
        const res = await fetch('https://api.telnyx.com/v2/balance', {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(4500),
        });
        if (!res.ok) {
          throw new Error(`Telnyx API responded ${res.status}`);
        }
        const json = (await res.json()) as {
          data?: {
            balance?: string;
            credit_limit?: string;
            available_credit?: string;
            pending?: string;
            currency?: string;
          };
        };
        if (json.data) {
          const bal = Number(json.data.balance);
          const cred = Number(json.data.credit_limit);
          const avail = Number(json.data.available_credit);
          const pend = Number(json.data.pending);
          if (!Number.isNaN(bal)) this.account.currentBalanceUsd = bal;
          if (!Number.isNaN(cred)) this.account.creditLimitUsd = cred;
          if (!Number.isNaN(avail)) this.account.availableCreditUsd = avail;
          if (!Number.isNaN(pend)) this.account.pendingUnbilledUsd = pend;
          this.account.dataSourceMode = 'Live Telnyx v2 API';
        }
        this.account.lastSyncedAt = new Date().toISOString();
        this.lruCache.invalidateAll();
        return true;
      },
      () => {
        this.account.lastSyncedAt = new Date().toISOString();
        return false;
      },
    );

    return {
      synced: true,
      source: result.fromFallback ? 'Carrier Telemetry Engine (Circuit Fallback)' : 'Live Telnyx v2 API',
    };
  }

  public updateBillingConfig(payload: {
    monthlyBudgetCapUsd?: number;
    autoRecharge?: Partial<AutoRechargeConfig>;
  }): BillingAccountOverview {
    if (
      typeof payload.monthlyBudgetCapUsd === 'number' &&
      Number.isFinite(payload.monthlyBudgetCapUsd) &&
      payload.monthlyBudgetCapUsd >= 500
    ) {
      this.account.monthlyBudgetCapUsd = Number(payload.monthlyBudgetCapUsd.toFixed(2));
    }

    if (payload.autoRecharge) {
      this.account.autoRecharge = {
        ...this.account.autoRecharge,
        ...payload.autoRecharge,
      };
    }

    this.account.lastSyncedAt = new Date().toISOString();
    this.lruCache.invalidateAll();
    this.eventBus.publish('billing_updated', this.account);
    return this.account;
  }

  public executeManualTopUp(amountUsd: number): BillingAccountOverview {
    const safeAmount = Math.min(50000, Math.max(50, Number(amountUsd) || 500));
    this.account.currentBalanceUsd = Number((this.account.currentBalanceUsd + safeAmount).toFixed(2));
    this.account.availableCreditUsd = Number((this.account.currentBalanceUsd + this.account.creditLimitUsd).toFixed(2));
    this.account.lastSyncedAt = new Date().toISOString();

    this.eventSeq += 1;
    this.cdrRingBuffer.push({
      id: `topup_${this.eventSeq}`,
      timestamp: new Date().toISOString(),
      epochMs: Date.now(),
      type: 'BILLING_ALERT',
      direction: 'System',
      fromNumber: 'MANUAL-TOPUP',
      toNumber: this.account.accountId,
      trunkName: `${this.account.autoRecharge.paymentMethodBrand} •••• ${this.account.autoRecharge.paymentMethodLast4}`,
      popCode: 'BILLING',
      durationOrUnits: `+$${safeAmount.toFixed(2)}`,
      rateUsd: 1,
      chargeUsd: 0,
      sipStatus: 'Credit Settled',
      pddMs: 14,
    });

    this.lruCache.invalidateAll();
    this.eventBus.publish('billing_updated', this.account);
    return this.account;
  }

  public simulateTrafficAndSpendSpike(): {
    injectedEvents: number;
    addedSpendUsd: number;
    account: BillingAccountOverview;
  } {
    const now = Date.now();
    const currentHour = new Date(now).getHours();
    let totalAdded = 0;
    const count = 18;

    for (let i = 0; i < count; i += 1) {
      this.eventSeq += 1;
      const trunk = this.trunks[i % 3];
      const charge = Number((4.85 + (i % 5) * 1.4).toFixed(2));
      totalAdded += charge;

      const evt: DetailRecordEvent = {
        id: `burst_${this.eventSeq}`,
        timestamp: new Date(now + i * 25).toISOString(),
        epochMs: now,
        type: 'CDR',
        direction: 'Outbound',
        fromNumber: '+14158901122',
        toNumber: `+44207946${String(1000 + i)}`,
        trunkName: trunk.name,
        popCode: trunk.primaryPop,
        durationOrUnits: `${680 + i * 35}s`,
        rateUsd: trunk.ratePerMinUsd,
        chargeUsd: charge,
        sipStatus: '200 OK',
        pddMs: trunk.pddMs + 14,
      };

      this.cdrRingBuffer.push(evt);
      this.spendWindow.record(now, charge);
      this.billingFenwick.update(currentHour, charge);
      trunk.mtdSpendUsd = Number((trunk.mtdSpendUsd + charge).toFixed(2));
    }

    totalAdded = Number(totalAdded.toFixed(2));
    const bucket = this.hourlyBuckets[currentHour];
    if (bucket) {
      bucket.sipTrunkSpendUsd = Number((bucket.sipTrunkSpendUsd + totalAdded).toFixed(2));
      bucket.totalSpendUsd = Number((bucket.totalSpendUsd + totalAdded).toFixed(2));
      bucket.callCount += count;
    }

    this.products[0].mtdCostUsd = Number((this.products[0].mtdCostUsd + totalAdded).toFixed(2));
    this.account.pendingUnbilledUsd = Number((this.account.pendingUnbilledUsd + totalAdded).toFixed(2));
    this.account.mtdSpendUsd = Number((this.account.mtdSpendUsd + totalAdded).toFixed(2));
    this.account.currentBalanceUsd = Math.max(0, Number((this.account.currentBalanceUsd - totalAdded).toFixed(2)));
    this.account.availableCreditUsd = Number((this.account.currentBalanceUsd + this.account.creditLimitUsd).toFixed(2));
    this.account.dailyBurnRateUsd = Number((this.account.dailyBurnRateUsd + totalAdded).toFixed(2));
    this.account.projectedMonthEndUsd = Number((this.account.mtdSpendUsd + this.account.dailyBurnRateUsd * 9).toFixed(2));
    this.account.lastSyncedAt = new Date(now).toISOString();

    this.checkAutoRecharge();
    this.lruCache.invalidateAll();
    this.eventBus.publish('billing_updated', this.account);

    return {
      injectedEvents: count,
      addedSpendUsd: totalAdded,
      account: this.account,
    };
  }

  public queryBillingRange(startHour: number, endHour: number) {
    const clampedStart = Math.max(0, Math.min(23, Math.floor(startHour)));
    const clampedEnd = Math.max(clampedStart, Math.min(23, Math.floor(endHour)));
    const totalSpendUsd = this.billingFenwick.rangeSum(clampedStart, clampedEnd);

    let totalCalls = 0;
    let totalMessages = 0;
    for (let h = clampedStart; h <= clampedEnd; h += 1) {
      const b = this.hourlyBuckets[h];
      if (b) {
        totalCalls += b.callCount;
        totalMessages += b.messageCount;
      }
    }

    const stats = this.billingFenwick.getStats();
    return {
      startHour: clampedStart,
      endHour: clampedEnd,
      bucketCount: clampedEnd - clampedStart + 1,
      totalSpendUsd,
      totalCalls,
      totalMessages,
      fenwickQueryTimeUs: stats.lastRangeQueryTimeUs,
    };
  }

  public searchDidsByPrefix(prefix: string) {
    const clean = prefix.trim() || '+';
    const matches = this.didTrie.searchByPrefix(clean, 50);
    const stats = this.didTrie.getStats();
    return {
      queryPrefix: stats.lastQueryPrefix,
      matchCount: matches.length,
      lookupTimeUs: stats.lastLookupTimeUs,
      totalIndexedDids: stats.indexedNumbers,
      trieNodeCount: stats.nodeCount,
      results: matches,
    };
  }

  public evaluateLongestPrefixMatch(e164: string) {
    const lpm = this.ratePrefixTrie.longestPrefixMatch(e164);
    const assignedPop = this.consistentHash.getTargetPop(e164);
    const trieStats = this.ratePrefixTrie.getStats();
    return {
      inputE164: e164,
      matchedPrefix: lpm?.matchedPrefix ?? 'DEFAULT',
      carrierRoute: lpm?.value.carrierRoute ?? 'Global Default Termination',
      ratePerMinUsd: lpm?.value.ratePerMinUsd ?? 0.012,
      preferredPop: lpm?.value.popCode ?? 'IAD1',
      consistentHashPop: assignedPop ?? 'IAD1',
      lookupTimeUs: trieStats.lastLookupTimeUs,
    };
  }

  public togglePopFailover(popCode: string): TelnyxPopNode[] {
    const target = this.pops.find((p) => p.code === popCode);
    if (target) {
      target.status = target.status === 'Failover' ? 'Nominal' : 'Failover';
      target.activeChannels = target.status === 'Failover' ? 0 : 820;
      this.rebuildConsistentHashRing();
      this.lruCache.invalidateAll();
    }
    return this.pops;
  }

  public mutateCircuitBreaker(action: 'trip' | 'reset') {
    if (action === 'trip') {
      this.circuitBreaker.recordFailure();
      this.circuitBreaker.recordFailure();
      this.circuitBreaker.recordFailure();
    } else {
      this.circuitBreaker.reset();
    }
    this.lruCache.invalidateAll();
    return this.circuitBreaker.getStats();
  }

  private evaluateAlerts(): BillingAlertRule[] {
    const windowStats = this.spendWindow.getStats();
    const budgetUtilizationPct = (this.account.mtdSpendUsd / this.account.monthlyBudgetCapUsd) * 100;
    const maxPdd = Math.max(...this.trunks.map((t) => t.pddMs));

    return [
      {
        id: 'alt-balance',
        name: 'Prepaid Balance Auto-Recharge Guard',
        metricKey: 'currentBalanceUsd',
        thresholdFormatted: `< $${this.account.autoRecharge.thresholdUsd.toFixed(2)}`,
        currentFormatted: `$${this.account.currentBalanceUsd.toFixed(2)}`,
        triggered: this.account.currentBalanceUsd < this.account.autoRecharge.thresholdUsd,
        severity: this.account.currentBalanceUsd < this.account.autoRecharge.thresholdUsd ? 'Warning' : 'Nominal',
      },
      {
        id: 'alt-budget',
        name: 'Monthly Billing Budget Utilization',
        metricKey: 'mtdSpendUsd',
        thresholdFormatted: `> 85% ($${(this.account.monthlyBudgetCapUsd * 0.85).toFixed(0)})`,
        currentFormatted: `${budgetUtilizationPct.toFixed(1)}% ($${this.account.mtdSpendUsd.toFixed(2)})`,
        triggered: budgetUtilizationPct > 85,
        severity: budgetUtilizationPct > 95 ? 'Critical' : budgetUtilizationPct > 85 ? 'Warning' : 'Nominal',
      },
      {
        id: 'alt-velocity',
        name: 'Sliding Window Burn Velocity Anomaly',
        metricKey: 'burnPerMinUsd',
        thresholdFormatted: '> $14.00 / min',
        currentFormatted: `$${windowStats.currentBurnPerMinUsd.toFixed(2)} / min`,
        triggered: windowStats.anomalyDetected,
        severity: windowStats.anomalyDetected ? 'Critical' : 'Nominal',
      },
      {
        id: 'alt-pdd',
        name: 'SIP Trunk Post-Dial Delay (PDD) SLA',
        metricKey: 'pddMs',
        thresholdFormatted: '> 240 ms',
        currentFormatted: `${maxPdd} ms peak`,
        triggered: maxPdd > 240,
        severity: maxPdd > 240 ? 'Warning' : 'Nominal',
      },
    ];
  }

  public getSystemMetrics(): SystemArchitectureMetrics {
    const topK = MinHeap.extractTopK(this.trunks, 4, (a, b) => a.mtdSpendUsd - b.mtdSpendUsd);
    this.trunkHeapTracker.recordTiming(topK.elapsedUs);

    return {
      rateLimiter: this.rateLimiter.getStats(),
      circuitBreaker: this.circuitBreaker.getStats(),
      lruCache: this.lruCache.getStats(),
      consistentHash: this.consistentHash.getStats(),
      dsaEngines: {
        prefixTrie: this.didTrie.getStats(),
        fenwickTree: this.billingFenwick.getStats(),
        minHeap: this.trunkHeapTracker.getStats(this.trunks.length),
        ringBuffer: this.cdrRingBuffer.getStats(),
        slidingWindow: this.spendWindow.getStats(),
      },
    };
  }

  public getDashboardSnapshot(bypassCache = false): DashboardSnapshot {
    const cacheKey = 'dashboard_snapshot_v1';
    if (!bypassCache) {
      const cached = this.lruCache.get(cacheKey);
      if (cached) {
        // Refresh live cache stats in response
        cached.systemMetrics = this.getSystemMetrics();
        return cached;
      }
    }

    const topK = MinHeap.extractTopK(this.trunks, 4, (a, b) => a.mtdSpendUsd - b.mtdSpendUsd);
    this.trunkHeapTracker.recordTiming(topK.elapsedUs);

    const snapshot: DashboardSnapshot = {
      account: { ...this.account },
      products: [...this.products],
      billingGroups: [...this.billingGroups],
      invoices: [...this.invoices],
      hourlyBuckets: [...this.hourlyBuckets],
      trunks: [...this.trunks],
      pops: [...this.pops],
      alerts: this.evaluateAlerts(),
      recentEvents: this.cdrRingBuffer.toArrayRecentFirst(40),
      topCostlyTrunks: topK.results,
      systemMetrics: this.getSystemMetrics(),
    };

    this.lruCache.put(cacheKey, snapshot, 3000);
    return snapshot;
  }
}
