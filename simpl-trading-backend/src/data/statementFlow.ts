/**
 * How each statement becomes a flow (Sankey) graph — the premium "Simpl
 * Financials" view. Same rationale as statementLayout.ts for living on the
 * backend: this is the mapping from Finnhub's field names to a structure,
 * and the app must never learn those names.
 *
 * THE ONE RULE: every node balances exactly. A Sankey node is drawn as wide
 * as the larger of its inflow and outflow, so any gap between the two shows
 * up as a visibly lopsided bar. Rather than trust that Finnhub's components
 * always sum to its subtotals (they usually do — TSLA reconciles to the
 * dollar — but "usually" isn't a guarantee across 500 filers), every stage
 * closes its own books: whatever the listed components don't explain
 * becomes an explicit "Other" ribbon. Small gap, thin ribbon; big gap, a big
 * honest ribbon labelled as such. That is the behaviour asked for, and it
 * means a company with zero revenue or a strange filing degrades into a
 * sparse diagram rather than a broken one.
 *
 * Sign handling: a link's value is always positive. A signed line item is
 * placed by its sign — money coming IN to a stage draws from a source node
 * on the left, money going OUT goes to a sink on the right. So a tax
 * benefit (negative tax) correctly appears as an inflow, and a non-recurring
 * gain flows in while a non-recurring charge flows out.
 */

export type FlowNode = {
  id: string;
  label: string;
  /**
   * Drives colour: the profit path, an expense, an income source, a loss
   * (money that had to come from somewhere to cover expenses), or a residual.
   */
  kind: "stage" | "expense" | "income" | "loss" | "other";
  /**
   * The figure the filing actually reports for this line, for the label. A
   * stage bar is drawn at its THROUGHPUT — in a loss year that's the
   * reported profit plus the loss ribbon that had to feed it — so without
   * this, TSLA 2017 labelled Gross Profit "$3.85B" when the filing says
   * $2.22B. Signed and unscaled here; companyData.ts scales it with the
   * links. Absent on sinks and sources, whose throughput IS the figure.
   */
  reported?: number;
};

export type FlowLink = { source: string; target: string; value: number };

export type FlowGraph = { nodes: FlowNode[]; links: FlowLink[] };

type Raw = Record<string, unknown>;

