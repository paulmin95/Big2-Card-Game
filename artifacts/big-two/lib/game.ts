export type Card = {
  rank: number;
  suit: number;
};

export type ComboKind =
  | 'single'
  | 'pair'
  | 'triple'
  | 'straight'
  | 'flush'
  | 'full house'
  | 'four of a kind'
  | 'straight flush';

export type Combo = {
  kind: ComboKind;
  size: number;
  power: number;
};

export type Play = {
  player: number;
  cards: Card[];
  combo: Combo;
};

export type GameState = {
  hands: Card[][];
  turn: number;
  lastPlay: Play | null;
  plays: Play[];
  passes: number;
  openingPending: boolean;
  winner: number | null;
  message: string;
  turnCount: number;
};

export type Stats = {
  wins: number;
  hands: number;
};

export type GameMode = 'solo' | 'pass-and-play';

export type HandRecord = {
  handNumber: number;
  winner: number;
  plays: Play[];
  playerNames: string[];
  mode: GameMode;
};

export type StoredMatch = {
  game: GameState;
  stats: Stats;
  rankSort: boolean;
  mode: GameMode;
  playerNames: string[];
  handHistory: HandRecord[];
  revealedPlayer: number | null;
  soundEnabled: boolean;
};

export const RANKS = [
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
  '2',
] as const;

export const SUITS = ['♦', '♣', '♥', '♠'] as const;
export const DEFAULT_PLAYER_NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'] as const;
const OPENING_CARD: Card = { rank: 0, suit: 0 };

export function playerLabel(index: number): string {
  return `Player ${index + 1}`;
}

export function cardKey(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

export function cardLabel(card: Card): string {
  const suitNames = ['diamonds', 'clubs', 'hearts', 'spades'];
  return `${RANKS[card.rank]} of ${suitNames[card.suit]}`;
}

export function compareCards(a: Card, b: Card): number {
  return a.rank - b.rank || a.suit - b.suit;
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort(compareCards);
}

function highestCard(cards: Card[]): Card {
  return [...cards].sort(compareCards).at(-1)!;
}

function makePower(tier: number, rank: number, suit: number): number {
  return tier * 100_000 + rank * 4 + suit;
}

export function getCombo(cards: Card[]): Combo | null {
  if (![1, 2, 3, 5].includes(cards.length)) return null;
  if (new Set(cards.map(cardKey)).size !== cards.length) return null;

  const ranks = cards.map((card) => card.rank).sort((a, b) => a - b);
  const rankCounts = new Map<number, number>();
  for (const rank of ranks) rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);

  if (cards.length === 1) {
    const card = cards[0]!;
    return { kind: 'single', size: 1, power: card.rank * 4 + card.suit };
  }

  if (cards.length === 2 && rankCounts.size === 1) {
    const high = highestCard(cards);
    return { kind: 'pair', size: 2, power: high.rank * 4 + high.suit };
  }

  if (cards.length === 3 && rankCounts.size === 1) {
    const high = highestCard(cards);
    return { kind: 'triple', size: 3, power: high.rank * 4 + high.suit };
  }

  if (cards.length !== 5) return null;

  const flush = cards.every((card) => card.suit === cards[0]!.suit);
  const straight = ranks.every(
    (rank, index) => index === 0 || rank === ranks[index - 1]! + 1,
  );
  const high = highestCard(cards);

  if (straight && flush) {
    return { kind: 'straight flush', size: 5, power: makePower(5, high.rank, high.suit) };
  }

  const fourRank = [...rankCounts.entries()].find(([, count]) => count === 4)?.[0];
  if (fourRank !== undefined) {
    const highSuit = Math.max(...cards.filter((card) => card.rank === fourRank).map((card) => card.suit));
    return {
      kind: 'four of a kind',
      size: 5,
      power: makePower(4, fourRank, highSuit),
    };
  }

  const tripleRank = [...rankCounts.entries()].find(([, count]) => count === 3)?.[0];
  const hasPair = [...rankCounts.values()].some((count) => count === 2);
  if (tripleRank !== undefined && hasPair) {
    const highSuit = Math.max(...cards.filter((card) => card.rank === tripleRank).map((card) => card.suit));
    return { kind: 'full house', size: 5, power: makePower(3, tripleRank, highSuit) };
  }

  if (flush) {
    return { kind: 'flush', size: 5, power: makePower(2, high.rank, high.suit) };
  }

  if (straight) {
    return { kind: 'straight', size: 5, power: makePower(1, high.rank, high.suit) };
  }

  return null;
}

