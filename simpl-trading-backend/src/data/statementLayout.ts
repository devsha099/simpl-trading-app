/**
 * How a financial statement is laid out for display: which Finnhub fields to
 * show, in what order, under what human label, and how each one reads.
 *
 * Lives on the BACKEND on purpose. companyData.ts is already the boundary
 * that keeps the app away from Finnhub's raw field names (which have shifted
 * before — finnhubio/Finnhub-API#337), and a statement layout is exactly that
 * mapping. The app renders whatever sections it is handed and never learns
 * that `sgaExpense` or `liabilitiesShareholdersEquity` exist.
 *
 * Order follows how each statement actually computes, so the subtotals land
 * where a reader expects them — revenue down to net income, assets against
 * liabilities plus equity, operating/investing/financing to the change in
 * cash. Verified against TSLA: every subtotal reconciles exactly.
 */

export type StatementKind = "ic" | "bs" | "cf";
export type Frequency = "annual" | "quarterly";

/**
 * How to read a number, NOT how to format it — formatting is the app's job.
 * Finnhub reports monetary figures and share counts in millions; both are
 * converted to real units once, in companyData.ts, so nothing downstream has
 * to remember the scale (the same single-conversion rule §14 sets for market
 * cap). `perShare` and `ratio` arrive already in their final units.
 */
export type Unit = "currency" | "shares" | "perShare" | "ratio";

export type LineItem = {
  key: string;
  label: string;
  unit?: Unit; // defaults to "currency"
  /** 1 = a component of the subtotal below it. */
  indent?: boolean;
  /** Renders with a rule above and heavier type. */
  emphasis?: "subtotal" | "total";
};

export type SectionLayout = { title?: string; items: LineItem[] };

export type StatementLayout = {
  title: string;
  sections: SectionLayout[];
  /**
   * Shown under a "Also reported" heading. These are real figures that are
   * NOT part of the arithmetic above — listing them inline would imply they
   * belong to a subtotal they don't feed. Interest Expense is the clearest
   * case: `interestIncomeExpense` is the net figure inside the waterfall,
   * while `interestExpense` is the gross detail beside it.
   */
  memo: LineItem[];
};

const INCOME_STATEMENT: StatementLayout = {
  title: "Income Statement",
  sections: [
    {
      items: [
        { key: "revenue", label: "Revenue", emphasis: "subtotal" },
        { key: "costOfGoodsSold", label: "Cost of Revenue", indent: true },
        { key: "grossIncome", label: "Gross Profit", emphasis: "subtotal" },
      ],
    },
    {
      title: "Operating Expenses",
      items: [
        { key: "researchDevelopment", label: "Research & Development", indent: true },
        { key: "sgaExpense", label: "Selling, General & Administrative", indent: true },
        { key: "totalOperatingExpense", label: "Total Operating Expenses", emphasis: "subtotal" },
        { key: "ebit", label: "Operating Income", emphasis: "subtotal" },
      ],
    },
    {
      title: "Below the Operating Line",
      items: [
        { key: "interestIncomeExpense", label: "Interest Income (Expense), net", indent: true },
        { key: "totalOtherIncomeExpenseNet", label: "Other Income (Expense), net", indent: true },
        { key: "nonRecurringItems", label: "Non-Recurring Items", indent: true },
        { key: "pretaxIncome", label: "Pre-Tax Income", emphasis: "subtotal" },
        { key: "provisionforIncomeTaxes", label: "Income Tax Provision", indent: true },
        { key: "netIncomeAfterTaxes", label: "Net Income After Taxes", emphasis: "subtotal" },
        { key: "minorityInterest", label: "Minority Interest", indent: true },
        { key: "netIncome", label: "Net Income", emphasis: "total" },
      ],
    },
  ],
  memo: [
    { key: "dilutedEPS", label: "Diluted EPS", unit: "perShare" },
    { key: "dilutedAverageSharesOutstanding", label: "Diluted Shares Outstanding", unit: "shares" },
    { key: "interestExpense", label: "Interest Expense (gross)" },
  ],
};

