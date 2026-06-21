import { Card } from '../core/cards';

export interface HandLayoutRow {
  cards: Card[];
  startIndex: number;
  cardWidth: number;
  cardHeight: number;
  spacing: number;
  y: number;
}

export function handSpreadHeightForCount(count: number, gameKey?: string): number {
  if (count <= 22) return 82;
  return gameKey === 'guandan' ? 108 : 104;
}

export function buildHandLayoutRows(
  cards: Card[],
  layoutWidth: number,
  layoutHeight = handSpreadHeightForCount(cards.length)
): HandLayoutRow[] {
  if (cards.length === 0) return [];

  const availableWidth = Math.max(1, layoutWidth);
  const availableHeight = Math.max(1, layoutHeight);
  const rows = splitHandRows(cards);
  const rowCount = rows.length;
  const maxRowCount = Math.max(1, ...rows.map((row) => row.length));
  const idealWidth = rowCount === 1 ? 50 : 46;
  const minWidth = rowCount === 1 ? 30 : 28;
  const widthScale = rowCount === 1 ? 2.1 : 1.95;
  const ratio = rowCount === 1 ? 1.44 : 1.36;
  const cardWidth = Math.min(idealWidth, Math.max(minWidth, (availableWidth / maxRowCount) * widthScale));
  const cardHeight = cardWidth * ratio;
  const yPositions = handRowYPositions(rowCount, availableHeight, cardHeight);

  let startIndex = 0;
  return rows.map((row, rowIndex) => {
    const rowStartIndex = startIndex;
    startIndex += row.length;
    return {
      cards: row,
      startIndex: rowStartIndex,
      cardWidth,
      cardHeight,
      spacing: handRowSpacing(availableWidth, cardWidth, row.length, rowCount),
      y: yPositions[rowIndex] ?? 0
    };
  });
}

export function handRowTotalWidth(row: Pick<HandLayoutRow, 'cards' | 'cardWidth' | 'spacing'>): number {
  return row.cardWidth + Math.max(0, row.cards.length - 1) * (row.cardWidth + row.spacing);
}

function splitHandRows(cards: Card[]): Card[][] {
  if (cards.length <= 22) return [cards];

  const firstRowCount = Math.ceil(cards.length / 2);
  return [cards.slice(0, firstRowCount), cards.slice(firstRowCount)];
}

function handRowYPositions(rowCount: number, height: number, cardHeight: number): number[] {
  if (rowCount === 1) {
    return [Math.max(0, height - cardHeight)];
  }

  const lowerY = Math.max(0, height - cardHeight);
  const rowStep = Math.min(cardHeight + 4, Math.max(cardHeight * 0.56, lowerY));
  return [Math.max(0, lowerY - rowStep), lowerY];
}

function handRowSpacing(width: number, cardWidth: number, rowCardCount: number, rowCount: number): number {
  if (rowCardCount <= 1) return 0;

  const visibleStep = (width - cardWidth) / (rowCardCount - 1);
  const exactFitSpacing = visibleStep - cardWidth;
  const iosMinSpacing = rowCount === 1 ? -24 : -18;
  const iosSpacing = Math.min(3, Math.max(iosMinSpacing, exactFitSpacing));
  const iosTotalWidth = cardWidth + (rowCardCount - 1) * (cardWidth + iosSpacing);
  return iosTotalWidth > width ? exactFitSpacing : iosSpacing;
}
