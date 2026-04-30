/**
 * Login-Screen — Token-Eingabe + Server-Validierung.
 * Token wird gegen /api/assistant/whoami geprueft, bevor er gespeichert wird —
 * sonst koennte der User mit einem revoked/falschen Token im Hauptscreen
 * stranden und die App haette keinen Re-Login-Pfad.
 */

import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { setAuthToken, verifyToken, UnauthorizedError } from '../../lib/api';

export default function LoginScreen() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      Alert.alert('Fehler', 'Bitte Token eingeben');
      return;
    }
    setBusy(true);
    try {
      // Erst gegen den Server pruefen, dann in den SecureStore schreiben.
      await verifyToken(trimmed);
      await setAuthToken(trimmed);
      router.replace('/(app)');
    } catch (err) {
      const msg =
        err instanceof UnauthorizedError
          ? 'Token wurde abgelehnt. Bitte einen gueltigen API-Token aus admin-booking.propus.ch verwenden.'
          : err instanceof Error
            ? err.message
            : 'Login fehlgeschlagen';
      Alert.alert('Fehler', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Propus</Text>
      <Text style={styles.subtitle}>Assistant</Text>
      <Text style={styles.hint}>Token aus admin-booking.propus.ch einfügen.</Text>
      <TextInput
        style={styles.input}
        placeholder="API-Token"
        placeholderTextColor="rgba(245,240,225,0.4)"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        secureTextEntry
      />
      <Pressable style={[styles.btn, busy && styles.btnDisabled]} onPress={handleLogin} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Pruefe Token …' : 'Anmelden'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0c0d10',
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },
  brand: { color: '#d4a93a', fontSize: 36, fontWeight: '700', textAlign: 'center', letterSpacing: 0.5 },
  subtitle: { color: '#f5f0e1', fontSize: 18, textAlign: 'center', marginBottom: 24 },
  hint: { color: 'rgba(245,240,225,0.5)', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  input: {
    backgroundColor: '#16181c',
    color: '#f5f0e1',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    fontSize: 15,
  },
  btn: {
    backgroundColor: '#b68e20',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#0c0d10', fontSize: 15, fontWeight: '600' },
});
