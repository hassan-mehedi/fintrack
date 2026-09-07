export function isEmailConfigured() {
    return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export interface EmailMessage {
    to: string;
    subject: string;
    html: string;
    text: string;
}

export async function sendEmail({ to, subject, html, text }: EmailMessage) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;

    if (!apiKey || !from) {
        throw new Error("Resend is not configured.");
    }

    const replyTo = process.env.RESEND_REPLY_TO;

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from,
            to: [to],
            subject,
            html,
            text,
            ...(replyTo ? { reply_to: replyTo } : {}),
        }),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Resend request failed (${response.status}): ${body}`);
    }
}

/** Wraps a short message in the shared FinTrack email layout. */
export function renderEmail(heading: string, greetingName: string, paragraphs: string[]) {
    const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
    return {
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
                <h1 style="font-size: 22px; margin-bottom: 12px;">${escapeHtml(heading)}</h1>
                <p>Hello ${escapeHtml(greetingName)},</p>
                ${body}
            </div>
        `,
        text: `Hello ${greetingName},\n\n${paragraphs.join("\n\n")}`,
    };
}
