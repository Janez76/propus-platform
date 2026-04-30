/**
 * Audio-Recording mit expo-av.
 */

import { Audio } from 'expo-av';

let recording: Audio.Recording | null = null;

export async function startRecording(): Promise<void> {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Mikrofon-Berechtigung verweigert');

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const { recording: rec } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
  );
  recording = rec;
}

export async function stopRecording(): Promise<{ uri: string; mimeType: string }> {
  if (!recording) throw new Error('Keine Aufnahme aktiv');
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  recording = null;
  if (!uri) throw new Error('Aufnahme-URI fehlt');
  // iOS produziert .m4a, Android .m4a/.mp4 — Whisper akzeptiert beides
  return { uri, mimeType: 'audio/m4a' };
}

export function isRecording(): boolean {
  return recording !== null;
}
