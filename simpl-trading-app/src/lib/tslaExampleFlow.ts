import type { FlowGraph } from "./statements";

/**
 * Tesla's FY2025 income statement as a flow — the example the paywall shows.
 *
 * A SNAPSHOT, generated from the backend's own flow builder, not fetched
 * live: a marketing preview must render instantly and must not depend on
 * the data plan covering TSLA that day. Regenerate from
 * /api/company/TSLA/statements?statement=ic if the flow builder's shape
 * changes, so the preview never drifts from what a subscriber actually gets.
 * Values are real dollars, as the app receives them.
 */
export const TSLA_EXAMPLE_FLOW: FlowGraph = {
  nodes: [
    { id: "revenue", label: "Revenue", kind: "stage", reported: 94827000000 },
    { id: "cogs", label: "Cost of Revenue", kind: "expense" },
    { id: "gross", label: "Gross Profit", kind: "stage", reported: 17094000000 },
    { id: "rd", label: "Research & Development", kind: "expense" },
    { id: "sga", label: "Selling, General & Admin", kind: "expense" },
    { id: "operating", label: "Operating Income", kind: "stage", reported: 4849000000 },
    { id: "nonrecurring", label: "Non-Recurring Charge", kind: "expense" },
    { id: "pretax", label: "Pre-Tax Income", kind: "stage", reported: 5278000000 },
    { id: "interest", label: "Interest, net", kind: "income" },
    { id: "other-income", label: "Other Income", kind: "income" },
    { id: "tax", label: "Income Tax", kind: "expense" },
    { id: "minority", label: "Minority Interest", kind: "expense" },
    { id: "net", label: "Net Income", kind: "stage", reported: 3794000000 },
  ],
  links: [
    { source: "revenue", target: "cogs", value: 77733000000 },
    { source: "revenue", target: "gross", value: 17094000000 },
    { source: "gross", target: "rd", value: 6411000000 },
    { source: "gross", target: "sga", value: 5834000000 },
    { source: "gross", target: "operating", value: 4849000000 },
    { source: "operating", target: "nonrecurring", value: 494000000 },
    { source: "interest", target: "pretax", value: 867000000 },
    { source: "other-income", target: "pretax", value: 56000000 },
    { source: "operating", target: "pretax", value: 4355000000 },
    { source: "pretax", target: "tax", value: 1423000000 },
    { source: "pretax", target: "minority", value: 61000000 },
    { source: "pretax", target: "net", value: 3794000000 },
  ],
};
