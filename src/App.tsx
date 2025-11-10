// src/kruskal_visualizer_draft.tsx
import {jsPDF} from "jspdf";
import "jspdf-autotable";
import html2canvas from "html2canvas";
import './App.css';
import './index.css';   
import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  Download,
  Plus,
  Link,
  Move,
  FileText,
  Settings,
  HelpCircle
} from 'lucide-react';

interface GraphNode {
  id: string;
  name: string;
  x: number;
  y: number;
}

interface GraphEdge {
  id: number;
  from: string;
  to: string;
  weight: number;
}

interface AlgoStep {
  edge: GraphEdge;
  mst: GraphEdge[];
  cost: number;
  message: string;
  added: boolean;
  parents: Record<string, string>; // snapshot of DSU parents after this step
  ranks: Record<string, number>;   // snapshot of DSU ranks after this step
}

/* ----------------- CONFIG (edit these to change visuals) ----------------- */
const WEIGHT_BOX_BG = '#0f172a';     // change this for weight box background
const WEIGHT_BOX_TEXT = '#cbd5e1';   // change this for weight number color
/* ------------------------------------------------------------------------- */

/* Simple modal component used for all three popups */
const Modal: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
  maxWidth?: string;
}> = ({ open, title, onClose, children, maxWidth = 'min(920px, 96%)' }) => {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2,6,23,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: maxWidth,
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0b1220',
          color: '#fff',
          borderRadius: 10,
          padding: 16,
          boxShadow: '0 10px 30px rgba(2,6,23,0.7)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: '#111827',
              color: '#fff',
              border: 'none',
              padding: '6px 10px',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
        <div style={{ marginTop: 10 }}>{children}</div>
      </div>
    </div>
  );
};

