import React, { memo } from 'react';
import type { ThreadReference } from '../lib/messageReference';
import { isDocumentReference } from '../lib/messageReference';
import { DocumentReferenceQuote } from './DocumentReferenceQuote';
import { MessageReferenceQuote } from './MessageReferenceQuote';

interface Props {
  reference: ThreadReference;
  variant?: 'user-bubble' | 'luna-bubble';
  onPress?: () => void;
}

export const ThreadReferenceQuote = memo(function ThreadReferenceQuote({
  reference,
  variant = 'user-bubble',
  onPress,
}: Props) {
  if (isDocumentReference(reference)) {
    return <DocumentReferenceQuote reference={reference} variant={variant} onPress={onPress} />;
  }
  return (
    <MessageReferenceQuote
      reference={reference}
      variant={variant === 'user-bubble' ? 'user-bubble' : undefined}
      onPress={onPress}
    />
  );
});
