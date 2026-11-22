import type { CodeLanguage } from "@/lib/code-runner";

export type JournalFigurePresetId =
  | "nature-single"
  | "nature-double"
  | "ieee-single"
  | "ieee-double"
  | "elsevier-single"
  | "elsevier-double"
  | "ams-siam"
  | "arxiv-preprint";

export interface JournalFigureSpec {
  id: JournalFigurePresetId;
  label: string;
  publisher: string;
  columns: 1 | 2;
  widthInches: number;
  heightInches: number;
  widthMm: number;
  dpi: number;
  fontFamily: "sans-serif" | "serif";
  fontName: string;
  baseFontPt: number;
  titleFontPt: number;
  axisLabelPt: number;
  tickLabelPt: number;
  legendFontPt: number;
  panelLabelPt: number;
  lineWidthPt: number;
  axisLineWidthPt: number;
  pdfFontType: 42;
  latexWidth: string;
  guidelines: string;
}

export const JOURNAL_FIGURE_SPECS: Record<
  JournalFigurePresetId,
  JournalFigureSpec
> = {
  "nature-single": {
    id: "nature-single",
    label: "Nature / Springer (1-col · 89 mm)",
    publisher: "Springer Nature",
    columns: 1,
    widthInches: 3.5,
    heightInches: 2.65,
    widthMm: 89,
    dpi: 300,
    fontFamily: "sans-serif",
    fontName: "Helvetica / DejaVu Sans",
    baseFontPt: 8,
    titleFontPt: 9,
    axisLabelPt: 8,
    tickLabelPt: 7,
    legendFontPt: 7,
    panelLabelPt: 9,
    lineWidthPt: 1.35,
    axisLineWidthPt: 0.75,
    pdfFontType: 42,
    latexWidth: "0.48\\textwidth",
    guidelines:
      "89 mm single column, 7–8 pt sans-serif labels, despined top/right axes, 300 DPI + Type 42 vector PDF.",
  },
  "nature-double": {
    id: "nature-double",
    label: "Nature / Springer (2-col · 183 mm)",
    publisher: "Springer Nature",
    columns: 2,
    widthInches: 7.2,
    heightInches: 3.8,
    widthMm: 183,
    dpi: 300,
    fontFamily: "sans-serif",
    fontName: "Helvetica / DejaVu Sans",
    baseFontPt: 8.5,
    titleFontPt: 9.5,
    axisLabelPt: 8.5,
    tickLabelPt: 7.5,
    legendFontPt: 7.5,
    panelLabelPt: 9.5,
    lineWidthPt: 1.5,
    axisLineWidthPt: 0.8,
    pdfFontType: 42,
    latexWidth: "0.96\\textwidth",
    guidelines:
      "183 mm full-page span, bold lowercase panel letters (a, b), Type 42 editable TrueType outlines.",
  },
  "ieee-single": {
    id: "ieee-single",
    label: "IEEE Transactions (1-col · 3.5 in)",
    publisher: "IEEE",
    columns: 1,
    widthInches: 3.5,
    heightInches: 2.6,
    widthMm: 88.9,
    dpi: 300,
    fontFamily: "serif",
    fontName: "Times / DejaVu Serif",
    baseFontPt: 8,
    titleFontPt: 9,
    axisLabelPt: 8,
    tickLabelPt: 7,
    legendFontPt: 7,
    panelLabelPt: 8.5,
    lineWidthPt: 1.35,
    axisLineWidthPt: 0.75,
    pdfFontType: 42,
    latexWidth: "0.96\\columnwidth",
    guidelines:
      "3.5 in IEEE column width, 8 pt Times-compatible serif typography, distinct markers for B/W print legibility.",
  },
  "ieee-double": {
    id: "ieee-double",
    label: "IEEE Transactions (2-col · 7.16 in)",
    publisher: "IEEE",
    columns: 2,
    widthInches: 7.16,
    heightInches: 3.6,
    widthMm: 182,
    dpi: 300,
    fontFamily: "serif",
    fontName: "Times / DejaVu Serif",
    baseFontPt: 9,
    titleFontPt: 10,
    axisLabelPt: 9,
    tickLabelPt: 8,
    legendFontPt: 8,
    panelLabelPt: 9.5,
    lineWidthPt: 1.5,
    axisLineWidthPt: 0.8,
    pdfFontType: 42,
    latexWidth: "0.96\\textwidth",
    guidelines:
      "7.16 in double-column figure* span, 8–9 pt serif labels, embedded Type 42 fonts.",
  },
  "elsevier-single": {
    id: "elsevier-single",
    label: "Elsevier Journal (1-col · 90 mm)",
    publisher: "Elsevier",
    columns: 1,
    widthInches: 3.54,
    heightInches: 2.65,
    widthMm: 90,
    dpi: 300,
    fontFamily: "sans-serif",
    fontName: "Arial / DejaVu Sans",
    baseFontPt: 8,
    titleFontPt: 9,
    axisLabelPt: 8,
    tickLabelPt: 7,
    legendFontPt: 7,
    panelLabelPt: 9,
    lineWidthPt: 1.35,
    axisLineWidthPt: 0.75,
    pdfFontType: 42,
    latexWidth: "0.48\\textwidth",
    guidelines:
      "90 mm Elsevier single column, uniform 7–8 pt sans-serif sizing, >=300 DPI halftone.",
  },
  "elsevier-double": {
    id: "elsevier-double",
    label: "Elsevier Journal (2-col · 190 mm)",
    publisher: "Elsevier",
    columns: 2,
    widthInches: 7.48,
    heightInches: 3.9,
    widthMm: 190,
    dpi: 300,
    fontFamily: "sans-serif",
    fontName: "Arial / DejaVu Sans",
    baseFontPt: 8.5,
    titleFontPt: 9.5,
    axisLabelPt: 8.5,
    tickLabelPt: 7.5,
    legendFontPt: 7.5,
    panelLabelPt: 9.5,
    lineWidthPt: 1.5,
    axisLineWidthPt: 0.8,
    pdfFontType: 42,
    latexWidth: "0.96\\textwidth",
    guidelines:
      "190 mm full-width Elsevier double column with high-contrast CVD-safe palette.",
  },
  "ams-siam": {
    id: "ams-siam",
    label: "AMS / SIAM Mathematics (127 mm)",
    publisher: "AMS / SIAM",
    columns: 1,
    widthInches: 5.0,
    heightInches: 3.35,
    widthMm: 127,
    dpi: 300,
    fontFamily: "serif",
    fontName: "Computer Modern / DejaVu Serif",
    baseFontPt: 9,
    titleFontPt: 10,
    axisLabelPt: 9,
    tickLabelPt: 8,
    legendFontPt: 8,
    panelLabelPt: 9.5,
    lineWidthPt: 1.4,
    axisLineWidthPt: 0.8,
    pdfFontType: 42,
    latexWidth: "0.82\\textwidth",
    guidelines:
      "127 mm mathematical monograph width, serif math labels, crisp vector lines and slope triangles.",
  },
  "arxiv-preprint": {
    id: "arxiv-preprint",
    label: "arXiv Preprint (140 mm · 1-col)",
    publisher: "arXiv",
    columns: 1,
    widthInches: 5.5,
    heightInches: 3.55,
    widthMm: 140,
    dpi: 300,
    fontFamily: "serif",
    fontName: "Computer Modern / DejaVu Serif",
    baseFontPt: 9.5,
    titleFontPt: 10.5,
    axisLabelPt: 9.5,
    tickLabelPt: 8.5,
    legendFontPt: 8.5,
    panelLabelPt: 10,
    lineWidthPt: 1.5,
    axisLineWidthPt: 0.85,
    pdfFontType: 42,
    latexWidth: "0.85\\textwidth",
    guidelines:
      "140 mm wide single-column preprint figure optimized for screen reading and archival PDF/A.",
  },
};

export const JOURNAL_FIGURE_PRESET_LIST: JournalFigureSpec[] =
  Object.values(JOURNAL_FIGURE_SPECS);

export type FigurePaletteId = "okabe-ito" | "tol-muted" | "grayscale";

export interface FigurePalette {
  id: FigurePaletteId;
  label: string;
  description: string;
  colors: string[];
  markers: string[];
  lineStyles: string[];
}

export const FIGURE_PALETTES: Record<FigurePaletteId, FigurePalette> = {
  "okabe-ito": {
    id: "okabe-ito",
    label: "Okabe–Ito (Colorblind-Safe)",
    description:
      "Deuteranopia/protanopia-safe qualitative palette recommended by Nature Methods & IEEE.",
    colors: [
      "#0072B2",
      "#D55E00",
      "#009E73",
      "#CC79A7",
      "#E69F00",
      "#56B4E9",
      "#000000",
    ],
    markers: ["o", "s", "^", "D", "v", "P", "X"],
    lineStyles: ["-", "--", "-.", ":"],
  },
  "tol-muted": {
    id: "tol-muted",
    label: "Paul Tol Muted (Scientific)",
    description:
      "Balanced luminance scientific palette with distinct hues for multi-series comparisons.",
    colors: [
      "#332288",
      "#44AA99",
      "#CC6677",
      "#117733",
      "#882255",
      "#DDCC77",
      "#88CCEE",
    ],
    markers: ["o", "s", "^", "D", "v", "P", "X"],
    lineStyles: ["-", "--", "-.", ":"],
  },
  grayscale: {
    id: "grayscale",
    label: "Print Grayscale (B/W Journal)",
    description:
      "Monochrome print-safe grayscale relying on distinct markers, hatching, and dash patterns.",
    colors: ["#141413", "#4A4A48", "#767672", "#2E2E2C", "#5E5E5A", "#8F8F8A"],
    markers: ["o", "s", "^", "D", "v", "P"],
    lineStyles: ["-", "--", "-.", ":"],
  },
};

export const FIGURE_PALETTE_LIST: FigurePalette[] =
  Object.values(FIGURE_PALETTES);

export type FigureFamily =
  | "line-convergence"
  | "bar-comparison"
  | "scatter-regression"
  | "distribution-violin"
  | "heatmap-matrix"
  | "function-surface"
  | "dag-flowchart"
  | "network-graph"
  | "multi-panel";

export interface FigureGraphNodeInput {
  id: string;
  label?: string;
}

export interface FigureGraphEdgeInput {
  from: string;
  to: string;
  label?: string;
  weight?: number;
}

