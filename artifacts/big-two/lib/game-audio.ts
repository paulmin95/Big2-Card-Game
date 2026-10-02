import { useAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect } from 'react';

function replay(player: AudioPlayer): void {
  void player.seekTo(0).then(() => player.play()).catch(() => player.play());
}

export function useGameAudio() {
  const deal = useAudioPlayer(require('../assets/sounds/deal.wav'));
  const single = useAudioPlayer(require('../assets/sounds/play-1.wav'));
  const pair = useAudioPlayer(require('../assets/sounds/play-2.wav'));
  const triple = useAudioPlayer(require('../assets/sounds/play-3.wav'));
  const five = useAudioPlayer(require('../assets/sounds/play-5.wav'));

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    }).catch(() => undefined);
    deal.volume = 0.52;
    single.volume = 0.55;
    pair.volume = 0.55;
    triple.volume = 0.55;
    five.volume = 0.55;
  }, [deal, single, pair, triple, five]);

  const playDeal = useCallback(() => replay(deal), [deal]);
  const playHand = useCallback(
    (cardCount: number) => {
      const player =
        cardCount === 1
          ? single
          : cardCount === 2
            ? pair
            : cardCount === 3
              ? triple
              : cardCount === 5
                ? five
                : null;
      if (player) replay(player);
    },
    [single, pair, triple, five],
  );

  return { playDeal, playHand };
}