const num = (raw: Raw, key: string): number | null => {
  const v = raw[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

// Below this share of the graph's largest value, a ribbon is too thin to
// carry a label; it still draws (as a hairline) so nothing silently vanishes.
const EPSILON = 1e-9;

class GraphBuilder {
  nodes = new Map<string, FlowNode>();
  links: FlowLink[] = [];

  node(id: string, label: string, kind: FlowNode["kind"], reported?: number): string {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, reported === undefined ? { id, label, kind } : { id, label, kind, reported });
    }
    return id;
  }

  link(source: string, target: string, value: number): void {
    if (value > EPSILON) this.links.push({ source, target, value });
  }

  /**
   * Move from `parent` (which carries `parentValue` forward) to `child`
   * (reported as `child.value`). Returns what the child carries on to the
   * next stage — never negative.
   *
   * `expenses` are reported as positive costs (positive = money out);
   * `adjustments` are signed (positive = money in). Each is placed by its
   * sign, so a tax benefit draws in and a non-recurring gain draws in.
   *
   * The parent → child ribbon carries what the PARENT HAS LEFT after its own
   * outflows — not the child's reported value. Sizing it by the child was the
   * first version's bug: income sources join the child directly, so the
   * child's total already includes money that never passed through the
   * parent, and the parent's bar came out narrower than its outflows.
   *
   * Two balancing acts, each closed exactly:
   * - The PARENT can't pay out more than it holds. If expenses exceed it,
   *   the gap is a loss: a rust "… Loss" source on the left funds the excess
   *   (the classic way a loss-making year is drawn), the child carries
   *   nothing forward, and any income sources are routed into the parent so
   *   they visibly help cover the bill instead of dangling.
   * - The CHILD's inflow must equal what it reports. Any difference is
   *   real money the filing put somewhere we don't itemise, drawn as an
   *   "Other" ribbon — thin when the books nearly reconcile, honest-sized
   *   when they don't.
   */
  stage(
    parent: string,
    parentValue: number,
    child: { id: string; label: string; value: number },
    expenses: { id: string; label: string; negLabel?: string; value: number | null }[],
    adjustments: { id: string; label: string; negLabel?: string; value: number | null }[] = [],
  ): number {
    const outs: { id: string; label: string; value: number }[] = [];
    const ins: { id: string; label: string; value: number }[] = [];
    // `negLabel` names the line when its sign flips it to the other side —
    // "Other Income" drawn as an outflow in a year it was negative is a
    // contradiction on screen; "Other Expense" is what happened.
    for (const e of expenses) {
      if (e.value === null || e.value === 0) continue;
      if (e.value > 0) outs.push({ id: e.id, label: e.label, value: e.value });
      else ins.push({ id: e.id, label: e.negLabel ?? e.label, value: -e.value });
    }
    for (const a of adjustments) {
      if (a.value === null || a.value === 0) continue;
      if (a.value > 0) ins.push({ id: a.id, label: a.label, value: a.value });
      else outs.push({ id: a.id, label: a.negLabel ?? a.label, value: -a.value });
    }
    const sumOut = outs.reduce((s, o) => s + o.value, 0);
    const sumIn = ins.reduce((s, i) => s + i.value, 0);

    for (const o of outs) this.link(parent, this.node(o.id, o.label, "expense"), o.value);

    const childId = this.node(child.id, child.label, "stage", child.value);
    // The child is drawn at exactly its reported value (a loss year draws
    // nothing forward). Everything below arranges for its inflow to equal
    // this — so the bar a user reads IS the number in the filing, and any
    // one-off the filing doesn't itemise (Apple's EU tax charge, Microsoft's
    // TCJA charge) shows as an "Other" ribbon leaving the PARENT, not as a
    // fatter child.
    const display = Math.max(child.value, 0);

    let available: number; // what the parent still holds for the child
    let fromSources: number; // how much of the child's inflow the sources supply
    if (parentValue >= sumOut) {
      // Normal: sources join the child directly.
      for (const i of ins) this.link(this.node(i.id, i.label, "income"), childId, i.value);
      available = parentValue - sumOut;
      fromSources = sumIn;
    } else {
      // Shortfall: sources shore up the parent, and whatever is still
      // uncovered is drawn as a loss feeding in from the left.
      for (const i of ins) this.link(this.node(i.id, i.label, "income"), parent, i.value);
      const uncovered = sumOut - parentValue - sumIn;
      if (uncovered > EPSILON) {
        const label = child.label.replace(/\b(Income|Profit)\b/, "Loss");
        this.link(this.node(`${child.id}:loss`, label, "loss"), parent, uncovered);
      }
      available = Math.max(parentValue + sumIn - sumOut, 0);
      fromSources = 0;
    }

    const need = display - fromSources;
    if (need < -EPSILON) {
      // Sources alone exceed the reported child — rare, and only in a filing
      // that doesn't reconcile. The child sheds the excess.
      this.link(childId, this.node(`${child.id}:other-out`, "Other", "other"), -need);
      if (available > EPSILON) {
        this.link(parent, this.node(`${child.id}:parent-other`, "Other", "other"), available);
      }
      return display;
    }

    const toChild = Math.min(available, need);
    this.link(parent, childId, toChild);
    const residual = available - need;
    if (residual > EPSILON) {
      this.link(parent, this.node(`${child.id}:other-out`, "Other", "other"), residual);
    } else if (residual < -EPSILON) {
      this.link(this.node(`${child.id}:other-in`, "Other", "other"), childId, -residual);
    }
    return display;
  }

  build(): FlowGraph {
    // Drop nodes that ended up with no links at all (a stage whose value was
    // zero, an expense that was null) so the layout never sees an island.
    const used = new Set<string>();
    for (const l of this.links) {
      used.add(l.source);
      used.add(l.target);
    }
    return {
      nodes: [...this.nodes.values()].filter((n) => used.has(n.id)),
      links: this.links,
    };
  }
}

/**
 * Income statement: the classic waterfall. Revenue on the left, profit
 * stages marching right, expenses peeling off to sinks, income sources
 * joining from the left where the filing adds them in.
 */
