import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';

import { findExcerptRange } from './chat/excerptHighlight';
import { tokens } from '../theme/tokens';

export type DocumentSelectableContentHandle = {
  focusText: () => void;
};

interface Props {
  text: string;
  highlightExcerpt?: string;
  onSelectionChange: (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
}

export const DocumentSelectableContent = forwardRef<DocumentSelectableContentHandle, Props>(
  function DocumentSelectableContent({ text, highlightExcerpt, onSelectionChange }, ref) {
    const inputRef = useRef<TextInput>(null);
    const { height: windowHeight } = useWindowDimensions();
    const locked = useRef(text);
    locked.current = text;

    const maxScrollHeight = useMemo(
      () => Math.min(Math.max(windowHeight * 0.48, 220), 520),
      [windowHeight],
    );

    useImperativeHandle(ref, () => ({
      focusText: () => inputRef.current?.focus(),
    }));

    useEffect(() => {
      if (!highlightExcerpt?.trim() || !text) return;
      const range = findExcerptRange(text, highlightExcerpt);
      if (!range) return;
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.setNativeProps({
          selection: { start: range.start, end: range.end },
        });
      }, 320);
      return () => clearTimeout(t);
    }, [highlightExcerpt, text]);

    return (
      <View style={styles.wrap}>
        <TextInput
          ref={inputRef}
          value={text}
          editable
          multiline
          scrollEnabled
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          caretHidden
          showSoftInputOnFocus={false}
          contextMenuHidden={false}
          importantForAutofill="no"
          onChangeText={(next) => {
            if (next !== locked.current) {
              inputRef.current?.setNativeProps({ text: locked.current });
            }
          }}
          onSelectionChange={onSelectionChange}
          style={[styles.input, { maxHeight: maxScrollHeight }]}
          selectionColor="rgba(255, 193, 120, 0.55)"
        />
      </View>
    );
  },
);

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 12 },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    color: tokens.textHigh,
    fontFamily: mono,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.glassBorder,
    textAlignVertical: 'top',
  },
});
