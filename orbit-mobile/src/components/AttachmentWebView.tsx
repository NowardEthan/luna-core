import React, { type ReactElement } from 'react';
import { getOptionalWebView } from '../lib/optionalWebView';

type Props = {
  source: { uri?: string; html?: string };
  style?: object;
  originWhitelist?: string[];
  allowFileAccess?: boolean;
  allowFileAccessFromFileURLs?: boolean;
  allowUniversalAccessFromFileURLs?: boolean;
  startInLoadingState?: boolean;
  renderLoading?: () => ReactElement;
};

export function AttachmentWebView(props: Props) {
  const WebView = getOptionalWebView();
  if (!WebView) return null;
  return <WebView {...(props as object)} />;
}
