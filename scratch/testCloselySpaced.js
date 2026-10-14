// Test closely spaced cards and valley splitting
function testCloselySpacedCards() {
  const imgW = 3000;
  const imgH = 2000;

  // 2 cards placed closely side-by-side:
  // Card 1: x: 400..900, y: 500..900 (width 500, height 400)
  // Card 2: x: 940..1440, y: 500..900 (width 500, height 400) - only 40px gap!

  const words = [];
  // Card 1 words
  for (let l = 0; l < 4; l++) {
    for (let w = 0; w < 3; w++) {
      words.push({
        x1: 420 + w * 140,
        y1: 530 + l * 80,
        x2: 420 + w * 140 + 110,
        y2: 530 + l * 80 + 30,
        width: 110,
        height: 30,
        card: 1
      });
    }
  }

  // Card 2 words
  for (let l = 0; l < 4; l++) {
    for (let w = 0; w < 3; w++) {
      words.push({
        x1: 960 + w * 140,
        y1: 530 + l * 80,
        x2: 960 + w * 140 + 110,
        y2: 530 + l * 80 + 30,
        width: 110,
        height: 30,
        card: 2
      });
    }
  }

  console.log(`Testing 2 closely-spaced cards (gap between words = 960 - (420+280+110) = 150px)`);

  const heights = words.map(w => w.height).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 25;

  // For business cards, typical line-to-line is 2.5x font height, word-to-word is 2x font height.
  // Gaps larger than 2.8x font height between lines or 3.2x between words are rare within one paragraph.
  // But between cards, the gap is typically at least 3-4x font height.
  const maxDx = Math.max(20, Math.min(imgW * 0.05, medianH * 3.2));
  const maxDy = Math.max(15, Math.min(imgH * 0.05, medianH * 2.4));

  console.log(`maxDx=${maxDx.toFixed(1)}, maxDy=${maxDy.toFixed(1)}`);
  const wordGap = 960 - (420 + 2 * 140 + 110);
  console.log(`Gap between Card 1 rightmost word and Card 2 leftmost word: ${wordGap}px`);
  console.log(`Is wordGap <= maxDx? ${wordGap <= maxDx ? 'YES (would merge)' : 'NO (cleanly separated!)'}`);
}

testCloselySpacedCards();