export function validatePlay(
  cards: Card[],
  lastPlay: Play | null,
  openingPending: boolean,
): string | null {
  const combo = getCombo(cards);
  if (!combo) return 'Choose a single, pair, triple, or valid five-card hand.';

  if (openingPending && !cards.some((card) => cardKey(card) === cardKey(OPENING_CARD))) {
    return 'The opening play must include the 3 of diamonds.';
  }

  if (!lastPlay) return null;
  if (combo.size !== lastPlay.combo.size) {
    return `Play ${lastPlay.combo.size} card${lastPlay.combo.size === 1 ? '' : 's'} to beat that hand.`;
  }
  if (combo.power <= lastPlay.combo.power) return 'That hand does not beat the cards on the table.';
  return null;
}

export function describeCombo(combo: Combo): string {
  return combo.kind;
}

function allCombinations(cards: Card[], size: number): Card[][] {
  const result: Card[][] = [];
  const current: Card[] = [];

  function visit(start: number): void {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    const remaining = size - current.length;
    for (let index = start; index <= cards.length - remaining; index += 1) {
      current.push(cards[index]!);
      visit(index + 1);
      current.pop();
    }
  }

  visit(0);
  return result;
}

function possiblePlays(hand: Card[], size?: number): Array<{ cards: Card[]; combo: Combo }> {
  const sizes = size === undefined ? [1, 2, 3, 5] : [size];
  return sizes.flatMap((cardCount) =>
    allCombinations(hand, cardCount)
      .map((cards) => ({ cards, combo: getCombo(cards) }))
      .filter(
        (play): play is { cards: Card[]; combo: Combo } => play.combo !== null,
      ),
  );
}

export function newGame(): GameState {
  const deck: Card[] = [];
  for (let rank = 0; rank < 13; rank += 1) {
    for (let suit = 0; suit < 4; suit += 1) deck.push({ rank, suit });
  }

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
  }

  const hands = [[], [], [], []] as Card[][];
  deck.forEach((card, index) => hands[index % 4]!.push(card));
  for (let index = 1; index < hands.length; index += 1) {
    hands[index] = sortCards(hands[index]!);
  }

  const turn = hands.findIndex((hand) =>
    hand.some((card) => cardKey(card) === cardKey(OPENING_CARD)),
  );

  return {
    hands,
    turn,
    lastPlay: null,
    passes: 0,
    openingPending: true,
    winner: null,
    message: turn === 0 ? 'You have the 3 of diamonds. Make the opening play.' : `${playerLabel(turn)} has the 3 of diamonds.`,
    turnCount: 0,
    plays: [],
  };
}

function recordPlay(state: GameState, player: number, cards: Card[], combo: Combo): GameState {
  const playedKeys = new Set(cards.map(cardKey));
  const hands = state.hands.map((hand, index) =>
    index === player ? hand.filter((card) => !playedKeys.has(cardKey(card))) : hand,
  );
  const winner = hands[player]!.length === 0 ? player : null;
  const nextPlayer = (player + 1) % 4;
  const play = { player, cards: sortCards(cards), combo };

  return {
    ...state,
    hands,
    turn: nextPlayer,
    lastPlay: play,
    plays: [...state.plays, play],
    passes: 0,
    openingPending: false,
    winner,
    message: winner !== null
      ? player === 0
        ? 'You win the hand.'
        : `${playerLabel(player)} wins the hand.`
      : `${playerLabel(player)} played ${combo.kind}.`,
    turnCount: state.turnCount + 1,
  };
}