function incomeFlow(raw: Raw): FlowGraph | null {
  const revenue = num(raw, "revenue");
  const gross = num(raw, "grossIncome");
  const operating = num(raw, "ebit");
  const pretax = num(raw, "pretaxIncome");
  const net = num(raw, "netIncome");
  // Nothing to draw without a top line and a bottom line.
  if (revenue === null || revenue <= 0 || net === null) return null;

  const g = new GraphBuilder();
  const rev = g.node("revenue", "Revenue", "stage", revenue);

  const afterGross = g.stage(
    rev,
    revenue,
    { id: "gross", label: "Gross Profit", value: gross ?? revenue },
    [{ id: "cogs", label: "Cost of Revenue", value: num(raw, "costOfGoodsSold") }],
  );

  // R&D and SG&A are the itemised pieces; anything else inside
  // totalOperatingExpense surfaces as "Other Operating Expenses" rather than
  // a bare "Other", because here we know exactly what bucket it belongs to.
  const rd = num(raw, "researchDevelopment") ?? 0;
  const sga = num(raw, "sgaExpense") ?? 0;
  const totalOpex = num(raw, "totalOperatingExpense");
  const otherOpex = totalOpex !== null ? totalOpex - rd - sga : null;

  const afterOperating = g.stage(
    "gross",
    afterGross,
    { id: "operating", label: "Operating Income", value: operating ?? afterGross },
    [
      { id: "rd", label: "Research & Development", value: num(raw, "researchDevelopment") },
      { id: "sga", label: "Selling, General & Admin", value: num(raw, "sgaExpense") },
      { id: "opex-other", label: "Other Operating Expenses", value: otherOpex },
    ],
  );

  const afterPretax = g.stage(
    "operating",
    afterOperating,
    { id: "pretax", label: "Pre-Tax Income", value: pretax ?? afterOperating },
    [],
    [
      { id: "interest", label: "Interest, net", value: num(raw, "interestIncomeExpense") },
      {
        id: "other-income",
        label: "Other Income",
        negLabel: "Other Expense",
        value: num(raw, "totalOtherIncomeExpenseNet"),
      },
      {
        id: "nonrecurring",
        label: "Non-Recurring Gain",
        negLabel: "Non-Recurring Charge",
        value: num(raw, "nonRecurringItems"),
      },
    ],
  );

  g.stage(
    "pretax",
    afterPretax,
    { id: "net", label: "Net Income", value: net },
    [{ id: "tax", label: "Income Tax", negLabel: "Tax Benefit", value: num(raw, "provisionforIncomeTaxes") }],
    [{ id: "minority", label: "Minority Interest", value: num(raw, "minorityInterest") }],
  );

  return g.build();
}

/**
 * Balance sheet: assets gather from the left into Total Assets, which then
 * fans out to liabilities and equity on the right. Always balances by
 * definition (A = L + E); the residual ribbons catch rounding and any
 * catch-all line the filing uses.
 *
 * `propertyPlantEquipment` is already net of depreciation in this feed
 * (verified: TSLA's components sum to totalAssets exactly only when
 * accumulatedDepreciation is left out), and `otherAssets` duplicated
 * goodwill for TSLA — so both are excluded, and the residual absorbs
 * whatever a different filer puts there.
 */
function balanceFlow(raw: Raw): FlowGraph | null {
  const total = num(raw, "totalAssets");
  if (total === null || total <= 0) return null;

  const g = new GraphBuilder();
  const hub = g.node("assets", "Total Assets", "stage", total);

  const assetItems: [string, string, string][] = [
    ["cash", "Cash & Short-Term Investments", "cashShortTermInvestments"],
    ["receivables", "Receivables", "totalReceivables"],
    ["inventory", "Inventory", "inventory"],
    ["other-current", "Other Current Assets", "otherCurrentAssets"],
    ["ppe", "Property, Plant & Equipment", "propertyPlantEquipment"],
    // Apple's single largest asset ($77.7B) and NVDA's ($27.1B) — without this
    // line both drew as a giant "Other Assets" ribbon.
    ["lt-investments", "Long-Term Investments", "longTermInvestments"],
    ["goodwill", "Goodwill", "goodwill"],
    ["intangibles", "Intangibles", "intangiblesAssets"],
    ["lt-notes", "Long-Term Notes", "noteReceivableLongTerm"],
    ["other-lt", "Other Long-Term Assets", "otherLongTermAssets"],
  ];
  let explained = 0;
  for (const [id, label, key] of assetItems) {
    const v = num(raw, key);
    if (v === null || v <= 0) continue;
    g.link(g.node(id, label, "income"), hub, v);
    explained += v;
  }
  if (total - explained > EPSILON) {
    g.link(g.node("assets-other", "Other Assets", "other"), hub, total - explained);
  }

  const claimItems: [string, string, string, FlowNode["kind"]][] = [
    ["current-liab", "Current Liabilities", "currentLiabilities", "expense"],
    ["lt-debt", "Long-Term Debt", "longTermDebt", "expense"],
    ["deferred-tax", "Deferred Taxes", "deferredIncomeTax", "expense"],
    ["other-liab", "Other Liabilities", "otherLiabilities", "expense"],
    ["minority", "Minority Interest", "minorityInterest", "expense"],
    ["equity", "Shareholders' Equity", "totalEquity", "stage"],
  ];
  let claimed = 0;
  for (const [id, label, key, kind] of claimItems) {
    const v = num(raw, key);
    if (v === null || v <= 0) continue;
    g.link(hub, g.node(id, label, kind), v);
    claimed += v;
  }
  if (total - claimed > EPSILON) {
    g.link(hub, g.node("claims-other", "Other", "other"), total - claimed);
  }

  return g.build();
}