const BALANCE_SHEET: StatementLayout = {
  title: "Balance Sheet",
  sections: [
    {
      title: "Assets",
      items: [
        { key: "cash", label: "Cash", indent: true },
        { key: "cashEquivalents", label: "Cash Equivalents", indent: true },
        { key: "shortTermInvestments", label: "Short-Term Investments", indent: true },
        { key: "cashShortTermInvestments", label: "Cash & Short-Term Investments", emphasis: "subtotal" },
        { key: "accountsReceivables", label: "Accounts Receivable", indent: true },
        { key: "otherReceivables", label: "Other Receivables", indent: true },
        { key: "totalReceivables", label: "Total Receivables", emphasis: "subtotal" },
        { key: "inventory", label: "Inventory", indent: true },
        { key: "otherCurrentAssets", label: "Other Current Assets", indent: true },
        { key: "currentAssets", label: "Total Current Assets", emphasis: "subtotal" },
        { key: "propertyPlantEquipment", label: "Property, Plant & Equipment", indent: true },
        { key: "accumulatedDepreciation", label: "Accumulated Depreciation", indent: true },
        { key: "goodwill", label: "Goodwill", indent: true },
        { key: "intangiblesAssets", label: "Intangible Assets", indent: true },
        { key: "noteReceivableLongTerm", label: "Long-Term Notes Receivable", indent: true },
        { key: "otherLongTermAssets", label: "Other Long-Term Assets", indent: true },
        { key: "otherAssets", label: "Other Assets", indent: true },
        { key: "totalAssets", label: "Total Assets", emphasis: "total" },
      ],
    },
    {
      title: "Liabilities",
      items: [
        { key: "accountsPayable", label: "Accounts Payable", indent: true },
        { key: "accruedLiability", label: "Accrued Liabilities", indent: true },
        { key: "shortTermDebt", label: "Short-Term Debt", indent: true },
        { key: "currentPortionLongTermDebt", label: "Current Portion of Long-Term Debt", indent: true },
        { key: "deferredRevenue", label: "Deferred Revenue", indent: true },
        { key: "otherCurrentliabilities", label: "Other Current Liabilities", indent: true },
        { key: "currentLiabilities", label: "Total Current Liabilities", emphasis: "subtotal" },
        { key: "longTermDebt", label: "Long-Term Debt", indent: true },
        { key: "otherLiabilities", label: "Other Liabilities", indent: true },
        { key: "totalLiabilities", label: "Total Liabilities", emphasis: "total" },
      ],
    },
    {
      title: "Equity",
      items: [
        { key: "commonStock", label: "Common Stock", indent: true },
        { key: "additionalPaidInCapital", label: "Additional Paid-In Capital", indent: true },
        { key: "retainedEarnings", label: "Retained Earnings", indent: true },
        { key: "otherEquity", label: "Other Equity", indent: true },
        { key: "minorityInterest", label: "Minority Interest", indent: true },
        { key: "totalEquity", label: "Total Equity", emphasis: "total" },
        {
          key: "liabilitiesShareholdersEquity",
          label: "Total Liabilities & Equity",
          emphasis: "subtotal",
        },
      ],
    },
  ],
  memo: [
    { key: "totalDebt", label: "Total Debt" },
    { key: "netDebt", label: "Net Debt" },
    { key: "sharesOutstanding", label: "Shares Outstanding", unit: "shares" },
    { key: "tangibleBookValueperShare", label: "Tangible Book Value per Share", unit: "perShare" },
  ],
};

const CASH_FLOW: StatementLayout = {
  title: "Cash Flow",
  sections: [
    {
      title: "Operating Activities",
      items: [
        { key: "netIncomeStartingLine", label: "Net Income", indent: true },
        { key: "depreciationAmortization", label: "Depreciation & Amortization", indent: true },
        { key: "stockBasedCompensation", label: "Stock-Based Compensation", indent: true },
        { key: "deferredTaxesInvestmentTaxCredit", label: "Deferred Taxes", indent: true },
        { key: "otherFundsNonCashItems", label: "Other Non-Cash Items", indent: true },
        { key: "changesinWorkingCapital", label: "Changes in Working Capital", indent: true },
        { key: "netOperatingCashFlow", label: "Cash from Operations", emphasis: "total" },
      ],
    },
    {
      title: "Investing Activities",
      items: [
        { key: "capex", label: "Capital Expenditures", indent: true },
        { key: "otherInvestingCashFlowItemsTotal", label: "Other Investing Activities", indent: true },
        { key: "netInvestingCashFlow", label: "Cash from Investing", emphasis: "total" },
      ],
    },
    {
      title: "Financing Activities",
      items: [
        { key: "issuanceReductionCapitalStock", label: "Stock Issued (Repurchased)", indent: true },
        { key: "issuanceReductionDebtNet", label: "Debt Issued (Repaid), net", indent: true },
        { key: "otherFundsFinancingItems", label: "Other Financing Activities", indent: true },
        { key: "netCashFinancingActivities", label: "Cash from Financing", emphasis: "total" },
      ],
    },
    {
      items: [
        { key: "foreignExchangeEffects", label: "Foreign Exchange Effects", indent: true },
        { key: "changeinCash", label: "Net Change in Cash", emphasis: "total" },
      ],
    },
  ],
  memo: [
    { key: "fcf", label: "Free Cash Flow" },
    { key: "cashInterestPaid", label: "Cash Interest Paid" },
    { key: "cashTaxesPaid", label: "Cash Taxes Paid" },
  ],
};

export const STATEMENT_LAYOUTS: Record<StatementKind, StatementLayout> = {
  ic: INCOME_STATEMENT,
  bs: BALANCE_SHEET,
  cf: CASH_FLOW,
};

export const STATEMENT_KINDS: StatementKind[] = ["ic", "bs", "cf"];

export const isStatementKind = (v: string): v is StatementKind =>
  (STATEMENT_KINDS as string[]).includes(v);