export function playCards(state: GameState, cards: Card[]): GameState {
  if (state.winner !== null || state.turn < 0 || state.turn > 3) return state;
  const error = validatePlay(cards, state.lastPlay, state.openingPending);
  const combo = getCombo(cards);
  if (error || !combo) return state;
  if (cards.some((card) => !state.hands[state.turn]!.some((held) => cardKey(held) === cardKey(card)))) {
    return state;
  }
  return recordPlay(state, state.turn, cards, combo);
}

export function passTurn(state: GameState): GameState {
  if (state.winner !== null || !state.lastPlay) return state;

  const passes = state.passes + 1;
  if (passes === 3) {
    const nextLeader = state.lastPlay.player;
    return {
      ...state,
      turn: nextLeader,
      lastPlay: null,
      passes: 0,
      message: `Table cleared. ${playerLabel(nextLeader)} leads.`,
      turnCount: state.turnCount + 1,
    };
  }

  const nextPlayer = (state.turn + 1) % 4;
  return {
    ...state,
    turn: nextPlayer,
    passes,
    message: `${playerLabel(state.turn)} passed.`,
    turnCount: state.turnCount + 1,
  };
}

export function computerTurn(state: GameState): GameState {
  if (state.turn === 0 || state.winner !== null) return state;
  const hand = state.hands[state.turn]!;
  const options = possiblePlays(hand, state.lastPlay?.combo.size);

  if (state.lastPlay) {
    const responses = options
      .filter(
        ({ combo }) =>
          combo.size === state.lastPlay!.combo.size &&
          combo.power > state.lastPlay!.combo.power,
      )
      .sort((a, b) => a.combo.power - b.combo.power);

    if (responses.length === 0) return passTurn(state);
    const best = responses[0]!;
    return recordPlay(state, state.turn, best.cards, best.combo);
  }

  const leads = options
    .filter(({ cards }) =>
      !state.openingPending ||
      cards.some((card) => cardKey(card) === cardKey(OPENING_CARD)),
    )
    .map((play) => ({ ...play, leadCost: scoreLead(hand, play.cards, play.combo) }))
    .sort((a, b) => a.leadCost - b.leadCost || a.combo.power - b.combo.power);

  if (leads.length === 0) return state;
  const bestCost = leads[0]!.leadCost;
  const goodLeads = leads.filter((play) => play.leadCost <= bestCost + 1.25);
  const chosen = goodLeads[Math.floor(Math.random() * goodLeads.length)]!;
  return recordPlay(state, state.turn, chosen.cards, chosen.combo);
}

function scoreLead(hand: Card[], cards: Card[], combo: Combo): number {
  const rankCounts = new Map<number, number>();
  for (const card of hand) rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);

  const playedCounts = new Map<number, number>();
  for (const card of cards) playedCounts.set(card.rank, (playedCounts.get(card.rank) ?? 0) + 1);

  const sizeCost: Record<number, number> = { 1: 0, 2: 4, 3: 13, 5: 18 };
  let score = (sizeCost[combo.size] ?? 30) - combo.size * 1.7;
  score += cards.reduce((sum, card) => sum + card.rank * 0.32, 0);
  score += Math.max(...cards.map((card) => card.rank)) * 0.38;

  for (const [rank, groupSize] of rankCounts) {
    if (groupSize < 2) continue;
    const played = playedCounts.get(rank) ?? 0;
    if (played === 0) continue;

    if (played === groupSize) {
      const premium = Math.max(0, rank - 7);
      score += groupSize === 3 ? 5 + premium * 4 : 3 + premium * 2;
    } else {
      score += groupSize === 3 ? 5 : 2;
    }
  }

  return score;
}

