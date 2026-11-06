/**
 * PrefixTrie (Radix/Digital Search Tree) for O(L) E.164 phone number lookup
 * and Longest Prefix Match (LPM) carrier rate-deck resolution.
 *
 * Time Complexity:
 *  - insert(e164, payload): O(L) where L is the length of the E.164 string (<= 16 chars)
 *  - searchPrefix(prefix, limit): O(L + M) where M is visited subtree nodes up to limit
 *  - longestPrefixMatch(e164): O(L) deterministic carrier tariff lookup
 * Space Complexity:
 *  - O(N * L) bounded by shared country/area code prefixes
 */

export interface TrieNode<T> {
  children: Map<string, TrieNode<T>>;
  isTerminal: boolean;
  value: T | null;
  subtreeCount: number;
}

export class PrefixTrie<T> {
  private readonly root: TrieNode<T>;
  private totalNodes: number;
  private indexedItems: number;
  private maxDepthSeen: number;
  private lastLookupTimeUs: number;
  private lastQueryPrefix: string;
  private lastMatchCount: number;

  constructor() {
    this.root = this.createNode();
    this.totalNodes = 1;
    this.indexedItems = 0;
    this.maxDepthSeen = 0;
    this.lastLookupTimeUs = 0;
    this.lastQueryPrefix = '+1';
    this.lastMatchCount = 0;
  }

  private createNode(): TrieNode<T> {
    return {
      children: new Map<string, TrieNode<T>>(),
      isTerminal: false,
      value: null,
      subtreeCount: 0,
    };
  }

  private normalizeKey(raw: string): string {
    return raw.trim().replace(/[^\d+]/g, '');
  }

  public insert(key: string, value: T): void {
    const clean = this.normalizeKey(key);
    if (!clean) return;

    const existing = this.exactMatch(clean);
    const isNew = existing === null;

    let curr = this.root;
    if (isNew) {
      curr.subtreeCount += 1;
    }

    for (let i = 0; i < clean.length; i += 1) {
      const ch = clean[i];
      let next = curr.children.get(ch);
      if (!next) {
        next = this.createNode();
        curr.children.set(ch, next);
        this.totalNodes += 1;
      }
      curr = next;
      if (isNew) {
        curr.subtreeCount += 1;
      }
    }

    curr.isTerminal = true;
    curr.value = value;
    if (isNew) {
      this.indexedItems += 1;
    }
    if (clean.length > this.maxDepthSeen) {
      this.maxDepthSeen = clean.length;
    }
  }

  public exactMatch(key: string): T | null {
    const clean = this.normalizeKey(key);
    let curr: TrieNode<T> | undefined = this.root;
    for (let i = 0; i < clean.length; i += 1) {
      curr = curr.children.get(clean[i]);
      if (!curr) return null;
    }
    return curr.isTerminal ? curr.value : null;
  }

  public longestPrefixMatch(key: string): { matchedPrefix: string; value: T } | null {
    const startNs = process.hrtime.bigint();
    const clean = this.normalizeKey(key);
    let curr: TrieNode<T> | undefined = this.root;
    let bestValue: T | null = null;
    let bestPrefix = '';

    for (let i = 0; i < clean.length; i += 1) {
      curr = curr.children.get(clean[i]);
      if (!curr) break;
      if (curr.isTerminal && curr.value !== null) {
        bestValue = curr.value;
        bestPrefix = clean.slice(0, i + 1);
      }
    }

    const elapsedUs = Number(process.hrtime.bigint() - startNs) / 1000;
    this.lastLookupTimeUs = Number(elapsedUs.toFixed(2));
    this.lastQueryPrefix = clean || '*';
    this.lastMatchCount = bestValue ? 1 : 0;

    return bestValue !== null ? { matchedPrefix: bestPrefix, value: bestValue } : null;
  }

  public searchByPrefix(prefix: string, limit = 100): T[] {
    const startNs = process.hrtime.bigint();
    const clean = this.normalizeKey(prefix);
    let curr: TrieNode<T> | undefined = this.root;

    for (let i = 0; i < clean.length; i += 1) {
      curr = curr.children.get(clean[i]);
      if (!curr) {
        const elapsedUs = Number(process.hrtime.bigint() - startNs) / 1000;
        this.lastLookupTimeUs = Number(elapsedUs.toFixed(2));
        this.lastQueryPrefix = clean || '*';
        this.lastMatchCount = 0;
        return [];
      }
    }

    const results: T[] = [];
    const stack: TrieNode<T>[] = [curr];

    while (stack.length > 0 && results.length < limit) {
      const node = stack.pop()!;
      if (node.isTerminal && node.value !== null) {
        results.push(node.value);
      }
      const children = Array.from(node.children.values());
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]);
      }
    }

    const elapsedUs = Number(process.hrtime.bigint() - startNs) / 1000;
    this.lastLookupTimeUs = Number(elapsedUs.toFixed(2));
    this.lastQueryPrefix = clean || '*';
    this.lastMatchCount = results.length;

    return results;
  }

  public getStats() {
    return {
      indexedNumbers: this.indexedItems,
      nodeCount: this.totalNodes,
      maxDepth: this.maxDepthSeen,
      lastLookupTimeUs: this.lastLookupTimeUs,
      lastQueryPrefix: this.lastQueryPrefix,
      lastMatchCount: this.lastMatchCount,
    };
  }
}
