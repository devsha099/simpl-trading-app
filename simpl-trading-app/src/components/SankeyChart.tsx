import { useMemo } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop, Text } from "react-native-svg";
import {
  sankey,
  sankeyJustify,
  sankeyLinkHorizontal,
  type SankeyLink,
  type SankeyNode,
} from "d3-sankey";
import type { FlowGraph, FlowNode } from "../lib/statements";
import { colors, fonts } from "../lib/theme";

/**
 * A financial statement as a flow: the "Simpl Financials" premium view.
 *
 * d3-sankey does the layout — it's pure geometry with no DOM dependency, so
 * the same code runs on native and web — and react-native-svg draws it.
 * Nothing here knows what an income statement is; the backend hands over a
 * balanced graph (data/statementFlow.ts) and this turns nodes into bars and
 * links into ribbons.
 *
 * Every ribbon is a gradient from its source's colour to its target's, so a
 * reader follows money by hue: amber is the company's own profit path,
 * green is money coming in from elsewhere, rust is money going out (and, on
 * the left, a loss that had to be covered), grey is what the filing didn't
 * itemise.
 *
 * Labels sit beside their bar with a dark halo underneath — the halo is the
 * text drawn twice, stroke first, because SVG paint-order isn't available
 * on native and text over a ribbon is unreadable without it.
 */

type N = SankeyNode<FlowNode, {}>;
type L = SankeyLink<FlowNode, {}>;

const NODE_WIDTH = 14;
// The right margin is reserved for the last column's labels, so sink names
// never sit over a ribbon or under a stage's label. Top/bottom make room
// for middle stages, which label above and below their bar.
// 152 fits "Research & Development" at 11 px semibold; 132 clipped it.
const MARGIN = { top: 26, right: 152, bottom: 26, left: 16 };
// A two-line label is ~24 px tall. Bars in a column are separated by at
// least this much, so even hairline bars stacked together keep their labels
// apart — the first render put "$77.73B" on top of "Research & Development".
const NODE_PADDING = 27;
const ROW_HEIGHT = 54;
const MIN_HEIGHT = 420;

const KIND_COLOR: Record<FlowNode["kind"], string> = {
  stage: colors.amber,
  income: colors.phosphor,
  expense: colors.rust,
  loss: "#b0503a",
  other: colors.paperDim,
};

