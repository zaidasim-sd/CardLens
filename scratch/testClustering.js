// Test script to verify the clustering logic
function testClustering() {
  const imgW = 3000;
  const imgH = 2000;

  // Simulate 6 cards placed in 2 rows of 3:
  // Card 1: x: 200..800, y: 150..650
  // Card 2: x: 1100..1700, y: 150..650
  // Card 3: x: 2000..2600, y: 150..650
  // Card 4: x: 200..800, y: 1000..1500
  // Card 5: x: 1100..1700, y: 1000..1500
  // Card 6: x: 2000..2600, y: 1000..1500

  const cardDefs = [
    { x: 200, y: 150, w: 600, h: 500 },
    { x: 1100, y: 150, w: 600, h: 500 },
    { x: 2000, y: 150, w: 600, h: 500 },
    { x: 200, y: 1000, w: 600, h: 500 },
    { x: 1100, y: 1000, w: 600, h: 500 },
    { x: 2000, y: 1000, w: 600, h: 500 },
  ];

  // Generate words on each card
  const words = [];
  cardDefs.forEach((card, cardIdx) => {
    // 5 lines of text on each card
    for (let line = 0; line < 5; line++) {
      const lineY = card.y + 60 + line * 70;
      // 3 words per line
      for (let w = 0; w < 3; w++) {
        const wordX = card.x + 50 + w * 160;
        words.push({
          x1: wordX,
          y1: lineY,
          x2: wordX + 130,
          y2: lineY + 35,
          width: 130,
          height: 35,
          cx: wordX + 65,
          cy: lineY + 17.5,
          cardIdx,
        });
      }
    }
  });

  console.log(`Generated ${words.length} simulated words across ${cardDefs.length} cards.`);

  // Median word height
  const heights = words.map(w => w.height).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 25;

  const maxDx = Math.max(25, Math.min(imgW * 0.08, medianH * 3.8));
  const maxDy = Math.max(18, Math.min(imgH * 0.08, medianH * 2.8));
  const maxCardW = imgW * 0.45;
  const maxCardH = imgH * 0.45;
  const maxCardArea = (imgW * imgH) * 0.22;

  console.log(`Clustering params: maxDx=${maxDx.toFixed(1)}, maxDy=${maxDy.toFixed(1)}, maxCardW=${maxCardW}, maxCardH=${maxCardH}`);

  // Disjoint set with box tracking
  const n = words.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const clusterBoxes = words.map(w => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, count: 1 }));

  function find(i) {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }

  function tryUnion(i, j) {
    const ra = find(i);
    const rb = find(j);
    if (ra === rb) return;

    const bA = clusterBoxes[ra];
    const bB = clusterBoxes[rb];

    // Candidate merged box
    const nx1 = Math.min(bA.x1, bB.x1);
    const ny1 = Math.min(bA.y1, bB.y1);
    const nx2 = Math.max(bA.x2, bB.x2);
    const ny2 = Math.max(bA.y2, bB.y2);
    const nw = nx2 - nx1;
    const nh = ny2 - ny1;
    const narea = nw * nh;

    // Strict constraint: Merged box CANNOT exceed single-card physical limits!
    if (nw > maxCardW || nh > maxCardH || narea > maxCardArea) {
      return; // DO NOT MERGE! They belong to different cards!
    }

    // Merge rb into ra
    parent[rb] = ra;
    clusterBoxes[ra] = { x1: nx1, y1: ny1, x2: nx2, y2: ny2, count: bA.count + bB.count };
  }

  // Iterate all pairs
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = words[i];
      const b = words[j];
      const dx = Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2));
      const dy = Math.max(0, Math.max(a.y1, b.y1) - Math.min(a.y2, b.y2));

      if (dx <= maxDx && dy <= maxDy) {
        tryUnion(i, j);
      }
    }
  }

  // Collect clusters
  const finalClusters = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!finalClusters.has(r)) {
      finalClusters.set(r, clusterBoxes[r]);
    }
  }

  console.log(`Detected clusters count: ${finalClusters.size}`);
  let idx = 1;
  for (const [root, box] of finalClusters.entries()) {
    console.log(` Card ${idx++}: [${box.x1}, ${box.y1}, ${box.x2 - box.x1} x ${box.y2 - box.y1}], wordCount=${box.count}`);
  }
}

testClustering();