export interface PositionedGraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  layer: number;
  order: number;
}

export interface PositionedGraphEdge {
  from: string;
  to: string;
  label?: string;
  weight?: number;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  backEdge?: boolean;
}

export interface GraphLayoutResult {
  nodes: PositionedGraphNode[];
  edges: PositionedGraphEdge[];
  layerCount: number;
  crossings: number;
}

function normalizeNodeInputs(
  nodes: ReadonlyArray<string | FigureGraphNodeInput>,
  edges: ReadonlyArray<FigureGraphEdgeInput | [string, string]>,
): {
  nodeList: Array<{ id: string; label: string }>;
  edgeList: FigureGraphEdgeInput[];
} {
  const byId = new Map<string, { id: string; label: string }>();
  for (const item of nodes) {
    if (typeof item === "string") {
      const id = item.trim();
      if (id && !byId.has(id)) byId.set(id, { id, label: id });
    } else if (item?.id.trim()) {
      const id = item.id.trim();
      byId.set(id, { id, label: (item.label ?? id).trim() || id });
    }
  }

  const edgeList: FigureGraphEdgeInput[] = [];
  for (const raw of edges) {
    const edge: FigureGraphEdgeInput = Array.isArray(raw)
      ? { from: raw[0], to: raw[1] }
      : raw;
    const from = edge.from.trim();
    const to = edge.to.trim();
    if (!from || !to) continue;
    if (!byId.has(from)) byId.set(from, { id: from, label: from });
    if (!byId.has(to)) byId.set(to, { id: to, label: to });
    edgeList.push({
      from,
      to,
      label: edge.label,
      weight: edge.weight,
    });
  }

  return {
    nodeList: Array.from(byId.values()),
    edgeList,
  };
}

function countAdjacentCrossings(
  layers: string[][],
  dagEdges: Array<{ from: string; to: string }>,
  layerOf: Map<string, number>,
): number {
  let crossings = 0;
  for (let l = 0; l < layers.length - 1; l++) {
    const upper = layers[l];
    const lower = layers[l + 1];
    const upperOrder = new Map<string, number>();
    const lowerOrder = new Map<string, number>();
    upper.forEach((id, idx) => upperOrder.set(id, idx));
    lower.forEach((id, idx) => lowerOrder.set(id, idx));

    const spanEdges = dagEdges.filter(
      (e) => layerOf.get(e.from) === l && layerOf.get(e.to) === l + 1,
    );
    for (let i = 0; i < spanEdges.length; i++) {
      for (let j = i + 1; j < spanEdges.length; j++) {
        const u1 = upperOrder.get(spanEdges[i].from) ?? 0;
        const v1 = lowerOrder.get(spanEdges[i].to) ?? 0;
        const u2 = upperOrder.get(spanEdges[j].from) ?? 0;
        const v2 = lowerOrder.get(spanEdges[j].to) ?? 0;
        if ((u1 - u2) * (v1 - v2) < 0) {
          crossings++;
        }
      }
    }
  }
  return crossings;
}

/**
 * 3-Phase Deterministic Sugiyama Layered Graph Layout:
 * 1. DFS cycle breaking + topological longest-path layer assignment
 * 2. Iterative downward/upward barycenter crossing reduction
 * 3. Balanced non-overlapping normalized [0, 1] x [0, 1] coordinate assignment
 */
export function layoutSugiyamaDag(
  nodes: ReadonlyArray<string | FigureGraphNodeInput>,
  edges: ReadonlyArray<FigureGraphEdgeInput | [string, string]>,
): GraphLayoutResult {
  const { nodeList, edgeList } = normalizeNodeInputs(nodes, edges);
  if (nodeList.length === 0) {
    return { nodes: [], edges: [], layerCount: 0, crossings: 0 };
  }

  const labelById = new Map(nodeList.map((n) => [n.id, n.label]));
  const initialIndex = new Map(nodeList.map((n, idx) => [n.id, idx]));

  // Phase 1a: Break cycles deterministically via DFS visitation state
  const adj = new Map<string, string[]>();
  for (const n of nodeList) adj.set(n.id, []);
  for (const e of edgeList) {
    if (e.from !== e.to) {
      adj.get(e.from)?.push(e.to);
    }
  }

  const state = new Map<string, 0 | 1 | 2>();
  const backEdgeKeys = new Set<string>();
  const dfs = (u: string) => {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const vState = state.get(v) ?? 0;
      if (vState === 1) {
        backEdgeKeys.add(`${u}->${v}`);
      } else if (vState === 0) {
        dfs(v);
      }
    }
    state.set(u, 2);
  };
  for (const n of nodeList) {
    if ((state.get(n.id) ?? 0) === 0) {
      dfs(n.id);
    }
  }

  const dagEdges: Array<{ from: string; to: string; backEdge: boolean }> = [];
  for (const e of edgeList) {
    if (e.from === e.to) continue;
    const isBack = backEdgeKeys.has(`${e.from}->${e.to}`);
    dagEdges.push(
      isBack
        ? { from: e.to, to: e.from, backEdge: true }
        : { from: e.from, to: e.to, backEdge: false },
    );
  }

  // Phase 1b: Longest-path topological layer assignment
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const n of nodeList) {
    inDegree.set(n.id, 0);
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
  }
  for (const e of dagEdges) {
    outgoing.get(e.from)?.push(e.to);
    incoming.get(e.to)?.push(e.from);
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }

  const layerOf = new Map<string, number>();
  for (const n of nodeList) layerOf.set(n.id, 0);

  const queue: string[] = nodeList
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);
  const visited = new Set<string>();

  while (queue.length > 0) {
    const u = queue.shift()!;
    visited.add(u);
    const uLayer = layerOf.get(u) ?? 0;
    for (const v of outgoing.get(u) ?? []) {
      const nextLayer = Math.max(layerOf.get(v) ?? 0, uLayer + 1);
      layerOf.set(v, nextLayer);
      const nextIn = (inDegree.get(v) ?? 1) - 1;
      inDegree.set(v, nextIn);
      if (nextIn <= 0 && !visited.has(v)) {
        queue.push(v);
      }
    }
  }

  // Fallback for any residual cycle nodes
  for (const n of nodeList) {
    if (!visited.has(n.id)) {
      layerOf.set(n.id, initialIndex.get(n.id) ?? 0);
    }
  }

  // Compact layer indices to 0 .. L-1
  const distinctLayers = Array.from(new Set(layerOf.values())).sort(
    (a, b) => a - b,
  );
  const layerRemap = new Map(distinctLayers.map((val, idx) => [val, idx]));
  const layerCount = Math.max(1, distinctLayers.length);
  const layers: string[][] = Array.from({ length: layerCount }, () => []);

  for (const n of nodeList) {
    const mapped = layerRemap.get(layerOf.get(n.id) ?? 0) ?? 0;
    layerOf.set(n.id, mapped);
    layers[mapped].push(n.id);
  }

  // Phase 2: Iterative barycenter crossing reduction
  let bestLayers = layers.map((layer) => [...layer]);
  let bestCrossings = countAdjacentCrossings(bestLayers, dagEdges, layerOf);

  for (let sweep = 0; sweep < 12; sweep++) {
    // Downward pass
    for (let l = 1; l < layerCount; l++) {
      const orderMap = new Map<string, number>();
      layers.forEach((layerNodes) =>
        layerNodes.forEach((id, idx) => orderMap.set(id, idx)),
      );
      const current = layers[l];
      const barycenters = new Map<string, number>();
      current.forEach((id, idx) => {
        const preds = (incoming.get(id) ?? []).filter(
          (p) => (layerOf.get(p) ?? 0) < l,
        );
        if (preds.length === 0) {
          barycenters.set(id, idx);
        } else {
          const sum = preds.reduce(
            (acc, p) => acc + (orderMap.get(p) ?? idx),
            0,
          );
          barycenters.set(id, sum / preds.length);
        }
      });
      current.sort((a, b) => {
        const diff = (barycenters.get(a) ?? 0) - (barycenters.get(b) ?? 0);
        if (Math.abs(diff) > 1e-6) return diff;
        return (initialIndex.get(a) ?? 0) - (initialIndex.get(b) ?? 0);
      });
    }

    // Upward pass
    for (let l = layerCount - 2; l >= 0; l--) {
      const orderMap = new Map<string, number>();
      layers.forEach((layerNodes) =>
        layerNodes.forEach((id, idx) => orderMap.set(id, idx)),
      );
      const current = layers[l];
      const barycenters = new Map<string, number>();
      current.forEach((id, idx) => {
        const succs = (outgoing.get(id) ?? []).filter(
          (s) => (layerOf.get(s) ?? 0) > l,
        );
        if (succs.length === 0) {
          barycenters.set(id, idx);
        } else {
          const sum = succs.reduce(
            (acc, s) => acc + (orderMap.get(s) ?? idx),
            0,
          );
          barycenters.set(id, sum / succs.length);
        }
      });
      current.sort((a, b) => {
        const diff = (barycenters.get(a) ?? 0) - (barycenters.get(b) ?? 0);
        if (Math.abs(diff) > 1e-6) return diff;
        return (initialIndex.get(a) ?? 0) - (initialIndex.get(b) ?? 0);
      });
    }

    const crossings = countAdjacentCrossings(layers, dagEdges, layerOf);
    if (crossings < bestCrossings) {
      bestCrossings = crossings;
      bestLayers = layers.map((layer) => [...layer]);
      if (bestCrossings === 0) break;
    }
  }

  // Phase 3: Balanced non-overlapping normalized [0, 1] x [0, 1] coordinates
  const positionedNodes: PositionedGraphNode[] = [];
  const nodeById = new Map<string, PositionedGraphNode>();

  for (let l = 0; l < layerCount; l++) {
    const layerNodes = bestLayers[l];
    const x =
      layerCount === 1
        ? 0.5
        : Number((0.12 + (0.76 * l) / (layerCount - 1)).toFixed(4));
    const count = layerNodes.length;

    for (let idx = 0; idx < count; idx++) {
      const id = layerNodes[idx];
      const y =
        count === 1
          ? 0.5
          : Number((0.82 - (0.64 * idx) / (count - 1)).toFixed(4));
      const positioned: PositionedGraphNode = {
        id,
        label: labelById.get(id) ?? id,
        x,
        y,
        layer: l,
        order: idx,
      };
      positionedNodes.push(positioned);
      nodeById.set(id, positioned);
    }
  }

  const positionedEdges: PositionedGraphEdge[] = edgeList
    .map((e) => {
      const src = nodeById.get(e.from);
      const dst = nodeById.get(e.to);
      if (!src || !dst) return null;
      return {
        from: e.from,
        to: e.to,
        label: e.label,
        weight: e.weight,
        sourceX: src.x,
        sourceY: src.y,
        targetX: dst.x,
        targetY: dst.y,
        backEdge: backEdgeKeys.has(`${e.from}->${e.to}`),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    layerCount,
    crossings: bestCrossings,
  };
}

function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0 || 1;
}