export function SankeyChart({
  graph,
  width,
  formatValue,
}: {
  graph: FlowGraph;
  width: number;
  formatValue: (v: number) => string;
}) {
  const layout = useMemo(() => {
    if (graph.links.length === 0) return null;

    // d3-sankey mutates what it's given; hand it copies.
    const nodes = graph.nodes.map((n) => ({ ...n })) as N[];
    const links = graph.links.map((l) => ({ ...l })) as unknown as L[];

    // Size the canvas to the busiest column so labels have room, then lay
    // out into it. Depth isn't known until layout runs, so run once to
    // count, once to fit.
    const probe = sankey<FlowNode, {}>()
      .nodeId((d) => d.id)
      .nodeWidth(NODE_WIDTH)
      .nodePadding(8)
      .nodeAlign(sankeyJustify)
      .extent([[0, 0], [1000, 1000]]);
    const probed = probe({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ ...l })),
    });
    const perColumn = new Map<number, number>();
    for (const n of probed.nodes) perColumn.set(n.depth ?? 0, (perColumn.get(n.depth ?? 0) ?? 0) + 1);
    const busiest = Math.max(...perColumn.values(), 1);
    const height = Math.max(MIN_HEIGHT, busiest * ROW_HEIGHT + MARGIN.top + MARGIN.bottom);

    const gen = sankey<FlowNode, {}>()
      .nodeId((d) => d.id)
      .nodeWidth(NODE_WIDTH)
      .nodePadding(NODE_PADDING)
      .nodeAlign(sankeyJustify)
      .extent([
        [MARGIN.left, MARGIN.top],
        [width - MARGIN.right, height - MARGIN.bottom],
      ]);
    const result = gen({ nodes, links });
    // Column membership by POSITION, not `depth`: sankeyJustify moves every
    // sink to the last column but leaves its depth where the path put it,
    // so "depth < maxDepth" called every sink a middle stage and gave it the
    // above/below labels meant for the profit path.
    const xs = result.nodes.map((n) => n.x0 ?? 0);
    return { ...result, height, firstX: Math.min(...xs), lastX: Math.max(...xs) };
  }, [graph, width]);

  if (!layout) {
    return (
      <View style={styles.empty}>
        <RNText style={styles.emptyText}>Not enough reported figures to draw this period.</RNText>
      </View>
    );
  }

  const path = sankeyLinkHorizontal<FlowNode, {}>();

  return (
    <Svg width={width} height={layout.height}>
      <Defs>
        {layout.links.map((l, i) => {
          const s = l.source as N;
          const t = l.target as N;
          return (
            <LinearGradient
              key={`g${i}`}
              id={`lk${i}`}
              gradientUnits="userSpaceOnUse"
              x1={s.x1 ?? 0}
              x2={t.x0 ?? 0}
              y1={0}
              y2={0}
            >
              <Stop offset="0" stopColor={KIND_COLOR[s.kind]} />
              <Stop offset="1" stopColor={KIND_COLOR[t.kind]} />
            </LinearGradient>
          );
        })}
      </Defs>

      <G>
        {layout.links.map((l, i) => (
          <Path
            key={`l${i}`}
            d={path(l) ?? ""}
            fill="none"
            stroke={`url(#lk${i})`}
            // A hairline for the tiniest flows so nothing silently vanishes.
            strokeWidth={Math.max(l.width ?? 1, 1)}
            strokeOpacity={0.42}
          />
        ))}
      </G>

      <G>
        {layout.nodes.map((n) => {
          const x0 = n.x0 ?? 0;
          const x1 = n.x1 ?? 0;
          const y0 = n.y0 ?? 0;
          const y1 = n.y1 ?? 0;
          const color = KIND_COLOR[n.kind];
          const isStage = n.kind === "stage";
          const cy = (y0 + y1) / 2;
          const cx = (x0 + x1) / 2;
          // Label the FILED figure where the backend supplies one — a stage
          // bar in a loss year is drawn at its throughput (profit plus the
          // loss ribbon feeding it), which is not the number in the filing.
          const value = formatValue(n.reported ?? n.value ?? 0);
          const valueColor = isStage ? colors.amberSoft : colors.paperDim;
          // Three placements, by column. First column (sources) and last
          // column (sinks) label to the right — the last into the reserved
          // margin. Middle stages label above and below their bar, centred,
          // so labels from neighbouring columns never share a horizontal
          // band.
          const middle = x0 > layout.firstX + 1 && x0 < layout.lastX - 1;
          return (
            <G key={n.id}>
              <Rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={Math.max(y1 - y0, 1.5)}
                rx={2}
                fill={color}
                stroke={isStage ? colors.amberSoft : "none"}
                strokeWidth={isStage ? 0.75 : 0}
              />
              {middle ? (
                <>
                  <Halo x={cx} y={y0 - 7} anchor="middle" size={11} family={fonts.bodySemiBold} fill={colors.paper}>
                    {n.label}
                  </Halo>
                  <Halo x={cx} y={y1 + 13} anchor="middle" size={10} family={fonts.mono} fill={valueColor}>
                    {value}
                  </Halo>
                </>
              ) : (
                <>
                  <Halo x={x1 + 7} y={cy - 3} anchor="start" size={11} family={fonts.bodySemiBold} fill={colors.paper}>
                    {n.label}
                  </Halo>
                  <Halo x={x1 + 7} y={cy + 10} anchor="start" size={10} family={fonts.mono} fill={valueColor}>
                    {value}
                  </Halo>
                </>
              )}
            </G>
          );
        })}
      </G>
    </Svg>
  );
}

/** Text with a dark halo so it stays legible over a ribbon. */
function Halo({
  x,
  y,
  anchor,
  size,
  family,
  fill,
  children,
}: {
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  size: number;
  family: string;
  fill: string;
  children: string;
}) {
  const common = { x, y, textAnchor: anchor, fontSize: size, fontFamily: family } as const;
  return (
    <>
      <Text {...common} stroke={colors.ink} strokeWidth={3.5} strokeOpacity={0.9} fill={colors.ink}>
        {children}
      </Text>
      <Text {...common} fill={fill}>
        {children}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: 48, alignItems: "center" },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.paperDim, textAlign: "center" },
});
