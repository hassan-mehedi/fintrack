import { useQueryClient } from '@tanstack/react-query';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { streamChat, type ChatMessage } from '@/lib/chat';
import { transcribeRecording } from '@/lib/transcribe';

const MAX_VOICE_SECONDS = 30;

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `msg-${messageCounter}`;
}

export default function AssistantScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const recordedSeconds = Math.floor(recorderState.durationMillis / 1000);

  const isPro = user?.plan === 'pro';

  useEffect(() => {
    if (recorderState.isRecording && recordedSeconds >= MAX_VOICE_SECONDS) {
      stopAndTranscribe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordedSeconds, recorderState.isRecording]);

  async function startRecording() {
    setError(null);
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Microphone permission denied');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function stopAndTranscribe() {
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) return;

    setIsTranscribing(true);
    try {
      const text = await transcribeRecording(uri);
      setInput((current) => (current ? `${current} ${text}` : text));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setIsTranscribing(false);
    }
  }

  function handleMicPress() {
    if (isTranscribing) return;
    if (recorderState.isRecording) {
      stopAndTranscribe();
    } else {
      startRecording();
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMessage: ChatMessage = { id: nextId(), role: 'user', text };
    const history = [...messages, userMessage];
    const assistantId = nextId();

    setMessages([...history, { id: assistantId, role: 'assistant', text: '' }]);
    setInput('');
    setError(null);
    setIsStreaming(true);

    function setAssistantText(value: string) {
      setMessages((current) =>
        current.map((m) => (m.id === assistantId ? { ...m, text: value } : m))
      );
    }

    try {
      const finalText = await streamChat(history, setAssistantText);
      if (!finalText) setAssistantText('(no response)');
      // The agent may have created transactions/accounts on the user's behalf
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    } catch (err) {
      setMessages((current) => current.filter((m) => m.id !== assistantId));
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsStreaming(false);
    }
  }

  if (!isPro) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerShown: true, title: 'Assistant' }} />
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ThemedView type="backgroundElement" style={styles.lockedCard}>
            <ThemedText type="subtitle">Pro plan required</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              The AI assistant is available on the Pro plan. You can request an upgrade from
              the web app.
            </ThemedText>
          </ThemedView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'Assistant' }} />
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Ask about your finances — &ldquo;How much did I spend on food this
                month?&rdquo; — or tell me to record a transaction.
              </ThemedText>
            }
            renderItem={({ item }) => (
              <ThemedView
                type={item.role === 'user' ? 'backgroundSelected' : 'backgroundElement'}
                style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                <ThemedText type="small">{item.text || '…'}</ThemedText>
              </ThemedView>
            )}
          />

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <View style={styles.inputRow}>
            <Pressable
              onPress={handleMicPress}
              disabled={isStreaming}
              style={({ pressed }) => [
                styles.micButton,
                { backgroundColor: theme.backgroundElement },
                recorderState.isRecording && styles.micRecording,
                (pressed || isStreaming) && styles.pressed,
              ]}>
              {isTranscribing ? (
                <ActivityIndicator size="small" />
              ) : (
                <ThemedText type="smallBold">
                  {recorderState.isRecording ? `⏹ ${recordedSeconds}s` : '🎤'}
                </ThemedText>
              )}
            </Pressable>
            <TextInput
              style={[
                styles.input,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
              placeholder="Ask your assistant…"
              placeholderTextColor={theme.textSecondary}
              value={input}
              onChangeText={setInput}
              maxLength={500}
              multiline
            />
            <Pressable
              onPress={handleSend}
              disabled={isStreaming || !input.trim()}
              style={({ pressed }) => [
                styles.sendButton,
                { backgroundColor: theme.primary },
                (pressed || isStreaming || !input.trim()) && styles.pressed,
              ]}>
              {isStreaming ? (
                <ActivityIndicator color={theme.onPrimary} size="small" />
              ) : (
                <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                  Send
                </ThemedText>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  flex: {
    flex: 1,
  },
  listContent: {
    padding: Spacing.four,
    gap: Spacing.two,
    flexGrow: 1,
  },
  hint: {
    textAlign: 'center',
    marginTop: Spacing.five,
  },
  bubble: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
  },
  aiBubble: {
    alignSelf: 'flex-start',
  },
  error: {
    color: '#ef4444',
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  input: {
    flex: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 15,
    maxHeight: 120,
  },
  micButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
  },
  micRecording: {
    backgroundColor: '#ef4444',
  },
  sendButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  lockedCard: {
    margin: Spacing.four,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