/**
 * Deterministic Seeded Fruchterman–Reingold Force-Directed Equilibrium Layout
 * normalized to [0, 1] x [0, 1] with non-overlap separation guarantee.
 */
export function layoutFruchtermanReingold(
  nodes: ReadonlyArray<string | FigureGraphNodeInput>,
  edges: ReadonlyArray<FigureGraphEdgeInput | [string, string]>,
  iterations = 120,
): GraphLayoutResult {
  const { nodeList, edgeList } = normalizeNodeInputs(nodes, edges);
  const n = nodeList.length;
  if (n === 0) {
    return { nodes: [], edges: [], layerCount: 0, crossings: 0 };
  }
  if (n === 1) {
    const only: PositionedGraphNode = {
      id: nodeList[0].id,
      label: nodeList[0].label,
      x: 0.5,
      y: 0.5,
      layer: 0,
      order: 0,
    };
    return { nodes: [only], edges: [], layerCount: 1, crossings: 0 };
  }

  const seedStr = [
    ...nodeList.map((node) => node.id),
    "|",
    ...edgeList.map((edge) => `${edge.from}->${edge.to}`),
  ].join(",");
  let rngState = hashSeed(seedStr);
  const nextRand = (): number => {
    rngState ^= rngState << 13;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5;
    return (rngState >>> 0) / 0xffffffff;
  };

  const pos = nodeList.map((node, i) => {
    const angle = (2 * Math.PI * i) / n;
    const radius = 0.34 + 0.04 * (nextRand() - 0.5);
    return {
      id: node.id,
      label: node.label,
      x: 0.5 + radius * Math.cos(angle),
      y: 0.5 + radius * Math.sin(angle),
    };
  });
  const indexById = new Map(pos.map((p, idx) => [p.id, idx]));

  const area = 1.0;
  const k = Math.sqrt(area / n);
  const totalIters = Math.max(16, Math.min(400, Math.round(iterations)));

  for (let iter = 0; iter < totalIters; iter++) {
    const dispX = new Float64Array(n);
    const dispY = new Float64Array(n);
    const temp = 0.16 * (1 - iter / totalIters) + 0.005;

    // Pairwise repulsive forces
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
          dx = 1e-4 * (i + 1);
          dy = -1e-4 * (j + 1);
        }
        const dist = Math.hypot(dx, dy) || 1e-4;
        const rep = (k * k) / dist;
        const fx = (dx / dist) * rep;
        const fy = (dy / dist) * rep;
        dispX[i] += fx;
        dispY[i] += fy;
        dispX[j] -= fx;
        dispY[j] -= fy;
      }
    }

    // Edge attractive forces
    for (const edge of edgeList) {
      const u = indexById.get(edge.from);
      const v = indexById.get(edge.to);
      if (u === undefined || v === undefined || u === v) continue;
      const dx = pos[u].x - pos[v].x;
      const dy = pos[u].y - pos[v].y;
      const dist = Math.hypot(dx, dy) || 1e-4;
      const weight = edge.weight && edge.weight > 0 ? edge.weight : 1;
      const att = ((dist * dist) / k) * weight;
      const fx = (dx / dist) * att;
      const fy = (dy / dist) * att;
      dispX[u] -= fx;
      dispY[u] -= fy;
      dispX[v] += fx;
      dispY[v] += fy;
    }

    // Centering gravity + temperature-clamped update
    for (let i = 0; i < n; i++) {
      dispX[i] += (0.5 - pos[i].x) * 0.08;
      dispY[i] += (0.5 - pos[i].y) * 0.08;
      const mag = Math.hypot(dispX[i], dispY[i]) || 1e-6;
      const step = Math.min(mag, temp);
      pos[i].x += (dispX[i] / mag) * step;
      pos[i].y += (dispY[i] / mag) * step;
    }
  }

  // Normalize to [0.14, 0.86] x [0.16, 0.84]
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of pos) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const spanX = Math.max(1e-5, maxX - minX);
  const spanY = Math.max(1e-5, maxY - minY);
  for (const p of pos) {
    p.x = 0.14 + 0.72 * ((p.x - minX) / spanX);
    p.y = 0.16 + 0.68 * ((p.y - minY) / spanY);
  }

  // Final deterministic separation pass so no two nodes overlap
  const minSep = Math.min(0.14, 0.55 / Math.sqrt(n));
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const d = Math.hypot(dx, dy);
        if (d < minSep) {
          const push = (minSep - d) * 0.55;
          const ux = d > 1e-5 ? dx / d : Math.cos(i + j);
          const uy = d > 1e-5 ? dy / d : Math.sin(i + j);
          pos[i].x = Math.min(0.9, Math.max(0.1, pos[i].x + ux * push));
          pos[i].y = Math.min(0.9, Math.max(0.1, pos[i].y + uy * push));
          pos[j].x = Math.min(0.9, Math.max(0.1, pos[j].x - ux * push));
          pos[j].y = Math.min(0.9, Math.max(0.1, pos[j].y - uy * push));
        }
      }
    }
  }

  const positionedNodes: PositionedGraphNode[] = pos.map((p, idx) => ({
    id: p.id,
    label: p.label,
    x: Number(p.x.toFixed(4)),
    y: Number(p.y.toFixed(4)),
    layer: 0,
    order: idx,
  }));
  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));

  const positionedEdges: PositionedGraphEdge[] = edgeList
    .map((e) => {
      const src = nodeById.get(e.from);
      const dst = nodeById.get(e.to);
      if (!src || !dst) return null;
      return {
        from: e.from,
        to: e.to,
        label: e.label,
        weight: e.weight,
        sourceX: src.x,
        sourceY: src.y,
        targetX: dst.x,
        targetY: dst.y,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    layerCount: 1,
    crossings: 0,
  };
}

export interface FigureSeriesData {
  name: string;
  x: number[];
  y: number[];
  error?: number[];
}

export interface FigureDeduceOptions {
  presetId?: JournalFigurePresetId;
  paletteId?: FigurePaletteId;
  language?: CodeLanguage | "auto";
  csvPath?: string;
  csvContent?: string;
  csvColumns?: string[];
  title?: string;
}

export interface FigureInstructionPlan {
  slug: string;
  title: string;
  caption: string;
  label: string;
  prompt: string;
  family: FigureFamily;
  familyLabel: string;
  algorithm: string;
  recommendedLanguage: CodeLanguage;
  language: CodeLanguage;
  presetId: JournalFigurePresetId;
  preset: JournalFigureSpec;
  paletteId: FigurePaletteId;
  palette: FigurePalette;
  xLabel: string;
  yLabel: string;
  xScale: "linear" | "log";
  yScale: "linear" | "log";
  series: FigureSeriesData[];
  categories?: string[];
  matrix?: {
    rowLabels: string[];
    colLabels: string[];
    values: number[][];
  };
  functionExpr?: string;
  graphLayout?: GraphLayoutResult;
  csvPath?: string;
  csvColumns?: string[];
  instructions: string[];
  rationale: string;
}

const FAMILY_META: Record<
  FigureFamily,
  {
    label: string;
    algorithm: string;
    defaultLanguage: CodeLanguage;
    defaultXLabel: string;
    defaultYLabel: string;
  }
> = {
  "line-convergence": {
    label: "Convergence & Parametric Curves",
    algorithm: "Asymptotic Error Decay & Multi-Series Line Synthesis",
    defaultLanguage: "python",
    defaultXLabel: "Discretization DOF $N$",
    defaultYLabel: "Relative $L^2$ Error $\\|u - u_h\\|_2$",
  },
  "bar-comparison": {
    label: "Grouped Benchmark Comparison",
    algorithm: "Grouped Dodged Bar Synthesis with 95% CI Error Whiskers",
    defaultLanguage: "python",
    defaultXLabel: "Method / Condition",
    defaultYLabel: "Measured Performance (±95% CI)",
  },
  "scatter-regression": {
    label: "Scatter & OLS Regression Band",
    algorithm: "Ordinary Least Squares Fit with 95% Confidence Envelope",
    defaultLanguage: "r",
    defaultXLabel: "Predictor $x$",
    defaultYLabel: "Response $y$",
  },
  "distribution-violin": {
    label: "Distribution Violin & Quantiles",
    algorithm: "Kernel Density Violin + Interquartile Box Summary",
    defaultLanguage: "r",
    defaultXLabel: "Experimental Cohort / Sampler",
    defaultYLabel: "Observed Value Distribution",
  },
  "heatmap-matrix": {
    label: "2D Matrix & Operator Heatmap",
    algorithm: "Perceptually Uniform Scalar Field & Cell Annotation Matrix",
    defaultLanguage: "python",
    defaultXLabel: "Predicted / Column Index $j$",
    defaultYLabel: "True / Row Index $i$",
  },
  "function-surface": {
    label: "2D Contour & Potential Surface",
    algorithm: "Bivariate Spectral Meshgrid & Iso-Contour Field Synthesis",
    defaultLanguage: "python",
    defaultXLabel: "Spatial Coordinate $x_1$",
    defaultYLabel: "Spatial Coordinate $x_2$",
  },
  "dag-flowchart": {
    label: "Layered DAG & Causal Flowchart",
    algorithm:
      "3-Phase Sugiyama Layered Graph Layout (Barycenter Minimization)",
    defaultLanguage: "python",
    defaultXLabel: "Topological Stage",
    defaultYLabel: "Parallel Channel",
  },
  "network-graph": {
    label: "Force-Directed Network Graph",
    algorithm: "Seeded Fruchterman–Reingold Force-Directed Equilibrium",
    defaultLanguage: "python",
    defaultXLabel: "Embedding Axis $z_1$",
    defaultYLabel: "Embedding Axis $z_2$",
  },
  "multi-panel": {
    label: "Multi-Panel Composite Figure (a, b)",
    algorithm: "Synchronized 1×2 Journal Subplot Grid with Bold Panel Tags",
    defaultLanguage: "python",
    defaultXLabel: "Control Parameter",
    defaultYLabel: "Response Metric",
  },
};

function slugifyTitle(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return cleaned || "scientific-figure";
}

function parseArrowEdgesFromPrompt(prompt: string): FigureGraphEdgeInput[] {
  const edges: FigureGraphEdgeInput[] = [];
  const normalized = prompt.replace(/→|=>|-->/g, "->");
  const segments = normalized.split(/[;\n]+/);

  for (const segment of segments) {
    if (!segment.includes("->")) continue;
    // Strip leading prefix before colon if present, e.g. "Causal pipeline: A -> B -> C"
    const body = segment.includes(":")
      ? segment.slice(segment.indexOf(":") + 1)
      : segment;
    const parts = body
      .split("->")
      .map((part) =>
        part
          .replace(/^[,\s(]+|[,\s).]+$/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((part) => part.length > 0 && part.length <= 42);

    for (let i = 0; i < parts.length - 1; i++) {
      edges.push({ from: parts[i], to: parts[i + 1] });
    }
  }

  return edges;
}

function parseUndirectedEdgesFromPrompt(
  prompt: string,
): FigureGraphEdgeInput[] {
  const edges: FigureGraphEdgeInput[] = [];
  const normalized = prompt.replace(/<->|↔|—/g, "--");
  const regex = /([A-Za-z0-9_+-]{1,28})\s*--\s*([A-Za-z0-9_+-]{1,28})/g;
  for (const match of normalized.matchAll(regex)) {
    edges.push({ from: match[1].trim(), to: match[2].trim() });
  }
  return edges;
}

function parseCsvColumns(
  csvContent?: string,
  explicitColumns?: string[],
): string[] {
  if (explicitColumns && explicitColumns.length > 0) {
    return explicitColumns;
  }
  if (!csvContent) return [];
  const firstLine = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#"));
  if (!firstLine) return [];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  return firstLine
    .split(delimiter)
    .map((col) => col.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

function deduceFamily(prompt: string, arrowEdgesCount: number): FigureFamily {
  const lower = prompt.toLowerCase();

  if (
    /\b(multi-panel|multipanel|two-panel|subplot|side-by-side|panel\s*\(?a\)?|\(a\)\s*and\s*\(b\))\b/.test(
      lower,
    )
  ) {
    return "multi-panel";
  }

  if (
    /\b(fruchterman|force-directed|network\s+graph|interaction\s+network|social\s+network|citation\s+graph|community\s+graph|undirected\s+graph|topology\s+network)\b/.test(
      lower,
    ) ||
    parseUndirectedEdgesFromPrompt(prompt).length >= 2
  ) {
    return "network-graph";
  }

  if (
    arrowEdgesCount >= 1 ||
    /\b(dag|flowchart|sugiyama|causal\s+graph|architecture\s+diagram|block\s+diagram|pipeline\s+diagram|state\s+machine|markov\s+chain)\b/.test(
      lower,
    )
  ) {
    return "dag-flowchart";
  }

  if (
    /\b(contour|surface|meshgrid|potential\s+field|phase\s+portrait|eigenfunction|level\s+set|scalar\s+potential|helmholtz|laplacian\s+field)\b/.test(
      lower,
    )
  ) {
    return "function-surface";
  }

  if (
    /\b(heatmap|confusion\s+matrix|correlation\s+matrix|covariance\s+matrix|attention\s+map|coupling\s+matrix|jacobian\s+matrix)\b/.test(
      lower,
    )
  ) {
    return "heatmap-matrix";
  }

  if (
    /\b(violin|boxplot|box\s+plot|posterior\s+distribution|density\s+distribution|quantile\s+distribution|iqr|mcmc\s+sampler|cohort\s+distribution)\b/.test(
      lower,
    )
  ) {
    return "distribution-violin";
  }

  if (
    /\b(scatter|regression|linear\s+fit|confidence\s+band|ols|r\^2|correlation\s+plot|calibration\s+plot)\b/.test(
      lower,
    )
  ) {
    return "scatter-regression";
  }

  if (
    /\b(bar\s+chart|bar\s+plot|grouped\s+bar|grouped\s+benchmark|ablation\s+bar|throughput\s+comparison|speedup\s+comparison|error\s+bars)\b/.test(
      lower,
    ) &&
    !/\b(log-log|semilogy|convergence\s+rate|o\(n\^|o\(h\^)\b/.test(lower)
  ) {
    return "bar-comparison";
  }

  return "line-convergence";
}

function deduceRecommendedLanguage(
  prompt: string,
  family: FigureFamily,
): CodeLanguage {
  const lower = prompt.toLowerCase();
  if (
    /\b(in\s+r|using\s+r|rscript|ggplot|ggplot2|tidyverse|biostat)\b/.test(
      lower,
    )
  ) {
    return "r";
  }
  if (/\b(in\s+python|using\s+python|matplotlib|numpy|scipy)\b/.test(lower)) {
    return "python";
  }
  return FAMILY_META[family].defaultLanguage;
}

function deriveTitleFromPrompt(prompt: string, family: FigureFamily): string {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .replace(/[:;].*$/, "")
    .trim();
  if (cleaned.length >= 6 && cleaned.length <= 64) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return FAMILY_META[family].label;
}

/**
 * Stage 1 — Deduce structured scientific figure specification, layout coordinates,
 * and explicit numbered visual synthesis instructions from a research prompt.
 */
export function deduceFigureSpec(
  prompt: string,
  options?: FigureDeduceOptions,
): FigureInstructionPlan {
  const trimmedPrompt =
    prompt.trim() ||
    "Spectral convergence of numerical solvers with asymptotic error decay";
  const presetId: JournalFigurePresetId = options?.presetId ?? "nature-single";
  const preset =
    JOURNAL_FIGURE_SPECS[presetId] ?? JOURNAL_FIGURE_SPECS["nature-single"];
  const paletteId: FigurePaletteId = options?.paletteId ?? "okabe-ito";
  const palette = FIGURE_PALETTES[paletteId] ?? FIGURE_PALETTES["okabe-ito"];

  const arrowEdges = parseArrowEdgesFromPrompt(trimmedPrompt);
  const undirectedEdges = parseUndirectedEdgesFromPrompt(trimmedPrompt);
  const family = deduceFamily(trimmedPrompt, arrowEdges.length);
  const meta = FAMILY_META[family];

  const recommendedLanguage = deduceRecommendedLanguage(trimmedPrompt, family);
  const language: CodeLanguage =
    options?.language && options.language !== "auto"
      ? options.language
      : recommendedLanguage;

  const title =
    options?.title?.trim() || deriveTitleFromPrompt(trimmedPrompt, family);
  const slug = slugifyTitle(title);
  const label = `fig:${slug}`;

  const lower = trimmedPrompt.toLowerCase();
  const isLogLog = /\b(log-log|loglog|o\(n\^|o\(h\^|power-law)\b/.test(lower);
  const isLogY =
    isLogLog ||
    /\b(semilogy|log\s+scale|log-scale|exponential\s+decay|error\s+decay|convergence)\b/.test(
      lower,
    );

  const xScale: "linear" | "log" =
    family === "line-convergence" && isLogLog ? "log" : "linear";
  const yScale: "linear" | "log" =
    family === "line-convergence" && isLogY ? "log" : "linear";

  const csvColumns = parseCsvColumns(options?.csvContent, options?.csvColumns);
  const csvPath = options?.csvPath?.trim() || undefined;

  const xLabel = csvColumns.length >= 2 ? csvColumns[0] : meta.defaultXLabel;
  const yLabel = csvColumns.length >= 2 ? csvColumns[1] : meta.defaultYLabel;

  let graphLayout: GraphLayoutResult | undefined;
  if (family === "dag-flowchart") {
    const edgesToLayout: FigureGraphEdgeInput[] =
      arrowEdges.length > 0
        ? arrowEdges
        : [
            { from: "Input Tensor", to: "Spectral Encoder", label: "FFT" },
            { from: "Spectral Encoder", to: "Koopman Latent", label: "K" },
            { from: "Spectral Encoder", to: "Residual Gate", label: "skip" },
            { from: "Koopman Latent", to: "Lyapunov Filter", label: "V(z)" },
            { from: "Residual Gate", to: "Lyapunov Filter" },
            { from: "Lyapunov Filter", to: "Verified Policy", label: "u*" },
          ];
    const uniqueNodes = Array.from(
      new Set(edgesToLayout.flatMap((e) => [e.from, e.to])),
    );
    graphLayout = layoutSugiyamaDag(uniqueNodes, edgesToLayout);
  } else if (family === "network-graph") {
    const edgesToLayout: FigureGraphEdgeInput[] =
      undirectedEdges.length > 0
        ? undirectedEdges
        : arrowEdges.length > 0
          ? arrowEdges
          : [
              { from: "Hub-A", to: "Node-1" },
              { from: "Hub-A", to: "Node-2" },
              { from: "Hub-A", to: "Node-3" },
              { from: "Node-1", to: "Node-2" },
              { from: "Hub-B", to: "Node-4" },
              { from: "Hub-B", to: "Node-5" },
              { from: "Node-4", to: "Node-5" },
              { from: "Hub-A", to: "Hub-B", label: "bridge" },
              { from: "Node-3", to: "Node-6" },
              { from: "Hub-B", to: "Node-6" },
            ];
    const uniqueNodes = Array.from(
      new Set(edgesToLayout.flatMap((e) => [e.from, e.to])),
    );
    graphLayout = layoutFruchtermanReingold(uniqueNodes, edgesToLayout, 140);
  }

  const series: FigureSeriesData[] =
    family === "line-convergence"
      ? [
          {
            name: "Spectral Chebyshev",
            x: [8, 16, 32, 64, 128, 256],
            y: [1.8e-1, 1.1e-2, 6.4e-4, 3.9e-5, 2.4e-6, 1.5e-7],
          },
          {
            name: "Preconditioned CG (Order 2)",
            x: [8, 16, 32, 64, 128, 256],
            y: [3.4e-1, 8.6e-2, 2.15e-2, 5.4e-3, 1.35e-3, 3.38e-4],
          },
          {
            name: "Finite Difference Baseline",
            x: [8, 16, 32, 64, 128, 256],
            y: [4.9e-1, 2.45e-1, 1.22e-1, 6.1e-2, 3.05e-2, 1.52e-2],
          },
        ]
      : family === "bar-comparison"
        ? [
            {
              name: "Dense Direct",
              x: [0, 1, 2, 3],
              y: [42.0, 58.4, 71.2, 64.5],
              error: [2.4, 2.9, 3.1, 2.8],
            },
            {
              name: "Sparse Krylov",
              x: [0, 1, 2, 3],
              y: [68.5, 84.1, 91.6, 88.0],
              error: [2.1, 2.5, 2.2, 2.4],
            },
            {
              name: "Proposed Multigrid",
              x: [0, 1, 2, 3],
              y: [92.4, 96.8, 98.9, 97.5],
              error: [1.4, 1.2, 0.9, 1.1],
            },
          ]
        : [
            {
              name: "Empirical Observations",
              x: [1.0, 1.8, 2.5, 3.2, 4.0, 4.8, 5.5, 6.3, 7.1, 8.0],
              y: [2.1, 3.5, 4.2, 5.8, 6.9, 8.1, 9.4, 10.2, 11.8, 13.1],
            },
          ];

  const categories =
    family === "bar-comparison"
      ? [" Poisson 2D", "Helmholtz", "Navier-Stokes", "Maxwell 3D"].map((s) =>
          s.trim(),
        )
      : family === "distribution-violin"
        ? ["HMC-NUTS", "Langevin", "SVGD", "Variational"]
        : undefined;

  const matrix =
    family === "heatmap-matrix"
      ? {
          rowLabels: ["Mode 1", "Mode 2", "Mode 3", "Mode 4", "Mode 5"],
          colLabels: ["Mode 1", "Mode 2", "Mode 3", "Mode 4", "Mode 5"],
          values: [
            [1.0, 0.24, -0.12, 0.05, 0.01],
            [0.24, 0.96, 0.31, -0.08, 0.04],
            [-0.12, 0.31, 0.92, 0.27, -0.09],
            [0.05, -0.08, 0.27, 0.95, 0.22],
            [0.01, 0.04, -0.09, 0.22, 0.98],
          ],
        }
      : undefined;

  const instructions: string[] = [
    `1. Configure ${preset.label} canvas (${preset.widthInches.toFixed(2)} in × ${preset.heightInches.toFixed(2)} in / ${preset.widthMm} mm, ${preset.dpi} DPI, ${preset.baseFontPt} pt ${preset.fontName}, TrueType pdf.fonttype = ${preset.pdfFontType}).`,
    `2. Execute ${meta.algorithm} (${family}) in ${language === "python" ? "Python (matplotlib + numpy)" : "R (ggplot2 with base-R fallback)"}.`,
    csvPath
      ? `3. Load project dataset "${csvPath}"${csvColumns.length > 0 ? ` (columns: ${csvColumns.slice(0, 6).join(", ")})` : ""} with automatic numeric validation and fallback series.`
      : graphLayout
        ? `3. Embed deterministic pre-computed coordinates for ${graphLayout.nodes.length} nodes and ${graphLayout.edges.length} edges (${graphLayout.layerCount} layer(s), ${graphLayout.crossings} crossings) normalized to [0, 1] × [0, 1].`
        : `3. Synthesize calibrated benchmark series with reproducible numerical values and uncertainty bounds.`,
    `4. Format axes ("${xLabel}" [${xScale}], "${yLabel}" [${yScale}]) with despined top/right borders, ${preset.axisLineWidthPt} pt spine weight, and subtle major gridlines.`,
    `5. Encode series with ${palette.label} (${palette.colors.slice(0, 4).join(", ")}) paired with redundant marker shapes (${palette.markers.slice(0, 4).join(", ")}) and dash patterns.`,
    `6. Annotate key scientific landmarks (asymptotic slope guide / 95% confidence interval / directed arrowheads) without label occlusion.`,
    `7. Export publication vector PDF (figures/${slug}.pdf)${language === "python" ? `, vector SVG (figures/${slug}.svg),` : ""} and 300 DPI raster preview (figures/${slug}.png).`,
  ];

  const caption = `${title}. Synthesized for ${preset.publisher} (${preset.widthMm} mm ${preset.columns === 2 ? "double-column" : "single-column"} layout) using ${meta.algorithm} and the ${palette.label} palette.`;

  return {
    slug,
    title,
    caption,
    label,
    prompt: trimmedPrompt,
    family,
    familyLabel: meta.label,
    algorithm: meta.algorithm,
    recommendedLanguage,
    language,
    presetId,
    preset,
    paletteId,
    palette,
    xLabel,
    yLabel,
    xScale,
    yScale,
    series,
    categories,
    matrix,
    functionExpr:
      family === "function-surface"
        ? "exp(-0.35*(X**2 + Y**2)) * (cos(2.2*X) + 0.6*sin(2.2*Y))"
        : undefined,
    graphLayout,
    csvPath,
    csvColumns: csvColumns.length > 0 ? csvColumns : undefined,
    instructions,
    rationale: `Selected ${meta.label} (${language.toUpperCase()}) with ${meta.algorithm} to match ${preset.label} typography and ${palette.label} accessibility standards.`,
  };
}

function buildPythonScript(plan: FigureInstructionPlan): string {
  const { preset, palette, slug } = plan;
  const colorsJson = JSON.stringify(palette.colors);
  const markersJson = JSON.stringify(palette.markers);
  const stylesJson = JSON.stringify(palette.lineStyles);

  const header = [
    "# Auto-generated by arcanaTeX Scientific Figure Studio",
    `# Family: ${plan.family} | Algorithm: ${plan.algorithm}`,
    `# Preset: ${preset.label} (${preset.widthInches} in x ${preset.heightInches} in @ ${preset.dpi} DPI)`,
    "import os",
    "import csv",
    "import json",
    "import math",
    "import numpy as np",
    "import matplotlib.pyplot as plt",
    "from matplotlib.patches import FancyBboxPatch, FancyArrowPatch",
    "",
    'os.makedirs("figures", exist_ok=True)',
    "",
    `COLORS = ${colorsJson}`,
    `MARKERS = ${markersJson}`,
    `LINESTYLES = ${stylesJson}`,
    "",
    "plt.rcParams.update({",
    `    "font.family": "${preset.fontFamily}",`,
    `    "font.size": ${preset.baseFontPt},`,
    `    "axes.titlesize": ${preset.titleFontPt},`,
    `    "axes.labelsize": ${preset.axisLabelPt},`,
    `    "xtick.labelsize": ${preset.tickLabelPt},`,
    `    "ytick.labelsize": ${preset.tickLabelPt},`,
    `    "legend.fontsize": ${preset.legendFontPt},`,
    `    "lines.linewidth": ${preset.lineWidthPt},`,
    `    "axes.linewidth": ${preset.axisLineWidthPt},`,
    `    "pdf.fonttype": ${preset.pdfFontType},`,
    `    "ps.fonttype": ${preset.pdfFontType},`,
    `    "savefig.dpi": ${preset.dpi},`,
    '    "savefig.bbox": "tight",',
    '    "savefig.pad_inches": 0.04,',
    "})",
    "",
    "def style_scientific_axes(ax, grid=True):",
    '    ax.spines["top"].set_visible(False)',
    '    ax.spines["right"].set_visible(False)',
    "    if grid:",
    '        ax.grid(True, which="major", linestyle=":", linewidth=0.5, alpha=0.45)',
    "",
  ];

  const csvHelper = plan.csvPath
    ? [
        `CSV_PATH = ${JSON.stringify(plan.csvPath)}`,
        "def load_numeric_csv(path):",
        "    if not os.path.exists(path):",
        "        return None, []",
        '    with open(path, "r", encoding="utf-8") as fh:',
        "        sample = fh.read(2048)",
        "        fh.seek(0)",
        '        delim = "\\t" if "\\t" in sample else ","',
        "        reader = list(csv.reader(fh, delimiter=delim))",
        "    if len(reader) < 2:",
        "        return None, []",
        "    headers = [h.strip() for h in reader[0]]",
        "    cols = [[] for _ in headers]",
        "    for row in reader[1:]:",
        "        if len(row) < len(headers):",
        "            continue",
        "        try:",
        "            vals = [float(row[i]) for i in range(len(headers))]",
        "            for i, v in enumerate(vals):",
        "                cols[i].append(v)",
        "        except ValueError:",
        "            continue",
        "    if not cols or len(cols[0]) < 2:",
        "        return None, headers",
        "    return [np.array(c, dtype=float) for c in cols], headers",
        "",
      ]
    : [];

  let body: string[] = [];

  if (plan.family === "dag-flowchart" || plan.family === "network-graph") {
    const layout =
      plan.graphLayout ??
      layoutSugiyamaDag(
        ["Input", "Transform", "Operator", "Output"],
        [
          ["Input", "Transform"],
          ["Transform", "Operator"],
          ["Operator", "Output"],
        ],
      );
    body = [
      `NODES = json.loads(${JSON.stringify(JSON.stringify(layout.nodes))})`,
      `EDGES = json.loads(${JSON.stringify(JSON.stringify(layout.edges))})`,
      "",
      `fig, ax = plt.subplots(figsize=(${preset.widthInches}, ${preset.heightInches}))`,
      "ax.set_xlim(-0.04, 1.04)",
      "ax.set_ylim(-0.06, 1.06)",
      "ax.axis('off')",
      `ax.set_title(${JSON.stringify(plan.title)}, fontweight="bold", pad=8)`,
      "",
      "for idx, edge in enumerate(EDGES):",
      '    sx, sy = edge["sourceX"], edge["sourceY"]',
      '    tx, ty = edge["targetX"], edge["targetY"]',
      '    is_back = edge.get("backEdge", False)',
      "    rad = -0.22 if is_back else (0.12 if abs(sy - ty) < 1e-3 and abs(sx - tx) > 0.38 else 0.0)",
      "    arrow = FancyArrowPatch(",
      "        (sx, sy),",
      "        (tx, ty),",
      `        arrowstyle="${plan.family === "dag-flowchart" ? "-|>,head_length=5,head_width=3" : "-"}",`,
      '        connectionstyle=f"arc3,rad={rad}",',
      "        linewidth=1.15,",
      '        linestyle="--" if is_back else "-",',
      '        color=COLORS[1] if is_back else "#4A4A48",',
      "        shrinkA=18,",
      "        shrinkB=18,",
      "        zorder=2,",
      "    )",
      "    ax.add_patch(arrow)",
      '    if edge.get("label"):',
      "        mx, my = 0.5 * (sx + tx), 0.5 * (sy + ty) + (0.05 if rad >= 0 else -0.05)",
      '        ax.text(mx, my, str(edge["label"]), fontsize=6.5, ha="center", va="center", color="#2B2B29", bbox=dict(boxstyle="round,pad=0.15", facecolor="white", edgecolor="none", alpha=0.85), zorder=4)',
      "",
      "for i, node in enumerate(NODES):",
      '    nx, ny = node["x"], node["y"]',
      '    color = COLORS[node.get("layer", i) % len(COLORS)]',
      `    if ${plan.family === "dag-flowchart" ? "True" : "False"}:`,
      "        w, h = 0.17, 0.12",
      "        patch = FancyBboxPatch(",
      "            (nx - w / 2, ny - h / 2), w, h,",
      '            boxstyle="round,pad=0.02,rounding_size=0.025",',
      '            facecolor="white", edgecolor=color, linewidth=1.4, zorder=3',
      "        )",
      "        ax.add_patch(patch)",
      "    else:",
      '        ax.scatter([nx], [ny], s=290, facecolor="white", edgecolor=color, linewidth=1.6, zorder=3)',
      '    ax.text(nx, ny, str(node["label"]), ha="center", va="center", fontsize=7.0, fontweight="medium", color="#141413", zorder=5)',
    ];
  } else if (plan.family === "bar-comparison") {
    body = [
      `CATEGORIES = ${JSON.stringify(plan.categories ?? ["Bench A", "Bench B", "Bench C", "Bench D"])}`,
      `SERIES = ${JSON.stringify(plan.series)}`,
      `fig, ax = plt.subplots(figsize=(${preset.widthInches}, ${preset.heightInches}))`,
      "x = np.arange(len(CATEGORIES))",
      "n_series = max(1, len(SERIES))",
      "width = min(0.26, 0.75 / n_series)",
      "for idx, s in enumerate(SERIES):",
      "    offset = (idx - (n_series - 1) / 2.0) * width",
      '    vals = np.array(s["y"][:len(CATEGORIES)], dtype=float)',
      '    errs = np.array(s.get("error", [1.5] * len(vals))[:len(CATEGORIES)], dtype=float)',
      "    ax.bar(",
      "        x + offset, vals, width=width * 0.92, yerr=errs, capsize=2.2,",
      '        label=s["name"], color=COLORS[idx % len(COLORS)], edgecolor="#141413", linewidth=0.5, alpha=0.88,',
      '        error_kw=dict(lw=0.8, capthick=0.8, ecolor="#141413")',
      "    )",
      "ax.set_xticks(x)",
      "ax.set_xticklabels(CATEGORIES)",
      `ax.set_xlabel(${JSON.stringify(plan.xLabel)})`,
      `ax.set_ylabel(${JSON.stringify(plan.yLabel)})`,
      `ax.set_title(${JSON.stringify(plan.title)}, fontweight="bold")`,
      "style_scientific_axes(ax, grid=True)",
      'ax.legend(frameon=False, loc="best")',
    ];
  } else if (plan.family === "scatter-regression") {
    body = [
      "rng = np.random.default_rng(42)",
      "x = np.linspace(0.5, 10.0, 36)",
      "y = 1.65 * x + 1.1 + rng.normal(0.0, 0.95, size=x.size)",
      ...(plan.csvPath
        ? [
            "loaded, headers = load_numeric_csv(CSV_PATH)",
            "if loaded and len(loaded) >= 2:",
            "    x, y = loaded[0], loaded[1]",
          ]
        : []),
      `fig, ax = plt.subplots(figsize=(${preset.widthInches}, ${preset.heightInches}))`,
      "order = np.argsort(x)",
      "x, y = x[order], y[order]",
      "slope, intercept = np.polyfit(x, y, 1)",
      "x_grid = np.linspace(float(np.min(x)), float(np.max(x)), 100)",
      "y_hat = slope * x_grid + intercept",
      "resid = y - (slope * x + intercept)",
      "s_err = np.sqrt(np.sum(resid ** 2) / max(1, len(x) - 2))",
      "ci = 1.96 * s_err * np.sqrt(1.0 / len(x) + (x_grid - np.mean(x)) ** 2 / max(1e-9, np.sum((x - np.mean(x)) ** 2)))",
      'ax.scatter(x, y, color=COLORS[0], marker=MARKERS[0], s=22, alpha=0.85, label="Observed Data")',
      'ax.plot(x_grid, y_hat, color=COLORS[1], linestyle="-", label=f"OLS Fit ($y={slope:.2f}x+{intercept:.2f}$)")',
      'ax.fill_between(x_grid, y_hat - ci, y_hat + ci, color=COLORS[1], alpha=0.18, label="95% Confidence Band")',
      `ax.set_xlabel(${JSON.stringify(plan.xLabel)})`,
      `ax.set_ylabel(${JSON.stringify(plan.yLabel)})`,
      `ax.set_title(${JSON.stringify(plan.title)}, fontweight="bold")`,
      "style_scientific_axes(ax, grid=True)",
      'ax.legend(frameon=False, loc="best")',
    ];
  } else if (plan.family === "distribution-violin") {
    body = [
      "rng = np.random.default_rng(17)",
      `LABELS = ${JSON.stringify(plan.categories ?? ["HMC-NUTS", "Langevin", "SVGD", "Variational"])}`,
      "data = [",
      "    rng.normal(loc=0.82, scale=0.11, size=80),",
      "    rng.normal(loc=0.74, scale=0.15, size=80),",
      "    rng.normal(loc=0.69, scale=0.13, size=80),",
      "    rng.normal(loc=0.61, scale=0.18, size=80),",
      "]",
      `fig, ax = plt.subplots(figsize=(${preset.widthInches}, ${preset.heightInches}))`,
      "parts = ax.violinplot(data, showmeans=False, showmedians=False, showextrema=False, widths=0.7)",
      'for idx, body in enumerate(parts["bodies"]):',
      "    body.set_facecolor(COLORS[idx % len(COLORS)])",
      '    body.set_edgecolor("#141413")',
      "    body.set_alpha(0.65)",
      "ax.boxplot(data, widths=0.18, showfliers=False, medianprops=dict(color='#141413', linewidth=1.4))",
      "ax.set_xticks(np.arange(1, len(LABELS) + 1))",
      "ax.set_xticklabels(LABELS)",
      `ax.set_xlabel(${JSON.stringify(plan.xLabel)})`,
      `ax.set_ylabel(${JSON.stringify(plan.yLabel)})`,
      `ax.set_title(${JSON.stringify(plan.title)}, fontweight="bold")`,
      "style_scientific_axes(ax, grid=True)",
    ];
  } else if (plan.family === "heatmap-matrix") {
    const matrix = plan.matrix ?? {
      rowLabels: ["M1", "M2", "M3", "M4"],
      colLabels: ["M1", "M2", "M3", "M4"],
      values: [
        [1.0, 0.25, -0.1, 0.04],
        [0.25, 0.95, 0.3, -0.05],
        [-0.1, 0.3, 0.92, 0.28],
        [0.04, -0.05, 0.28, 0.97],
      ],
    };
    body = [
      `ROWS = ${JSON.stringify(matrix.rowLabels)}`,
      `COLS = ${JSON.stringify(matrix.colLabels)}`,
      `MAT = np.array(${JSON.stringify(matrix.values)}, dtype=float)`,
      `fig, ax = plt.subplots(figsize=(${preset.widthInches}, ${preset.heightInches}))`,
      'im = ax.imshow(MAT, cmap="cividis" if "grayscale" not in ' +
        JSON.stringify(plan.paletteId) +
        ' else "Greys", aspect="auto")',
      "ax.set_xticks(np.arange(len(COLS)))",
      "ax.set_yticks(np.arange(len(ROWS)))",
      "ax.set_xticklabels(COLS)",
      "ax.set_yticklabels(ROWS)",
      "for i in range(MAT.shape[0]):",
      "    for j in range(MAT.shape[1]):",
      "        val = MAT[i, j]",
      '        txt_color = "white" if abs(val) > 0.55 else "#141413"',
      '        ax.text(j, i, f"{val:.2f}", ha="center", va="center", fontsize=6.5, color=txt_color)',
      "cbar = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04)",
      "cbar.ax.tick_params(labelsize=6.5)",
      `ax.set_xlabel(${JSON.stringify(plan.xLabel)})`,
      `ax.set_ylabel(${JSON.stringify(plan.yLabel)})`,
      `ax.set_title(${JSON.stringify(plan.title)}, fontweight="bold")`,
    ];
  } else if (plan.family === "function-surface") {
    body = [
      "grid_x = np.linspace(-2.4, 2.4, 120)",
      "grid_y = np.linspace(-2.4, 2.4, 120)",
      "X, Y = np.meshgrid(grid_x, grid_y)",
      "Z = np.exp(-0.35 * (X ** 2 + Y ** 2)) * (np.cos(2.2 * X) + 0.6 * np.sin(2.2 * Y))",
      `fig, ax = plt.subplots(figsize=(${preset.widthInches}, ${preset.heightInches}))`,
      'cf = ax.contourf(X, Y, Z, levels=16, cmap="viridis" if "grayscale" not in ' +
        JSON.stringify(plan.paletteId) +
        ' else "Greys")',
      'cs = ax.contour(X, Y, Z, levels=8, colors="#141413", linewidths=0.45, alpha=0.6)',
      "ax.clabel(cs, inline=True, fontsize=6, fmt='%.2f')",
      "fig.colorbar(cf, ax=ax, fraction=0.046, pad=0.04, label='Field Potential $\\\\Phi(x_1, x_2)$')",
      `ax.set_xlabel(${JSON.stringify(plan.xLabel)})`,
      `ax.set_ylabel(${JSON.stringify(plan.yLabel)})`,
      `ax.set_title(${JSON.stringify(plan.title)}, fontweight="bold")`,
    ];
  } else if (plan.family === "multi-panel") {
    body = [
      `fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(${Math.max(preset.widthInches, 5.2)}, ${preset.heightInches}))`,
      "n_dof = np.array([8, 16, 32, 64, 128, 256], dtype=float)",
      "err_spec = 1.6 * (n_dof ** -3.5)",
      "err_fd = 2.4 * (n_dof ** -1.8)",
      'ax1.loglog(n_dof, err_spec, color=COLORS[0], marker=MARKERS[0], linestyle=LINESTYLES[0], label="Spectral")',
      'ax1.loglog(n_dof, err_fd, color=COLORS[1], marker=MARKERS[1], linestyle=LINESTYLES[1], label="Finite Diff.")',
      'ax1.set_xlabel("Resolution $N$")',
      'ax1.set_ylabel("Relative $L^2$ Error")',
      'ax1.text(-0.18, 1.05, "(a)", transform=ax1.transAxes, fontweight="bold", fontsize=9)',
      "style_scientific_axes(ax1, grid=True)",
      'ax1.legend(frameon=False, loc="best")',
      "",
      "methods = ['Baseline', 'Krylov', 'Proposed']",
      "speedup = [1.0, 2.8, 5.4]",
      "ci = [0.08, 0.18, 0.24]",
      "ax2.bar(methods, speedup, yerr=ci, capsize=2.5, color=COLORS[:3], edgecolor='#141413', linewidth=0.5, alpha=0.88)",
      'ax2.set_ylabel("Wall-Clock Speedup (×)")',
      'ax2.text(-0.18, 1.05, "(b)", transform=ax2.transAxes, fontweight="bold", fontsize=9)',
      "style_scientific_axes(ax2, grid=True)",
      "fig.tight_layout()",
    ];
  } else {
    // line-convergence
    body = [
      `SERIES = ${JSON.stringify(plan.series)}`,
      `fig, ax = plt.subplots(figsize=(${preset.widthInches}, ${preset.heightInches}))`,
      ...(plan.csvPath
        ? [
            "loaded, headers = load_numeric_csv(CSV_PATH)",
            "if loaded and len(loaded) >= 2:",
            "    SERIES = []",
            "    for col_idx in range(1, min(len(loaded), 6)):",
            '        label = headers[col_idx] if col_idx < len(headers) else f"Series {col_idx}"',
            '        SERIES.append({"name": label, "x": loaded[0].tolist(), "y": loaded[col_idx].tolist()})',
          ]
        : []),
      "for idx, s in enumerate(SERIES):",
      '    xs = np.array(s["x"], dtype=float)',
      '    ys = np.array(s["y"], dtype=float)',
      `    if ${plan.xScale === "log" ? "True" : "False"}:`,
      "        xs = np.where(xs > 0, xs, np.arange(1, len(xs) + 1, dtype=float))",
      `    if ${plan.yScale === "log" ? "True" : "False"}:`,
      "        ys = np.where(ys > 0, ys, np.abs(ys) + 1e-9)",
      "    ax.plot(",
      "        xs, ys,",
      "        color=COLORS[idx % len(COLORS)],",
      "        marker=MARKERS[idx % len(MARKERS)],",
      "        linestyle=LINESTYLES[idx % len(LINESTYLES)],",
      "        markersize=3.8,",
      '        label=s["name"],',
      "    )",
      `ax.set_xscale(${JSON.stringify(plan.xScale)})`,
      `ax.set_yscale(${JSON.stringify(plan.yScale)})`,
      `ax.set_xlabel(${JSON.stringify(plan.xLabel)})`,
      `ax.set_ylabel(${JSON.stringify(plan.yLabel)})`,
      `ax.set_title(${JSON.stringify(plan.title)}, fontweight="bold")`,
      "style_scientific_axes(ax, grid=True)",
      'ax.legend(frameon=False, loc="best")',
    ];
  }

  const footer = [
    "",
    `fig.savefig("figures/${slug}.pdf")`,
    `fig.savefig("figures/${slug}.png", dpi=${preset.dpi})`,
    `fig.savefig("figures/${slug}.svg")`,
    "plt.close(fig)",
    `print("Rendered figures/${slug}.pdf, figures/${slug}.png, figures/${slug}.svg")`,
  ];

  return [...header, ...csvHelper, ...body, ...footer].join("\n");
}

function buildRScript(plan: FigureInstructionPlan): string {
  const { preset, palette, slug } = plan;
  const rColors = `c(${palette.colors.map((c) => `"${c}"`).join(", ")})`;

  const header = [
    "# Auto-generated by arcanaTeX Scientific Figure Studio (R Engine)",
    `# Family: ${plan.family} | Algorithm: ${plan.algorithm}`,
    `# Preset: ${preset.label} (${preset.widthInches} in x ${preset.heightInches} in @ ${preset.dpi} DPI)`,
    'dir.create("figures", showWarnings = FALSE, recursive = TRUE)',
    `palette_colors <- ${rColors}`,
    `fig_w <- ${preset.widthInches}`,
    `fig_h <- ${preset.heightInches}`,
    `fig_dpi <- ${preset.dpi}`,
    'has_ggplot2 <- requireNamespace("ggplot2", quietly = TRUE)',
    "",
  ];

  let body: string[] = [];

  if (plan.family === "dag-flowchart" || plan.family === "network-graph") {
    const layout =
      plan.graphLayout ??
      layoutSugiyamaDag(
        ["Input", "Transform", "Operator", "Output"],
        [
          ["Input", "Transform"],
          ["Transform", "Operator"],
          ["Operator", "Output"],
        ],
      );
    const xs = layout.nodes.map((n) => n.x).join(", ");
    const ys = layout.nodes.map((n) => n.y).join(", ");
    const labels = layout.nodes.map((n) => JSON.stringify(n.label)).join(", ");
    const sx = layout.edges.map((e) => e.sourceX).join(", ");
    const sy = layout.edges.map((e) => e.sourceY).join(", ");
    const tx = layout.edges.map((e) => e.targetX).join(", ");
    const ty = layout.edges.map((e) => e.targetY).join(", ");

    body = [
      `nodes_df <- data.frame(x = c(${xs}), y = c(${ys}), label = c(${labels}), stringsAsFactors = FALSE)`,
      `edges_df <- data.frame(sx = c(${sx}), sy = c(${sy}), tx = c(${tx}), ty = c(${ty}))`,
      "draw_base_graph <- function() {",
      "  par(mar = c(1.2, 1.2, 2.2, 1.2))",
      `  plot(nodes_df$x, nodes_df$y, xlim = c(-0.05, 1.05), ylim = c(-0.08, 1.08), type = "n", axes = FALSE, xlab = "", ylab = "", main = ${JSON.stringify(plan.title)})`,
      "  if (nrow(edges_df) > 0) {",
      "    arrows(edges_df$sx, edges_df$sy, edges_df$tx, edges_df$ty, length = 0.07, col = '#4A4A48', lwd = 1.4)",
      "  }",
      "  points(nodes_df$x, nodes_df$y, pch = 21, bg = 'white', col = palette_colors[1], cex = 3.2, lwd = 1.6)",
      "  text(nodes_df$x, nodes_df$y, labels = nodes_df$label, cex = 0.72)",
      "}",
      `pdf("figures/${slug}.pdf", width = fig_w, height = fig_h)`,
      "draw_base_graph()",
      "dev.off()",
      `png("figures/${slug}.png", width = round(fig_w * fig_dpi), height = round(fig_h * fig_dpi), res = fig_dpi)`,
      "draw_base_graph()",
      "dev.off()",
    ];
  } else if (plan.family === "distribution-violin") {
    body = [
      "set.seed(42)",
      'groups <- rep(c("HMC-NUTS", "Langevin", "SVGD", "Variational"), each = 60)',
      "values <- c(rnorm(60, 0.84, 0.09), rnorm(60, 0.75, 0.13), rnorm(60, 0.69, 0.11), rnorm(60, 0.60, 0.15))",
      "df <- data.frame(group = factor(groups, levels = unique(groups)), value = values)",
      "if (has_ggplot2) {",
      "  library(ggplot2)",
      "  p <- ggplot(df, aes(x = group, y = value, fill = group)) +",
      "    geom_violin(trim = FALSE, alpha = 0.7, color = '#141413', linewidth = 0.4) +",
      "    geom_boxplot(width = 0.16, fill = 'white', outlier.shape = NA, linewidth = 0.45) +",
      "    scale_fill_manual(values = palette_colors) +",
      `    labs(title = ${JSON.stringify(plan.title)}, x = ${JSON.stringify(plan.xLabel)}, y = ${JSON.stringify(plan.yLabel)}) +`,
      `    theme_classic(base_size = ${preset.baseFontPt}) +`,
      "    theme(legend.position = 'none', plot.title = element_text(face = 'bold'))",
      `  ggsave("figures/${slug}.pdf", plot = p, width = fig_w, height = fig_h)`,
      `  ggsave("figures/${slug}.png", plot = p, width = fig_w, height = fig_h, dpi = fig_dpi)`,
      "} else {",
      `  pdf("figures/${slug}.pdf", width = fig_w, height = fig_h)`,
      `  boxplot(value ~ group, data = df, col = palette_colors[1:4], main = ${JSON.stringify(plan.title)}, xlab = ${JSON.stringify(plan.xLabel)}, ylab = ${JSON.stringify(plan.yLabel)})`,
      "  dev.off()",
      `  png("figures/${slug}.png", width = round(fig_w * fig_dpi), height = round(fig_h * fig_dpi), res = fig_dpi)`,
      `  boxplot(value ~ group, data = df, col = palette_colors[1:4], main = ${JSON.stringify(plan.title)}, xlab = ${JSON.stringify(plan.xLabel)}, ylab = ${JSON.stringify(plan.yLabel)})`,
      "  dev.off()",
      "}",
    ];
  } else if (plan.family === "scatter-regression") {
    body = [
      "set.seed(42)",
      "x <- seq(0.5, 10, length.out = 36)",
      "y <- 1.65 * x + 1.1 + rnorm(length(x), 0, 0.9)",
      "df <- data.frame(x = x, y = y)",
      ...(plan.csvPath
        ? [
            `if (file.exists(${JSON.stringify(plan.csvPath)})) {`,
            `  raw <- tryCatch(read.csv(${JSON.stringify(plan.csvPath)}), error = function(e) NULL)`,
            "  if (!is.null(raw) && ncol(raw) >= 2 && is.numeric(raw[[1]]) && is.numeric(raw[[2]])) {",
            "    df <- data.frame(x = raw[[1]], y = raw[[2]])",
            "  }",
            "}",
          ]
        : []),
      "if (has_ggplot2) {",
      "  library(ggplot2)",
      "  p <- ggplot(df, aes(x = x, y = y)) +",
      "    geom_point(color = palette_colors[1], size = 1.6, alpha = 0.85) +",
      "    geom_smooth(method = 'lm', formula = y ~ x, se = TRUE, color = palette_colors[2], fill = palette_colors[2], alpha = 0.2, linewidth = 0.8) +",
      `    labs(title = ${JSON.stringify(plan.title)}, x = ${JSON.stringify(plan.xLabel)}, y = ${JSON.stringify(plan.yLabel)}) +`,
      `    theme_classic(base_size = ${preset.baseFontPt}) +`,
      "    theme(plot.title = element_text(face = 'bold'))",
      `  ggsave("figures/${slug}.pdf", plot = p, width = fig_w, height = fig_h)`,
      `  ggsave("figures/${slug}.png", plot = p, width = fig_w, height = fig_h, dpi = fig_dpi)`,
      "} else {",
      "  fit <- lm(y ~ x, data = df)",
      `  pdf("figures/${slug}.pdf", width = fig_w, height = fig_h)`,
      `  plot(df$x, df$y, pch = 19, col = palette_colors[1], main = ${JSON.stringify(plan.title)}, xlab = ${JSON.stringify(plan.xLabel)}, ylab = ${JSON.stringify(plan.yLabel)})`,
      "  abline(fit, col = palette_colors[2], lwd = 2)",
      "  dev.off()",
      `  png("figures/${slug}.png", width = round(fig_w * fig_dpi), height = round(fig_h * fig_dpi), res = fig_dpi)`,
      `  plot(df$x, df$y, pch = 19, col = palette_colors[1], main = ${JSON.stringify(plan.title)}, xlab = ${JSON.stringify(plan.xLabel)}, ylab = ${JSON.stringify(plan.yLabel)})`,
      "  abline(fit, col = palette_colors[2], lwd = 2)",
      "  dev.off()",
      "}",
    ];
  } else if (plan.family === "bar-comparison") {
    body = [
      'df <- data.frame(category = rep(c("Poisson", "Helmholtz", "Navier-Stokes", "Maxwell"), times = 2), method = rep(c("Krylov", "Proposed"), each = 4), score = c(68.5, 84.1, 91.6, 88.0, 92.4, 96.8, 98.9, 97.5), ci = c(2.1, 2.5, 2.2, 2.4, 1.4, 1.2, 0.9, 1.1))',
      "if (has_ggplot2) {",
      "  library(ggplot2)",
      "  pos <- position_dodge(width = 0.75)",
      "  p <- ggplot(df, aes(x = category, y = score, fill = method)) +",
      "    geom_col(position = pos, width = 0.68, color = '#141413', linewidth = 0.3) +",
      "    geom_errorbar(aes(ymin = score - ci, ymax = score + ci), position = pos, width = 0.22, linewidth = 0.4) +",
      "    scale_fill_manual(values = palette_colors) +",
      `    labs(title = ${JSON.stringify(plan.title)}, x = ${JSON.stringify(plan.xLabel)}, y = ${JSON.stringify(plan.yLabel)}) +`,
      `    theme_classic(base_size = ${preset.baseFontPt}) +`,
      "    theme(legend.position = 'top', plot.title = element_text(face = 'bold'))",
      `  ggsave("figures/${slug}.pdf", plot = p, width = fig_w, height = fig_h)`,
      `  ggsave("figures/${slug}.png", plot = p, width = fig_w, height = fig_h, dpi = fig_dpi)`,
      "} else {",
      `  pdf("figures/${slug}.pdf", width = fig_w, height = fig_h)`,
      `  barplot(matrix(df$score, nrow = 2, byrow = TRUE), beside = TRUE, col = palette_colors[1:2], names.arg = c("Poisson", "Helmholtz", "Navier", "Maxwell"), main = ${JSON.stringify(plan.title)})`,
      "  dev.off()",
      `  png("figures/${slug}.png", width = round(fig_w * fig_dpi), height = round(fig_h * fig_dpi), res = fig_dpi)`,
      `  barplot(matrix(df$score, nrow = 2, byrow = TRUE), beside = TRUE, col = palette_colors[1:2], names.arg = c("Poisson", "Helmholtz", "Navier", "Maxwell"), main = ${JSON.stringify(plan.title)})`,
      "  dev.off()",
      "}",
    ];
  } else {
    body = [
      "n_dof <- c(8, 16, 32, 64, 128, 256)",
      "df <- data.frame(",
      "  x = rep(n_dof, times = 2),",
      "  y = c(1.8e-1, 1.1e-2, 6.4e-4, 3.9e-5, 2.4e-6, 1.5e-7, 3.4e-1, 8.6e-2, 2.15e-2, 5.4e-3, 1.35e-3, 3.38e-4),",
      '  method = rep(c("Spectral Chebyshev", "Preconditioned CG"), each = length(n_dof))',
      ")",
      "if (has_ggplot2) {",
      "  library(ggplot2)",
      "  p <- ggplot(df, aes(x = x, y = y, color = method, shape = method)) +",
      "    geom_line(linewidth = 0.7) +",
      "    geom_point(size = 1.8) +",
      "    scale_color_manual(values = palette_colors) +",
      `    ${plan.yScale === "log" ? "scale_y_log10() +" : ""}`,
      `    ${plan.xScale === "log" ? "scale_x_log10() +" : ""}`,
      `    labs(title = ${JSON.stringify(plan.title)}, x = ${JSON.stringify(plan.xLabel)}, y = ${JSON.stringify(plan.yLabel)}) +`,
      `    theme_classic(base_size = ${preset.baseFontPt}) +`,
      "    theme(legend.position = 'top', plot.title = element_text(face = 'bold'))",
      `  ggsave("figures/${slug}.pdf", plot = p, width = fig_w, height = fig_h)`,
      `  ggsave("figures/${slug}.png", plot = p, width = fig_w, height = fig_h, dpi = fig_dpi)`,
      "} else {",
      `  pdf("figures/${slug}.pdf", width = fig_w, height = fig_h)`,
      `  plot(n_dof, df$y[1:6], type = "b", log = "${plan.yScale === "log" ? "y" : ""}", col = palette_colors[1], main = ${JSON.stringify(plan.title)}, xlab = ${JSON.stringify(plan.xLabel)}, ylab = ${JSON.stringify(plan.yLabel)})`,
      "  dev.off()",
      `  png("figures/${slug}.png", width = round(fig_w * fig_dpi), height = round(fig_h * fig_dpi), res = fig_dpi)`,
      `  plot(n_dof, df$y[1:6], type = "b", log = "${plan.yScale === "log" ? "y" : ""}", col = palette_colors[1], main = ${JSON.stringify(plan.title)}, xlab = ${JSON.stringify(plan.xLabel)}, ylab = ${JSON.stringify(plan.yLabel)})`,
      "  dev.off()",
      "}",
    ];
  }

  return [
    ...header,
    ...body,
    `cat("Rendered figures/${slug}.pdf and figures/${slug}.png\\n")`,
  ].join("\n");
}

/**
 * Stage 2 — Compile a deduced FigureInstructionPlan into self-contained,
 * executable Python (matplotlib + numpy) or R (ggplot2 + base-R fallback) code.
 */
export function compileFigureCode(
  plan: FigureInstructionPlan,
  language?: CodeLanguage,
): string {
  const targetLanguage = language ?? plan.language;
  if (targetLanguage === "r") {
    return buildRScript(plan);
  }
  return buildPythonScript(plan);
}

export function buildLatexFigureSnippet(input: {
  imagePath: string;
  caption?: string;
  label?: string;
  doubleColumn?: boolean;
  width?: string;
}): string {
  const env = input.doubleColumn ? "figure*" : "figure";
  const placement = input.doubleColumn ? "[t]" : "[htbp]";
  const width =
    input.width ?? (input.doubleColumn ? "0.95\\textwidth" : "0.85\\linewidth");
  const cleanPath = input.imagePath.replace(/^\/+/, "");
  const caption =
    input.caption?.trim() || "Scientific figure synthesized in arcanaTeX.";
  const rawLabel = input.label?.trim() || "fig:synthesized-figure";
  const label = rawLabel.startsWith("fig:") ? rawLabel : `fig:${rawLabel}`;

  return [
    `\\begin{${env}}${placement}`,
    "  \\centering",
    `  \\includegraphics[width=${width}]{${cleanPath}}`,
    `  \\caption{${caption}}`,
    `  \\label{${label}}`,
    `\\end{${env}}`,
  ].join("\n");
}

export function ensureGraphicxInLatex(
  texContent: string,
  figureSnippet: string,
  insertOffset?: number,
): string {
  let content = texContent;

  const hasGraphicx =
    /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{[^}]*\b(?:graphicx|tikz)\b[^}]*\}/.test(
      content,
    );

  if (!hasGraphicx) {
    const beginDocMatch = content.match(/\\begin\{document\}/);
    if (beginDocMatch && beginDocMatch.index !== undefined) {
      content =
        content.slice(0, beginDocMatch.index) +
        "\\usepackage{graphicx}\n\n" +
        content.slice(beginDocMatch.index);
    } else {
      content = `\\usepackage{graphicx}\n${content}`;
    }
  }

  const endDocMatch = content.match(/\\end\{document\}/);
  const block = `\n\n${figureSnippet}\n\n`;

  if (
    typeof insertOffset === "number" &&
    insertOffset > 0 &&
    (!endDocMatch ||
      endDocMatch.index === undefined ||
      insertOffset <= endDocMatch.index)
  ) {
    const beginDocMatch = content.match(/\\begin\{document\}/);
    const minOffset =
      beginDocMatch && beginDocMatch.index !== undefined
        ? beginDocMatch.index + beginDocMatch[0].length
        : 0;
    const safeOffset = Math.max(
      minOffset,
      Math.min(insertOffset, content.length),
    );
    return content.slice(0, safeOffset) + block + content.slice(safeOffset);
  }

  if (endDocMatch && endDocMatch.index !== undefined) {
    return (
      content.slice(0, endDocMatch.index).trimEnd() +
      block +
      content.slice(endDocMatch.index)
    );
  }

  return `${content.trimEnd()}${block}`;
}
