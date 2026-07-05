import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenPane, type ScreenEnterMode } from './ScreenPane';

type ScreenId = 'home' | 'thread';

interface Props {
  screen: ScreenId;
  threadEnterKey: number;
  threadEnterMode: ScreenEnterMode;
  home: React.ReactNode;
  thread: React.ReactNode;
}

/** Stack home ↔ thread — conversa entra com push de tela inteira. */
export function ChatScreenStack({
  screen,
  threadEnterKey,
  threadEnterMode,
  home,
  thread,
}: Props) {
  return (
    <View style={styles.stack}>
      <ScreenPane visible={screen === 'home'} enterMode="none">
        {home}
      </ScreenPane>
      <ScreenPane
        visible={screen === 'thread'}
        enterKey={threadEnterKey}
        enterMode={threadEnterMode}
      >
        {thread}
      </ScreenPane>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flex: 1,
  },
});
