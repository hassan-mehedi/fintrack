/**
 * Client-side helpers for managing the user's push subscription.
 * Designed to be called from React components after user gesture.
 */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export type PushStatus = "unsupported" | "denied" | "granted" | "default";

export function getPermission(): PushStatus {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as PushStatus;
}

export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

/**
 * Ensures the user has an active push subscription and reports it to the
 * server. Throws if permission is denied or push isn't supported.
 */
export async function enablePush(): Promise<void> {
  if (!isPushSupported()) throw new Error("Push not supported on this device");

  const reg = await navigator.serviceWorker.ready;

  const perm =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notification permission was not granted");

  const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!pubKey) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pubKey),
    });
  }

  const json = sub.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      userAgent: navigator.userAgent,
    }),
  });
  if (!res.ok) throw new Error("Could not register subscription with server");
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
