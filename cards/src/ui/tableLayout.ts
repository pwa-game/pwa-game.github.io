export interface FanMetrics {
  cardWidth: number;
  cardHeight: number;
  spacing: number;
}

export interface RevealedHandLayout {
  cardWidth: number;
  cardHeight: number;
  rows: Array<{
    startIndex: number;
    count: number;
    y: number;
    spacing: number;
  }>;
}

export function playedCardsFanMetrics(width: number, count: number): FanMetrics {
  if (count <= 0) return { cardWidth: 34, cardHeight: 48, spacing: 0 };
  const cardWidth = Math.min(36, Math.max(22, (width / count) * 1.75));
  const cardHeight = cardWidth * 1.38;
  if (count === 1) return { cardWidth, cardHeight, spacing: 0 };
  const visibleStep = (width - cardWidth) / (count - 1);
  return {
    cardWidth,
    cardHeight,
    spacing: Math.min(2, Math.max(-18, visibleStep - cardWidth))
  };
}

export function fanTotalWidth(metrics: FanMetrics, count: number): number {
  if (count <= 0) return 0;
  return metrics.cardWidth + Math.max(0, count - 1) * (metrics.cardWidth + metrics.spacing);
}

export function revealedHandLayout(width: number, height: number, count: number): RevealedHandLayout {
  if (count <= 0) return { cardWidth: 28, cardHeight: 38, rows: [] };
  const rowCount = count > 34 ? 3 : count > 16 ? 2 : 1;
  const cardsPerRow = Math.ceil(count / rowCount);
  const cardWidth = Math.min(30, Math.max(18, (width / Math.max(cardsPerRow, 1)) * 1.72));
  const cardHeight = cardWidth * 1.38;
  const availableHeight = Math.max(0, height - 17);
  const rowStep = rowCount === 1 ? 0 : Math.min(cardHeight + 2, Math.max(cardHeight * 0.52, availableHeight / rowCount));
  const rows: RevealedHandLayout['rows'] = [];
  let startIndex = 0;

  for (let rowIndex = 0; rowIndex < rowCount && startIndex < count; rowIndex += 1) {
    const rowCardCount = Math.min(cardsPerRow, count - startIndex);
    rows.push({
      startIndex,
      count: rowCardCount,
      y: rowIndex * rowStep,
      spacing: revealedRowSpacing(width, cardWidth, rowCardCount)
    });
    startIndex += rowCardCount;
  }

  return { cardWidth, cardHeight, rows };
}

export function slotWidthForSeat(index: number, seatCount: number, viewportWidth: number): number {
  const tableWidth = Math.max(320, viewportWidth - 32);
  if (index === 0) return Math.min(300, tableWidth * 0.48);
  if (seatCount === 4 && index === 2) return Math.min(260, tableWidth * 0.42);
  return Math.min(238, tableWidth * 0.34);
}

export function slotContentWidth(slotWidth: number, hasHorizontalPadding: boolean): number {
  return Math.max(1, slotWidth - (hasHorizontalPadding ? 12 : 0));
}

function revealedRowSpacing(width: number, cardWidth: number, count: number): number {
  if (count <= 1) return 0;
  const visibleStep = (width - cardWidth) / (count - 1);
  return Math.min(2, Math.max(-24, visibleStep - cardWidth));
}
