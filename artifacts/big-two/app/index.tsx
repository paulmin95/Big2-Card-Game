import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PlayedHandMotion } from '@/components/PlayedHandMotion';
import { PlayerSeat } from '@/components/PlayerSeat';
import { useColors } from '@/hooks/useColors';
import {
  Card,
  DEFAULT_PLAYER_NAMES,
  HandRecord,
  GameMode,
  GameState,
  RANKS,
  SUITS,
  StoredMatch,
  cardKey,
  cardLabel,
  computerTurn,
  describeCombo,
  isValidStoredMatch,
  newGame,
  passTurn,
  playerLabel,
  playCards,
  sortCards,
  validatePlay,
} from '@/lib/game';
import { useGameAudio } from '@/lib/game-audio';

const SAVE_KEY = 'big-two:local-match:v1';

function finishMatch(previous: StoredMatch, game: GameState): StoredMatch {
  const justFinished = previous.game.winner === null && game.winner !== null;
  if (!justFinished) return { ...previous, game };

  return {
    ...previous,
    game,
    handHistory: [
      ...previous.handHistory,
      {
        handNumber: previous.stats.hands + 1,
        winner: game.winner!,
        plays: game.plays,
        playerNames: [...previous.playerNames],
        mode: previous.mode,
      },
    ].slice(-50),
    stats: {
      wins: previous.stats.wins + (game.winner === 0 ? 1 : 0),
      hands: previous.stats.hands + 1,
    },
  };
}

function createStoredMatch(): StoredMatch {
  return {
    game: newGame(),
    stats: { wins: 0, hands: 0 },
    rankSort: false,
    mode: 'solo',
    playerNames: [...DEFAULT_PLAYER_NAMES],
    handHistory: [],
    revealedPlayer: null,
    soundEnabled: true,
  };
}

function normalizeStoredMatch(saved: StoredMatch): StoredMatch {
  return {
    ...saved,
    game: { ...saved.game, plays: saved.game.plays ?? [] },
    mode: saved.mode ?? 'solo',
    playerNames: saved.playerNames ?? [...DEFAULT_PLAYER_NAMES],
    handHistory: saved.handHistory ?? [],
    revealedPlayer: null,
    soundEnabled: saved.soundEnabled ?? true,
  };
}

function displayName(match: StoredMatch, player: number): string {
  if (match.mode === 'solo') {
    return player === 0 ? 'You' : DEFAULT_PLAYER_NAMES[player] ?? playerLabel(player);
  }
  return match.playerNames[player]?.trim() || playerLabel(player);
}

function displayRecordName(record: HandRecord, player: number): string {
  if (record.mode === 'solo') {
    return player === 0 ? 'You' : DEFAULT_PLAYER_NAMES[player] ?? playerLabel(player);
  }
  return record.playerNames[player]?.trim() || playerLabel(player);
}

function compactCards(cards: Card[]): string {
  return sortCards(cards)
    .map((card) => `${RANKS[card.rank]}${SUITS[card.suit]}`)
    .join('  ');
}

function CardFace({
  card,
  width,
  height,
  selected = false,
  disabled = false,
  onPress,
  testID,
}: {
  card: Card;
  width: number;
  height: number;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const redSuit = card.suit === 0 || card.suit === 2;
  const ink = redSuit ? colors.destructive : '#183126';
  const isHandCard = !!onPress;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cardLabel(card)}
      accessibilityState={{ selected, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.cardFace,
        {
          width,
          height,
          borderColor: selected ? colors.primary : '#E8E2D4',
          backgroundColor: '#FAF7EE',
          transform: selected ? [{ translateY: -12 }] : undefined,
          zIndex: selected ? 30 : undefined,
          opacity: pressed ? 0.82 : disabled && isHandCard ? 0.78 : 1,
        },
      ]}
    >
      <View style={styles.cardCorner}>
        <Text style={[styles.cardRank, { color: ink, fontSize: width * 0.23 }]}>
          {RANKS[card.rank]}
        </Text>
        <Text style={[styles.cardSuitSmall, { color: ink, fontSize: width * 0.2 }]}>
          {SUITS[card.suit]}
        </Text>
      </View>
      <Text style={[styles.cardSuitLarge, { color: ink, fontSize: width * 0.44 }]}>
        {SUITS[card.suit]}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled = false,
  primary = false,
  testID,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.actionButton,
        {
          backgroundColor: primary ? colors.primary : colors.secondary,
          borderColor: primary ? colors.primary : colors.border,
          opacity: disabled ? 0.42 : pressed ? 0.78 : 1,
        },
      ]}
    >
      <Feather
        name={icon}
        size={17}
        color={primary ? colors.primaryForeground : colors.foreground}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.actionText,
          { color: primary ? colors.primaryForeground : colors.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function InfoModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.modalBackdrop,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 20),
            paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 20),
          },
        ]}
      >
        <View style={[styles.modalPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={12}
              testID="modal-close"
              style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.65 : 1 }]}
            >
              <Feather name="x" size={21} color={colors.foreground} />
            </Pressable>
          </View>
          <KeyboardAwareScrollViewCompat
            bottomOffset={24}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
            contentContainerStyle={{ paddingBottom: 6 }}
          >
            {children}
          </KeyboardAwareScrollViewCompat>
        </View>
      </View>
    </Modal>
  );
}

