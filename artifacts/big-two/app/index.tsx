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
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import {
  Card,
  GameState,
  PLAYER_NAMES,
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
  playCards,
  sortCards,
  validatePlay,
} from '@/lib/game';

const SAVE_KEY = 'big-two:local-match:v1';

function finishMatch(previous: StoredMatch, game: GameState): StoredMatch {
  const justFinished = previous.game.winner === null && game.winner !== null;
  if (!justFinished) return { ...previous, game };

  return {
    ...previous,
    game,
    stats: {
      wins: previous.stats.wins + (game.winner === 0 ? 1 : 0),
      hands: previous.stats.hands + 1,
    },
  };
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
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function GameScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [match, setMatch] = useState<StoredMatch | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [modal, setModal] = useState<'rules' | 'new-hand' | null>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const usableWidth = Math.min(windowWidth, 500);
  const cardWidth = Math.max(37, Math.min(49, (usableWidth - 36) / 7.45));
  const cardStep = (usableWidth - 36 - cardWidth) / 12;

  useEffect(() => {
    let active = true;
    async function loadMatch(): Promise<void> {
      try {
        const raw = await AsyncStorage.getItem(SAVE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (active && isValidStoredMatch(parsed)) {
          setMatch(parsed);
        } else if (active) {
          setMatch({
            game: newGame(),
            stats: { wins: 0, hands: 0 },
            rankSort: true,
          });
        }
      } catch {
        if (active) {
          setMatch({
            game: newGame(),
            stats: { wins: 0, hands: 0 },
            rankSort: true,
          });
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
    if (!hydrated || !match) return;
    const { game } = match;
    if (game.turn === 0 || game.winner !== null) return;

    const timer = setTimeout(() => {
      setValidationMessage('');
      setMatch((current) => {
        if (!current || current.game.turn === 0 || current.game.winner !== null) return current;
        return finishMatch(current, computerTurn(current.game));
      });
    }, 760);

    return () => clearTimeout(timer);
  }, [hydrated, match]);

  const game = match?.game;
  const userTurn = game?.turn === 0 && game.winner === null;
  const hand = game?.hands[0] ?? [];
  const displayedHand = useMemo(() => {
    if (!match) return [];
    const cards = sortCards(hand);
    if (match.rankSort) return cards;
    return [...cards].sort((a, b) => a.suit - b.suit || a.rank - b.rank);
  }, [hand, match]);
  const selectedCards = useMemo(
    () => displayedHand.filter((card) => selectedKeys.includes(cardKey(card))),
    [displayedHand, selectedKeys],
  );

  const toggleCard = (card: Card): void => {
    if (!userTurn) return;
    const key = cardKey(card);
    setValidationMessage('');
    void Haptics.selectionAsync();
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const submitPlay = (): void => {
    if (!match || !userTurn) return;
    const error = validatePlay(selectedCards, game!.lastPlay, game!.openingPending);
    if (error) {
      setValidationMessage(error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setValidationMessage('');
    setSelectedKeys([]);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMatch((current) =>
      current && current.game.turn === 0
        ? finishMatch(current, playCards(current.game, selectedCards))
        : current,
    );
  };

  const submitPass = (): void => {
    if (!match || !userTurn || !game!.lastPlay) return;
    setSelectedKeys([]);
    setValidationMessage('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMatch((current) =>
      current && current.game.turn === 0
        ? finishMatch(current, passTurn(current.game))
        : current,
    );
  };

  const toggleSort = (): void => {
    if (!match) return;
    setMatch((current) => current ? { ...current, rankSort: !current.rankSort } : current);
    void Haptics.selectionAsync();
  };

  const confirmNewHand = (): void => {
    setModal(null);
    setSelectedKeys([]);
    setValidationMessage('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMatch((current) => current ? { ...current, game: newGame() } : current);
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
  const statusText = winner !== null
    ? winner === 0
      ? 'You cleared your hand first.'
      : `${PLAYER_NAMES[winner]} cleared their hand first.`
    : game.turn === 0
      ? game.openingPending
        ? 'Open with the 3 of diamonds.'
        : game.lastPlay
          ? `Beat ${PLAYER_NAMES[game.lastPlay.player]} or pass.`
          : 'The table is yours to lead.'
      : `${PLAYER_NAMES[game.turn]} is thinking…`;
  const visibleNotice = validationMessage || statusText;
  const currentStatus = winner !== null || game.turn === 0;

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
            <Text style={[styles.wordmark, { color: colors.foreground }]}>BIG TWO</Text>
            <Text style={[styles.submark, { color: colors.mutedForeground }]}>FOUR PLAYERS · ONE TABLE</Text>
          </View>
          <View style={styles.topActions}>
            <View style={[styles.scorePill, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="award" size={13} color={colors.primary} />
              <Text style={[styles.scoreText, { color: colors.foreground }]}>
                {match.stats.wins}<Text style={{ color: colors.mutedForeground }}> / {match.stats.hands}</Text>
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Big Two rules"
              onPress={() => setModal('rules')}
              testID="rules-button"
              style={({ pressed }) => [
                styles.iconButton,
                { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="help-circle" size={19} color={colors.foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start a new hand"
              onPress={() => setModal('new-hand')}
              testID="new-hand-button"
              style={({ pressed }) => [
                styles.iconButton,
                { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="rotate-ccw" size={17} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        <View style={styles.seatRow}>
          {PLAYER_NAMES.map((name, index) => {
            const active = winner === null && game.turn === index;
            const isHuman = index === 0;
            return (
              <View
                key={name}
                style={[
                  styles.seat,
                  {
                    backgroundColor: active ? colors.accent : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                    opacity: winner !== null ? 0.72 : 1,
                  },
                ]}
              >
                <View style={styles.seatHeader}>
                  <View style={[styles.seatDot, { backgroundColor: active ? colors.primary : colors.mutedForeground }]} />
                  <Text style={[styles.seatName, { color: active ? colors.primary : colors.mutedForeground }]}>
                    {name}
                  </Text>
                </View>
                <Text style={[styles.seatCount, { color: colors.foreground }]}>
                  {game.hands[index]!.length}
                  <Text style={[styles.seatCardsLabel, { color: colors.mutedForeground }]}> cards</Text>
                </Text>
                {!isHuman && <Text style={[styles.botLabel, { color: colors.mutedForeground }]}>CPU</Text>}
              </View>
            );
          })}
        </View>

        <View style={[styles.table, { backgroundColor: '#12392B', borderColor: '#315A45' }]}>
          <View style={[styles.tableInner, { borderColor: 'rgba(220, 203, 158, 0.18)' }]}>
            <View style={styles.tableTop}>
              <View style={styles.tableOverline}>
                <View style={[styles.tableDot, { backgroundColor: colors.primary }]} />
                <Text style={styles.tableLabel}>
                  {game.lastPlay ? `${describeCombo(game.lastPlay.combo).toUpperCase()} · ${game.lastPlay.cards.length} CARDS` : 'THE TABLE'}
                </Text>
              </View>
              <Text style={styles.turnCounter}>HAND {match.stats.hands + (winner === null ? 1 : 0)}</Text>
            </View>

            <View style={styles.playArea}>
              {game.lastPlay ? (
                <>
                  <View style={styles.playedCards} accessibilityLabel="Cards currently on the table">
                    {game.lastPlay.cards.map((card) => (
                      <View key={cardKey(card)} style={styles.playedCard}>
                        <CardFace card={card} width={43} height={67} />
                      </View>
                    ))}
                  </View>
                  <Text style={styles.lastPlayBy}>{PLAYER_NAMES[game.lastPlay.player]} PLAYED</Text>
                </>
              ) : winner !== null ? (
                <View style={styles.resultMark}>
                  <Feather name={winner === 0 ? 'award' : 'flag'} size={30} color={colors.primary} />
                  <Text style={styles.resultText}>{winner === 0 ? 'HAND WON' : 'HAND OVER'}</Text>
                </View>
              ) : (
                <View style={styles.waitingMark}>
                  <Text style={styles.waitingSuit}>♠</Text>
                  <Text style={styles.waitingText}>A good hand starts here.</Text>
                </View>
              )}
            </View>

            <View style={styles.tableBottom}>
              <Text
                accessibilityLiveRegion="polite"
                numberOfLines={2}
                style={[styles.statusMessage, { color: currentStatus && winner === null ? colors.primary : '#E0E9E1' }]}
              >
                {visibleNotice}
              </Text>
              {game.turn !== 0 && winner === null && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
            </View>
          </View>
        </View>

        <View style={styles.handHeading}>
          <View>
            <Text style={[styles.handTitle, { color: colors.foreground }]}>YOUR HAND</Text>
            <Text style={[styles.handHint, { color: colors.mutedForeground }]}>
              {selectedKeys.length > 0
                ? `${selectedKeys.length} selected`
                : `${hand.length} cards · tap to select`}
            </Text>
          </View>
          <Text style={[styles.selectionHint, { color: colors.primary }]}>
            {game.openingPending && game.turn === 0 ? '3♦ LEADS' : ''}
          </Text>
        </View>

        <View style={[styles.handArea, { height: 111 }]}>
          {displayedHand.map((card, index) => {
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
                  disabled={!userTurn}
                  onPress={() => toggleCard(card)}
                  testID={`card-${key}`}
                />
              </View>
            );
          })}
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
          ) : (
            <>
              <ActionButton
                label="Sort"
                icon="shuffle"
                onPress={toggleSort}
                disabled={!userTurn}
                testID="sort-button"
              />
              <ActionButton
                label="Pass"
                icon="corner-up-right"
                onPress={submitPass}
                disabled={!userTurn || !game.lastPlay}
                testID="pass-button"
              />
              <ActionButton
                label="Play"
                icon="play"
                onPress={submitPlay}
                disabled={!userTurn || selectedKeys.length === 0}
                primary
                testID="play-button"
              />
            </>
          )}
        </View>
        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>
          {winner !== null ? 'A fresh hand is one tap away.' : game.turn === 0 ? 'Select cards, then play or pass.' : 'The other players are taking their turns.'}
        </Text>
      </View>

      <InfoModal visible={modal === 'rules'} title="How to play" onClose={() => setModal(null)}>
        <Text style={[styles.modalLead, { color: colors.foreground }]}>
          Be the first to play every card in your hand. You are up against three computer players.
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
          Your hand and win count are saved on this device.
        </Text>
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
    gap: 7,
  },
  scorePill: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 20,
  },
  scoreText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatRow: {
    flexDirection: 'row',
    gap: 6,
  },
  seat: {
    flex: 1,
    minWidth: 0,
    minHeight: 63,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 7,
  },
  seatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  seatDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  seatName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.8,
  },
  seatCount: {
    marginTop: 5,
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
  },
  seatCardsLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
  },
  botLabel: {
    position: 'absolute',
    top: 7,
    right: 7,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 7,
    letterSpacing: 0.6,
  },
  table: {
    flex: 1,
    minHeight: 170,
    maxHeight: 360,
    marginTop: 12,
    marginBottom: 15,
    borderRadius: 24,
    borderWidth: 1,
    padding: 9,
  },
  tableInner: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 17,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 12,
  },
  tableTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    minHeight: 86,
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 3,
    elevation: 3,
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
});