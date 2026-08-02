import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, SafeAreaView, StyleSheet } from 'react-native';
import { LevelManager } from './components/LevelManager';

export default function App() {
  useEffect(() => {
    // On mobile Safari, a press-and-hold on the Air Jet button (or any touchable) is
    // indistinguishable from a text-selection long-press without this: it pops the native
    // "Copy / Search with Google" callout instead of just firing the jet.
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.textContent = `
      * {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <LevelManager />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#02243A',
  },
});