export function isValidStoredMatch(value: unknown): value is StoredMatch {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredMatch>;
  const game = candidate.game;
  const stats = candidate.stats;
  const validCard = (card: unknown): card is Card =>
    !!card &&
    typeof card === 'object' &&
    Number.isInteger((card as Card).rank) &&
    (card as Card).rank >= 0 &&
    (card as Card).rank <= 12 &&
    Number.isInteger((card as Card).suit) &&
    (card as Card).suit >= 0 &&
    (card as Card).suit <= 3;

  if (!game || !stats || !Array.isArray(game.hands) || game.hands.length !== 4) return false;
  if (!game.hands.every((hand) => Array.isArray(hand) && hand.every(validCard))) return false;
  if (!Number.isInteger(game.turn) || game.turn < 0 || game.turn > 3) return false;
  if (game.lastPlay !== null && game.lastPlay !== undefined) {
    if (
      !game.lastPlay ||
      !Number.isInteger(game.lastPlay.player) ||
      game.lastPlay.player < 0 ||
      game.lastPlay.player > 3 ||
      !Array.isArray(game.lastPlay.cards) ||
      !game.lastPlay.cards.every(validCard) ||
      !getCombo(game.lastPlay.cards)
    ) {
      return false;
    }
  }
  const validPlay = (play: unknown): play is Play => {
    if (!play || typeof play !== 'object') return false;
    const item = play as Play;
    return (
      Number.isInteger(item.player) &&
      item.player >= 0 &&
      item.player <= 3 &&
      Array.isArray(item.cards) &&
      item.cards.every(validCard) &&
      getCombo(item.cards) !== null
    );
  };
  const optionalArraysValid =
    (candidate.handHistory === undefined ||
      (Array.isArray(candidate.handHistory) &&
        candidate.handHistory.every((record) => {
          if (!record || typeof record !== 'object') return false;
          const item = record as HandRecord;
          return (
            Number.isInteger(item.handNumber) &&
            item.handNumber > 0 &&
            Number.isInteger(item.winner) &&
            item.winner >= 0 &&
            item.winner <= 3 &&
            Array.isArray(item.plays) &&
            item.plays.every(validPlay) &&
            Array.isArray(item.playerNames) &&
            item.playerNames.length === 4 &&
            item.playerNames.every((name) => typeof name === 'string') &&
            (item.mode === 'solo' || item.mode === 'pass-and-play')
          );
        }))) &&
    (game.plays === undefined ||
      (Array.isArray(game.plays) && game.plays.every(validPlay))) &&
    (candidate.mode === undefined ||
      candidate.mode === 'solo' ||
      candidate.mode === 'pass-and-play') &&
    (candidate.playerNames === undefined ||
      (Array.isArray(candidate.playerNames) &&
        candidate.playerNames.length === 4 &&
        candidate.playerNames.every((name) => typeof name === 'string'))) &&
    (candidate.revealedPlayer === undefined ||
      candidate.revealedPlayer === null ||
      (Number.isInteger(candidate.revealedPlayer) &&
        candidate.revealedPlayer >= 0 &&
        candidate.revealedPlayer <= 3)) &&
    (candidate.soundEnabled === undefined || typeof candidate.soundEnabled === 'boolean');

  return (
    optionalArraysValid &&
    Number.isInteger(game.passes) &&
    game.passes >= 0 &&
    game.passes <= 2 &&
    typeof game.openingPending === 'boolean' &&
    (game.winner === null ||
      (Number.isInteger(game.winner) && game.winner >= 0 && game.winner <= 3)) &&
    Number.isInteger(game.turnCount) &&
    game.turnCount >= 0 &&
    typeof game.message === 'string' &&
    Number.isInteger(stats.wins) &&
    stats.wins >= 0 &&
    Number.isInteger(stats.hands) &&
    stats.hands >= 0 &&
    typeof candidate.rankSort === 'boolean'
  );
}