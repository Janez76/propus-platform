/**
 * Mobile-Hauptscreen — Voice-Chat-Interface.
 */

import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { startRecording, stopRecording } from '../../lib/audio';
import { transcribe, sendMessage, type AssistantResponse } from '../../lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: AssistantResponse['toolCallsExecuted'];
}

type State = 'idle' | 'recording' | 'transcribing' | 'thinking';

export default function HomeScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<State>('idle');
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<unknown[]>([]);
  const pulse = useRef(new Animated.Value(1)).current;

  const animatePulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  };

  const stopPulse = () => {
    pulse.stopAnimation();
    Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  const handlePressIn = async () => {
    if (state !== 'idle') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await startRecording();
      setState('recording');
      animatePulse();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aufnahme fehlgeschlagen');
    }
  };

  const handlePressOut = async () => {
    if (state !== 'recording') return;
    stopPulse();
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { uri, mimeType } = await stopRecording();
      setState('transcribing');
      const text = await transcribe(uri, mimeType);
      if (text.trim()) await processMessage(text);
      else setState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
      setState('idle');
    }
  };

  const processMessage = async (text: string) => {
    setMessages((m) => [...m, { id: String(Date.now()), role: 'user', content: text }]);
    setState('thinking');
    try {
      const data = await sendMessage(text, historyRef.current);
      historyRef.current = data.history;
      setMessages((m) => [
        ...m,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: data.finalText,
          toolCalls: data.toolCallsExecuted,
        },
      ]);
      // TTS auf iOS/Android
      if (data.finalText && Platform.OS !== 'web') {
        Speech.speak(data.finalText, { language: 'de-DE', rate: 1.05 });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler');
    } finally {
      setState('idle');
    }
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim() || state !== 'idle') return;
    const t = textInput;
    setTextInput('');
    await processMessage(t);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>Propus Assistant</Text>
        {messages.length > 0 && (
          <Pressable
            onPress={() => {
              setMessages([]);
              historyRef.current = [];
              setError(null);
            }}
          >
            <Text style={styles.clearBtn}>Neu</Text>
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
        {messages.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Halte den Button gedrückt und sprich.</Text>
            <Text style={styles.emptyHint}>„Welche Aufträge habe ich morgen?"</Text>
            <Text style={styles.emptyHint}>„Wie viele Touren laufen ab?"</Text>
          </View>
        )}
        {messages.map((m) => (
          <View
            key={m.id}
            style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}
          >
            {m.toolCalls && m.toolCalls.length > 0 && (
              <View style={styles.tools}>
                {m.toolCalls.map((tc, i) => (
                  <Text key={i} style={[styles.tool, tc.error ? styles.toolError : null]}>
                    {tc.error ? '⚠' : '⚙'} {tc.name}
                  </Text>
                ))}
              </View>
            )}
            <Text style={m.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant}>
              {m.content}
            </Text>
          </View>
        ))}
        {state === 'thinking' && <Text style={styles.typing}>denkt nach …</Text>}
        {state === 'transcribing' && <Text style={styles.typing}>verarbeitet Audio …</Text>}
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <TextInput
          style={styles.input}
          placeholder="Tippen oder Mikro halten …"
          placeholderTextColor="rgba(245,240,225,0.35)"
          value={textInput}
          onChangeText={setTextInput}
          onSubmitEditing={handleTextSubmit}
          editable={state === 'idle'}
        />
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={state === 'thinking' || state === 'transcribing'}
        >
          <Animated.View
            style={[
              styles.micBtn,
              state === 'recording' && styles.micBtnActive,
              { transform: [{ scale: pulse }] },
            ]}
          >
            <Text style={styles.micIcon}>{state === 'recording' ? '●' : '🎙'}</Text>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c0d10' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  brand: { color: '#d4a93a', fontSize: 20, fontWeight: '600', letterSpacing: 0.3 },
  clearBtn: {
    color: '#f5f0e1',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
  },
  messages: { flex: 1 },
  messagesContent: { padding: 16, gap: 10 },
  empty: { marginTop: 80, alignItems: 'center', gap: 10 },
  emptyTitle: { color: '#f5f0e1', fontSize: 18, marginBottom: 12, textAlign: 'center' },
  emptyHint: { color: 'rgba(245,240,225,0.5)', fontSize: 14, fontStyle: 'italic' },
  bubble: { maxWidth: '85%', padding: 12, borderRadius: 18, marginBottom: 8 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#b68e20', borderBottomRightRadius: 6 },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: '#16181c',
    borderColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderBottomLeftRadius: 6,
  },
  bubbleTextUser: { color: '#0c0d10', fontSize: 15, lineHeight: 22 },
  bubbleTextAssistant: { color: '#f5f0e1', fontSize: 15, lineHeight: 22 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  tool: {
    fontSize: 11,
    color: '#d4a93a',
    backgroundColor: 'rgba(182,142,32,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  toolError: {
    color: '#f87171',
    backgroundColor: 'rgba(220,38,38,0.12)',
  },
  typing: { color: 'rgba(245,240,225,0.5)', fontSize: 13, paddingHorizontal: 6 },
  error: {
    backgroundColor: 'rgba(220,38,38,0.1)',
    borderColor: 'rgba(220,38,38,0.3)',
    borderWidth: 1,
    color: '#f87171',
    padding: 10,
    borderRadius: 8,
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  input: {
    flex: 1,
    backgroundColor: '#16181c',
    color: '#f5f0e1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    fontSize: 15,
  },
  micBtn: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: '#16181c',
    borderColor: 'rgba(182,142,32,0.4)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: {
    backgroundColor: '#b68e20',
    borderColor: '#d4a93a',
  },
  micIcon: { fontSize: 22 },
});