export default function GameScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { playDeal, playHand } = useGameAudio();
  const [match, setMatch] = useState<StoredMatch | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [modal, setModal] = useState<'rules' | 'new-hand' | 'history' | 'settings' | null>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [freshDealPending, setFreshDealPending] = useState(false);
  const handWidth = windowWidth - 36;
  const compactHeader = windowWidth < 360;
  const cardWidth = Math.max(36, Math.min(49, handWidth / 7.45));
  const cardStep = (handWidth - cardWidth) / 12;
  const tableSize = Math.max(260, Math.min(handWidth, windowHeight * 0.42, 400));
  const sideSeatWidth = Math.min(94, tableSize * 0.25);
  const edgeSeatWidth = Math.min(148, tableSize * 0.42);
  const tableCardWidth = Math.max(
    27,
    Math.min(40, (tableSize - sideSeatWidth * 2 - 16) / 5 + 7),
  );

  useEffect(() => {
    let active = true;
    async function loadMatch(): Promise<void> {
      try {
        const raw = await AsyncStorage.getItem(SAVE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (active && isValidStoredMatch(parsed)) {
          setMatch(normalizeStoredMatch(parsed));
        } else if (active) {
          setMatch(createStoredMatch());
          setFreshDealPending(true);
        }
      } catch {
        if (active) {
          setMatch(createStoredMatch());
          setFreshDealPending(true);
        }
      } finally {
        if (active) setHydrated(true);
      }
    }
    void loadMatch();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !match) return;
    void AsyncStorage.setItem(SAVE_KEY, JSON.stringify(match)).catch(() => {
      setValidationMessage('This hand could not be saved on this device.');
    });
  }, [hydrated, match]);

  useEffect(() => {
    if (!hydrated || !freshDealPending || !match) return;
    if (match.soundEnabled) playDeal();
    setFreshDealPending(false);
  }, [freshDealPending, hydrated, match, playDeal]);

  useEffect(() => {
    if (!hydrated || !match) return;
    const { game } = match;
    if (match.mode !== 'solo' || game.turn === 0 || game.winner !== null) return;

    const timer = setTimeout(() => {
      setValidationMessage('');
      const nextGame = computerTurn(game);
      if (
        match.soundEnabled &&
        nextGame.plays.length > game.plays.length &&
        nextGame.lastPlay
      ) {
        playHand(nextGame.lastPlay.cards.length);
      }
      setMatch((current) =>
        current &&
        current.mode === 'solo' &&
        current.game.turn === game.turn &&
        current.game.turnCount === game.turnCount
          ? finishMatch(current, nextGame)
          : current,
      );
    }, 1420);

    return () => clearTimeout(timer);
  }, [hydrated, match, playHand]);

  const game = match?.game;
  const activePlayer = game && match?.mode === 'pass-and-play' ? game.turn : 0;
  const humanTurn = !!game && (match?.mode === 'pass-and-play' || game.turn === 0);
  const handRevealed = !!match && !!game && (
    match.mode === 'solo' || match.revealedPlayer === game.turn
  );
  const canInteract = !!game && humanTurn && handRevealed && game.winner === null;
  const hand = game?.hands[activePlayer] ?? [];
  const displayedHand = useMemo(() => {
    if (!match) return [];
    return match.rankSort ? sortCards(hand) : hand;
  }, [hand, match?.rankSort]);
  const selectedCards = useMemo(
    () => displayedHand.filter((card) => selectedKeys.includes(cardKey(card))),
    [displayedHand, selectedKeys],
  );

  const toggleCard = (card: Card): void => {
    if (!canInteract) return;
    const key = cardKey(card);
    setValidationMessage('');
    void Haptics.selectionAsync();
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const submitPlay = (): void => {
    if (!match || !canInteract) return;
    const error = validatePlay(selectedCards, game!.lastPlay, game!.openingPending);
    if (error) {
      setValidationMessage(error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setValidationMessage('');
    setSelectedKeys([]);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (match.soundEnabled) playHand(selectedCards.length);
    setMatch((current) => {
      if (
        !current ||
        current.game.turn !== game!.turn ||
        current.game.turnCount !== game!.turnCount
      ) {
        return current;
      }
      const next = finishMatch(current, playCards(current.game, selectedCards));
      return current.mode === 'pass-and-play' ? { ...next, revealedPlayer: null } : next;
    });
  };

  const submitPass = (): void => {
    if (!match || !canInteract || !game!.lastPlay) return;
    setSelectedKeys([]);
    setValidationMessage('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMatch((current) => {
      if (
        !current ||
        current.game.turn !== game!.turn ||
        current.game.turnCount !== game!.turnCount
      ) {
        return current;
      }
      const next = finishMatch(current, passTurn(current.game));
      return current.mode === 'pass-and-play' ? { ...next, revealedPlayer: null } : next;
    });
  };

  const toggleSort = (): void => {
    if (!match || !canInteract) return;
    setMatch((current) => current ? { ...current, rankSort: !current.rankSort } : current);
    void Haptics.selectionAsync();
  };

  const revealHand = (): void => {
    if (!game || !match || match.mode !== 'pass-and-play' || game.winner !== null) return;
    setSelectedKeys([]);
    setValidationMessage('');
    setMatch((current) => current ? { ...current, revealedPlayer: current.game.turn } : current);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const confirmNewHand = (): void => {
    setModal(null);
    setSelectedKeys([]);
    setValidationMessage('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (match?.soundEnabled) playDeal();
    setMatch((current) =>
      current
        ? {
            ...current,
            game: newGame(),
            rankSort: false,
            revealedPlayer: null,
          }
        : current,
    );
  };

  const changeMode = (mode: GameMode): void => {
    setSelectedKeys([]);
    setValidationMessage('');
    setMatch((current) =>
      current ? { ...current, mode, revealedPlayer: null } : current,
    );
  };

  const changePlayerName = (player: number, name: string): void => {
    setMatch((current) =>
      current
        ? {
            ...current,
            playerNames: current.playerNames.map((currentName, index) =>
              index === player ? name : currentName,
            ),
          }
        : current,
    );
  };

  const toggleSound = (): void => {
    setMatch((current) => current ? { ...current, soundEnabled: !current.soundEnabled } : current);
    void Haptics.selectionAsync();
  };

  if (!hydrated || !match || !game) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Shuffling the deck</Text>
      </View>
    );
  }

  const winner = game.winner;
  const activeName = displayName(match, game.turn);
  const currentStatus = winner !== null || humanTurn;
  const statusText = winner !== null
    ? `${displayName(match, winner)} cleared their hand first.`
    : match.mode === 'pass-and-play'
      ? !handRevealed
        ? `Pass the device to ${activeName}, then reveal their hand.`
        : game.openingPending
          ? `${activeName}: open with the 3 of diamonds.`
          : game.lastPlay
            ? `${activeName}: beat ${displayName(match, game.lastPlay.player)} or pass.`
            : `${activeName}: lead a new trick.`
      : game.turn === 0
        ? game.openingPending
          ? 'Open with the 3 of diamonds.'
          : game.lastPlay
            ? `Beat ${displayName(match, game.lastPlay.player)} or pass.`
            : 'The table is yours to lead.'
        : `${activeName} is thinking…`;
  const visibleNotice = validationMessage || statusText;

  return (
    <View
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
          paddingTop: (Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top) + 8,
          paddingBottom: (Platform.OS === 'web' ? Math.max(insets.bottom, 34) : insets.bottom) + 10,
        },
      ]}
    >
      <StatusBar style="light" />
      <View style={styles.gameShell}>
        <View style={styles.topBar}>
          <View>
            <Text
              style={[
                styles.wordmark,
                { color: colors.foreground, fontSize: compactHeader ? 18 : 20 },
              ]}
            >
              BIG TWO
            </Text>
            <Text
              style={[
                styles.submark,
                {
                  color: colors.mutedForeground,
                  fontSize: compactHeader ? 7 : 8,
                  letterSpacing: compactHeader ? 0.8 : 1.15,
                },
              ]}
            >
              FOUR PLAYERS · ONE TABLE
            </Text>
          </View>
          <View style={[styles.topActions, compactHeader && styles.topActionsCompact]}>
            <View
              style={[
                styles.scorePill,
                compactHeader && styles.scorePillCompact,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {!compactHeader && <Feather name="award" size={13} color={colors.primary} />}
              <Text style={[styles.scoreText, { color: colors.foreground }]}>
                {match.stats.wins}<Text style={{ color: colors.mutedForeground }}> / {match.stats.hands}</Text>
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review previous hands"
              onPress={() => setModal('history')}
              testID="history-button"
              style={({ pressed }) => [
                styles.iconButton,
                compactHeader && styles.iconButtonCompact,
                { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="clock" size={16} color={colors.foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Game settings"
              onPress={() => setModal('settings')}
              testID="settings-button"
              style={({ pressed }) => [
                styles.iconButton,
                compactHeader && styles.iconButtonCompact,
                { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="settings" size={16} color={colors.foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start a new hand"
              onPress={() => setModal('new-hand')}
              testID="new-hand-button"
              style={({ pressed }) => [
                styles.iconButton,
                compactHeader && styles.iconButtonCompact,
                { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="rotate-ccw" size={17} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.circleTable,
            {
              width: tableSize,
              height: tableSize,
              borderRadius: tableSize / 2,
            },
          ]}
          testID="four-seat-table"
        >
          <View
            style={[
              styles.circleTableSurface,
              {
                borderRadius: (tableSize - 16) / 2,
                borderColor: 'rgba(220, 203, 158, 0.2)',
              },
            ]}
          />
          <View style={[styles.compassSeat, styles.northSeat]}>
            <PlayerSeat
              name={displayName(match, 2)}
              cards={game.hands[2]!.length}
              active={winner === null && game.turn === 2}
              isHuman={match.mode === 'pass-and-play'}
              width={edgeSeatWidth}
              testID="seat-player-3"
            />
          </View>
          <View style={[styles.compassSeat, styles.westSeat, { width: sideSeatWidth }]}>
            <PlayerSeat
              name={displayName(match, 1)}
              cards={game.hands[1]!.length}
              active={winner === null && game.turn === 1}
              isHuman={match.mode === 'pass-and-play'}
              width={sideSeatWidth}
              testID="seat-player-2"
            />
          </View>
          <View style={[styles.compassSeat, styles.eastSeat, { width: sideSeatWidth }]}>
            <PlayerSeat
              name={displayName(match, 3)}
              cards={game.hands[3]!.length}
              active={winner === null && game.turn === 3}
              isHuman={match.mode === 'pass-and-play'}
              width={sideSeatWidth}
              testID="seat-player-4"
            />
          </View>
          <View style={[styles.compassSeat, styles.southSeat]}>
            <PlayerSeat
              name={displayName(match, 0)}
              cards={game.hands[0]!.length}
              active={winner === null && game.turn === 0}
              isHuman
              width={edgeSeatWidth}
              testID="seat-player-1"
            />
          </View>

          <View
            style={[
              styles.tableCenter,
              {
                left: sideSeatWidth - 5,
                right: sideSeatWidth - 5,
                top: tableSize * 0.28,
                bottom: tableSize * 0.28,
              },
            ]}
          >
            <View style={styles.tableOverline}>
              <View style={[styles.tableDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.tableLabel}>
                {game.lastPlay
                  ? `${describeCombo(game.lastPlay.combo).toUpperCase()} · ${game.lastPlay.cards.length} CARDS`
                  : 'CURRENT TRICK'}
              </Text>
            </View>
            <View style={styles.playArea}>
              {game.lastPlay ? (
                <PlayedHandMotion player={game.lastPlay.player} playId={game.plays.length}>
                  <View style={styles.playedCards} accessibilityLabel="Cards currently on the table">
                    {game.lastPlay.cards.map((card, index) => (
                      <View
                        key={`${game.plays.length}-${index}-${cardKey(card)}`}
                        style={[styles.playedCard, { marginHorizontal: -tableCardWidth * 0.11 }]}
                      >
                        <CardFace
                          card={card}
                          width={tableCardWidth}
                          height={tableCardWidth * 1.52}
                        />
                      </View>
                    ))}
                  </View>
                </PlayedHandMotion>
              ) : winner !== null ? (
                <View style={styles.resultMark}>
                  <Feather name={winner === 0 ? 'award' : 'flag'} size={28} color={colors.primary} />
                  <Text style={styles.resultText}>{winner === 0 ? 'HAND WON' : 'HAND OVER'}</Text>
                </View>
              ) : (
                <View style={styles.waitingMark}>
                  <Text style={styles.waitingSuit}>♠</Text>
                  <Text style={styles.waitingText}>Waiting for a lead</Text>
                </View>
              )}
            </View>
            <Text
              accessibilityLiveRegion="polite"
              numberOfLines={3}
              style={[
                styles.statusMessage,
                { color: currentStatus && winner === null ? colors.primary : '#E0E9E1' },
              ]}
            >
              {visibleNotice}
            </Text>
            {match.mode === 'solo' && game.turn !== 0 && winner === null && (
              <ActivityIndicator size="small" color={colors.primary} style={styles.cpuSpinner} />
            )}
          </View>
        </View>

        <View style={styles.handHeading}>
          <View>
            <Text style={[styles.handTitle, { color: colors.foreground }]}>
              {winner !== null
                ? 'HAND COMPLETE'
                : match.mode === 'pass-and-play'
                  ? `${activeName.toUpperCase()}'S HAND`
                  : 'YOUR HAND'}
            </Text>
            <Text style={[styles.handHint, { color: colors.mutedForeground }]}>
              {winner !== null
                ? `${displayName(match, winner)} won this hand`
                : !handRevealed
                  ? `${hand.length} cards · hidden until revealed`
                  : selectedKeys.length > 0
                    ? `${selectedKeys.length} selected`
                    : `${hand.length} cards · ${match.rankSort ? 'tap to select' : 'dealt order · tap to select'}`}
            </Text>
          </View>
          <Text style={[styles.selectionHint, { color: colors.primary }]}>
            {game.openingPending && (match.mode === 'pass-and-play' || game.turn === 0) ? '3♦ LEADS' : ''}
          </Text>
        </View>

        <View style={[styles.handArea, { height: 111 }]}>
          {winner !== null ? (
            <View style={styles.handFinished}>
              <Feather name="check-circle" size={22} color={colors.primary} />
              <Text style={[styles.hiddenHandText, { color: colors.mutedForeground }]}>
                Deal another hand when you’re ready.
              </Text>
            </View>
          ) : !handRevealed ? (
            <View style={styles.hiddenHand}>
              <View style={styles.cardBackStack}>
                {[0, 1, 2, 3, 4].map((index) => (
                  <View
                    key={index}
                    style={[
                      styles.cardBack,
                      {
                        left: 18 + index * 16,
                        transform: [{ rotate: `${(index - 2) * 5}deg` }],
                      },
                    ]}
                  >
                    <Text style={styles.cardBackMark}>♠</Text>
                  </View>
                ))}
              </View>
              <Text style={[styles.hiddenHandText, { color: colors.mutedForeground }]}>
                Private hand · reveal when the device is with you
              </Text>
            </View>
          ) : (
            displayedHand.map((card, index) => {
              const key = cardKey(card);
              const isSelected = selectedKeys.includes(key);
              return (
                <View
                  key={key}
                  style={[
                    styles.handCardPosition,
                    {
                      left: index * cardStep,
                      width: cardWidth,
                      zIndex: isSelected ? 25 + index : index,
                    },
                  ]}
                >
                  <CardFace
                    card={card}
                    width={cardWidth}
                    height={91}
                    selected={isSelected}
                    disabled={!canInteract}
                    onPress={() => toggleCard(card)}
                    testID={`card-${key}`}
                  />
                </View>
              );
            })
          )}
        </View>

        <View style={styles.actionRow}>
          {winner !== null ? (
            <ActionButton
              label="Deal again"
              icon="repeat"
              onPress={confirmNewHand}
              primary
              testID="deal-again-button"
            />
          ) : match.mode === 'pass-and-play' && !handRevealed ? (
            <ActionButton
              label={`Show ${activeName}'s hand`}
              icon="eye"
              onPress={revealHand}
              primary
              testID="show-hand-button"
            />
          ) : (
            <>
              <ActionButton
                label="Sort"
                icon="align-center"
                onPress={toggleSort}
                disabled={!canInteract}
                testID="sort-button"
              />
              <ActionButton
                label="Pass"
                icon="corner-up-right"
                onPress={submitPass}
                disabled={!canInteract || !game.lastPlay}
                testID="pass-button"
              />
              <ActionButton
                label="Play"
                icon="play"
                onPress={submitPlay}
                disabled={!canInteract || selectedKeys.length === 0}
                primary
                testID="play-button"
              />
            </>
          )}
        </View>
        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
          {winner !== null
            ? 'Your completed hands remain available in history.'
            : match.mode === 'pass-and-play'
              ? handRevealed
                ? 'Cards will hide automatically when this player plays or passes.'
                : 'Keep the cards covered while passing the device.'
              : game.turn === 0
                ? 'Select cards, then play or pass.'
                : 'The other players are taking their turns.'}
        </Text>
      </View>

      <InfoModal visible={modal === 'rules'} title="How to play" onClose={() => setModal(null)}>
        <Text style={[styles.modalLead, { color: colors.foreground }]}>
          {match.mode === 'solo'
            ? 'Be the first to play every card in your hand. Play against three computer players.'
            : 'Four people share one device. Keep each hand hidden during the handoff, then reveal it when that player is ready.'}
        </Text>
        <Text style={[styles.ruleHeading, { color: colors.primary }]}>CARD ORDER</Text>
        <Text style={[styles.ruleText, { color: colors.secondaryForeground }]}>
          Ranks go from 3 (lowest) up to 2 (highest). Within a rank, suits go ♦, ♣, ♥, ♠. The opening play must include the 3 of diamonds.
        </Text>
        <Text style={[styles.ruleHeading, { color: colors.primary }]}>VALID PLAYS</Text>
        <Text style={[styles.ruleText, { color: colors.secondaryForeground }]}>
          Play one card, a pair, a three of a kind, or a five-card hand. Five-card hands rank: straight, flush, full house, four of a kind, then straight flush. Straights use five consecutive ranks in the 3-to-2 order.
        </Text>
        <Text style={[styles.ruleHeading, { color: colors.primary }]}>YOUR TURN</Text>
        <Text style={[styles.ruleText, { color: colors.secondaryForeground }]}>
          To beat a play, use the same number of cards and a stronger combination. You may pass instead. After three players pass, the last player to play leads a new trick.
        </Text>
        <Text style={[styles.ruleFootnote, { color: colors.mutedForeground }]}>
          Your game, names, and completed-hand history are saved on this device.
        </Text>
      </InfoModal>

      <InfoModal visible={modal === 'settings'} title="Game settings" onClose={() => setModal(null)}>
        <Text style={[styles.ruleHeading, { color: colors.primary }]}>PLAY MODE</Text>
        <View style={styles.modeOptions}>
          {([
            ['solo', 'Play CPUs'],
            ['pass-and-play', 'Pass & play'],
          ] as [GameMode, string][]).map(([mode, label]) => {
            const selected = match.mode === mode;
            return (
              <Pressable
                key={mode}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => changeMode(mode)}
                style={[
                  styles.modeOption,
                  {
                    backgroundColor: selected ? colors.accent : colors.secondary,
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modeOptionText,
                    { color: selected ? colors.primary : colors.foreground },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.ruleText, { color: colors.secondaryForeground }]}>
          {match.mode === 'solo'
            ? 'Play your hand against three CPU players.'
            : 'Every turn is a person. Cards stay covered between turns; the next player taps Show hand when the device is with them.'}
        </Text>

        {match.mode === 'pass-and-play' && (
          <>
            <Text style={[styles.ruleHeading, { color: colors.primary }]}>PLAYER NAMES</Text>
            {match.playerNames.map((name, index) => (
              <View key={index} style={styles.nameInputRow}>
                <Text style={[styles.nameInputLabel, { color: colors.mutedForeground }]}>
                  PLAYER {index + 1}
                </Text>
                <TextInput
                  accessibilityLabel={`Player ${index + 1} name`}
                  value={name}
                  onChangeText={(value) => changePlayerName(index, value)}
                  maxLength={16}
                  autoCapitalize="words"
                  autoCorrect={false}
                  placeholder={`Player ${index + 1}`}
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType={index === 3 ? 'done' : 'next'}
                  style={[
                    styles.nameInput,
                    {
                      color: colors.foreground,
                      backgroundColor: colors.secondary,
                      borderColor: colors.border,
                    },
                  ]}
                />
              </View>
            ))}
          </>
        )}

        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Sound effects"
          accessibilityState={{ checked: match.soundEnabled }}
          onPress={toggleSound}
          style={[styles.soundSetting, { borderTopColor: colors.border }]}
        >
          <View style={styles.soundSettingCopy}>
            <Feather
              name={match.soundEnabled ? 'volume-2' : 'volume-x'}
              size={17}
              color={colors.primary}
            />
            <Text style={[styles.soundSettingText, { color: colors.foreground }]}>
              Card sounds
            </Text>
          </View>
          <View
            style={[
              styles.toggleTrack,
              { backgroundColor: match.soundEnabled ? colors.primary : colors.border },
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                { alignSelf: match.soundEnabled ? 'flex-end' : 'flex-start' },
              ]}
            />
          </View>
        </Pressable>

        <View style={styles.modalActions}>
          <ActionButton
            label="New hand"
            icon="rotate-ccw"
            onPress={() => setModal('new-hand')}
          />
          <ActionButton label="Rules" icon="help-circle" onPress={() => setModal('rules')} />
        </View>
      </InfoModal>

      <InfoModal visible={modal === 'history'} title="Hand history" onClose={() => setModal(null)}>
        {winner === null && game.plays.length > 0 && (
          <View style={styles.historySection}>
            <Text style={[styles.ruleHeading, { color: colors.primary }]}>CURRENT HAND</Text>
            {game.plays.map((play, index) => (
              <View key={`current-${index}`} style={[styles.historyPlay, { borderBottomColor: colors.border }]}>
                <Text style={[styles.historyPlayer, { color: colors.foreground }]}>
                  {displayName(match, play.player)}
                </Text>
                <Text style={[styles.historyCards, { color: colors.secondaryForeground }]}>
                  {describeCombo(play.combo)} · {compactCards(play.cards)}
                </Text>
              </View>
            ))}
          </View>
        )}
        {match.handHistory.length === 0 ? (
          <Text style={[styles.ruleText, { color: colors.mutedForeground }]}>
            {winner === null && game.plays.length > 0
              ? 'Completed hands will appear here.'
              : 'Completed hands will appear here after the first hand ends.'}
          </Text>
        ) : (
          [...match.handHistory].reverse().map((record) => (
            <View key={`hand-${record.handNumber}`} style={styles.historySection}>
              <View style={styles.historyHandHeading}>
                <View>
                  <Text style={[styles.historyHandTitle, { color: colors.foreground }]}>
                    HAND {record.handNumber}
                  </Text>
                  <Text style={[styles.historyWinner, { color: colors.primary }]}>
                    {displayRecordName(record, record.winner)} won · {record.plays.length} plays
                  </Text>
                </View>
              </View>
              {record.plays.map((play, index) => (
                <View
                  key={`hand-${record.handNumber}-play-${index}`}
                  style={[styles.historyPlay, { borderBottomColor: colors.border }]}
                >
                  <Text style={[styles.historyPlayer, { color: colors.foreground }]}>
                    {displayRecordName(record, play.player)}
                  </Text>
                  <Text style={[styles.historyCards, { color: colors.secondaryForeground }]}>
                    {describeCombo(play.combo)} · {compactCards(play.cards)}
                  </Text>
                </View>
              ))}
            </View>
          ))
        )}
      </InfoModal>

      <InfoModal visible={modal === 'new-hand'} title="Start a new hand?" onClose={() => setModal(null)}>
        <Text style={[styles.modalLead, { color: colors.foreground }]}>
          The current hand will end and a fresh 52-card deal will begin. Your completed-hand record stays saved.
        </Text>
        <View style={styles.modalActions}>
          <ActionButton label="Keep playing" icon="arrow-left" onPress={() => setModal(null)} />
          <ActionButton label="New hand" icon="rotate-ccw" onPress={confirmNewHand} primary />
        </View>
      </InfoModal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingHorizontal: 18,
  },
  gameShell: {
    flex: 1,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  loadingText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    letterSpacing: 0.6,
  },
  topBar: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 13,
  },
  wordmark: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    letterSpacing: 2.4,
  },
  submark: {
    marginTop: 2,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 8,
    letterSpacing: 1.15,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  topActionsCompact: {
    gap: 2,
  },
  scorePill: {
    height: 33,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 20,
  },
  scorePillCompact: {
    paddingHorizontal: 6,
  },
  scoreText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  iconButton: {
    width: 33,
    height: 33,
    borderWidth: 1,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonCompact: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  circleTable: {
    position: 'relative',
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#315A45',
    backgroundColor: '#12392B',
    padding: 8,
    overflow: 'visible',
  },
  circleTableSurface: {
    position: 'absolute',
    top: 8,
    right: 8,
    bottom: 8,
    left: 8,
    borderWidth: 1,
    backgroundColor: '#143F30',
  },
  compassSeat: {
    position: 'absolute',
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  northSeat: {
    top: 10,
    left: 0,
    right: 0,
  },
  westSeat: {
    top: 0,
    bottom: 0,
    left: 4,
  },
  eastSeat: {
    top: 0,
    right: 4,
    bottom: 0,
  },
  southSeat: {
    right: 0,
    bottom: 10,
    left: 0,
  },
  tableCenter: {
    position: 'absolute',
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  cpuSpinner: {
    position: 'absolute',
    bottom: -5,
  },
  tableOverline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  tableDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tableLabel: {
    color: '#EEE8D9',
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 1.2,
  },
  turnCounter: {
    color: '#B7C7BA',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 8,
    letterSpacing: 0.9,
  },
  playArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 0,
  },
  playedCards: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  playedCard: {
    marginHorizontal: -2,
    marginVertical: 2,
  },
  lastPlayBy: {
    marginTop: 7,
    color: '#E6DDBD',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 8,
    letterSpacing: 1.3,
  },
  waitingMark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingSuit: {
    color: '#D7B46A',
    fontSize: 42,
    lineHeight: 46,
  },
  waitingText: {
    color: '#DBE4D9',
    marginTop: 5,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.15,
  },
  resultMark: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  resultText: {
    color: '#E6DDBD',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.5,
  },
  tableBottom: {
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusMessage: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  handHeading: {
    minHeight: 39,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  handTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: 1.4,
  },
  handHint: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  selectionHint: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  handArea: {
    position: 'relative',
    width: '100%',
    marginTop: 2,
    marginBottom: 8,
  },
  hiddenHand: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  cardBackStack: {
    width: 148,
    height: 77,
    position: 'relative',
  },
  cardBack: {
    position: 'absolute',
    top: 3,
    width: 48,
    height: 70,
    borderWidth: 1,
    borderColor: '#83A48A',
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#214838',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 2px 3px rgba(0, 0, 0, 0.22)' }
      : {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.22,
          shadowRadius: 3,
          elevation: 2,
        }),
  },
  cardBackMark: {
    color: '#D7B46A',
    fontSize: 19,
  },
  hiddenHandText: {
    maxWidth: '100%',
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
  },
  handFinished: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  handCardPosition: {
    position: 'absolute',
    top: 8,
    height: 98,
  },
  cardFace: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 7,
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 2px 4px rgba(0, 0, 0, 0.14)' }
      : {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.14,
          shadowRadius: 3,
          elevation: 3,
        }),
  },
  cardCorner: {
    position: 'absolute',
    left: 3,
    top: 3,
    alignItems: 'center',
  },
  cardRank: {
    fontFamily: 'Inter_700Bold',
    lineHeight: 15,
  },
  cardSuitSmall: {
    lineHeight: 12,
  },
  cardSuitLarge: {
    position: 'absolute',
    alignSelf: 'center',
    top: '34%',
    lineHeight: 40,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 9,
    minHeight: 48,
  },
  actionButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 9,
  },
  actionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  footerNote: {
    height: 20,
    marginTop: 7,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    letterSpacing: 0.15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.67)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  modalPanel: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '88%',
    borderWidth: 1,
    borderRadius: 22,
    padding: 19,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLead: {
    marginTop: 4,
    marginBottom: 16,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  ruleHeading: {
    marginTop: 11,
    marginBottom: 5,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1.1,
  },
  ruleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
  },
  ruleFootnote: {
    marginTop: 18,
    marginBottom: 7,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 3,
    marginBottom: 4,
  },
  modeOptions: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 10,
  },
  modeOption: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  modeOptionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  nameInputRow: {
    minHeight: 45,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 7,
  },
  nameInputLabel: {
    width: 63,
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.8,
  },
  nameInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 11,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
  },
  soundSetting: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 11,
    marginBottom: 13,
  },
  soundSettingCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  soundSettingText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  toggleTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    padding: 3,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
  },
  historySection: {
    marginBottom: 16,
  },
  historyHandHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  historyHandTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: 0.8,
  },
  historyWinner: {
    marginTop: 3,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  historyPlay: {
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyPlayer: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  historyCards: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
  },
});