import { API_URL, ApiError, getAccessToken, refreshSession } from './api';

async function upload(uri: string): Promise<Response> {
  const formData = new FormData();
  const extension = uri.split('.').pop() ?? 'm4a';
  formData.append('audio', {
    uri,
    name: `recording.${extension}`,
    type: `audio/${extension}`,
    // React Native's FormData accepts file descriptors; the DOM types don't know that
  } as unknown as Blob);

  return fetch(`${API_URL}/v1/transcribe`, {
    method: 'POST',
    headers: { authorization: `Bearer ${getAccessToken()}` },
    body: formData,
  });
}

export async function transcribeRecording(uri: string): Promise<string> {
  let response = await upload(uri);
  if (response.status === 401 && (await refreshSession())) {
    response = await upload(uri);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? 'Transcription failed');
  }
  const data = (await response.json()) as { text: string };
  return data.text;
}
