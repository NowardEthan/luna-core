import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

function isConnected(state: NetInfoState): boolean {
  if (state.isConnected == null) return true;
  if (!state.isConnected) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/** Estado de conectividade do dispositivo (Wi‑Fi / dados móveis). */
export function useNetworkStatus() {
  const [connected, setConnected] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    const apply = (state: NetInfoState) => {
      if (!mounted) return;
      setConnected(isConnected(state));
      setChecked(true);
    };

    void NetInfo.fetch().then(apply);
    const unsub = NetInfo.addEventListener(apply);

    // Ao voltar do background, o NetInfo pode não ter emitido eventos enquanto o
    // app estava fechado — o estado fica velho e o banner "prende". Re-checa na
    // volta pro foreground para o banner refletir a conectividade real de novo.
    const onAppState = (status: AppStateStatus) => {
      if (status === 'active') void NetInfo.fetch().then(apply);
    };
    const appStateSub = AppState.addEventListener('change', onAppState);

    return () => {
      mounted = false;
      unsub();
      appStateSub.remove();
    };
  }, []);

  return { connected, checked, offline: checked && !connected };
}