/**
 * Cash flow: every positive item is a source of cash, every negative item a
 * use, all through one "Cash" hub. The change in cash closes the books — a
 * net increase is a use ("Added to Cash"), a net decrease is a source
 * ("Drawn from Cash") — so inflow equals outflow exactly.
 *
 * Operating cash flow is deliberately NOT decomposed into net income + D&A
 * + working capital: Finnhub's sub-items overlap (stock-based compensation
 * appears both on its own and inside "other non-cash items" for TSLA), so
 * itemising them would manufacture a spurious "Other" ribbon. The table
 * view has the breakdown for anyone who wants it.
 */
function cashFlow(raw: Raw): FlowGraph | null {
  const ops = num(raw, "netOperatingCashFlow");
  if (ops === null) return null;

  const g = new GraphBuilder();
  const hub = g.node("cash", "Cash", "stage");

  const items: [string, string, string][] = [
    ["ops", "Cash from Operations", "netOperatingCashFlow"],
    ["capex", "Capital Expenditures", "capex"],
    ["invest-other", "Other Investing", "otherInvestingCashFlowItemsTotal"],
    ["stock", "Stock Issued / Repurchased", "issuanceReductionCapitalStock"],
    ["debt", "Debt Issued / Repaid", "issuanceReductionDebtNet"],
    ["fin-other", "Other Financing", "otherFundsFinancingItems"],
    ["fx", "Foreign Exchange", "foreignExchangeEffects"],
  ];

  let inflow = 0;
  let outflow = 0;
  for (const [id, label, key] of items) {
    const v = num(raw, key);
    if (v === null || v === 0) continue;
    if (v > 0) {
      g.link(g.node(id, label, id === "ops" ? "stage" : "income"), hub, v);
      inflow += v;
    } else {
      g.link(hub, g.node(id, label, "expense"), -v);
      outflow += -v;
    }
  }

  // Dividends are always money OUT regardless of the sign convention a
  // feed uses, so they're placed by magnitude, not sign. Leaving them out was
  // the first audit's biggest miss: Microsoft, Walmart, Apple and Pfizer
  // each pay $6–22B a year, and every one of those showed up as an
  // unexplained "Other" ribbon a fifth the size of the whole diagram.
  const dividends = num(raw, "cashDividendsPaid");
  if (dividends !== null && dividends !== 0) {
    g.link(hub, g.node("dividends", "Dividends Paid", "expense"), Math.abs(dividends));
    outflow += Math.abs(dividends);
  }

  // The cash account itself closes the books: a net increase is where the
  // surplus went, a net decrease is where a shortfall came from. Both are
  // the company's own cash, so both take the stage colour — "Drawn from
  // Cash" is a real, labelled figure, not a residual.
  const change = num(raw, "changeinCash");
  if (change !== null && change !== 0) {
    if (change > 0) {
      g.link(hub, g.node("change", "Added to Cash", "stage"), change);
      outflow += change;
    } else {
      g.link(g.node("change", "Drawn from Cash", "stage"), hub, -change);
      inflow += -change;
    }
  }

  // Anything still unbalanced is a line the feed didn't itemise.
  const gap = inflow - outflow;
  if (gap > EPSILON) g.link(hub, g.node("cash-other-out", "Other", "other"), gap);
  else if (gap < -EPSILON) g.link(g.node("cash-other-in", "Other", "other"), hub, -gap);

  return g.build();
}

export const FLOW_BUILDERS: Record<"ic" | "bs" | "cf", (raw: Raw) => FlowGraph | null> = {
  ic: incomeFlow,
  bs: balanceFlow,
  cf: cashFlow,
};
