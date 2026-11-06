import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import type { DidPhoneNumber } from '../../../shared/types.ts';
import { InlineBarLoader } from '../DashboardSkeletons.tsx';

interface DidSearchResponse {
  queryPrefix: string;
  matchCount: number;
  lookupTimeUs: number;
  totalIndexedDids: number;
  trieNodeCount: number;
  results: DidPhoneNumber[];
}

interface LpmResponse {
  inputE164: string;
  matchedPrefix: string;
  carrierRoute: string;
  ratePerMinUsd: number;
  preferredPop: string;
  consistentHashPop: string;
  lookupTimeUs: number;
}

const QUICK_PREFIXES = ['+', '+1415', '+1212', '+1312', '+1800', '+4420', '+4969', '+813'];

export const DidInventoryView: React.FC = () => {
  const [prefixInput, setPrefixInput] = useState<string>('+');
  const [searchData, setSearchData] = useState<DidSearchResponse | null>(null);
  const [loadingTrie, setLoadingTrie] = useState<boolean>(false);

  const [lpmInput, setLpmInput] = useState<string>('+496912008841');
  const [lpmResult, setLpmResult] = useState<LpmResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    const runSearch = async () => {
      setLoadingTrie(true);
      try {
        const res = await fetch(
          `/api/v1/dids/search?prefix=${encodeURIComponent(prefixInput || '+')}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as DidSearchResponse;
        if (!cancelled) {
          setSearchData(json);
        }
      } finally {
        if (!cancelled) {
          setLoadingTrie(false);
        }
      }
    };
    runSearch();
    return () => {
      cancelled = true;
    };
  }, [prefixInput]);

  useEffect(() => {
    let cancelled = false;
    const runLpm = async () => {
      try {
        const res = await fetch(
          `/api/v1/routing/lpm?e164=${encodeURIComponent(lpmInput || '+1')}`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as LpmResponse;
        if (!cancelled) {
          setLpmResult(json);
        }
      } catch {
        // Ignore transient network errors
      }
    };
    runLpm();
    return () => {
      cancelled = true;
    };
  }, [lpmInput]);

  return (
    <div className="space-y-6">
      {/* 2-Column Split: Prefix Trie DID Search & Longest-Prefix-Match Carrier Rate Lookup */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <section className="border border-[#DCE1E7] bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-base font-semibold text-[#0F172A]">
                E.164 Prefix Trie Number Lookup
              </h2>
              {searchData && (
                <span className="font-mono-tabular text-xs font-semibold text-[#00875A]">
                  {searchData.lookupTimeUs} μs · {searchData.trieNodeCount} nodes
                </span>
              )}
            </div>
            <p className="text-xs text-[#475569] mb-4">
              Traverses the backend Radix/Prefix Trie in O(L) time where L is prefix digit length.
            </p>

            <div className="relative mb-3">
              <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={prefixInput}
                onChange={(e) => setPrefixInput(e.target.value)}
                placeholder="Enter E.164 prefix (e.g. +1415, +4420, +813)"
                className="w-full border border-[#CBD5E1] bg-[#F8FAFC] pl-9 pr-3 py-2 font-mono-tabular text-sm text-[#0F172A] focus:border-[#00875A] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_PREFIXES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrefixInput(p)}
                  className={`px-2.5 py-1 font-mono-tabular text-xs border transition-colors cursor-pointer whitespace-nowrap ${
                    prefixInput === p
                      ? 'border-[#00875A] bg-[#00875A] text-white'
                      : 'border-[#DCE1E7] bg-[#F8FAFC] text-[#334155] hover:border-[#94A3B8]'
                  }`}
                >
                  {p === '+' ? 'All (+)' : p}
                </button>
              ))}
            </div>
          </div>

          {searchData && (
            <div className="mt-4 pt-3 border-t border-[#F1F5F9] flex items-center justify-between font-mono-tabular text-xs text-[#475569]">
              <span>
                Matched {searchData.matchCount} of {searchData.totalIndexedDids} provisioned DIDs
              </span>
              {loadingTrie && <InlineBarLoader label="Traversing" />}
            </div>
          )}
        </section>

        <section className="border border-[#DCE1E7] bg-white p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-base font-semibold text-[#0F172A]">
                Longest Prefix Match (LPM) Tariff &amp; PoP Router
              </h2>
              {lpmResult && (
                <span className="font-mono-tabular text-xs font-semibold text-[#1D4ED8]">
                  {lpmResult.lookupTimeUs} μs
                </span>
              )}
            </div>
            <p className="text-xs text-[#475569] mb-4">
              Resolves deepest matching Telnyx carrier rate-deck prefix + Consistent Hash target PoP.
            </p>

            <input
              type="text"
              value={lpmInput}
              onChange={(e) => setLpmInput(e.target.value)}
              placeholder="Destination E.164 (e.g. +496912008841)"
              className="w-full border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono-tabular text-sm text-[#0F172A] focus:border-[#1D4ED8] focus:outline-none mb-4"
            />
          </div>

          {lpmResult && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-[#E2E8F0] bg-[#F8FAFC] p-3 font-mono-tabular text-xs">
              <div>
                <div className="text-[#475569] mb-0.5">Matched Prefix</div>
                <div className="font-bold text-[#0F172A]">{lpmResult.matchedPrefix}</div>
              </div>
              <div>
                <div className="text-[#475569] mb-0.5">Tariff Rate</div>
                <div className="font-bold text-[#00875A]">
                  ${lpmResult.ratePerMinUsd.toFixed(4)}/m
                </div>
              </div>
              <div>
                <div className="text-[#475569] mb-0.5">Carrier Route</div>
                <div className="font-medium text-[#0F172A] truncate" title={lpmResult.carrierRoute}>
                  {lpmResult.carrierRoute}
                </div>
              </div>
              <div>
                <div className="text-[#475569] mb-0.5">Hash Ring PoP</div>
                <div className="font-bold text-[#1D4ED8]">{lpmResult.consistentHashPop}</div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Provisioned DID Inventory Table */}
      <section className="border border-[#DCE1E7] bg-white">
        <div className="px-6 py-4 border-b border-[#DCE1E7] flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Provisioned Phone Numbers (DID Inventory)
          </h2>
          <span className="font-mono-tabular text-xs text-[#475569]">
            Prefix query: &quot;{searchData?.queryPrefix ?? prefixInput}&quot;
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE1E7] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                <th className="py-3 px-6">E.164 Number</th>
                <th className="py-3 px-4">Rate Center</th>
                <th className="py-3 px-4">SIP Connection</th>
                <th className="py-3 px-4">Billing Group</th>
                <th className="py-3 px-4">Capabilities</th>
                <th className="py-3 px-4 text-right">Monthly MRC</th>
                <th className="py-3 px-4 text-right">MTD Usage</th>
                <th className="py-3 px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEFF2] text-sm">
              {(searchData?.results ?? []).map((did) => (
                <tr key={did.e164} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="py-3 px-6 font-mono-tabular font-semibold text-[#0F172A]">
                    {did.e164}
                  </td>
                  <td className="py-3 px-4 text-xs text-[#334155]">
                    {did.rateCenter} · {did.countryCode}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular text-xs text-[#0F172A]">
                    {did.connectionName}
                  </td>
                  <td className="py-3 px-4 text-xs text-[#475569]">{did.billingGroup}</td>
                  <td className="py-3 px-4 font-mono-tabular text-xs text-[#334155]">
                    {did.capabilities.join(' · ')}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#334155]">
                    ${did.monthlyMrcUsd.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#0F172A]">
                    ${did.mtdUsageUsd.toFixed(2)}
                  </td>
                  <td className="py-3 px-6 font-mono-tabular text-xs font-semibold">
                    <span
                      className={
                        did.status === 'Active' ? 'text-[#00875A]' : 'text-[#B45309]'
                      }
                    >
                      {did.status}
                    </span>
                  </td>
                </tr>
              ))}
              {searchData && searchData.results.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-[#475569]">
                    No DID numbers match prefix &quot;{prefixInput}&quot;. Try +1415, +4420, or +.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
