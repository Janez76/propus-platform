/**
 * Audio-Recording mit expo-av.
 */

import { Audio } from 'expo-av';

let recording: Audio.Recording | null = null;
let recordingStartedAt = 0;

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
  recordingStartedAt = Date.now();
}

export async function stopRecording(): Promise<{ uri: string; mimeType: string; durationMs: number }> {
  if (!recording) throw new Error('Keine Aufnahme aktiv');
  await recording.stopAndUnloadAsync();
  const uri = recording.getURI();
  const durationMs = Date.now() - recordingStartedAt;
  recording = null;
  recordingStartedAt = 0;
  if (!uri) throw new Error('Aufnahme-URI fehlt');
  // iOS produziert .m4a, Android .m4a/.mp4 — Whisper akzeptiert beides
  return { uri, mimeType: 'audio/mp4', durationMs };
}

export function isRecording(): boolean {
  return recording !== null;
}
