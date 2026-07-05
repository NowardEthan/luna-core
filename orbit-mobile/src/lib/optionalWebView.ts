import { NativeModules, UIManager } from 'react-native';

/** Verifica se o binário nativo inclui react-native-webview (sem carregar o módulo JS). */
export function isWebViewNativeAvailable(): boolean {
  if (NativeModules.RNCWebViewModule != null) return true;
  if (typeof UIManager.hasViewManagerConfig === 'function') {
    return UIManager.hasViewManagerConfig('RNCWebView');
  }
  if (typeof UIManager.getViewManagerConfig === 'function') {
    return UIManager.getViewManagerConfig('RNCWebView') != null;
  }
  return false;
}

export type WebViewComponent = typeof import('react-native-webview').WebView;

let cachedWebView: WebViewComponent | null | undefined;

/** Carrega WebView só quando o nativo existe — evita crash no Metro reload. */
export function getOptionalWebView(): WebViewComponent | null {
  if (cachedWebView !== undefined) return cachedWebView;
  if (!isWebViewNativeAvailable()) {
    cachedWebView = null;
    return null;
  }
  try {
    cachedWebView = require('react-native-webview').WebView as WebViewComponent;
  } catch {
    cachedWebView = null;
  }
  return cachedWebView ?? null;
}
