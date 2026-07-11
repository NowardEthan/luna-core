import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { tokens } from '../theme/tokens';

interface State {
  error: Error | null;
}

/** Mostra erros na tela — útil quando o Expo Go não deixa ver o log. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[Orbit]', error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const { error } = this.state;
    return (
      <View style={styles.root}>
        <Text style={styles.title}>Erro no Orbit</Text>
        <Text style={styles.message}>{error.message}</Text>
        {error.stack ? (
          <ScrollView style={styles.scroll}>
            <Text style={styles.stack}>{error.stack}</Text>
          </ScrollView>
        ) : null}
        <Text style={styles.hint}>Tire um print e envie no chat.</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.ink0,
    padding: 24,
    paddingTop: 48,
  },
  title: { color: tokens.error, fontSize: 20, fontWeight: '700', marginBottom: 12 },
  message: { color: tokens.textHigh, fontSize: 15, lineHeight: 22, marginBottom: 16 },
  scroll: { flex: 1, marginBottom: 16 },
  stack: { color: tokens.textMid, fontSize: 11, fontFamily: 'monospace', lineHeight: 16 },
  hint: { color: tokens.textLow, fontSize: 13 },
});