const GraphVisualizer: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<'builder' | 'visualizer' | 'results'>('builder');
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedTool, setSelectedTool] = useState<'node' | 'edge' | 'select'>('node');
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [isDirected, setIsDirected] = useState<boolean>(false);
  const [nodeName, setNodeName] = useState<string>('');
  const [edgeWeight, setEdgeWeight] = useState<string>('');

  // Animation states
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [animationSpeed, setAnimationSpeed] = useState<number>(1.0);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [algorithmSteps, setAlgorithmSteps] = useState<AlgoStep[]>([]);
  const [mstEdges, setMstEdges] = useState<GraphEdge[]>([]);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [sortedEdges, setSortedEdges] = useState<GraphEdge[]>([]);
  const [fadeIn, setFadeIn] = useState<boolean>(false);

  // modal states
  const [showLearn, setShowLearn] = useState(false);
  const [showDev, setShowDev] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Small tick state used to force redraws on resize
  const [tick, setTick] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fade in effect on page change
  useEffect(() => {
    setFadeIn(false);
    const timer = setTimeout(() => setFadeIn(true), 50);
    return () => clearTimeout(timer);
  }, [currentPage]);

  // DPR-safe draw effect (keeps canvas crisp and avoids white flash)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // get displayed size
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // device pixel ratio handling
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.round(rect.width);
    const cssHeight = Math.round(rect.height);

    // set actual canvas pixel size to css size * dpr
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }

    // Reset transform and scale so drawing is done in CSS pixel space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // clear (in CSS pixel coords)
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Paint explicit background (helps avoid white flash)
    const backgroundColor = currentPage === 'builder' ? '#0b1220' : '#f8fafc';
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Draw edges
    edges.forEach(edge => {
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode = nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;

      const isMSTEdge = mstEdges.some(e =>
        (e.from === edge.from && e.to === edge.to) ||
        (e.from === edge.to && e.to === edge.from)
      );

      const isCurrentEdge = algorithmSteps[currentStep]?.edge?.id === edge.id;

      // draw line
      ctx.beginPath();
      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.lineTo(toNode.x, toNode.y);
      ctx.strokeStyle = isMSTEdge ? '#10b981' : (isCurrentEdge ? '#fbbf24' : '#475569');
      ctx.lineWidth = isMSTEdge ? 4 : (isCurrentEdge ? 3.5 : 2);
      ctx.stroke();

      // if directed and not same point, draw an arrow head near destination
      if (isDirected) {
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const angle = Math.atan2(dy, dx);
        const arrowLen = 20;
        const arrowAngle = Math.PI / 8;

        // place arrow tip outside the destination node radius
        const arrowX = toNode.x - Math.cos(angle) * 30;
        const arrowY = toNode.y - Math.sin(angle) * 30;

        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - arrowLen * Math.cos(angle - arrowAngle), arrowY - arrowLen * Math.sin(angle - arrowAngle));
        ctx.lineTo(arrowX - arrowLen * Math.cos(angle + arrowAngle), arrowY - arrowLen * Math.sin(angle + arrowAngle));
        ctx.closePath();
        ctx.fillStyle = isMSTEdge ? '#10b981' : (isCurrentEdge ? '#fbbf24' : '#475569');
        ctx.fill();
      }

      // Draw weight box
      const midX = (fromNode.x + toNode.x) / 2;
      const midY = (fromNode.y + toNode.y) / 2;

      // Weight box styling (edit the constants at top to change colors)
      ctx.fillStyle = WEIGHT_BOX_BG;
      ctx.fillRect(midX - 18, midY - 14, 36, 28);
      ctx.fillStyle = isMSTEdge ? '#10b981' : (isCurrentEdge ? '#fbbf24' : WEIGHT_BOX_TEXT);
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(edge.weight), midX, midY);
    });

    // Draw nodes
    nodes.forEach(node => {
      const isSelected = selectedNodes.includes(node.id);

      ctx.beginPath();
      ctx.arc(node.x, node.y, 25, 0, 2 * Math.PI);
      ctx.fillStyle = currentPage === 'builder' ? '#1e293b' : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = isSelected ? '#3b82f6' : '#64748b';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      ctx.fillStyle = currentPage === 'builder' ? '#ffffff' : '#0f172a';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.name, node.x, node.y);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, selectedNodes, mstEdges, currentStep, algorithmSteps, currentPage, tick, isDirected]);

  // Repaint / resize when the window resizes or when the page changes
  useEffect(() => {
    const handleResize = () => setTick(t => t + 1);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // pure function: compute steps synchronously from nodes + edges
const computeKruskalSteps = (nodesList: GraphNode[], edgesList: GraphEdge[]) => {
  const sorted = [...edgesList].sort((a,b) => a.weight - b.weight);
  const parent: Record<string,string> = {};
  const rank: Record<string, number> = {};
  nodesList.forEach(n => { parent[n.id] = n.id; rank[n.id] = 0; });

  const find = (x: string): string => {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  };

  const union = (x: string, y: string): boolean => {
    const rx = find(x), ry = find(y);
    if (rx === ry) return false;
    if (rank[rx] < rank[ry]) parent[rx] = ry;
    else if (rank[rx] > rank[ry]) parent[ry] = rx;
    else { parent[ry] = rx; rank[rx]++; }
    return true;
  };

  const snapshot = () => ({
    parents: Object.fromEntries(Object.entries(parent)),
    ranks: Object.fromEntries(Object.entries(rank))
  });

  const steps: AlgoStep[] = [];
  const mst: GraphEdge[] = [];
  let cost = 0;

  sorted.forEach(edge => {
    const before = snapshot();
    const added = union(edge.from, edge.to);
    if (added) { mst.push(edge); cost += edge.weight; }
    const after = snapshot();
    steps.push({
      edge,
      mst: [...mst],
      cost,
      message: added ? `Considering edge (${edge.from}, ${edge.to}) — added.` : `Considering edge (${edge.from}, ${edge.to}) — skipped (cycle).`,
      added,
      parents: after.parents,
      ranks: after.ranks
    } as AlgoStep);
  });

  return { steps, sorted, mst, totalCost: cost };
};


  // Kruskal's Algorithm
const runKruskal = () => {
  if (nodes.length === 0) { setStatusMessage('Please add nodes first'); return; }

  const { steps, sorted, mst, totalCost: cost } = computeKruskalSteps(nodes, edges);
  setSortedEdges(sorted);
  setAlgorithmSteps(steps);
  setCurrentStep(0);
  setTotalCost(cost);
  setMstEdges([]); // keep animation driven MST empty initially
  setStatusMessage("Ready to visualize Kruskal's steps.");
  setCurrentPage('visualizer');
  setTick(t => t + 1);
};


  // Animation control
  useEffect(() => {
    if (!isAnimating) return;
    if (currentStep >= algorithmSteps.length) {
      setIsAnimating(false);
      return;
    }

    const timer = setTimeout(() => {
      const step = algorithmSteps[currentStep];
      if (step) {
        setMstEdges(step.mst);
        setStatusMessage(step.message);
        setCurrentStep(prev => prev + 1);
      } else setIsAnimating(false);
    }, 2000 / animationSpeed);

    return () => clearTimeout(timer);
  }, [isAnimating, currentStep, algorithmSteps, animationSpeed]);

  // Canvas click handler (keeps scaling accounted for)
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentPage !== 'builder') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const rawY = (e.clientY - rect.top) * (canvas.height / rect.height);
    const dpr = window.devicePixelRatio || 1;
    const x = rawX / dpr;
    const y = rawY / dpr;

    const clickedNode = nodes.find(node => {
      const dist = Math.sqrt((node.x - x) ** 2 + (node.y - y) ** 2);
      return dist <= 25;
    });

    if (selectedTool === 'select' && clickedNode) {
      if (selectedNodes.includes(clickedNode.id)) setSelectedNodes(selectedNodes.filter(id => id !== clickedNode.id));
      else setSelectedNodes([...selectedNodes, clickedNode.id]);
    } else if (selectedTool === 'node' && nodeName && !clickedNode) {
      const newNode: GraphNode = { id: nodeName, name: nodeName, x, y };
      setNodes(prev => [...prev, newNode]);
      setNodeName('');
      setTick(t => t + 1);
    }
  };

  const addEdge = () => {
    if (selectedNodes.length !== 2) { alert('Please select exactly 2 nodes to connect'); return; }
    if (!edgeWeight || isNaN(Number(edgeWeight)) || Number(edgeWeight) <= 0) { alert('Please enter a valid positive weight'); return; }
    const nextId = edges.length > 0 ? Math.max(...edges.map(e => e.id)) + 1 : 1;
    const newEdge: GraphEdge = { id: nextId, from: selectedNodes[0], to: selectedNodes[1], weight: Number(edgeWeight) };
    setEdges(prev => [...prev, newEdge]);
    setSelectedNodes([]);
    setEdgeWeight('');
    setTick(t => t + 1);
  };

  const exportAsImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return; const link = document.createElement('a'); link.download = 'graph_mst.png'; link.href = canvas.toDataURL(); link.click();
  };

  const exportAsCSV = () => {
    let csv = 'Edge,Source,Destination,Weight\n';
    mstEdges.forEach((edge) => { csv += `${edge.from} - ${edge.to},${edge.from},${edge.to},${edge.weight}\n`; });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'mst_results.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const exportAsText = () => {
    let text = "Kruskal's Algorithm: Minimum Spanning Tree Results\n\n";
    text += `Total MST Cost: ${totalCost}\n`; text += `Edges in MST: ${mstEdges.length}\n\n`; text += 'Minimum Spanning Tree Edges:\n';
    text += 'EDGE (U-V)\tSOURCE (U)\tDESTINATION (V)\tWEIGHT\n';
    mstEdges.forEach(edge => { text += `${edge.from} - ${edge.to}\t${edge.from}\t\t${edge.to}\t\t${edge.weight}\n`; });
    const blob = new Blob([text], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'mst_results.txt'; a.click(); URL.revokeObjectURL(url);
  };

  const clearGraph = () => {
    setNodes([]); setEdges([]); setSelectedNodes([]); setNodeName(''); setEdgeWeight(''); setMstEdges([]); setAlgorithmSteps([]); setCurrentStep(0); setTotalCost(0); setStatusMessage('');
    setTick(t => t + 1);
  };

  const loadSampleGraph = () => {
    const sampleNodes: GraphNode[] = [
      { id: 'A', name: 'A', x: 330, y: 100 },
      { id: 'B', name: 'B', x: 610, y: 180 },
      { id: 'C', name: 'C', x: 480, y: 260 },
      { id: 'D', name: 'D', x: 480, y: 380 },
      { id: 'E', name: 'E', x: 610, y: 460 },
      { id: 'F', name: 'F', x: 330, y: 460 },
      { id: 'G', name: 'G', x: 200, y: 380 }
    ];
    const sampleEdges: GraphEdge[] = [
      { id: 1, from: 'A', to: 'C', weight: 5 },
      { id: 2, from: 'A', to: 'B', weight: 2 },
      { id: 3, from: 'B', to: 'D', weight: 3 },
      { id: 4, from: 'B', to: 'C', weight: 6 },
      { id: 5, from: 'C', to: 'F', weight: 4 },
      { id: 6, from: 'D', to: 'E', weight: 1 },
      { id: 7, from: 'E', to: 'G', weight: 6 },
      { id: 8, from: 'F', to: 'G', weight: 7 }
    ];
    setNodes(sampleNodes); setEdges(sampleEdges); setTick(t => t + 1);
  };

  const stepForward = () => {
    if (currentStep < algorithmSteps.length) {
      const step = algorithmSteps[currentStep];
      setMstEdges(step.mst);
      setStatusMessage(step.message);
      setCurrentStep(prev => prev + 1);
      setTick(t => t + 1);
    }
  };

  const stepBackward = () => {
    if (currentStep > 0) {
      const step = algorithmSteps[currentStep - 2];
      if (step) { setMstEdges(step.mst); setStatusMessage(step.message); } else { setMstEdges([]); setStatusMessage('Ready to start'); }
      setCurrentStep(prev => Math.max(0, prev - 1));
      setTick(t => t + 1);
    }
  };

  const resetAnimation = () => {
    setCurrentStep(0); setMstEdges([]); setIsAnimating(false); setStatusMessage('Ready to start algorithm'); setTick(t => t + 1);
  };

  

  // ---------------- PDF generation / Download ----------------
  const edgesToTableRows = (edgeList: GraphEdge[]) => {
    return edgeList.map(e => [String(e.id), e.from, e.to, String(e.weight)]);
  };

  const compactDSU = (parents: Record<string, string>, nodesOrder?: string[]) => {
    // Return compact mapping like A→A, B→A, C→C
    const keys = nodesOrder && nodesOrder.length ? nodesOrder : Object.keys(parents).sort();
    return keys.map(k => `${k}->${parents[k]}`).join(', ');
  };

  const buildStepRows = (steps: AlgoStep[]) => {
    return steps.map((s, idx) => {
      const mstList = s.mst.map(e => `${e.from}-${e.to}(${e.weight})`).join(", ");
      const reason = s.added ? "Connected different components" : "Forms a cycle (skipped)";
      const dsuCompact = compactDSU(s.parents, nodes.map(n => n.id));
      return [
        String(idx + 1),
        `${s.edge.from}-${s.edge.to}`,
        String(s.edge.weight),
        s.added ? "Added" : "Skipped",
        reason,
        mstList || '—',
        String(s.cost),
        dsuCompact
      ];
    });
  };

// safe toDataURL wrapper
const safeCanvasDataUrl = (canvas: HTMLCanvasElement | null): string | null => {
  if (!canvas) return null;
  try {
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('safeCanvasDataUrl: canvas.toDataURL() threw', err);
    return null;
  }
};

const generatePdf = async () => {
  console.info('generatePdf: start');
  try {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const usableWidth = pageWidth - margin * 2;

    // Cover
    doc.setFontSize(20);
    doc.text("Kruskal's Algorithm — Step-by-step Report", margin, 80);
    doc.setFontSize(12);
    doc.text(`Team: Taniska Routray, Viswa Danuskka`, margin, 110);
    doc.text(`Guide: Dr A Swaminathan`, margin, 128);
    doc.text(`Date: ${new Date().toLocaleString()}`, margin, 146);
    doc.setFontSize(10);
    doc.text(
      "Summary: This report shows the edges considered by Kruskal's algorithm, the action (added/skipped), MST progression and total cost.",
      margin, 170, { maxWidth: usableWidth }
    );

    // Canvas snapshot (prefer toDataURL)
    let imgData: string | null = null;
    try {
      console.info('generatePdf: trying canvas.toDataURL()');
      imgData = safeCanvasDataUrl(canvasRef.current);
      if (imgData) console.info('generatePdf: canvas.toDataURL() succeeded');
    } catch (err) {
      console.warn('generatePdf: canvas.toDataURL() threw', err);
      imgData = null;
    }

    if (!imgData) {
      try {
        console.info('generatePdf: falling back to html2canvas');
        // html2canvas may throw if canvas is cross-origin-tainted
        const snap = await html2canvas(canvasRef.current as HTMLCanvasElement, { backgroundColor: null, scale: 1 });
        imgData = snap.toDataURL('image/png');
        console.info('generatePdf: html2canvas succeeded');
      } catch (err) {
        console.error('generatePdf: html2canvas fallback failed', err);
        imgData = null;
      }
    }

    if (imgData) {
      try {
        const canvas = canvasRef.current;
        const imgWidth = canvas ? (canvas.width / (window.devicePixelRatio || 1)) : usableWidth;
        const imgHeight = canvas ? (canvas.height / (window.devicePixelRatio || 1)) : (usableWidth * 0.6);
        const aspect = imgWidth / imgHeight || 1.77;
        const drawW = Math.min(usableWidth, imgWidth);
        const drawH = drawW / aspect;
        console.info(`generatePdf: adding image (w:${drawW}, h:${drawH})`);
        doc.addImage(imgData, 'PNG', margin, 200, drawW, drawH);
      } catch (err) {
        console.error('generatePdf: doc.addImage failed', err);
      }
    } else {
      console.warn('generatePdf: no snapshot image available; continuing without image');
    }

    // Graph summary page
    try {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Graph Summary', margin, 60);
      doc.setFontSize(11);
      doc.text(`Nodes: ${nodes.map(n => n.name).join(', ') || '—'}`, margin, 82);

      const edgesTableRows = edgesToTableRows(edges);
      if (edgesTableRows.length === 0) {
        doc.text('No edges in the graph.', margin, 110);
      } else {
        console.info('generatePdf: creating edges autoTable');
        (doc as any).autoTable({
          head: [['ID', 'Source', 'Target', 'Weight']],
          body: edgesTableRows,
          startY: 100,
          margin: { left: margin, right: margin },
          styles: { fontSize: 10 },
          theme: 'grid',
          headStyles: { fillColor: [20, 25, 31] },
        });
      }
    } catch (err) {
      console.error('generatePdf: error while building Graph Summary / edges table', err);
    }

    // Sorted edges
    try {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Sorted Edges (ascending by weight)', margin, 60);
      const sortedRows = edgesToTableRows(sortedEdges.length ? sortedEdges : [...edges].sort((a,b)=>a.weight-b.weight));
      (doc as any).autoTable({
        head: [['ID','Source','Target','Weight']],
        body: sortedRows,
        startY: 80,
        margin: { left: margin, right: margin },
        styles: { fontSize: 10 },
        theme: 'grid',
      });
    } catch (err) {
      console.error('generatePdf: error creating Sorted Edges table', err);
    }

    // Algorithm overview (short)
    try {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Algorithm Overview', margin, 60);
      doc.setFontSize(10);
      doc.text('Kruskal\'s algorithm: sort edges by weight, iterate edges from smallest to largest, use a Disjoint-Set (Union-Find) to avoid cycles, add edges until V-1 edges selected.', margin, 82, { maxWidth: usableWidth });
    } catch (err) {
      console.error('generatePdf: error writing algorithm overview', err);
    }

    // Steps table (includes DSU snapshot)
    try {
      doc.addPage();
      doc.setFontSize(14);
      doc.text("Step-by-step Kruskal Execution", margin, 60);
      doc.setFontSize(10);
      const stepRows = buildStepRows(algorithmSteps);
      if (!stepRows.length) {
        doc.text('No algorithm run data available. Run the algorithm first to generate steps.', margin, 90);
      } else {
        // include DSU state column as last column (may wrap)
        (doc as any).autoTable({
          head: [['Step','Edge','Wt','Action','Reason','MST after step','Total cost','DSU state (parents)']],
          body: stepRows,
          startY: 80,
          margin: { left: margin, right: margin },
          styles: { fontSize: 8, cellPadding: 6 }, // smaller font to fit DSU column
          theme: 'striped',
          columnStyles: {
            0: { cellWidth: 26 }, 1: { cellWidth: 56 }, 2: { cellWidth: 22 },
            3: { cellWidth: 40 }, 4: { cellWidth: 120 }, 5: { cellWidth: 140 }, 6: { cellWidth: 44 }, 7: { cellWidth: 150 }
          }
        });
      }
    } catch (err) {
      console.error('generatePdf: error creating Steps table', err);
    }

    // Final MST summary + complexity
    try {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Final MST Summary', margin, 60);
      const finalMstList = mstEdges.map(e => `${e.from}-${e.to} (${e.weight})`);
      doc.setFontSize(11);
      doc.text(`Edges in MST (${mstEdges.length}):`, margin, 92);
      doc.setFontSize(10);
      doc.text(finalMstList.join(', ') || '—', margin, 110, { maxWidth: usableWidth });
      doc.setFontSize(11);
      doc.text(`Total MST weight: ${totalCost}`, margin, 140);

      doc.addPage();
      doc.setFontSize(12);
      doc.text('Complexity and References', margin, 60);
      doc.setFontSize(10);
      doc.text('Kruskal complexity: O(E log E) due to sorting. DSU operations are near-constant amortized with path compression and union by rank.', margin, 82, { maxWidth: usableWidth });
      doc.text('References: CLRS (Introduction to Algorithms), GeeksforGeeks (Kruskal), MDN (Canvas API), Project repository.', margin, 110, { maxWidth: usableWidth });
    } catch (err) {
      console.error('generatePdf: error writing final summary or references', err);
    }

    // Save
    try {
      doc.save('kruskal_report.pdf');
      console.info('generatePdf: doc.save called');
    } catch (err) {
      console.error('generatePdf: doc.save failed', err);
      throw err;
    }

  } catch (err) {
    console.error('generatePdf: top-level error', err);
    throw err;
  }
};



  const handleDownload = async () => {
    try {
      await generatePdf();
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to create PDF. Check console for details.");
    }
  };

  // ---------------- Download steps window (CSV + HTML view) ----------------
  const downloadStepsWindow = () => {
    if (!algorithmSteps || algorithmSteps.length === 0) {
      alert('No algorithm steps available. Run Kruskal first to generate steps.');
      return;
    }

    // Build CSV
    const csvRows = [
      ['Step', 'Edge (U-V)', 'Action', 'MST Edges (so far)', 'Total Cost']
    ];
    algorithmSteps.forEach((s, idx) => {
      const mstStr = s.mst.map(e => `${e.from}-${e.to}(${e.weight})`).join('; ');
      const action = s.added ? 'Added' : 'Skipped';
      csvRows.push([String(idx + 1), `${s.edge.from}-${s.edge.to}`, action, mstStr, String(s.cost)]);
    });
    const csvText = csvRows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvText], { type: 'text/csv' });
    const csvUrl = URL.createObjectURL(blob);

    // Build simple HTML page with table
    let tableHtml = '';
    tableHtml += `<style>
      body{font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; background:#0b1220; color:#e6eef8; padding:18px}
      table{border-collapse:collapse; width:100%; max-width:980px; background:#081023; border-radius:8px; overflow:hidden}
      th,td{padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.04); text-align:left; font-size:13px}
      th{background:#071223; position:sticky; top:0}
      .download{display:inline-block; padding:8px 12px; margin-bottom:12px; background:#0b1220; color:#9fe6a0; border:1px solid rgba(160,255,180,0.06); border-radius:6px; text-decoration:none}
      .step-added{color:#9fe6a0}
      .step-skipped{color:#fbbf24}
      .muted{color:#9fb0c6; font-size:12px}
    </style>`;

    tableHtml += `<a class="download" href="${csvUrl}" download="kruskal_steps.csv">Download CSV</a>`;
    tableHtml += `<table><thead><tr><th>Step</th><th>Edge (U-V)</th><th>Action</th><th>MST Edges (so far)</th><th>Total Cost</th></tr></thead><tbody>`;

    algorithmSteps.forEach((s, i) => {
      const mstStr = s.mst.map(e => `${e.from}-${e.to}(${e.weight})`).join(', ');
      const cls = s.added ? 'step-added' : 'step-skipped';
      tableHtml += `<tr>
        <td>${i + 1}</td>
        <td>${s.edge.from}-${s.edge.to}</td>
        <td class="${cls}">${s.added ? 'Added' : 'Skipped'}</td>
        <td>${mstStr || '<span class="muted">—</span>'}</td>
        <td>${s.cost}</td>
      </tr>`;
    });

    tableHtml += `</tbody></table><div style="height:12px"></div><div style="max-width:980px;color:#9fb0c6;font-size:13px">This report was generated from the in-memory Kruskal algorithm steps. You can save the CSV using the Download button above.</div>`;

    const newWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!newWindow) {
      alert('Popup blocked. Please allow popups for this site to open the steps window.');
      return;
    }
    newWindow.document.write(`<html><head><title>Kruskal Steps</title></head><body>${tableHtml}</body></html>`);
    newWindow.document.close();
  };

  // ---------------- UI rendering ----------------

  // Builder page
  const renderBuilderPage = () => (
    <div className={`flex h-screen bg-slate-900 text-white transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
      {/* Left Sidebar */}
      <div className="w-64 bg-slate-950 border-r border-slate-800 p-4 overflow-y-auto">
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Graph Actions</h3>
          <div className="space-y-2">
            <button onClick={clearGraph} className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm">Clear Graph</button>
            <button onClick={loadSampleGraph} className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm">Load Sample Graph</button>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Graph Tools</h3>
          <p className="text-xs text-slate-500 mb-3">Build your graph</p>
          <div className="space-y-2">
            <button onClick={() => setSelectedTool('node')} className={`w-full flex items-center gap-3 px-4 py-2 rounded ${selectedTool === 'node' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}><Plus size={18} /><span>Add Node</span></button>

            <button onClick={() => setSelectedTool('edge')} className={`w-full flex items-center gap-3 px-4 py-2 rounded ${selectedTool === 'edge' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}><Link size={18} /><span>Add Edge</span></button>

            <button onClick={() => setSelectedTool('select')} className={`w-full flex items-center gap-3 px-4 py-2 rounded ${selectedTool === 'select' ? 'bg-blue-600' : 'bg-slate-800 hover:bg-slate-700'}`}><Move size={18} /><span>Select/Move</span></button>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Add Node by Name/Value</h3>
          <input type="text" value={nodeName} onChange={(e) => setNodeName(e.target.value)} placeholder="Enter node name" className="w-full px-3 py-2 bg-slate-800 rounded border border-slate-700 text-sm" />
        </div>

        {selectedTool === 'edge' && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-slate-400 mb-3">Add Edge</h3>
            <input type="number" value={edgeWeight} onChange={(e) => setEdgeWeight(e.target.value)} placeholder="Weight" className="w-full px-3 py-2 bg-slate-800 rounded border border-slate-700 text-sm mb-2" />
            <button onClick={addEdge} disabled={selectedNodes.length !== 2} className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded text-sm">Create Edge</button>
            <p className="text-xs text-slate-500 mt-2">Selected: {selectedNodes.join(', ')}</p>
          </div>
        )}

        <div className="mb-6">
          <h3 className="text-sm font-semibold text-slate-400 mb-3">Graph Type</h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={!isDirected} onChange={() => setIsDirected(false)} className="w-4 h-4" />
              <span className="text-sm">Undirected</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={isDirected} onChange={() => setIsDirected(true)} className="w-4 h-4" />
              <span className="text-sm">Directed (show arrows)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col">
        <div className="bg-slate-950 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white rounded"></div>
            </div>
            <h1 className="text-xl font-bold">Graph Algorithm Visualizer</h1>
          </div>

          {/* TOP-RIGHT: Download + Learn / Developed by / Help / Edit Graph */}
          <div className="flex gap-3 items-center">
            <button
              onClick={handleDownload}
              style={{
                background: '#0ea5a0',
                color: '#082f2e',
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                fontWeight: 600
              }}
              title="Download step-by-step PDF report"
            >
              Download Report
            </button>

            <button onClick={() => setShowLearn(true)} style={{ background: '#111827', color: '#fff', padding: '6px 10px', borderRadius: 6, border: 'none' }}>Learn</button>
            <button onClick={() => setShowDev(true)} style={{ background: '#111827', color: '#fff', padding: '6px 10px', borderRadius: 6, border: 'none' }}>Developed by</button>
            <button onClick={() => setShowHelp(true)} style={{ background: '#111827', color: '#fff', padding: '6px 10px', borderRadius: 6, border: 'none' }}>Help</button>

            <button onClick={() => setCurrentPage('visualizer')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-sm">
              Edit Graph
            </button>
          </div>
        </div>

        <div className="flex-1 flex p-4">
          <canvas ref={canvasRef} width={800} height={600} onClick={handleCanvasClick} className="bg-slate-950 rounded cursor-crosshair border border-slate-800 w-full h-full" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>

        <div className="text-center py-2 text-xs text-slate-500 border-t border-slate-800">© Taniska Routray and Viswa Danuskka</div>
      </div>

      {/* Right Sidebar */}
      <div className="w-80 bg-slate-950 border-l border-slate-800 p-4 overflow-y-auto">
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Algorithm Controls</h3>
          <div className="mb-3">
            <label className="block text-sm text-slate-400 mb-2">Algorithm</label>
            <select className="w-full px-3 py-2 bg-slate-800 rounded border border-slate-700 text-sm"><option>Kruskal's Algorithm</option></select>
          </div>

          <div className="flex gap-2 mb-3">
            <button onClick={runKruskal} className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm flex items-center justify-center gap-2"><Play size={16} />Run</button>
            <button className="p-2 bg-slate-800 hover:bg-slate-700 rounded"><RotateCcw size={16} /></button>
            <button className="p-2 bg-slate-800 hover:bg-slate-700 rounded"><SkipForward size={16} /></button>
          </div>

          <div className="mb-3">
            <label className="block text-sm text-slate-400 mb-2">Visualization Speed</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Slow</span>
              <input type="range" min="0.5" max="2" step="0.1" value={animationSpeed} onChange={(e) => setAnimationSpeed(Number(e.target.value))} className="flex-1" />
              <span className="text-xs text-slate-500">Fast</span>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">About Kruskal's Algorithm</h3>
          <p className="text-sm text-slate-400 leading-relaxed">Kruskal's algorithm is a greedy algorithm that finds a Minimum Spanning Tree (MST) for a weighted graph by sorting edges and adding the smallest edge that doesn't form a cycle.</p>
          <p className="text-sm text-slate-400 leading-relaxed mt-2">It sorts edges in non-decreasing order of weight and uses a Union-Find data structure to ensure the chosen edge won't create a cycle.</p>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Graph Info</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Nodes:</span><span>{nodes.length}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Edges:</span><span>{edges.length}</span></div>
          </div>
        </div>

        <div className="mt-6">
          <button onClick={exportAsImage} className="w-full px-3 py-2 bg-slate-800 rounded mb-2">Export Image</button>
          <button onClick={exportAsCSV} className="w-full px-3 py-2 bg-slate-800 rounded mb-2">Export CSV</button>
          <button onClick={exportAsText} className="w-full px-3 py-2 bg-slate-800 rounded">Export Text</button>
        </div>
      </div>

      {/* Modals omitted here (they are the same as before) */}
      <Modal open={showDev} title="Developed by" onClose={() => setShowDev(false)}>
        {/* ... same content ... */}
        <div style={{ display: 'grid', gap: 0 }}>
          <div>
            <div style={{ display: 'flex', gap: 18, marginTop: 0, alignItems: 'flex-start' }}>
              <div style={{ display: 'grid', gap: 8, alignItems: 'center', width: 160 }}>
                <img src="/images/Taniska.jpeg" alt="Taniska" style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 12, boxShadow: '0 6px 18px rgba(2,6,23,0.6)' }} />
                <div style={{ fontWeight: 700, fontSize: 18 }}>Taniska Routray</div>
              </div>
              <div style={{ display: 'grid', gap: 8, alignItems: 'center', width: 160 }}>
                <img src="/images/Viswa.jpeg" alt="Viswa" style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 12, boxShadow: '0 6px 18px rgba(2,6,23,0.6)' }} />
                <div style={{ fontWeight: 700, fontSize: 18 }}>Viswa Danuskka</div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Guided by</h3>
            <div style={{ display: 'flex', gap: 18, marginTop: 12, alignItems: 'center' }}>
              <div style={{ display: 'grid', gap: 8, alignItems: 'center', width: 160 }}>
                <img src="/images/Swaminathan.jpeg" alt="Dr Swaminathan" style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 12, boxShadow: '0 6px 18px rgba(2,6,23,0.6)' }} />
                <div style={{ fontWeight: 700, fontSize: 18 }}>Dr A Swaminathan</div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={showLearn} title="Learn" onClose={() => setShowLearn(false)} maxWidth="900px">
        {/* ... unchanged content ... */}
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <h3 style={{ margin: 0 }}>Materials (from prescribed textbook)</h3>
            <div style={{ color: '#cbd5e1', marginTop: 8, lineHeight: 1.9 }}>
              <p><strong>1. Graphs:</strong> A graph is a set of <strong>vertices (nodes)</strong> and <strong>edges (links)</strong> connecting pairs of vertices. Representations: <strong>adjacency matrix</strong> or <strong>adjacency list</strong>.</p>
              <p><strong>2. Minimum Spanning Tree (MST):</strong> An MST is a subset of edges that connects all vertices in a connected weighted graph with minimum total weight, and contains no cycles. Spanning trees have <strong>V − 1</strong> edges for V vertices.</p>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={showHelp} title="Help" onClose={() => setShowHelp(false)} maxWidth="820px">
        {/* ... unchanged help content ... */}
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>What this project does</h3>
            <p style={{ color: '#cbd5e1', marginTop: 6 }}>
              Create a graph (vertices + weighted edges), run Kruskal's algorithm to compute a Minimum Spanning Tree (MST), visualize each decision step, and export results.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );

  // Visualizer page
  const renderVisualizerPage = () => (
    <div className={`flex h-screen bg-slate-900 text-white transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex-1 flex flex-col">
        <div className="bg-slate-950 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white rounded"></div>
            </div>
            <h1 className="text-xl font-bold">Kruskal's Algorithm Visualizer</h1>
          </div>

          <div className="flex gap-3 items-center">
            <button onClick={downloadStepsWindow} style={{ background: '#0b1220', color: '#9fe6a0', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(160,255,180,0.06)', cursor: 'pointer' }} title="Open step-by-step Kruskal report and download CSV"><Download size={16} style={{ marginRight: 8 }} /> Download Steps</button>
            <button onClick={() => setShowLearn(true)} style={{ background: '#111827', color: '#fff', padding: '6px 10px', borderRadius: 6, border: 'none' }}>Learn</button>
            <button onClick={() => setShowDev(true)} style={{ background: '#111827', color: '#fff', padding: '6px 10px', borderRadius: 6, border: 'none' }}>Developed by</button>
            <button onClick={() => setShowHelp(true)} style={{ background: '#111827', color: '#fff', padding: '6px 10px', borderRadius: 6, border: 'none' }}>Help</button>
            <button onClick={() => setCurrentPage('builder')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-sm">Edit Graph</button>
          </div>
        </div>

        <div className="flex-1 flex p-4">
          <canvas ref={canvasRef} width={800} height={600} className="bg-slate-50 rounded shadow-xl w-full h-full" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        </div>

        <div className="bg-slate-950 border-t border-slate-800 px-6 py-4">
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => { setCurrentStep(0); setTick(t => t + 1); }} className="p-2 hover:bg-slate-800 rounded"><SkipBack size={20} /></button>
            <button onClick={stepBackward} disabled={currentStep === 0} className="p-2 hover:bg-slate-800 rounded disabled:opacity-30"><SkipBack size={20} className="rotate-180" /></button>
            <button onClick={() => setIsAnimating(!isAnimating)} className="p-4 bg-blue-600 hover:bg-blue-700 rounded-lg">{isAnimating ? <Pause size={24} /> : <Play size={24} />}</button>
            <button onClick={stepForward} disabled={currentStep >= algorithmSteps.length} className="p-2 hover:bg-slate-800 rounded disabled:opacity-30"><SkipForward size={20} /></button>
            <button onClick={resetAnimation} className="p-2 hover:bg-slate-800 rounded"><RotateCcw size={20} /></button>
          </div>
          <div className="text-center mt-3 text-xs text-slate-500">© Taniska Routray and Viswa Danuskka</div>
        </div>
      </div>

      <div className="w-80 bg-slate-950 border-l border-slate-800 p-4 overflow-y-auto">
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Algorithm Controls</h3>
          <div className="mb-3">
            <label className="block text-sm text-slate-400 mb-2">Animation Speed</label>
            <div className="flex items-center justify-between mb-1"><span className="text-xs text-slate-500">{animationSpeed.toFixed(1)}x</span></div>
            <input type="range" min="0.5" max="2" step="0.1" value={animationSpeed} onChange={(e) => setAnimationSpeed(Number(e.target.value))} className="w-full" />
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Algorithm Status</h3>
          <p className="text-sm text-slate-400 bg-slate-900 p-3 rounded leading-relaxed">{statusMessage}</p>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Sorted Edges</h3>
          <div className="space-y-2">
            {sortedEdges.map((edge, idx) => {
              const isInMST = mstEdges.some(e => e.id === edge.id);
              const isCurrent = algorithmSteps[currentStep - 1]?.edge?.id === edge.id;
              const isSkipped = algorithmSteps.some(s => s.edge.id === edge.id && !s.added && algorithmSteps.indexOf(s) < currentStep);

              let bgColor = 'bg-slate-900';
              let textColor = 'text-slate-400';

              if (isCurrent) { bgColor = 'bg-yellow-900/30'; textColor = 'text-yellow-400'; }
              else if (isInMST) { bgColor = 'bg-emerald-900/30'; textColor = 'text-emerald-400'; }
              else if (isSkipped) { bgColor = 'bg-red-900/30'; textColor = 'text-red-400'; }

              return (
                <div key={idx} className={`flex justify-between items-center ${bgColor} p-2 rounded text-sm`}>
                  <span className={textColor}>Edge: {edge.from}-{edge.to}</span>
                  <span className={textColor}>Weight: {edge.weight}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3">Total MST Weight:</h3>
          <div className="text-4xl font-bold text-blue-400">{mstEdges.reduce((sum, e) => sum + e.weight, 0)}</div>
        </div>

        <div className="mt-6">
          <button onClick={exportAsImage} className="w-full px-3 py-2 bg-slate-800 rounded mb-2">Export Image</button>
          <button onClick={exportAsCSV} className="w-full px-3 py-2 bg-slate-800 rounded mb-2">Export CSV</button>
          <button onClick={exportAsText} className="w-full px-3 py-2 bg-slate-800 rounded">Export Text</button>
        </div>
      </div>
    </div>
  );

  // Results page (unchanged)
  const renderResultsPage = () => (
    <div className={`min-h-screen bg-slate-900 text-white transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}>
      <div className="bg-slate-950 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white rounded"></div>
          </div>
          <h1 className="text-xl font-bold">Graph Algorithm Visualizer</h1>
        </div>
        <button onClick={() => setCurrentPage('visualizer')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm">Back to Visualizer</button>
      </div>

      <div className="max-w-6xl mx-auto p-8">
        <h1 className="text-4xl font-bold mb-8 text-center">Kruskal's Algorithm: Minimum Spanning Tree Results</h1>

        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-6">
            <h3 className="text-sm text-slate-400 mb-2">Total MST Cost</h3>
            <div className="text-5xl font-bold">{totalCost}</div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-6">
            <h3 className="text-sm text-slate-400 mb-2">Edges in MST</h3>
            <div className="text-5xl font-bold">{mstEdges.length}</div>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-6">
            <h3 className="text-sm text-slate-400 mb-2">Export Options</h3>
            <div className="flex gap-3 mt-4">
              <button onClick={exportAsImage} className="p-3 bg-slate-800 hover:bg-slate-700 rounded" title="Export as Image"><Download size={20} /></button>
              <button onClick={exportAsCSV} className="p-3 bg-slate-800 hover:bg-slate-700 rounded" title="Export as CSV"><FileText size={20} /></button>
              <button onClick={exportAsText} className="p-3 bg-slate-800 hover:bg-slate-700 rounded" title="Export as Text"><Download size={20} /></button>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
          <h2 className="text-2xl font-bold p-6 border-b border-slate-800">Minimum Spanning Tree Edges</h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">EDGE (U-V)</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">SOURCE (U)</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-slate-400">DESTINATION (V)</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold text-slate-400">WEIGHT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {mstEdges.map((edge, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/50">
                    <td className="px-6 py-4">{edge.from} - {edge.to}</td>
                    <td className="px-6 py-4">{edge.from}</td>
                    <td className="px-6 py-4">{edge.to}</td>
                    <td className="px-6 py-4 text-right font-semibold">{edge.weight}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-center mt-8 text-sm text-slate-500">© Taniska Routray and Viswa Danuskka</div>
      </div>
    </div>
  );

  return (
    <>
      {currentPage === 'builder' && renderBuilderPage()}
      {currentPage === 'visualizer' && renderVisualizerPage()}
      {currentPage === 'results' && renderResultsPage()}
    </>
  );
};

export default GraphVisualizer;
