import { useEffect, useState } from 'react';
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
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return { connected, checked, offline: checked && !connected };
}
